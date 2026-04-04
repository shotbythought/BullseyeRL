import { getBoundsForArea, getLocationPresetArea } from "@/lib/location-presets";

const tutorialMapArea = getLocationPresetArea("san-francisco-walking");

if (!tutorialMapArea) {
  throw new Error('Tutorial map area "san-francisco-walking" is unavailable.');
}

const tutorialMapBounds = getBoundsForArea(tutorialMapArea);

if (!tutorialMapBounds) {
  throw new Error("Tutorial map bounds could not be derived.");
}

export const TUTORIAL_RADII = [50, 500, 2000, 5000] as const;
export const TUTORIAL_MAP_AREA = tutorialMapArea;
export const TUTORIAL_MAP_BOUNDS = tutorialMapBounds;
export const TUTORIAL_CLUE_IMAGE_URL = "/api/tutorial/clue";

export const TUTORIAL_TARGET = {
  lat: 37.76051,
  lng: -122.390497,
} as const;

export const TUTORIAL_START_POSITION = {
  latitude: 37.76051,
  longitude: -122.4475,
  accuracy: 18,
} as const;

export const TUTORIAL_WALKED_POSITION = {
  latitude: 37.76069,
  longitude: -122.390812,
  accuracy: 8,
} as const;

export const TUTORIAL_GET_ME_CLOSER_CIRCLE = {
  lat: TUTORIAL_TARGET.lat,
  lng: TUTORIAL_TARGET.lng,
  radiusMeters: TUTORIAL_RADII[2],
} as const;

export const TUTORIAL_CLUE = {
  lat: TUTORIAL_TARGET.lat,
  lng: TUTORIAL_TARGET.lng,
  heading: 180,
  pitch: 0,
  fov: 90,
} as const;
