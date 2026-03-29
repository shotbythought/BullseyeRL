import {
  RAW_LOCATION_AREAS,
  type RawLocationArea,
  type RawLocationPoint,
} from "@/lib/location-geometry-data";

export interface LocationLatLng {
  lat: number;
  lng: number;
}

export type LocationRing = LocationLatLng[];
export type LocationPolygon = LocationRing[];
export type LocationArea = LocationPolygon[];

export interface LocationRegion {
  id: string;
  label: string;
  polygons: LocationArea;
}

export interface LocationBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface LocationPreset {
  id: string;
  label: string;
  description: string;
  regions: LocationRegion[];
}

const POINT_ON_SEGMENT_TOLERANCE = 1e-9;

function toLocationLatLng([lng, lat]: RawLocationPoint): LocationLatLng {
  return { lat, lng };
}

function buildArea(rawArea: RawLocationArea): LocationArea {
  return rawArea.map((polygon) =>
    polygon.map((ring) => ring.map((point) => toLocationLatLng(point))),
  );
}

function createRectangleArea(bounds: LocationBounds): LocationArea {
  return [
    [
      [
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east },
        { lat: bounds.south, lng: bounds.east },
        { lat: bounds.south, lng: bounds.west },
      ],
    ],
  ];
}

function pointOnSegment(point: LocationLatLng, start: LocationLatLng, end: LocationLatLng) {
  const cross =
    (point.lat - start.lat) * (end.lng - start.lng) -
    (point.lng - start.lng) * (end.lat - start.lat);

  if (Math.abs(cross) > POINT_ON_SEGMENT_TOLERANCE) {
    return false;
  }

  const minLng = Math.min(start.lng, end.lng) - POINT_ON_SEGMENT_TOLERANCE;
  const maxLng = Math.max(start.lng, end.lng) + POINT_ON_SEGMENT_TOLERANCE;
  const minLat = Math.min(start.lat, end.lat) - POINT_ON_SEGMENT_TOLERANCE;
  const maxLat = Math.max(start.lat, end.lat) + POINT_ON_SEGMENT_TOLERANCE;

  return (
    point.lng >= minLng &&
    point.lng <= maxLng &&
    point.lat >= minLat &&
    point.lat <= maxLat
  );
}

function pointInRing(point: LocationLatLng, ring: LocationRing) {
  if (ring.length < 3) {
    return false;
  }

  let inside = false;

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];

    if (pointOnSegment(point, previous, current)) {
      return true;
    }

    const intersects =
      (current.lat > point.lat) !== (previous.lat > point.lat) &&
      point.lng <
        ((previous.lng - current.lng) * (point.lat - current.lat)) /
          (previous.lat - current.lat) +
          current.lng;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point: LocationLatLng, polygon: LocationPolygon) {
  if (!polygon.length || !pointInRing(point, polygon[0])) {
    return false;
  }

  return polygon.slice(1).every((ring) => !pointInRing(point, ring));
}

const ACTIVE_LOCATION_AREAS = {
  "new-york-manhattan": buildArea(RAW_LOCATION_AREAS["new-york-manhattan"]),
  "tokyo-23-wards": buildArea(RAW_LOCATION_AREAS["tokyo-23-wards"]),
  "london-greater-london": buildArea(RAW_LOCATION_AREAS["london-greater-london"]),
  "paris-arrondissements": buildArea(RAW_LOCATION_AREAS["paris-arrondissements"]),
  "san-francisco-city": buildArea(RAW_LOCATION_AREAS["san-francisco-city"]),
} satisfies Record<string, LocationArea>;

const LEGACY_LOCATION_REGIONS: LocationRegion[] = [
  {
    id: "new-york-core",
    label: "New York City",
    polygons: createRectangleArea({
      south: 40.5774,
      west: -74.15,
      north: 40.9176,
      east: -73.7004,
    }),
  },
  {
    id: "tokyo-core",
    label: "Tokyo",
    polygons: createRectangleArea({
      south: 35.528,
      west: 139.562,
      north: 35.838,
      east: 139.93,
    }),
  },
  {
    id: "london-core",
    label: "London",
    polygons: createRectangleArea({
      south: 51.3849,
      west: -0.3515,
      north: 51.6723,
      east: 0.1483,
    }),
  },
  {
    id: "paris-core",
    label: "Paris",
    polygons: createRectangleArea({
      south: 48.8155767,
      west: 2.2565,
      north: 48.9021619,
      east: 2.4107,
    }),
  },
  {
    id: "san-francisco-core",
    label: "San Francisco",
    polygons: createRectangleArea({
      south: 37.7082,
      west: -122.5149,
      north: 37.8149,
      east: -122.3791,
    }),
  },
];

