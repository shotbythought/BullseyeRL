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
  v_is_bullseye boolean := false;
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
  v_is_bullseye := v_is_success
    and p_selected_radius_meters <= v_challenge.guess_radius_min_meters;
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
  set attempts_used = attempts_used + case
        when v_is_bullseye then attempts_remaining
        else 1
      end,
      attempts_remaining = case
        when v_is_bullseye then 0
        else attempts_remaining - 1
      end,
      best_successful_radius_meters = case
        when v_improved then p_selected_radius_meters
        else best_successful_radius_meters
      end,
      provisional_points = case
        when v_improved then v_round_points
        else provisional_points
      end,
      resolved = v_is_bullseye or attempts_remaining - 1 <= 0,
      resolved_at = case
        when v_is_bullseye or attempts_remaining - 1 <= 0 then now()
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

grant execute on function public.submit_guess(uuid, integer, double precision, double precision, double precision) to authenticated;
