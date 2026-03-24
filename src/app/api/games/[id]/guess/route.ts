import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { submitGuessSchema } from "@/lib/validation/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, { supabase }] = await Promise.all([params, requireBearerUser()]);
    const payload = submitGuessSchema.parse(await request.json());

    if (payload.gameId !== id) {
      throw new Error("Game id mismatch.");
    }

    const service = getServiceSupabaseClient();
    const { data: preGame } = await service
      .from("games")
      .select("challenge_id, current_round_index")
      .eq("id", id)
      .single<{ challenge_id: string; current_round_index: number }>();

    const { data: preGameRound } = await service
      .from("game_rounds")
      .select("challenge_round_id")
      .eq("game_id", id)
      .eq("round_index", preGame?.current_round_index ?? 0)
      .single<{ challenge_round_id: string }>();

    const { data: preChallengeRound } = await service
      .from("challenge_rounds")
      .select("id, target_lat, target_lng")
      .eq("id", preGameRound?.challenge_round_id ?? "")
      .single<{ id: string; target_lat: number; target_lng: number }>();

    const { data: challenge } = await service
      .from("challenges")
      .select("radii_meters")
      .eq("id", preGame?.challenge_id ?? "")
      .single<{ radii_meters: number[] }>();

    const { data, error } = await supabase.rpc("submit_guess", {
      p_game_id: payload.gameId,
      p_selected_radius_meters: payload.selectedRadiusMeters,
      p_guess_lat: payload.currentLat,
      p_guess_lng: payload.currentLng,
      p_accuracy_meters: payload.accuracyMeters ?? null,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "Guess submission failed.");
    }

    return NextResponse.json({
      ...data,
      reveal:
        data.roundResolved && preChallengeRound
          ? {
              target: {
                lat: preChallengeRound.target_lat,
                lng: preChallengeRound.target_lng,
              },
              radiiMeters: challenge?.radii_meters ?? [],
            }
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Guess submission failed.",
      },
      { status: 400 },
    );
  }
}
