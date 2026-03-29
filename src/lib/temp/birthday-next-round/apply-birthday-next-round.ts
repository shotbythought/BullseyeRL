/**
 * TEMPORARY: captain-only override of the *next* challenge_round (not the active one)
 * with fixed SF cake-shop coordinates and south-facing Street View.
 *
 * REMOVE BY: ~2026-04-06 (or whenever the birthday surprise is done)
 *
 * Deletion checklist:
 * - Delete this entire directory: src/lib/temp/birthday-next-round/
 * - Delete: src/app/api/games/[id]/set-next-round/route.ts
 * - Delete: src/components/temp/birthday-set-next-round-button.tsx
 * - Remove BirthdaySetNextRoundButton from live-game-client.tsx
 * - Remove viewerIsCaptain from LiveGameState and getLiveGameState in queries.ts
 */

import { resolveStreetViewMetadata } from "@/lib/google/street-view";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  BIRTHDAY_STREET_VIEW_FOV,
  BIRTHDAY_STREET_VIEW_HEADING_SOUTH,
  BIRTHDAY_STREET_VIEW_PITCH,
  BIRTHDAY_TARGET_LAT,
  BIRTHDAY_TARGET_LNG,
} from "@/lib/temp/birthday-next-round/constants";
import { getCaptainUserIdForGame } from "@/lib/temp/birthday-next-round/captain";

export type ApplyBirthdayNextRoundResult =
  | { ok: true }
  | { error: string; status: 400 | 403 | 404 | 422 };

export async function applyBirthdayNextRoundSeed(input: {
  gameId: string;
  actingUserId: string;
}): Promise<ApplyBirthdayNextRoundResult> {
  const captainId = await getCaptainUserIdForGame(input.gameId);

  if (!captainId) {
    return { error: "Game not found or has no players.", status: 404 };
  }

  if (captainId !== input.actingUserId) {
    return { error: "Only the captain can set the next round.", status: 403 };
  }

  const supabase = getServiceSupabaseClient();

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, challenge_id, current_round_index, status")
    .eq("id", input.gameId)
    .maybeSingle<{
      id: string;
      challenge_id: string;
      current_round_index: number;
      status: string;
    }>();

  if (gameError || !game) {
    return { error: "Game not found.", status: 404 };
  }

  if (game.status === "completed") {
    return { error: "Game is already completed.", status: 400 };
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("location_count")
    .eq("id", game.challenge_id)
    .maybeSingle<{ location_count: number }>();

  if (challengeError || !challenge) {
    return { error: "Challenge not found.", status: 404 };
  }

  const nextRoundIndex = game.current_round_index + 1;

  if (nextRoundIndex >= challenge.location_count) {
    return { error: "There is no next round to override.", status: 400 };
  }

  const { data: nextRound, error: nextRoundError } = await supabase
    .from("challenge_rounds")
    .select("id")
    .eq("challenge_id", game.challenge_id)
    .eq("round_index", nextRoundIndex)
    .maybeSingle<{ id: string }>();

  if (nextRoundError || !nextRound) {
    return { error: "Next round not found for this challenge.", status: 404 };
  }

  let metadata;
  try {
    metadata = await resolveStreetViewMetadata(BIRTHDAY_TARGET_LAT, BIRTHDAY_TARGET_LNG);
  } catch {
    return { error: "Street View is unavailable at the override location.", status: 422 };
  }

  const { error: updateError } = await supabase
    .from("challenge_rounds")
    .update({
      target_lat: BIRTHDAY_TARGET_LAT,
      target_lng: BIRTHDAY_TARGET_LNG,
      street_view_lat: metadata.cameraLat,
      street_view_lng: metadata.cameraLng,
      street_view_pano_id: metadata.panoId,
      street_view_heading: BIRTHDAY_STREET_VIEW_HEADING_SOUTH,
      street_view_pitch: BIRTHDAY_STREET_VIEW_PITCH,
      street_view_fov: BIRTHDAY_STREET_VIEW_FOV,
    })
    .eq("id", nextRound.id);

  if (updateError) {
    return { error: updateError.message || "Failed to update next round.", status: 400 };
  }

  return { ok: true };
}
