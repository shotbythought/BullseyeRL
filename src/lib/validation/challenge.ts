import { z } from "zod";

import { validateRadii } from "@/lib/domain/scoring";

export const challengeInputSchema = z.object({
  presetId: z.string().min(1),
  locationCount: z.coerce.number().int().min(1).max(50),
  guessLimitPerRound: z.coerce.number().int().min(1).max(50),
  roundTimeLimitSeconds: z.coerce.number().int().positive().max(86400).nullable().optional().default(3600),
  radiiMeters: z
    .array(z.coerce.number().int().positive())
    .min(1)
    .max(12)
    .transform((radii) => validateRadii(radii)),
});

export type ChallengeInput = z.infer<typeof challengeInputSchema>;
