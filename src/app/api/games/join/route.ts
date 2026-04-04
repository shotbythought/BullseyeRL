import { NextResponse } from "next/server";
import { z } from "zod";

import { requireBearerUser } from "@/lib/api/auth";
import { slugifyJoinCode } from "@/lib/utils";
import { joinGameSchema } from "@/lib/validation/game";

const resolveJoinCodeSchema = z.object({
  joinCode: z.string().trim().min(4).max(12),
});

export async function GET(request: Request) {
  try {
    const { supabase } = await requireBearerUser();
    const url = new URL(request.url);
    const input = resolveJoinCodeSchema.parse({
      joinCode: url.searchParams.get("joinCode"),
    });
    const { data: game, error } = await supabase
      .from("games")
      .select("id")
      .eq("join_code", slugifyJoinCode(input.joinCode))
      .maybeSingle<{ id: string }>();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      gameId: game?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Game lookup failed.",
      },
      { status: 400 },
    );
  }
}

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
