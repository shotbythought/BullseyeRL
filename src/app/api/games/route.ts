import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { generateJoinCode } from "@/lib/data/helpers";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { createGameSchema } from "@/lib/validation/game";

export async function POST(request: Request) {
  try {
    const { user } = await requireBearerUser();
    const input = createGameSchema.parse(await request.json());
    const supabase = getServiceSupabaseClient();

    const { data: challenge, error: challengeError } = await supabase
      .from("challenges")
      .select("id, guess_limit_per_round, status")
      .eq("id", input.challengeId)
      .single<{ id: string; guess_limit_per_round: number; status: string }>();

    if (challengeError || !challenge) {
      throw new Error("Challenge not found.");
    }

    if (challenge.status !== "ready") {
      throw new Error("Challenge is not ready to play.");
    }

    const { data: firstRound, error: firstRoundError } = await supabase
      .from("challenge_rounds")
      .select("id, round_index")
      .eq("challenge_id", challenge.id)
      .eq("round_index", 0)
      .single<{ id: string; round_index: number }>();

    if (firstRoundError || !firstRound) {
      throw new Error("Challenge has no playable rounds.");
    }

    let joinCode = generateJoinCode();
    for (let attempts = 0; attempts < 5; attempts += 1) {
      const { data: existing } = await supabase
        .from("games")
        .select("id")
        .eq("join_code", joinCode)
        .maybeSingle<{ id: string }>();

      if (!existing) {
        break;
      }

      joinCode = generateJoinCode();
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        challenge_id: challenge.id,
        join_code: joinCode,
        status: "in_progress",
        current_round_index: 0,
        team_score: 0,
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single<{ id: string; join_code: string }>();

    if (gameError || !game) {
      throw new Error(gameError?.message ?? "Failed to create game.");
    }

    const [{ error: playerError }, { error: roundError }] = await Promise.all([
      supabase.from("game_players").insert({
        game_id: game.id,
        user_id: user.id,
        nickname: input.nickname.trim(),
      }),
      supabase.from("game_rounds").insert({
        game_id: game.id,
        challenge_round_id: firstRound.id,
        round_index: firstRound.round_index,
        attempts_remaining: challenge.guess_limit_per_round,
        attempts_used: 0,
        provisional_points: 0,
      }),
    ]);

    if (playerError) {
      throw new Error(playerError.message);
    }

    if (roundError) {
      throw new Error(roundError.message);
    }

    return NextResponse.json({
      gameId: game.id,
      joinCode: game.join_code,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Game creation failed.",
      },
      { status: 400 },
    );
  }
}
