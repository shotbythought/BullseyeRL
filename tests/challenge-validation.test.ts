import { describe, expect, it } from "vitest";

import { challengeInputSchema } from "../src/lib/validation/challenge";

describe("challenge timer validation", () => {
  it("defaults the round timer to one hour when omitted", () => {
    const challenge = challengeInputSchema.parse({
      presetId: "san-francisco",
      locationCount: 5,
      guessLimitPerRound: 4,
      radiiMeters: [50, 150, 2000, 5000],
    });

    expect(challenge.roundTimeLimitSeconds).toBe(3600);
  });

  it("allows disabling the round timer", () => {
    const challenge = challengeInputSchema.parse({
      presetId: "san-francisco",
      locationCount: 5,
      guessLimitPerRound: 4,
      roundTimeLimitSeconds: null,
      radiiMeters: [50, 150, 2000, 5000],
    });

    expect(challenge.roundTimeLimitSeconds).toBeNull();
  });
});
