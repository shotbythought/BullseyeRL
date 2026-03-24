create extension if not exists pgcrypto;

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  source_map_url text not null,
  source_map_id text not null,
  title text not null,
  location_count integer not null check (location_count > 0),
  guess_limit_per_round integer not null check (guess_limit_per_round > 0),
  radii_meters integer[] not null,
  import_seed text not null,
  status text not null check (status in ('draft', 'ready', 'failed')) default 'ready',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists public.challenge_rounds (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  round_index integer not null check (round_index >= 0),
  target_lat double precision not null,
  target_lng double precision not null,
  street_view_lat double precision not null,
  street_view_lng double precision not null,
  street_view_pano_id text,
  street_view_heading double precision not null,
  street_view_pitch double precision not null default 0,
  street_view_fov double precision not null default 90,
  source_payload jsonb,
  unique (challenge_id, round_index)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  join_code text not null unique,
  status text not null check (status in ('lobby', 'in_progress', 'completed')) default 'lobby',
  current_round_index integer not null default 0 check (current_round_index >= 0),
  team_score integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  challenge_round_id uuid not null references public.challenge_rounds(id) on delete cascade,
  round_index integer not null check (round_index >= 0),
  attempts_used integer not null default 0 check (attempts_used >= 0),
  attempts_remaining integer not null check (attempts_remaining >= 0),
  best_successful_radius_meters integer,
  provisional_points integer not null default 0 check (provisional_points >= 0),
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, round_index),
  unique (game_id, challenge_round_id)
);

create table if not exists public.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_round_id uuid not null references public.game_rounds(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete cascade,
  guess_lat double precision not null,
  guess_lng double precision not null,
  gps_accuracy_meters double precision,
  selected_radius_meters integer not null check (selected_radius_meters > 0),
  distance_to_target_meters double precision not null check (distance_to_target_meters >= 0),
  is_success boolean not null,
  improved_best_result boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_players_game_id on public.game_players(game_id);
create index if not exists idx_game_players_user_id on public.game_players(user_id);
create index if not exists idx_game_rounds_game_id on public.game_rounds(game_id);
create index if not exists idx_guesses_game_id on public.guesses(game_id);
create index if not exists idx_guesses_game_round_id on public.guesses(game_round_id);

alter table public.challenges enable row level security;
alter table public.challenge_rounds enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds enable row level security;
alter table public.guesses enable row level security;

create or replace function public.is_game_member(target_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.game_players
    where game_id = target_game_id
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_game_member(uuid) to authenticated;

create policy "challenge_select_authenticated"
on public.challenges
for select
to authenticated
using (true);

create policy "challenge_rounds_select_authenticated"
on public.challenge_rounds
for select
to authenticated
using (true);

create policy "games_select_members"
on public.games
for select
to authenticated
using (public.is_game_member(id));

create policy "game_players_select_members"
on public.game_players
for select
to authenticated
using (public.is_game_member(game_id));

create policy "game_rounds_select_members"
on public.game_rounds
for select
to authenticated
using (public.is_game_member(game_id));

create policy "guesses_select_members"
on public.guesses
for select
to authenticated
using (public.is_game_member(game_id));

create or replace function public.join_game_by_code(p_join_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
  v_trimmed_nickname text;
begin
  if auth.uid() is null then
    raise exception 'Unauthenticated';
  end if;

  v_trimmed_nickname := left(trim(p_nickname), 24);

  if v_trimmed_nickname is null or char_length(v_trimmed_nickname) < 2 then
    raise exception 'Nickname must be at least 2 characters.';
  end if;

  select id
  into v_game_id
  from public.games
  where upper(join_code) = upper(trim(p_join_code))
  limit 1;

  if v_game_id is null then
    raise exception 'Invalid join code.';
  end if;

  insert into public.game_players (game_id, user_id, nickname)
  values (v_game_id, auth.uid(), v_trimmed_nickname)
  on conflict (game_id, user_id)
  do update
    set nickname = excluded.nickname,
        last_seen_at = now();

  return v_game_id;
end;
$$;

grant execute on function public.join_game_by_code(text, text) to authenticated;

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
  v_next_round public.challenge_rounds%rowtype;
  v_distance double precision;
  v_is_success boolean;
  v_improved boolean := false;
  v_guess_id uuid;
  v_radius_index integer;
  v_round_points integer;
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
    v_round_points := array_length(v_challenge.radii_meters, 1) - v_radius_index + 1;
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

    select *
    into v_next_round
    from public.challenge_rounds
    where challenge_id = v_game.challenge_id
      and round_index = v_game_round.round_index + 1
    limit 1;

    if found then
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

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.game_rounds;
alter publication supabase_realtime add table public.guesses;
