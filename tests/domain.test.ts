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
  calculateDifficultyRadiusMeters,
  DEFAULT_DIFFICULTY_TIMER_SECONDS,
  METERS_PER_MILE,
} from "../src/lib/domain/difficulty";
import { clipAreaToRadius } from "../src/lib/domain/play-area";
import {
  getBoundsForArea,
  getLocationPreset,
  getLocationPresetArea,
  getLocationPresetBounds,
  getLocationPresetExclusionArea,
  getLocationRegion,
  getLocationRegionArea,
  getLocationRegionBounds,
  getLocationRegionExclusionArea,
  LOCATION_PRESETS,
  pointInArea,
  sampleRandomPointInArea,
  type LocationArea,
} from "../src/lib/location-presets";
import {
  BULLSEYE_RADIUS_METERS,
  FIRST_NON_BULLSEYE_POINTS,
  FIRST_NON_BULLSEYE_RADIUS_METERS,
  INFINITE_GUESS_RADIUS_MAX_METERS,
  MAX_ROUND_POINTS,
  RADIUS_SLIDER_BULLSEYE_LOCK_END,
  RADIUS_SLIDER_MAX,
  applyHintPenalty,
  didImproveBestRadius,
  getGuessRadiusMaxMeters,
  maxPointsForRadii,
  pointsForRadius,
  radiusFromSliderPosition,
  scorecardLabelForRadius,
  sliderPositionFromRadius,
  validateRadii,
} from "../src/lib/domain/scoring";

