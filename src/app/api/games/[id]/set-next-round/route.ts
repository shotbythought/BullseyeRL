import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { applyBirthdayNextRoundSeed } from "@/lib/temp/birthday-next-round/apply-birthday-next-round";
import { setNextRoundSchema } from "@/lib/validation/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, { user }] = await Promise.all([params, requireBearerUser()]);
    const payload = setNextRoundSchema.parse(await request.json());

    if (payload.gameId !== id) {
      throw new Error("Game id mismatch.");
    }

    const result = await applyBirthdayNextRoundSeed({
      gameId: id,
      actingUserId: user.id,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to set next round.",
      },
      { status: 400 },
    );
  }
}
