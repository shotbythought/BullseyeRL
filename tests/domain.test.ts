import { describe, expect, it } from "vitest";

import {
  getGetMeCloserHintRadius,
  pointHintDirectionFromBearing,
} from "../src/lib/domain/hints";
import {
  bearingBetweenPoints,
  haversineDistanceMeters,
} from "../src/lib/domain/geodesy";
import {
  getLocationPreset,
  getLocationPresetBounds,
  getLocationRegion,
  getLocationRegionBounds,
  LOCATION_PRESETS,
} from "../src/lib/location-presets";
import {
  applyHintPenalty,
  SCORE_STEP,
  didImproveBestRadius,
  maxPointsForRadii,
  pointsForRadius,
  scorecardLabelForRadius,
  validateRadii,
} from "../src/lib/domain/scoring";

describe("location presets", () => {
  it("exposes only the single-city presets in the picker", () => {
    const presetIds = LOCATION_PRESETS.map((preset) => preset.id);
    expect(presetIds).not.toContain("global-cities");
    expect(presetIds).toContain("new-york");
    expect(presetIds).toContain("tokyo");
    expect(presetIds).toContain("london");
    expect(presetIds).toContain("paris");
    expect(presetIds).toContain("san-francisco");
  });

  it("looks up presets by id", () => {
    expect(getLocationPreset("tokyo")?.label).toBe("Tokyo");
    expect(getLocationPreset("global-cities")?.label).toBe("Mixed Global Cities");
    expect(getLocationPreset("missing")).toBeNull();
  });

  it("looks up individual round regions by id", () => {
    expect(getLocationRegion("san-francisco-core")?.label).toBe("San Francisco");
    expect(getLocationRegion("missing")).toBeNull();
  });

  it("returns stable viewport bounds for presets and regions", () => {
    expect(getLocationRegionBounds("san-francisco-core")).toEqual({
      south: 37.7081,
      west: -122.5149,
      north: 37.8324,
      east: -122.357,
    });

    expect(getLocationPresetBounds("san-francisco")).toEqual({
      south: 37.7081,
      west: -122.5149,
      north: 37.8324,
      east: -122.357,
    });
  });
});

describe("scoring helpers", () => {
  it("validates strictly ascending radii", () => {
    expect(validateRadii([25, 100, 250])).toEqual([25, 100, 250]);
    expect(() => validateRadii([25, 25, 100])).toThrow(/unique/);
    expect(() => validateRadii([100, 25])).toThrow(/ascending/);
  });

  it("maps smallest successful radius to max points", () => {
    const radii = [25, 100, 250, 500];

    expect(pointsForRadius(radii, 25)).toBe(4 * SCORE_STEP);
    expect(pointsForRadius(radii, 100)).toBe(3 * SCORE_STEP);
    expect(pointsForRadius(radii, 500)).toBe(1 * SCORE_STEP);
    expect(pointsForRadius(radii, null)).toBe(0);
  });

  it("labels successful radii from best tier downward", () => {
    expect(scorecardLabelForRadius([25], 25)).toBe("Bullseye");
    expect(scorecardLabelForRadius([25], null)).toBe("Miss");
    expect(scorecardLabelForRadius([25, 100], 100)).toBe("Fair");
    expect(scorecardLabelForRadius([25, 100, 250, 500], 25)).toBe("Bullseye");
    expect(scorecardLabelForRadius([25, 100, 250, 500], 100)).toBe("Fair");
    expect(scorecardLabelForRadius([25, 100, 250, 500], 250)).toBe("mid minus");
    expect(scorecardLabelForRadius([25, 100, 250, 500], 500)).toBe("garbo");
  });

  it("applies hint penalties without going negative", () => {
    expect(applyHintPenalty(4000, 1000)).toBe(3000);
    expect(applyHintPenalty(1000, 2000)).toBe(0);
    expect(maxPointsForRadii([25, 100, 250, 500])).toBe(4 * SCORE_STEP);
  });

  it("detects only strictly smaller successes as improvements", () => {
    expect(didImproveBestRadius(null, 100)).toBe(true);
    expect(didImproveBestRadius(250, 100)).toBe(true);
    expect(didImproveBestRadius(100, 250)).toBe(false);
    expect(didImproveBestRadius(100, 100)).toBe(false);
  });
});

describe("hint helpers", () => {
  it("uses the third radius tier for get me closer", () => {
    expect(getGetMeCloserHintRadius([25, 100, 250, 500])).toBe(250);
    expect(getGetMeCloserHintRadius([25, 100])).toBeNull();
  });

  it("maps bearings into four cardinal directions", () => {
    expect(pointHintDirectionFromBearing(0)).toBe("north");
    expect(pointHintDirectionFromBearing(44.9)).toBe("north");
    expect(pointHintDirectionFromBearing(45)).toBe("east");
    expect(pointHintDirectionFromBearing(134.9)).toBe("east");
    expect(pointHintDirectionFromBearing(135)).toBe("south");
    expect(pointHintDirectionFromBearing(224.9)).toBe("south");
    expect(pointHintDirectionFromBearing(225)).toBe("west");
    expect(pointHintDirectionFromBearing(314.9)).toBe("west");
    expect(pointHintDirectionFromBearing(315)).toBe("north");
  });
});

describe("geodesy helpers", () => {
  it("computes distances in meters", () => {
    const distance = haversineDistanceMeters(37.7749, -122.4194, 37.7759, -122.4194);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });

  it("computes heading toward the target", () => {
    const bearing = bearingBetweenPoints(37.7749, -122.4194, 37.7759, -122.4194);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(1);
  });
});
