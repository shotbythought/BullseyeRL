import { z } from "zod";

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
