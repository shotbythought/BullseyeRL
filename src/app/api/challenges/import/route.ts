import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { createSeededRandom } from "@/lib/domain/random";
import { getLocationPreset } from "@/lib/location-presets";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { resolveStreetViewMetadata } from "@/lib/google/street-view";
import { challengeInputSchema } from "@/lib/validation/challenge";

export async function POST(request: Request) {
  try {
    const { user } = await requireBearerUser();
    const input = challengeInputSchema.parse(await request.json());
    const preset = getLocationPreset(input.presetId);

    if (!preset) {
      throw new Error("Unknown city preset.");
    }

    const seed = randomUUID();
    const random = createSeededRandom(seed);
    const playableRounds: Array<Record<string, unknown>> = [];
    const seenCoordinates = new Set<string>();
    const maxAttempts = Math.max(input.locationCount * 60, 120);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const region = preset.regions[Math.floor(random() * preset.regions.length)];
      const coordinate = {
        lat: region.minLat + (region.maxLat - region.minLat) * random(),
        lng: region.minLng + (region.maxLng - region.minLng) * random(),
        source: {
          presetId: preset.id,
          presetLabel: preset.label,
          regionId: region.id,
          regionLabel: region.label,
        },
      };
      const dedupeKey = `${coordinate.lat.toFixed(5)}:${coordinate.lng.toFixed(5)}`;

      if (seenCoordinates.has(dedupeKey)) {
        continue;
      }

      try {
        const metadata = await resolveStreetViewMetadata(coordinate.lat, coordinate.lng);
        seenCoordinates.add(dedupeKey);

        playableRounds.push({
          target_lat: coordinate.lat,
          target_lng: coordinate.lng,
          street_view_lat: metadata.cameraLat,
          street_view_lng: metadata.cameraLng,
          street_view_pano_id: metadata.panoId,
          street_view_heading: metadata.heading,
          street_view_pitch: metadata.pitch,
          street_view_fov: metadata.fov,
          source_payload: coordinate.source ?? null,
        });

        if (playableRounds.length === input.locationCount) {
          break;
        }
      } catch {
        continue;
      }
    }

    if (playableRounds.length < input.locationCount) {
      return NextResponse.json(
        {
          error:
            "Not enough Street View-backed random points were found inside that city preset to satisfy the requested challenge size.",
        },
        { status: 422 },
      );
    }

    const supabase = getServiceSupabaseClient();
    const { data: challenge, error: challengeError } = await supabase
      .from("challenges")
      .insert({
        source_map_url: `preset://${preset.id}`,
        source_map_id: preset.id,
        title: `${preset.label} Bullseye`,
        location_count: input.locationCount,
        guess_limit_per_round: input.guessLimitPerRound,
        round_time_limit_seconds: input.roundTimeLimitSeconds,
        radii_meters: input.radiiMeters,
        import_seed: seed,
        status: "ready",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (challengeError || !challenge) {
      throw new Error(challengeError?.message ?? "Failed to create challenge.");
    }

    const challengeRounds = playableRounds.map((round, roundIndex) => ({
      challenge_id: challenge.id,
      round_index: roundIndex,
      ...round,
    }));

    const { error: roundsError } = await supabase.from("challenge_rounds").insert(challengeRounds);

    if (roundsError) {
      throw new Error(roundsError.message);
    }

    return NextResponse.json({
      challengeId: challenge.id,
      title: challenge.title,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Challenge import failed.",
      },
      { status: 400 },
    );
  }
}
