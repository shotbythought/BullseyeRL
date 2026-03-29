import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { getLiveGameState } from "@/lib/data/queries";
import { submitGuessSchema } from "@/lib/validation/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, { supabase, user }] = await Promise.all([params, requireBearerUser()]);
    const payload = submitGuessSchema.parse(await request.json());

    if (payload.gameId !== id) {
      throw new Error("Game id mismatch.");
    }

    try {
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
    } catch (error) {
      const refreshedState = await getLiveGameState(id, user.id);

      if (refreshedState.roundResolved) {
        return NextResponse.json(refreshedState);
      }

      throw error;
    }

    const refreshedState = await getLiveGameState(id, user.id);
    return NextResponse.json(refreshedState);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Guess submission failed.",
      },
      { status: 400 },
    );
  }
}
