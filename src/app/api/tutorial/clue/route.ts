import { NextResponse } from "next/server";

import { buildStreetViewStaticUrl } from "@/lib/google/street-view";
import { TUTORIAL_CLUE } from "@/lib/tutorial/data";

export async function GET() {
  try {
    const imageUrl = buildStreetViewStaticUrl({
      lat: TUTORIAL_CLUE.lat,
      lng: TUTORIAL_CLUE.lng,
      heading: TUTORIAL_CLUE.heading,
      pitch: TUTORIAL_CLUE.pitch,
      fov: TUTORIAL_CLUE.fov,
    });

    const imageResponse = await fetch(imageUrl, {
      next: { revalidate: 0 },
    });

    if (!imageResponse.ok || !imageResponse.body) {
      throw new Error("Failed to fetch tutorial clue image.");
    }

    return new NextResponse(imageResponse.body, {
      status: 200,
      headers: {
        "content-type": imageResponse.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Tutorial clue fetch failed.",
      },
      { status: 400 },
    );
  }
}
