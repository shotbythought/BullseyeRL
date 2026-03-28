alter table public.challenges
add column if not exists round_time_limit_seconds integer default 3600;

alter table public.challenges
alter column round_time_limit_seconds drop not null;

alter table public.challenges
alter column round_time_limit_seconds set default 3600;

alter table public.challenges
drop constraint if exists challenges_round_time_limit_seconds_check;

alter table public.challenges
add constraint challenges_round_time_limit_seconds_check
check (round_time_limit_seconds is null or round_time_limit_seconds > 0);

create or replace function public.expire_current_round_if_needed(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_game_round public.game_rounds%rowtype;
  v_challenge public.challenges%rowtype;
  v_next_round public.challenge_rounds%rowtype;
  v_round_deadline timestamptz;
begin
  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found.';
  end if;

  if v_game.status = 'completed' then
    return false;
  end if;

  select *
  into v_challenge
  from public.challenges
  where id = v_game.challenge_id;

  if not found then
    raise exception 'Challenge not found.';
  end if;

  if v_challenge.round_time_limit_seconds is null then
    return false;
  end if;

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

  v_round_deadline :=
    v_game_round.created_at + make_interval(secs => v_challenge.round_time_limit_seconds);

  if v_game_round.resolved or v_round_deadline > now() then
    return false;
  end if;

  update public.game_rounds
  set resolved = true,
      resolved_at = coalesce(resolved_at, v_round_deadline)
  where id = v_game_round.id
  returning * into v_game_round;

  update public.games
  set team_score = team_score + v_game_round.provisional_points
  where id = p_game_id
  returning * into v_game;

  select *
  into v_next_round
  from public.challenge_rounds
  where challenge_id = v_game.challenge_id
    and round_index = v_game.current_round_index + 1
  limit 1;

  if not found then
    update public.games
    set status = 'completed',
        completed_at = coalesce(completed_at, v_round_deadline),
        started_at = coalesce(started_at, v_game.started_at, v_game_round.created_at)
    where id = p_game_id;
  end if;

  return true;
end;
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
  v_radius_index integer;
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

  select idx
  into v_radius_index
  from generate_subscripts(v_challenge.radii_meters, 1) as idx
  where v_challenge.radii_meters[idx] = p_selected_radius_meters
  limit 1;

  if v_radius_index is null then
    raise exception 'Selected radius is not a valid tier.';
  end if;

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
    v_round_points := (array_length(v_challenge.radii_meters, 1) - v_radius_index + 1) * 1000;
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

create or replace function public.advance_game_round(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_game public.games%rowtype;
  v_player public.game_players%rowtype;
  v_current_round public.game_rounds%rowtype;
  v_challenge public.challenges%rowtype;
  v_next_round public.challenge_rounds%rowtype;
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

  perform public.expire_current_round_if_needed(p_game_id);

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
  into v_current_round
  from public.game_rounds
  where game_id = p_game_id
    and round_index = v_game.current_round_index
  limit 1
  for update;

  if not found then
    raise exception 'Current game round not found.';
  end if;

  if not v_current_round.resolved then
    raise exception 'Current round is not resolved yet.';
  end if;

  select *
  into v_challenge
  from public.challenges
  where id = v_game.challenge_id;

  select *
  into v_next_round
  from public.challenge_rounds
  where challenge_id = v_game.challenge_id
    and round_index = v_game.current_round_index + 1
  limit 1;

  if not found then
    raise exception 'No next round is available.';
  end if;

  insert into public.game_rounds (
    game_id,
    challenge_round_id,
    round_index,
    attempts_remaining
  )
  values (
    p_game_id,
    v_next_round.id,
    v_next_round.round_index,
    v_challenge.guess_limit_per_round
  )
  on conflict (game_id, round_index) do nothing;

  update public.games
  set current_round_index = v_next_round.round_index,
      status = 'in_progress',
      started_at = coalesce(started_at, now())
  where id = p_game_id
  returning * into v_game;

  return jsonb_build_object(
    'currentRoundIndex', v_game.current_round_index,
    'gameStatus', v_game.status
  );
end;
$$;
