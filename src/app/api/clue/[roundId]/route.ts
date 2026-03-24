import { NextResponse } from "next/server";

import { buildStreetViewStaticUrl } from "@/lib/google/street-view";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  try {
    const { roundId } = await params;
    const supabase = getServiceSupabaseClient();
    const { data: challengeRound, error } = await supabase
      .from("challenge_rounds")
      .select(
        "street_view_lat, street_view_lng, street_view_pano_id, street_view_heading, street_view_pitch, street_view_fov",
      )
      .eq("id", roundId)
      .single<{
        street_view_lat: number;
        street_view_lng: number;
        street_view_pano_id: string | null;
        street_view_heading: number;
        street_view_pitch: number;
        street_view_fov: number;
      }>();

    if (error || !challengeRound) {
      throw new Error("Challenge round not found.");
    }

    const imageUrl = buildStreetViewStaticUrl({
      lat: challengeRound.street_view_lat,
      lng: challengeRound.street_view_lng,
      panoId: challengeRound.street_view_pano_id,
      heading: challengeRound.street_view_heading,
      pitch: challengeRound.street_view_pitch,
      fov: challengeRound.street_view_fov,
    });

    const imageResponse = await fetch(imageUrl, {
      next: { revalidate: 0 },
    });

    if (!imageResponse.ok || !imageResponse.body) {
      throw new Error("Failed to fetch clue image.");
    }

    return new NextResponse(imageResponse.body, {
      status: 200,
      headers: {
        "content-type":
          imageResponse.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Clue fetch failed.",
      },
      { status: 400 },
    );
  }
}
