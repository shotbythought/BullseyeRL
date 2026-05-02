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
  exclusions?: LocationExclusion[];
}

export interface LocationExclusion {
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

export const OPEN_LOCATION_PRESET_ID = "open";

const POINT_ON_SEGMENT_TOLERANCE = 1e-9;
const OPEN_LOCATION_BOUNDS: LocationBounds = {
  south: -90,
  west: -180,
  north: 90,
  east: 180,
};

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
  "san-francisco-walking": buildArea(RAW_LOCATION_AREAS["san-francisco-walking"]),
} satisfies Record<string, LocationArea>;

const SAN_FRANCISCO_EXCLUSIONS: LocationExclusion[] = [
  {
    id: "san-francisco-tenderloin-exclusion",
    label: "Tenderloin",
    polygons: [
      [
        [
          { lat: 37.775278, lng: -122.419168 },
          { lat: 37.775147, lng: -122.419256 },
          { lat: 37.775422, lng: -122.419397 },
          { lat: 37.785567, lng: -122.421442 },
          { lat: 37.785794, lng: -122.421298 },
          { lat: 37.786619, lng: -122.42157 },
          { lat: 37.788293, lng: -122.408402 },
          { lat: 37.784699, lng: -122.407698 },
          { lat: 37.78456, lng: -122.407337 },
          { lat: 37.775645, lng: -122.418704 },
          { lat: 37.775278, lng: -122.419168 },
        ],
      ],
    ],
  },
  {
    id: "san-francisco-hunters-point-exclusion",
    label: "Hunters Point",
    polygons: [
      [
        [
          { lat: 37.75307, lng: -122.381578 },
          { lat: 37.752249, lng: -122.376087 },
          { lat: 37.748707, lng: -122.375771 },
          { lat: 37.747591, lng: -122.387338 },
          { lat: 37.748546, lng: -122.392933 },
          { lat: 37.747441, lng: -122.392911 },
          { lat: 37.747144, lng: -122.376092 },
          { lat: 37.744972, lng: -122.374115 },
          { lat: 37.745505, lng: -122.372762 },
          { lat: 37.740134, lng: -122.367631 },
          { lat: 37.738805, lng: -122.373598 },
          { lat: 37.738222, lng: -122.367395 },
          { lat: 37.737043, lng: -122.372923 },
          { lat: 37.738394, lng: -122.37632 },
          { lat: 37.737295, lng: -122.374883 },
          { lat: 37.732881, lng: -122.375689 },
          { lat: 37.734209, lng: -122.371913 },
          { lat: 37.731947, lng: -122.367461 },
          { lat: 37.733803, lng: -122.365259 },
          { lat: 37.731916, lng: -122.36619 },
          { lat: 37.73283, lng: -122.365013 },
          { lat: 37.731715, lng: -122.36581 },
          { lat: 37.732143, lng: -122.362876 },
          { lat: 37.73009, lng: -122.361907 },
          { lat: 37.729783, lng: -122.35879 },
          { lat: 37.728521, lng: -122.362283 },
          { lat: 37.729245, lng: -122.357479 },
          { lat: 37.728217, lng: -122.360408 },
          { lat: 37.72871, lng: -122.356967 },
          { lat: 37.726282, lng: -122.3577 },
          { lat: 37.725219, lng: -122.361641 },
          { lat: 37.724624, lng: -122.357838 },
          { lat: 37.723775, lng: -122.361524 },
          { lat: 37.725512, lng: -122.365324 },
          { lat: 37.721629, lng: -122.359976 },
          { lat: 37.722102, lng: -122.36381 },
          { lat: 37.719309, lng: -122.359129 },
          { lat: 37.719055, lng: -122.363657 },
          { lat: 37.715883, lng: -122.358584 },
          { lat: 37.718021, lng: -122.362646 },
          { lat: 37.716727, lng: -122.363866 },
          { lat: 37.714298, lng: -122.360037 },
          { lat: 37.716581, lng: -122.363975 },
          { lat: 37.715352, lng: -122.365216 },
          { lat: 37.712752, lng: -122.361171 },
          { lat: 37.715237, lng: -122.365388 },
          { lat: 37.716468, lng: -122.364628 },
          { lat: 37.718905, lng: -122.373995 },
          { lat: 37.724241, lng: -122.377081 },
          { lat: 37.721759, lng: -122.380792 },
          { lat: 37.724471, lng: -122.386453 },
          { lat: 37.721883, lng: -122.382828 },
          { lat: 37.72009, lng: -122.383197 },
          { lat: 37.716108, lng: -122.376131 },
          { lat: 37.710615, lng: -122.38005 },
          { lat: 37.708601, lng: -122.377925 },
          { lat: 37.709692, lng: -122.376062 },
          { lat: 37.708637, lng: -122.374421 },
          { lat: 37.709999, lng: -122.386017 },
          { lat: 37.708671, lng: -122.388078 },
          { lat: 37.709698, lng: -122.39149 },
          { lat: 37.708402, lng: -122.393167 },
          { lat: 37.708352, lng: -122.405446 },
          { lat: 37.716259, lng: -122.398328 },
          { lat: 37.736424, lng: -122.406772 },
          { lat: 37.740763, lng: -122.406914 },
          { lat: 37.749475, lng: -122.403569 },
          { lat: 37.751179, lng: -122.396408 },
          { lat: 37.752311, lng: -122.396513 },
          { lat: 37.75308, lng: -122.381586 },
          { lat: 37.75307, lng: -122.381578 },
        ],
      ],
    ],
  },
];

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

