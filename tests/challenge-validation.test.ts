import { describe, expect, it } from "vitest";

import { challengeInputSchema } from "../src/lib/validation/challenge";

describe("challenge timer validation", () => {
  it("defaults the round timer to one hour when omitted", () => {
    const challenge = challengeInputSchema.parse({
      presetId: "san-francisco",
      locationCount: 3,
      guessLimitPerRound: 5,
    });

    expect(challenge.roundTimeLimitSeconds).toBe(3600);
  });

  it("allows disabling the round timer", () => {
    const challenge = challengeInputSchema.parse({
      presetId: "san-francisco",
      locationCount: 3,
      guessLimitPerRound: 5,
      roundTimeLimitSeconds: null,
    });

    expect(challenge.roundTimeLimitSeconds).toBeNull();
  });

  it("defaults difficulty to infinite radius", () => {
    const challenge = challengeInputSchema.parse({
      presetId: "san-francisco",
      locationCount: 3,
      guessLimitPerRound: 5,
    });

    expect(challenge.difficultyModeId).toBe("infinite");
    expect(challenge.difficultyOriginLat).toBeUndefined();
    expect(challenge.difficultyOriginLng).toBeUndefined();
  });

  it("requires origin coordinates for finite difficulty", () => {
    expect(() =>
      challengeInputSchema.parse({
        presetId: "san-francisco",
        locationCount: 3,
        guessLimitPerRound: 5,
        difficultyModeId: "biking",
      }),
    ).toThrow(/Current latitude/);

    const challenge = challengeInputSchema.parse({
      presetId: "san-francisco",
      locationCount: 3,
      guessLimitPerRound: 5,
      difficultyModeId: "biking",
      difficultyOriginLat: 37.76,
      difficultyOriginLng: -122.42,
    });

    expect(challenge.difficultyModeId).toBe("biking");
  });

  it("requires finite difficulty for the open play area", () => {
    expect(() =>
      challengeInputSchema.parse({
        presetId: "open",
        locationCount: 3,
        guessLimitPerRound: 5,
        difficultyModeId: "infinite",
      }),
    ).toThrow(/finite difficulty/);
  });

  it("rejects finite difficulty when the max guess radius is below the bullseye", () => {
    expect(() =>
      challengeInputSchema.parse({
        presetId: "san-francisco",
        locationCount: 3,
        guessLimitPerRound: 5,
        roundTimeLimitSeconds: 30,
        difficultyModeId: "quarter-mile",
        difficultyOriginLat: 37.76,
        difficultyOriginLng: -122.42,
      }),
    ).toThrow(/at least 50 meters/);
  });
});
