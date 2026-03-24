import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { getLiveGameState } from "@/lib/data/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, { user }] = await Promise.all([params, requireBearerUser()]);
    const state = await getLiveGameState(id, user.id);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load game state.",
      },
      { status: 400 },
    );
  }
}
