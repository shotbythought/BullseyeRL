import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { slugifyJoinCode } from "@/lib/utils";
import { joinGameSchema } from "@/lib/validation/game";

export async function POST(request: Request) {
  try {
    const { supabase } = await requireBearerUser();
    const input = joinGameSchema.parse(await request.json());
    const { data, error } = await supabase.rpc("join_game_by_code", {
      p_join_code: slugifyJoinCode(input.joinCode),
      p_nickname: input.nickname.trim(),
    });

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to join this game.");
    }

    return NextResponse.json({
      gameId: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Game join failed.",
      },
      { status: 400 },
    );
  }
}
