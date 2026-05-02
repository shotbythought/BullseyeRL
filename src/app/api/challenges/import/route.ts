import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/api/auth";
import { calculateDifficultyRadiusMeters, getDifficultyMode } from "@/lib/domain/difficulty";
import { clipAreaToRadius } from "@/lib/domain/play-area";
import { createSeededRandom } from "@/lib/domain/random";
import {
  getBoundsForArea,
  getLocationPreset,
  pointInArea,
  sampleRandomPointInArea,
  type LocationArea,
  type LocationLatLng,
} from "@/lib/location-presets";
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

    const difficultyMode = getDifficultyMode(input.difficultyModeId);

    if (!difficultyMode) {
      throw new Error("Unknown difficulty mode.");
    }

    const difficultyRadiusMeters = calculateDifficultyRadiusMeters({
      difficultyModeId: input.difficultyModeId,
      roundTimeLimitSeconds: input.roundTimeLimitSeconds,
    });
    const presetArea = preset.regions.flatMap((region) => region.polygons);
    const finiteDifficulty = difficultyRadiusMeters != null;
    let nextRadiusCenter: LocationLatLng | null =
      finiteDifficulty &&
      input.difficultyOriginLat != null &&
      input.difficultyOriginLng != null
        ? {
            lat: input.difficultyOriginLat,
            lng: input.difficultyOriginLng,
          }
        : null;

    const seed = randomUUID();
    const random = createSeededRandom(seed);
    const playableRounds: Array<Record<string, unknown>> = [];
    const seenCoordinates = new Set<string>();
    const maxAttempts = Math.max(input.locationCount * 200, 400);

    for (let roundIndex = 0; roundIndex < input.locationCount; roundIndex += 1) {
      const roundArea = resolveRoundGenerationArea({
        baseArea: presetArea,
        center: nextRadiusCenter,
        radiusMeters: difficultyRadiusMeters,
      });

      if (!roundArea) {
        return NextResponse.json(
          {
            error:
              "The selected difficulty radius does not overlap the selected play area.",
          },
          { status: 422 },
        );
      }

      let acceptedRound: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const sample = finiteDifficulty
          ? sampleRandomPointInArea(roundArea.mapArea, random)
          : sampleRandomPointInArea(
              preset.regions[Math.floor(random() * preset.regions.length)].polygons,
              random,
            );

        if (!sample) {
          continue;
        }

        const region = preset.regions.find((candidate) =>
          pointInArea(sample, candidate.polygons),
        );
        const sourcePayload: Record<string, unknown> = {
          presetId: preset.id,
          presetLabel: preset.label,
          regionId: region?.id ?? null,
          regionLabel: region?.label ?? null,
        };

        if (finiteDifficulty) {
          sourcePayload.effectiveMapArea = roundArea.mapArea;
          sourcePayload.effectiveMapBounds = roundArea.mapBounds;
          sourcePayload.difficulty = {
            modeId: input.difficultyModeId,
            radiusCenter: roundArea.radiusCenter,
            radiusMeters: roundArea.radiusMeters,
          };
        }

        const coordinate = {
          lat: sample.lat,
          lng: sample.lng,
          source: sourcePayload,
        };
        const dedupeKey = `${coordinate.lat.toFixed(5)}:${coordinate.lng.toFixed(5)}`;

        if (seenCoordinates.has(dedupeKey)) {
          continue;
        }

        try {
          const metadata = await resolveStreetViewMetadata(coordinate.lat, coordinate.lng);
          seenCoordinates.add(dedupeKey);

          acceptedRound = {
            target_lat: coordinate.lat,
            target_lng: coordinate.lng,
            street_view_lat: metadata.cameraLat,
            street_view_lng: metadata.cameraLng,
            street_view_pano_id: metadata.panoId,
            street_view_heading: metadata.heading,
            street_view_pitch: metadata.pitch,
            street_view_fov: metadata.fov,
            source_payload: coordinate.source ?? null,
          };
          break;
        } catch {
          continue;
        }
      }

      if (!acceptedRound) {
        break;
      }

      playableRounds.push(acceptedRound);
      nextRadiusCenter = {
        lat: acceptedRound.target_lat as number,
        lng: acceptedRound.target_lng as number,
      };
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
        difficulty_mode_id: input.difficultyModeId,
        difficulty_meters_per_hour:
          difficultyMode.milesPerHour == null
            ? null
            : difficultyMode.milesPerHour * 1609.344,
        difficulty_origin_lat: finiteDifficulty ? input.difficultyOriginLat : null,
        difficulty_origin_lng: finiteDifficulty ? input.difficultyOriginLng : null,
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

function resolveRoundGenerationArea(input: {
  baseArea: LocationArea;
  center: LocationLatLng | null;
  radiusMeters: number | null;
}) {
  if (input.radiusMeters == null) {
    const mapBounds = getBoundsForArea(input.baseArea);

    return mapBounds
      ? {
          mapArea: input.baseArea,
          mapBounds,
          radiusCenter: input.center ?? { lat: 0, lng: 0 },
          radiusMeters: Number.POSITIVE_INFINITY,
        }
      : null;
  }

  if (!input.center) {
    throw new Error("Current location is required for finite difficulty.");
  }

  return clipAreaToRadius({
    area: input.baseArea,
    center: input.center,
    radiusMeters: input.radiusMeters,
  });
}
