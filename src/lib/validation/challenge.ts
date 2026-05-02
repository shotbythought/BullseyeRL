import { z } from "zod";

import {
  calculateDifficultyRadiusMeters,
  getDifficultyMode,
  isFiniteDifficultyMode,
} from "@/lib/domain/difficulty";
import { OPEN_LOCATION_PRESET_ID } from "@/lib/location-presets";
import { getGuessRadiusMaxMeters, validateGuessRadiusBounds } from "@/lib/domain/scoring";

export const challengeInputSchema = z
  .object({
    presetId: z.string().min(1),
    locationCount: z.coerce.number().int().min(1).max(50),
    guessLimitPerRound: z.coerce.number().int().min(1).max(50),
    roundTimeLimitSeconds: z.coerce.number().int().positive().max(86400).nullable().optional().default(3600),
    difficultyModeId: z.string().min(1).optional().default("infinite"),
    difficultyOriginLat: z.coerce.number().min(-90).max(90).nullable().optional(),
    difficultyOriginLng: z.coerce.number().min(-180).max(180).nullable().optional(),
  })
  .superRefine((input, context) => {
    const mode = getDifficultyMode(input.difficultyModeId);

    if (!mode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unknown difficulty mode.",
        path: ["difficultyModeId"],
      });
      return;
    }

    const difficultyRadiusMeters = calculateDifficultyRadiusMeters({
      difficultyModeId: input.difficultyModeId,
      roundTimeLimitSeconds: input.roundTimeLimitSeconds,
    });

    try {
      validateGuessRadiusBounds({
        maxRadiusMeters: getGuessRadiusMaxMeters(difficultyRadiusMeters),
      });
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : "Selected difficulty radius is too small for a 50 meter bullseye.",
        path: ["difficultyModeId"],
      });
    }

    const finiteDifficulty = isFiniteDifficultyMode(input.difficultyModeId);

    if (input.presetId === OPEN_LOCATION_PRESET_ID && !finiteDifficulty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Open play area requires a finite difficulty radius.",
        path: ["difficultyModeId"],
      });
      return;
    }

    if (!finiteDifficulty) {
      return;
    }

    if (input.difficultyOriginLat == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current latitude is required for finite difficulty.",
        path: ["difficultyOriginLat"],
      });
    }

    if (input.difficultyOriginLng == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current longitude is required for finite difficulty.",
        path: ["difficultyOriginLng"],
      });
    }
  });

export type ChallengeInput = z.infer<typeof challengeInputSchema>;
