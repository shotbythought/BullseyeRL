# BullseyeRL

BullseyeRL is a Next.js + Supabase app that turns built-in city presets into collaborative real-world bullseye games.

## What is implemented

- Challenge generation from built-in city presets
- Immutable `challenge_rounds` snapshot created during import
- Collaborative `games` with shared attempts and shared score
- Fixed Street View clue images proxied through the server
- Interactive Google Maps live guess board with preview and history circles
- Supabase SQL schema, RLS policies, realtime tables, and `join_game_by_code` / `submit_guess` RPCs

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres/Auth/Realtime
- Google Maps JavaScript API
- Google Street View Static API

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase and Google Maps keys.
2. Apply all SQL migrations in [supabase/migrations](/Users/michaelzeng/BullseyeRL/supabase/migrations) to your Supabase project in filename order.
3. In Supabase Auth settings, enable Anonymous sign-ins.
4. Install dependencies with `npm install`.
5. Start the app with `npm run dev`.

## Important env vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GOOGLE_STREET_VIEW_API_KEY`

## Notes

- The preset generator uses hardcoded city bounding boxes and validates Street View coverage before the challenge snapshot is stored.
- The clue image is intentionally non-interactive. Players cannot move, pan, or zoom it.
- The authoritative guess mutation path lives in the Supabase migration SQL under [supabase/migrations](/Users/michaelzeng/BullseyeRL/supabase/migrations).