const coreCityPresets: LocationPreset[] = [
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
        exclusions: SAN_FRANCISCO_EXCLUSIONS,
      },
    ],
  },
];

const variantPresets: LocationPreset[] = [
  {
    id: OPEN_LOCATION_PRESET_ID,
    label: "Open",
    description: "No city boundary. Finite difficulties are clipped only by your travel radius.",
    regions: [
      {
        id: "open-world",
        label: "Open",
        polygons: createRectangleArea(OPEN_LOCATION_BOUNDS),
      },
    ],
  },
  {
    id: "san-francisco-walking",
    label: "SF (walking)",
    description:
      "A connected SF walking footprint covering Castro, the Castro-to-Noe connector, Noe Valley, Mission, Mission Dolores, Bernal Heights, Potrero Hill, Dogpatch, Duboce Triangle, and the Panhandle.",
    regions: [
      {
        id: "san-francisco-walking-area",
        label: "SF (walking)",
        polygons: ACTIVE_LOCATION_AREAS["san-francisco-walking"],
      },
    ],
  },
];

const pickerPresets: LocationPreset[] = [...coreCityPresets, ...variantPresets];

const globalCitiesPreset: LocationPreset = {
  id: "global-cities",
  label: "Mixed Global Cities",
  description: "Randomly pull rounds from Manhattan, Tokyo's 23 wards, Greater London, Paris, and San Francisco.",
  regions: coreCityPresets.flatMap((preset) => preset.regions),
};

const ALL_LOCATION_PRESETS: LocationPreset[] = [globalCitiesPreset, ...pickerPresets];
const REGION_LOOKUP = new Map(
  [...pickerPresets.flatMap((preset) => preset.regions), ...LEGACY_LOCATION_REGIONS].map(
    (region) => [region.id, region],
  ),
);

export const LOCATION_PRESETS: LocationPreset[] = pickerPresets;

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

export function getLocationPresetExclusions(presetId: string) {
  const preset = getLocationPreset(presetId);

  if (!preset) {
    return null;
  }

  return preset.regions.flatMap((region) => region.exclusions ?? []);
}

export function getLocationPresetExclusionArea(presetId: string) {
  const exclusions = getLocationPresetExclusions(presetId);

  if (!exclusions) {
    return null;
  }

  const area = exclusions.flatMap((exclusion) => exclusion.polygons);

  return area.length ? area : null;
}

export function getLocationRegionArea(regionId: string) {
  return getLocationRegion(regionId)?.polygons ?? null;
}

export function getLocationRegionExclusionArea(regionId: string) {
  const area =
    getLocationRegion(regionId)?.exclusions?.flatMap((exclusion) => exclusion.polygons) ?? [];

  return area.length ? area : null;
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
  exclusionArea: LocationArea | null = null,
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

    if (pointInArea(point, area) && (!exclusionArea || !pointInArea(point, exclusionArea))) {
      return point;
    }
  }

  return null;
}
