alter table public.challenges
add column if not exists difficulty_mode_id text not null default 'infinite';

alter table public.challenges
add column if not exists difficulty_meters_per_hour double precision;

alter table public.challenges
add column if not exists difficulty_origin_lat double precision;

alter table public.challenges
add column if not exists difficulty_origin_lng double precision;

alter table public.challenges
drop constraint if exists challenges_difficulty_mode_id_check;

alter table public.challenges
add constraint challenges_difficulty_mode_id_check
check (
  difficulty_mode_id in (
    'quarter-mile',
    'public-transport',
    'three-quarter-mile',
    'biking',
    'one-and-half-mile',
    'driving',
    'infinite'
  )
);

alter table public.challenges
drop constraint if exists challenges_difficulty_meters_per_hour_check;

alter table public.challenges
add constraint challenges_difficulty_meters_per_hour_check
check (difficulty_meters_per_hour is null or difficulty_meters_per_hour > 0);

alter table public.challenges
drop constraint if exists challenges_difficulty_origin_lat_check;

alter table public.challenges
add constraint challenges_difficulty_origin_lat_check
check (difficulty_origin_lat is null or difficulty_origin_lat between -90 and 90);

alter table public.challenges
drop constraint if exists challenges_difficulty_origin_lng_check;

alter table public.challenges
add constraint challenges_difficulty_origin_lng_check
check (difficulty_origin_lng is null or difficulty_origin_lng between -180 and 180);
