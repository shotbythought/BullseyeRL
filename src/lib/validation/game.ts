import { z } from "zod";

import { ROUND_HINT_TYPES } from "@/lib/domain/hints";

export const createGameSchema = z.object({
  challengeId: z.string().uuid(),
  nickname: z.string().trim().min(2).max(24),
});

export const joinGameSchema = z.object({
  joinCode: z.string().trim().min(4).max(12),
  nickname: z.string().trim().min(2).max(24),
});

export const submitGuessSchema = z.object({
  gameId: z.string().uuid(),
  selectedRadiusMeters: z.coerce.number().int().positive(),
  currentLat: z.coerce.number().min(-90).max(90),
  currentLng: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().nonnegative().nullable().optional(),
});

export const advanceRoundSchema = z.object({
  gameId: z.string().uuid(),
});

export const setNextRoundSchema = z.object({
  gameId: z.string().uuid(),
});

export const useHintSchema = z
  .object({
    gameId: z.string().uuid(),
    hintType: z.enum(ROUND_HINT_TYPES),
    currentLat: z.coerce.number().min(-90).max(90).optional(),
    currentLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .superRefine((value, context) => {
    if (value.hintType !== "point_me") {
      return;
    }

    if (value.currentLat == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current latitude is required for Point me.",
        path: ["currentLat"],
      });
    }

    if (value.currentLng == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current longitude is required for Point me.",
        path: ["currentLng"],
      });
    }
  });
