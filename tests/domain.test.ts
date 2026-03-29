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
  getBoundsForArea,
  getLocationPreset,
  getLocationPresetArea,
  getLocationPresetBounds,
  getLocationRegion,
  getLocationRegionArea,
  getLocationRegionBounds,
  LOCATION_PRESETS,
  pointInArea,
  sampleRandomPointInArea,
  type LocationArea,
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
    expect(presetIds).toContain("san-francisco-walking");
  });

  it("looks up presets by id", () => {
    expect(getLocationPreset("tokyo")?.label).toBe("Tokyo");
    expect(getLocationPreset("global-cities")?.label).toBe("Mixed Global Cities");
    expect(getLocationPreset("san-francisco-walking")?.label).toBe("SF (walking)");
    expect(getLocationPreset("san-francisco-walking")?.regions).toHaveLength(1);
    expect(getLocationPreset("missing")).toBeNull();
  });

  it("looks up individual round regions by id", () => {
    expect(getLocationRegion("new-york-manhattan")?.label).toBe("Manhattan");
    expect(getLocationRegion("paris-arrondissements")?.label).toBe("Paris Arrondissements");
    expect(getLocationRegion("san-francisco-city")?.label).toBe("San Francisco");
    expect(getLocationRegion("san-francisco-walking-area")?.label).toBe("SF (walking)");
    expect(getLocationRegion("san-francisco-core")?.label).toBe("San Francisco");
    expect(getLocationRegion("missing")).toBeNull();
  });

  it("returns stable viewport bounds for active presets and legacy regions", () => {
    expect(getLocationRegionBounds("san-francisco-core")).toEqual({
      south: 37.7082,
      west: -122.5149,
      north: 37.8149,
      east: -122.3791,
    });

    expect(getLocationRegionBounds("san-francisco-city")).toEqual({
      south: 37.7085,
      west: -122.513625,
      north: 37.810548,
      east: -122.360064,
    });

    expect(getLocationPresetBounds("san-francisco")).toEqual({
      south: 37.7085,
      west: -122.513625,
      north: 37.810548,
      east: -122.360064,
    });

    expect(getLocationPresetBounds("san-francisco-walking")).toEqual({
      south: 37.73216496748512,
      west: -122.45427136720835,
      north: 37.776844983568594,
      east: -122.38707873218037,
    });

    expect(getLocationRegionBounds("paris-core")).toEqual({
      south: 48.8155767,
      west: 2.2565,
      north: 48.9021619,
      east: 2.4107,
    });

    expect(getLocationRegionBounds("paris-arrondissements")).toEqual({
      south: 48.815576,
      west: 2.224122,
      north: 48.902156,
      east: 2.469704,
    });

    expect(getLocationPresetBounds("paris")).toEqual({
      south: 48.815576,
      west: 2.224122,
      north: 48.902156,
      east: 2.469704,
    });
  });

  it("exposes derived geometry areas for presets and regions", () => {
    expect(getLocationPresetArea("global-cities")).not.toBeNull();
    expect(getLocationPresetArea("paris")).not.toBeNull();
    expect(getLocationRegionArea("new-york-manhattan")).not.toBeNull();
    expect(getLocationRegionArea("new-york-core")).not.toBeNull();
    expect(
      pointInArea(
        { lat: 37.764119571818, lng: -122.427689247364 },
        getLocationPresetArea("san-francisco-walking")!,
      ),
    ).toBe(true);
    expect(
      pointInArea(
        { lat: 37.7578, lng: -122.4337 },
        getLocationPresetArea("san-francisco-walking")!,
      ),
    ).toBe(true);
    expect(
      pointInArea(
        { lat: 37.7563, lng: -122.4287 },
        getLocationPresetArea("san-francisco-walking")!,
      ),
    ).toBe(true);
  });
});

describe("location geometry helpers", () => {
  const testArea: LocationArea = [
    [
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 10 },
        { lat: 10, lng: 10 },
        { lat: 10, lng: 0 },
        { lat: 0, lng: 0 },
      ],
      [
        { lat: 4, lng: 4 },
        { lat: 4, lng: 6 },
        { lat: 6, lng: 6 },
        { lat: 6, lng: 4 },
        { lat: 4, lng: 4 },
      ],
    ],
    [
      [
        { lat: 20, lng: 20 },
        { lat: 20, lng: 22 },
        { lat: 22, lng: 22 },
        { lat: 22, lng: 20 },
        { lat: 20, lng: 20 },
      ],
    ],
  ];

  it("derives bounds from polygon and multipolygon areas", () => {
    expect(getBoundsForArea(testArea)).toEqual({
      south: 0,
      west: 0,
      north: 22,
      east: 22,
    });
  });

  it("detects points inside, outside, and within holes", () => {
    expect(pointInArea({ lat: 2, lng: 2 }, testArea)).toBe(true);
    expect(pointInArea({ lat: 5, lng: 5 }, testArea)).toBe(false);
    expect(pointInArea({ lat: 15, lng: 15 }, testArea)).toBe(false);
    expect(pointInArea({ lat: 21, lng: 21 }, testArea)).toBe(true);
  });

  it("samples only valid points from within polygon areas", () => {
    let state = 123456789;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };

    for (let index = 0; index < 25; index += 1) {
      const point = sampleRandomPointInArea(testArea, random);
      expect(point).not.toBeNull();
      expect(point && pointInArea(point, testArea)).toBe(true);
    }
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
