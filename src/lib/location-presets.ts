export interface LocationRegion {
  id: string;
  label: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
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

const baseCityPresets: LocationPreset[] = [
  {
    id: "new-york",
    label: "New York City",
    description: "Dense urban grid, borough variety, and huge street-level coverage.",
    regions: [
      {
        id: "new-york-core",
        label: "New York City",
        minLat: 40.5774,
        maxLat: 40.9176,
        minLng: -74.15,
        maxLng: -73.7004,
      },
    ],
  },
  {
    id: "tokyo",
    label: "Tokyo",
    description: "Massive metro sprawl with tight streets, towers, and residential detail.",
    regions: [
      {
        id: "tokyo-core",
        label: "Tokyo",
        minLat: 35.528,
        maxLat: 35.838,
        minLng: 139.562,
        maxLng: 139.93,
      },
    ],
  },
  {
    id: "london",
    label: "London",
    description: "Historic roads, river crossings, parks, and layered neighborhood texture.",
    regions: [
      {
        id: "london-core",
        label: "London",
        minLat: 51.3849,
        maxLat: 51.6723,
        minLng: -0.3515,
        maxLng: 0.1483,
      },
    ],
  },
  {
    id: "paris",
    label: "Paris",
    description: "Compact central density with broad boulevards and recognizable landmarks.",
    regions: [
      {
        id: "paris-core",
        label: "Paris",
        minLat: 48.8156,
        maxLat: 48.9022,
        minLng: 2.2241,
        maxLng: 2.4699,
      },
    ],
  },
  {
    id: "san-francisco",
    label: "San Francisco",
    description: "Steep hills, waterfronts, row houses, and strong geographic identity.",
    regions: [
      {
        id: "san-francisco-core",
        label: "San Francisco",
        minLat: 37.7081,
        maxLat: 37.8324,
        minLng: -122.5149,
        maxLng: -122.357,
      },
    ],
  },
];

const globalCitiesPreset: LocationPreset = {
  id: "global-cities",
  label: "Mixed Global Cities",
  description: "Randomly pull rounds from New York, Tokyo, London, Paris, and San Francisco.",
  regions: baseCityPresets.flatMap((preset) => preset.regions),
};

const ALL_LOCATION_PRESETS: LocationPreset[] = [globalCitiesPreset, ...baseCityPresets];

export const LOCATION_PRESETS: LocationPreset[] = baseCityPresets;

export function getLocationPreset(presetId: string) {
  return ALL_LOCATION_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function getLocationRegion(regionId: string) {
  for (const preset of ALL_LOCATION_PRESETS) {
    const region = preset.regions.find((candidate) => candidate.id === regionId);

    if (region) {
      return region;
    }
  }

  return null;
}

export function getBoundsForRegions(regions: LocationRegion[]): LocationBounds | null {
  if (!regions.length) {
    return null;
  }

  return {
    south: Math.min(...regions.map((region) => region.minLat)),
    west: Math.min(...regions.map((region) => region.minLng)),
    north: Math.max(...regions.map((region) => region.maxLat)),
    east: Math.max(...regions.map((region) => region.maxLng)),
  };
}

export function getLocationPresetBounds(presetId: string) {
  const preset = getLocationPreset(presetId);

  if (!preset) {
    return null;
  }

  return getBoundsForRegions(preset.regions);
}

export function getLocationRegionBounds(regionId: string) {
  const region = getLocationRegion(regionId);

  if (!region) {
    return null;
  }

  return getBoundsForRegions([region]);
}
