import { describe, expect, it } from "vitest";

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
  SCORE_STEP,
  didImproveBestRadius,
  pointsForRadius,
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

  it("detects only strictly smaller successes as improvements", () => {
    expect(didImproveBestRadius(null, 100)).toBe(true);
    expect(didImproveBestRadius(250, 100)).toBe(true);
    expect(didImproveBestRadius(100, 250)).toBe(false);
    expect(didImproveBestRadius(100, 100)).toBe(false);
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
