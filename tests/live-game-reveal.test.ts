import { describe, expect, it } from "vitest";

import { shouldShowJustCompletedReveal } from "@/lib/live-game-reveal";

describe("shouldShowJustCompletedReveal", () => {
  it("returns true when the current round just became the completed final reveal", () => {
    expect(
      shouldShowJustCompletedReveal(
        {
          currentRoundId: "round-3",
          roundResolved: false,
          status: "in_progress",
          target: null,
        },
        {
          currentRoundId: "round-3",
          roundResolved: true,
          status: "completed",
          target: {
            lat: 1,
            lng: 2,
          },
        },
      ),
    ).toBe(true);
  });

  it("returns false when opening an already completed game fresh", () => {
    expect(
      shouldShowJustCompletedReveal(null, {
        currentRoundId: "round-3",
        roundResolved: true,
        status: "completed",
        target: {
          lat: 1,
          lng: 2,
        },
      }),
    ).toBe(false);
  });

  it("returns false after the scorecard is already available", () => {
    expect(
      shouldShowJustCompletedReveal(
        {
          currentRoundId: "round-3",
          roundResolved: true,
          status: "completed",
          target: {
            lat: 1,
            lng: 2,
          },
        },
        {
          currentRoundId: "round-3",
          roundResolved: true,
          status: "completed",
          target: {
            lat: 1,
            lng: 2,
          },
        },
      ),
    ).toBe(false);
  });

  it("returns false when the response is for a different round", () => {
    expect(
      shouldShowJustCompletedReveal(
        {
          currentRoundId: "round-2",
          roundResolved: true,
          status: "in_progress",
          target: {
            lat: 1,
            lng: 2,
          },
        },
        {
          currentRoundId: "round-3",
          roundResolved: true,
          status: "completed",
          target: {
            lat: 3,
            lng: 4,
          },
        },
      ),
    ).toBe(false);
  });
});
