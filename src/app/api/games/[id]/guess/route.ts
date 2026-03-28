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

    const state = await getLiveGameState(id, user.id);

    if (state.roundResolved) {
      return NextResponse.json(buildResolvedRoundResponse(state));
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

      if (!data.roundResolved) {
        return NextResponse.json({
          ...data,
          reveal: null,
        });
      }

      const refreshedState = await getLiveGameState(id, user.id);

      return NextResponse.json({
        ...data,
        gameStatus: refreshedState.status,
        reveal: buildReveal(refreshedState),
      });
    } catch (error) {
      const refreshedState = await getLiveGameState(id, user.id);

      if (refreshedState.roundResolved) {
        return NextResponse.json(buildResolvedRoundResponse(refreshedState));
      }

      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Guess submission failed.",
      },
      { status: 400 },
    );
  }
}

function buildReveal(state: Awaited<ReturnType<typeof getLiveGameState>>) {
  if (!state.target) {
    return null;
  }

  return {
    target: state.target,
    radiiMeters: state.radiiMeters,
    timedOut: state.roundTimedOut,
  };
}

function buildResolvedRoundResponse(state: Awaited<ReturnType<typeof getLiveGameState>>) {
  return {
    roundResolved: true,
    gameStatus: state.status,
    teamScore: state.teamScore,
    currentRoundIndex: state.roundIndex,
    attemptsRemaining: state.attemptsRemaining,
    provisionalPoints: state.provisionalRoundPoints,
    bestSuccessfulRadiusMeters: state.bestSuccessfulRadiusMeters,
    timedOut: state.roundTimedOut,
    reveal: buildReveal(state),
  };
}
