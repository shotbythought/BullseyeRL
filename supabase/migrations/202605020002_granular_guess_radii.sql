alter table public.challenges
add column if not exists guess_radius_min_meters integer not null default 50;

alter table public.challenges
add column if not exists guess_radius_max_meters integer not null default 5000;

update public.challenges
set guess_radius_min_meters = 50,
    guess_radius_max_meters = greatest(
      50,
      coalesce(
        case
          when difficulty_meters_per_hour is null then 5000
          else round(difficulty_meters_per_hour * (coalesce(round_time_limit_seconds, 3600)::double precision / 3600.0))::integer
        end,
        5000
      )
    );

alter table public.challenges
drop constraint if exists challenges_guess_radius_bounds_check;

alter table public.challenges
add constraint challenges_guess_radius_bounds_check
check (
  guess_radius_min_meters = 50
  and guess_radius_max_meters >= guess_radius_min_meters
);

create or replace function public.raw_points_for_radius(
  p_min_radius_meters integer,
  p_max_radius_meters integer,
  p_successful_radius integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_min_radius integer := coalesce(p_min_radius_meters, 50);
  v_max_radius integer := greatest(coalesce(p_max_radius_meters, 5000), coalesce(p_min_radius_meters, 50));
  v_radius integer := p_successful_radius;
  v_first_non_bullseye_radius integer;
  v_log_progress double precision;
begin
  if v_radius is null then
    return 0;
  end if;

  if v_radius <= v_min_radius or v_max_radius = v_min_radius then
    return 100;
  end if;

  if v_radius >= v_max_radius then
    return 1;
  end if;

  v_first_non_bullseye_radius := least(250, v_max_radius);

  if v_radius <= v_first_non_bullseye_radius then
    return 90;
  end if;

  if v_max_radius = v_first_non_bullseye_radius then
    return 1;
  end if;

  v_log_progress := ln(v_max_radius::double precision / v_radius::double precision)
    / ln(v_max_radius::double precision / v_first_non_bullseye_radius::double precision);

  return greatest(1, least(90, round(1 + 89 * v_log_progress)::integer));
end;
$$;

create or replace function public.net_round_points(
  p_raw_points integer,
  p_hint_penalty_points integer
)
returns integer
language sql
immutable
as $$
  select greatest(0, coalesce(p_raw_points, 0) - greatest(coalesce(p_hint_penalty_points, 0), 0));
$$;

create or replace function public.submit_guess(
  p_game_id uuid,
  p_selected_radius_meters integer,
  p_guess_lat double precision,
  p_guess_lng double precision,
  p_accuracy_meters double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_player public.game_players%rowtype;
  v_game public.games%rowtype;
  v_game_round public.game_rounds%rowtype;
  v_challenge public.challenges%rowtype;
  v_challenge_round public.challenge_rounds%rowtype;
  v_distance double precision;
  v_is_success boolean;
  v_improved boolean := false;
  v_guess_id uuid;
  v_round_points integer;
  v_round_timed_out boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthenticated';
  end if;

  select *
  into v_player
  from public.game_players
  where game_id = p_game_id
    and user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'Not a member of this game.';
  end if;

  update public.game_players
  set last_seen_at = now()
  where id = v_player.id;

  select public.expire_current_round_if_needed(p_game_id)
  into v_round_timed_out;

  if v_round_timed_out then
    raise exception 'This round has already timed out.';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found.';
  end if;

  if v_game.status = 'completed' then
    raise exception 'Game already completed.';
  end if;

  select *
  into v_challenge
  from public.challenges
  where id = v_game.challenge_id;

  if p_selected_radius_meters < v_challenge.guess_radius_min_meters
    or p_selected_radius_meters > v_challenge.guess_radius_max_meters then
    raise exception 'Selected radius is outside this challenge radius range.';
  end if;

  select *
  into v_game_round
  from public.game_rounds
  where game_id = p_game_id
    and round_index = v_game.current_round_index
  limit 1
  for update;

  if not found then
    raise exception 'Active game round not found.';
  end if;

  if v_game_round.resolved or v_game_round.attempts_remaining <= 0 then
    raise exception 'This round is already resolved.';
  end if;

  select *
  into v_challenge_round
  from public.challenge_rounds
  where id = v_game_round.challenge_round_id;

  v_distance := 2 * 6371000 * asin(
    sqrt(
      power(sin(radians(v_challenge_round.target_lat - p_guess_lat) / 2), 2)
      + cos(radians(p_guess_lat))
      * cos(radians(v_challenge_round.target_lat))
      * power(sin(radians(v_challenge_round.target_lng - p_guess_lng) / 2), 2)
    )
  );

  v_is_success := v_distance <= p_selected_radius_meters;
  v_round_points := v_game_round.provisional_points;

  if v_is_success and (
    v_game_round.best_successful_radius_meters is null
    or p_selected_radius_meters < v_game_round.best_successful_radius_meters
  ) then
    v_improved := true;
    v_round_points := public.net_round_points(
      public.raw_points_for_radius(
        v_challenge.guess_radius_min_meters,
        v_challenge.guess_radius_max_meters,
        p_selected_radius_meters
      ),
      v_game_round.hint_penalty_points
    );
  end if;

  insert into public.guesses (
    game_id,
    game_round_id,
    player_id,
    guess_lat,
    guess_lng,
    gps_accuracy_meters,
    selected_radius_meters,
    distance_to_target_meters,
    is_success,
    improved_best_result
  )
  values (
    p_game_id,
    v_game_round.id,
    v_player.id,
    p_guess_lat,
    p_guess_lng,
    p_accuracy_meters,
    p_selected_radius_meters,
    v_distance,
    v_is_success,
    v_improved
  )
  returning id into v_guess_id;

  update public.game_rounds
  set attempts_used = attempts_used + 1,
      attempts_remaining = attempts_remaining - 1,
      best_successful_radius_meters = case
        when v_improved then p_selected_radius_meters
        else best_successful_radius_meters
      end,
      provisional_points = case
        when v_improved then v_round_points
        else provisional_points
      end,
      resolved = attempts_remaining - 1 <= 0,
      resolved_at = case
        when attempts_remaining - 1 <= 0 then now()
        else resolved_at
      end
  where id = v_game_round.id
  returning * into v_game_round;

  if v_game_round.resolved then
    update public.games
    set team_score = team_score + v_game_round.provisional_points
    where id = p_game_id
    returning * into v_game;

    if exists (
      select 1
      from public.challenge_rounds
      where challenge_id = v_game.challenge_id
        and round_index = v_game_round.round_index + 1
    ) then
      update public.games
      set started_at = coalesce(started_at, now())
      where id = p_game_id
      returning * into v_game;
    else
      update public.games
      set status = 'completed',
          completed_at = now(),
          started_at = coalesce(started_at, now())
      where id = p_game_id
      returning * into v_game;
    end if;
  end if;

  return jsonb_build_object(
    'guessId', v_guess_id,
    'distanceMeters', v_distance,
    'isSuccess', v_is_success,
    'improvedBestResult', v_improved,
    'attemptsRemaining', v_game_round.attempts_remaining,
    'provisionalPoints', v_game_round.provisional_points,
    'bestSuccessfulRadiusMeters', v_game_round.best_successful_radius_meters,
    'roundResolved', v_game_round.resolved,
    'gameStatus', v_game.status,
    'teamScore', v_game.team_score,
    'currentRoundIndex', v_game.current_round_index
  );
end;
$$;

create or replace function public.use_round_hint(
  p_game_id uuid,
  p_hint_type text,
  p_current_lat double precision default null,
  p_current_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_player public.game_players%rowtype;
  v_game public.games%rowtype;
  v_game_round public.game_rounds%rowtype;
  v_challenge public.challenges%rowtype;
  v_challenge_round public.challenge_rounds%rowtype;
  v_round_timed_out boolean;
  v_hint_cost integer;
  v_raw_points integer;
  v_hint_radius integer;
  v_random_bearing_radians double precision;
  v_random_distance_meters double precision;
  v_angular_distance double precision;
  v_target_lat_radians double precision;
  v_target_lng_radians double precision;
  v_hint_lat_radians double precision;
  v_hint_lng_radians double precision;
  v_bearing double precision;
  v_direction text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthenticated';
  end if;

  select *
  into v_player
  from public.game_players
  where game_id = p_game_id
    and user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'Not a member of this game.';
  end if;

  update public.game_players
  set last_seen_at = now()
  where id = v_player.id;

  select public.expire_current_round_if_needed(p_game_id)
  into v_round_timed_out;

  if v_round_timed_out then
    raise exception 'This round has already timed out.';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found.';
  end if;

  if v_game.status = 'completed' then
    raise exception 'Game already completed.';
  end if;

  select *
  into v_challenge
  from public.challenges
  where id = v_game.challenge_id;

  select *
  into v_game_round
  from public.game_rounds
  where game_id = p_game_id
    and round_index = v_game.current_round_index
  limit 1
  for update;

  if not found then
    raise exception 'Current game round not found.';
  end if;

  if v_game_round.resolved or v_game_round.attempts_remaining <= 0 then
    raise exception 'This round is already resolved.';
  end if;

  select *
  into v_challenge_round
  from public.challenge_rounds
  where id = v_game_round.challenge_round_id;

  v_raw_points := public.raw_points_for_radius(
    v_challenge.guess_radius_min_meters,
    v_challenge.guess_radius_max_meters,
    v_game_round.best_successful_radius_meters
  );

  if p_hint_type = 'get_me_closer' then
    if v_game_round.closer_hint_used then
      raise exception 'Get me closer has already been used this round.';
    end if;

    if v_challenge.guess_radius_max_meters <= v_challenge.guess_radius_min_meters then
      raise exception 'Get me closer is unavailable for this challenge.';
    end if;

    v_hint_cost := 20;
    v_hint_radius := greatest(
      v_challenge.guess_radius_min_meters,
      round(v_challenge.guess_radius_max_meters * 0.4)::integer
    );
    v_random_bearing_radians :=
      public.seeded_random_unit(v_game_round.id::text || ':closer:bearing')
      * 2
      * pi();
    v_random_distance_meters :=
      sqrt(public.seeded_random_unit(v_game_round.id::text || ':closer:distance'))
      * v_hint_radius;
    v_angular_distance := v_random_distance_meters / 6371000.0;
    v_target_lat_radians := radians(v_challenge_round.target_lat);
    v_target_lng_radians := radians(v_challenge_round.target_lng);

    v_hint_lat_radians := asin(
      sin(v_target_lat_radians) * cos(v_angular_distance)
      + cos(v_target_lat_radians) * sin(v_angular_distance) * cos(v_random_bearing_radians)
    );
    v_hint_lng_radians := v_target_lng_radians + atan2(
      sin(v_random_bearing_radians) * sin(v_angular_distance) * cos(v_target_lat_radians),
      cos(v_angular_distance) - sin(v_target_lat_radians) * sin(v_hint_lat_radians)
    );

    update public.game_rounds
    set hint_penalty_points = hint_penalty_points + v_hint_cost,
        closer_hint_used = true,
        closer_hint_center_lat = degrees(v_hint_lat_radians),
        closer_hint_center_lng = degrees(atan2(sin(v_hint_lng_radians), cos(v_hint_lng_radians))),
        closer_hint_radius_meters = v_hint_radius,
        provisional_points = public.net_round_points(v_raw_points, hint_penalty_points + v_hint_cost)
    where id = v_game_round.id
    returning * into v_game_round;
  elsif p_hint_type = 'point_me' then
    if v_game_round.point_hint_used then
      raise exception 'Point me has already been used this round.';
    end if;

    if p_current_lat is null or p_current_lng is null then
      raise exception 'Current coordinates are required for Point me.';
    end if;

    v_hint_cost := 10;
    v_bearing := degrees(
      atan2(
        sin(radians(v_challenge_round.target_lng - p_current_lng))
        * cos(radians(v_challenge_round.target_lat)),
        cos(radians(p_current_lat)) * sin(radians(v_challenge_round.target_lat))
        - sin(radians(p_current_lat))
        * cos(radians(v_challenge_round.target_lat))
        * cos(radians(v_challenge_round.target_lng - p_current_lng))
      )
    );

    if v_bearing < 0 then
      v_bearing := v_bearing + 360.0;
    end if;

    v_direction := case
      when v_bearing >= 315 or v_bearing < 45 then 'north'
      when v_bearing >= 45 and v_bearing < 135 then 'east'
      when v_bearing >= 135 and v_bearing < 225 then 'south'
      else 'west'
    end;

    update public.game_rounds
    set hint_penalty_points = hint_penalty_points + v_hint_cost,
        point_hint_used = true,
        point_hint_direction = v_direction,
        provisional_points = public.net_round_points(v_raw_points, hint_penalty_points + v_hint_cost)
    where id = v_game_round.id
    returning * into v_game_round;
  else
    raise exception 'Unknown hint type.';
  end if;

  return jsonb_build_object(
    'hintType', p_hint_type,
    'hintPenaltyPoints', v_game_round.hint_penalty_points,
    'provisionalPoints', v_game_round.provisional_points,
    'closerHintUsed', v_game_round.closer_hint_used,
    'pointHintUsed', v_game_round.point_hint_used,
    'pointHintDirection', v_game_round.point_hint_direction
  );
end;
$$;

grant execute on function public.raw_points_for_radius(integer, integer, integer) to authenticated;
grant execute on function public.submit_guess(uuid, integer, double precision, double precision, double precision) to authenticated;
grant execute on function public.use_round_hint(uuid, text, double precision, double precision) to authenticated;
