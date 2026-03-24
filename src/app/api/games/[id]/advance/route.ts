import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { getLiveGameState } from "@/lib/data/queries";
import { advanceRoundSchema } from "@/lib/validation/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, { supabase, user }] = await Promise.all([params, requireBearerUser()]);
    const payload = advanceRoundSchema.parse(await request.json());

    if (payload.gameId !== id) {
      throw new Error("Game id mismatch.");
    }

    const { error } = await supabase.rpc("advance_game_round", {
      p_game_id: id,
    });

    if (error) {
      throw new Error(error.message);
    }

    const state = await getLiveGameState(id, user.id);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to advance the round.",
      },
      { status: 400 },
    );
  }
}