const baseCityPresets: LocationPreset[] = [
  {
    id: "new-york",
    label: "New York City (Manhattan)",
    description: "Manhattan-only street grid, landmarks, and dense neighborhood variety.",
    regions: [
      {
        id: "new-york-manhattan",
        label: "Manhattan",
        polygons: ACTIVE_LOCATION_AREAS["new-york-manhattan"],
      },
    ],
  },
  {
    id: "tokyo",
    label: "Tokyo",
    description: "The 23 special wards, from dense cores to waterfront neighborhoods.",
    regions: [
      {
        id: "tokyo-23-wards",
        label: "Tokyo 23 Wards",
        polygons: ACTIVE_LOCATION_AREAS["tokyo-23-wards"],
      },
    ],
  },
  {
    id: "london",
    label: "London",
    description: "Greater London streets, river crossings, estates, and layered neighborhoods.",
    regions: [
      {
        id: "london-greater-london",
        label: "Greater London",
        polygons: ACTIVE_LOCATION_AREAS["london-greater-london"],
      },
    ],
  },
  {
    id: "paris",
    label: "Paris",
    description: "Paris proper within the arrondissements boundary, boulevards, and landmarks.",
    regions: [
      {
        id: "paris-arrondissements",
        label: "Paris Arrondissements",
        polygons: ACTIVE_LOCATION_AREAS["paris-arrondissements"],
      },
    ],
  },
  {
    id: "san-francisco",
    label: "San Francisco",
    description: "The city footprint around the peninsula, waterfronts, hills, and dense blocks.",
    regions: [
      {
        id: "san-francisco-city",
        label: "San Francisco",
        polygons: ACTIVE_LOCATION_AREAS["san-francisco-city"],
      },
    ],
  },
];

const globalCitiesPreset: LocationPreset = {
  id: "global-cities",
  label: "Mixed Global Cities",
  description: "Randomly pull rounds from Manhattan, Tokyo's 23 wards, Greater London, Paris, and San Francisco.",
  regions: baseCityPresets.flatMap((preset) => preset.regions),
};

const ALL_LOCATION_PRESETS: LocationPreset[] = [globalCitiesPreset, ...baseCityPresets];
const REGION_LOOKUP = new Map(
  [...baseCityPresets.flatMap((preset) => preset.regions), ...LEGACY_LOCATION_REGIONS].map(
    (region) => [region.id, region],
  ),
);

export const LOCATION_PRESETS: LocationPreset[] = baseCityPresets;

export function pointInArea(point: LocationLatLng, area: LocationArea) {
  return area.some((polygon) => pointInPolygon(point, polygon));
}

export function getBoundsForArea(area: LocationArea): LocationBounds | null {
  let south = Number.POSITIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let foundPoint = false;

  for (const polygon of area) {
    for (const ring of polygon) {
      for (const point of ring) {
        foundPoint = true;
        south = Math.min(south, point.lat);
        west = Math.min(west, point.lng);
        north = Math.max(north, point.lat);
        east = Math.max(east, point.lng);
      }
    }
  }

  if (!foundPoint) {
    return null;
  }

  return { south, west, north, east };
}

export function getLocationPreset(presetId: string) {
  return ALL_LOCATION_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function getLocationRegion(regionId: string) {
  return REGION_LOOKUP.get(regionId) ?? null;
}

export function getLocationPresetArea(presetId: string) {
  const preset = getLocationPreset(presetId);

  if (!preset) {
    return null;
  }

  return preset.regions.flatMap((region) => region.polygons);
}

export function getLocationRegionArea(regionId: string) {
  return getLocationRegion(regionId)?.polygons ?? null;
}

export function getBoundsForRegions(regions: LocationRegion[]): LocationBounds | null {
  return getBoundsForArea(regions.flatMap((region) => region.polygons));
}

export function getLocationPresetBounds(presetId: string) {
  const area = getLocationPresetArea(presetId);

  if (!area) {
    return null;
  }

  return getBoundsForArea(area);
}

export function getLocationRegionBounds(regionId: string) {
  const area = getLocationRegionArea(regionId);

  if (!area) {
    return null;
  }

  return getBoundsForArea(area);
}

export function sampleRandomPointInArea(
  area: LocationArea,
  random: () => number,
  maxAttempts = 1000,
) {
  const bounds = getBoundsForArea(area);

  if (!bounds) {
    return null;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const point = {
      lat: bounds.south + (bounds.north - bounds.south) * random(),
      lng: bounds.west + (bounds.east - bounds.west) * random(),
    };

    if (pointInArea(point, area)) {
      return point;
    }
  }

  return null;
}
