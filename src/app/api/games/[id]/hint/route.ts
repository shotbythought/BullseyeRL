import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { getLiveGameState } from "@/lib/data/queries";
import { useHintSchema } from "@/lib/validation/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, { supabase, user }] = await Promise.all([params, requireBearerUser()]);
    const payload = useHintSchema.parse(await request.json());

    if (payload.gameId !== id) {
      throw new Error("Game id mismatch.");
    }

    const state = await getLiveGameState(id, user.id);

    if (state.roundResolved) {
      return NextResponse.json(state);
    }

    try {
      const { error } = await supabase.rpc("use_round_hint", {
        p_game_id: payload.gameId,
        p_hint_type: payload.hintType,
        p_current_lat: payload.currentLat ?? null,
        p_current_lng: payload.currentLng ?? null,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      const refreshedState = await getLiveGameState(id, user.id);
      const requestedHintWasApplied =
        payload.hintType === "get_me_closer"
          ? refreshedState.hints.getMeCloser.used
          : refreshedState.hints.pointMe.used;

      if (refreshedState.roundResolved || requestedHintWasApplied) {
        return NextResponse.json(refreshedState);
      }

      throw error;
    }

    const refreshedState = await getLiveGameState(id, user.id);
    return NextResponse.json(refreshedState);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to use the hint.",
      },
      { status: 400 },
    );
  }
}