describe("location presets", () => {
  it("exposes playable presets in the picker", () => {
    const presetIds = LOCATION_PRESETS.map((preset) => preset.id);
    expect(presetIds).not.toContain("global-cities");
    expect(presetIds).toContain("open");
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
    expect(getLocationPreset("open")?.label).toBe("Open");
    expect(getLocationPreset("san-francisco-walking")?.label).toBe("SF (walking)");
    expect(getLocationPreset("san-francisco-walking")?.regions).toHaveLength(1);
    expect(getLocationPreset("missing")).toBeNull();
  });

  it("looks up individual round regions by id", () => {
    expect(getLocationRegion("open-world")?.label).toBe("Open");
    expect(getLocationRegion("new-york-manhattan")?.label).toBe("Manhattan");
    expect(getLocationRegion("paris-arrondissements")?.label).toBe("Paris Arrondissements");
    expect(getLocationRegion("san-francisco-city")?.label).toBe("San Francisco");
    expect(getLocationRegion("san-francisco-walking-area")?.label).toBe("SF (walking)");
    expect(getLocationRegion("san-francisco-core")?.label).toBe("San Francisco");
    expect(getLocationRegion("missing")).toBeNull();
  });

  it("returns stable viewport bounds for active presets and legacy regions", () => {
    expect(getLocationPresetBounds("open")).toEqual({
      south: -90,
      west: -180,
      north: 90,
      east: 180,
    });

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
    expect(getLocationPresetArea("open")).not.toBeNull();
    expect(getLocationPresetArea("paris")).not.toBeNull();
    expect(getLocationRegionArea("new-york-manhattan")).not.toBeNull();
    expect(getLocationRegionArea("new-york-core")).not.toBeNull();
    expect(pointInArea({ lat: 0, lng: 0 }, getLocationPresetArea("open")!)).toBe(true);
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

  it("exposes San Francisco exclusion areas for Tenderloin and Hunters Point", () => {
    const sanFranciscoArea = getLocationPresetArea("san-francisco")!;
    const exclusionArea = getLocationPresetExclusionArea("san-francisco")!;

    expect(getLocationRegionExclusionArea("san-francisco-city")).toEqual(exclusionArea);
    expect(pointInArea({ lat: 37.783, lng: -122.414 }, sanFranciscoArea)).toBe(true);
    expect(pointInArea({ lat: 37.783, lng: -122.414 }, exclusionArea)).toBe(true);
    expect(pointInArea({ lat: 37.73, lng: -122.38 }, sanFranciscoArea)).toBe(true);
    expect(pointInArea({ lat: 37.73, lng: -122.38 }, exclusionArea)).toBe(true);
    expect(pointInArea({ lat: 37.7641, lng: -122.4277 }, exclusionArea)).toBe(false);
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

  it("clips polygon areas to a radius circle", () => {
    const clipped = clipAreaToRadius({
      area: testArea,
      center: { lat: 2, lng: 2 },
      radiusMeters: 200000,
    });

    expect(clipped).not.toBeNull();
    expect(clipped?.mapBounds.south).toBeGreaterThanOrEqual(0);
    expect(clipped?.mapBounds.west).toBeGreaterThanOrEqual(0);
    expect(clipped?.mapBounds.north).toBeLessThan(5);
    expect(clipped?.mapBounds.east).toBeLessThan(5);
    expect(pointInArea({ lat: 2, lng: 2 }, clipped!.mapArea)).toBe(true);
    expect(pointInArea({ lat: 9, lng: 9 }, clipped!.mapArea)).toBe(false);
  });

  it("returns null for empty radius intersections", () => {
    expect(
      clipAreaToRadius({
        area: testArea,
        center: { lat: -20, lng: -20 },
        radiusMeters: 500,
      }),
    ).toBeNull();
  });
});

describe("difficulty helpers", () => {
  it("derives finite difficulty radius from round timer", () => {
    expect(
      calculateDifficultyRadiusMeters({
        difficultyModeId: "public-transport",
        roundTimeLimitSeconds: 7200,
      }),
    ).toBe(Math.round(1 * METERS_PER_MILE * 2));
  });

  it("uses one hour for disabled timer radius calculation", () => {
    expect(
      calculateDifficultyRadiusMeters({
        difficultyModeId: "driving",
        roundTimeLimitSeconds: null,
      }),
    ).toBe(Math.round(4 * METERS_PER_MILE * (DEFAULT_DIFFICULTY_TIMER_SECONDS / 3600)));
  });

  it("returns null for infinite radius", () => {
    expect(
      calculateDifficultyRadiusMeters({
        difficultyModeId: "infinite",
        roundTimeLimitSeconds: 3600,
      }),
    ).toBeNull();
  });
});

describe("scoring helpers", () => {
  it("validates strictly ascending radii", () => {
    expect(validateRadii([25, 100, 250])).toEqual([25, 100, 250]);
    expect(() => validateRadii([25, 25, 100])).toThrow(/unique/);
    expect(() => validateRadii([100, 25])).toThrow(/ascending/);
  });

  it("maps successful radii to log-scale points", () => {
    expect(pointsForRadius(50, 5000)).toBe(MAX_ROUND_POINTS);
    expect(pointsForRadius(250, 5000)).toBe(FIRST_NON_BULLSEYE_POINTS);
    expect(pointsForRadius(5000, 5000)).toBe(1);
    expect(pointsForRadius(null, 5000)).toBe(0);
    expect(pointsForRadius(50, 50)).toBe(MAX_ROUND_POINTS);
  });

  it("awards equal extra points for halving radius", () => {
    const twoKmToOneKmDelta = pointsForRadius(1000, 5000) - pointsForRadius(2000, 5000);
    const oneKmToFiveHundredDelta = pointsForRadius(500, 5000) - pointsForRadius(1000, 5000);

    expect(Math.abs(twoKmToOneKmDelta - oneKmToFiveHundredDelta)).toBeLessThanOrEqual(1);
  });

  it("maps slider positions to log-scale radii", () => {
    expect(radiusFromSliderPosition(0, 5000)).toBe(BULLSEYE_RADIUS_METERS);
    expect(radiusFromSliderPosition(RADIUS_SLIDER_BULLSEYE_LOCK_END, 5000)).toBe(
      BULLSEYE_RADIUS_METERS,
    );
    expect(radiusFromSliderPosition(RADIUS_SLIDER_BULLSEYE_LOCK_END + 1, 5000)).toBe(
      FIRST_NON_BULLSEYE_RADIUS_METERS,
    );
    expect(radiusFromSliderPosition(RADIUS_SLIDER_MAX, 5000)).toBe(5000);
    expect(sliderPositionFromRadius(BULLSEYE_RADIUS_METERS, 5000)).toBe(0);
    expect(sliderPositionFromRadius(FIRST_NON_BULLSEYE_RADIUS_METERS, 5000)).toBe(
      RADIUS_SLIDER_BULLSEYE_LOCK_END + 1,
    );
    expect(sliderPositionFromRadius(5000, 5000)).toBe(RADIUS_SLIDER_MAX);
  });

  it("derives max guess radius from difficulty", () => {
    expect(getGuessRadiusMaxMeters(null)).toBe(INFINITE_GUESS_RADIUS_MAX_METERS);
    expect(getGuessRadiusMaxMeters(161)).toBe(161);
  });

  it("labels successful radii by score band", () => {
    expect(scorecardLabelForRadius(50, 5000)).toBe("Bullseye");
    expect(scorecardLabelForRadius(null, 5000)).toBe("Miss");
    expect(scorecardLabelForRadius(100, 5000)).toBe("Fair");
    expect(scorecardLabelForRadius(750, 5000)).toBe("mid minus");
    expect(scorecardLabelForRadius(5000, 5000)).toBe("garbo");
  });

  it("applies hint penalties without going negative", () => {
    expect(applyHintPenalty(100, 10)).toBe(90);
    expect(applyHintPenalty(10, 20)).toBe(0);
    expect(maxPointsForRadii([25, 100, 250, 500])).toBe(MAX_ROUND_POINTS);
  });

  it("detects only strictly smaller successes as improvements", () => {
    expect(didImproveBestRadius(null, 100)).toBe(true);
    expect(didImproveBestRadius(250, 100)).toBe(true);
    expect(didImproveBestRadius(100, 250)).toBe(false);
    expect(didImproveBestRadius(100, 100)).toBe(false);
  });
});

describe("hint helpers", () => {
  it("uses 40 percent of max radius for get me closer", () => {
    expect(getGetMeCloserHintRadius(5000)).toBe(2000);
    expect(getGetMeCloserHintRadius(50)).toBeNull();
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
