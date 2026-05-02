import { circle } from "@turf/circle";
import { featureCollection, multiPolygon } from "@turf/helpers";
import { intersect } from "@turf/intersect";
import type { Feature, MultiPolygon, Polygon } from "geojson";

import type {
  LocationArea,
  LocationBounds,
  LocationLatLng,
  LocationRing,
} from "@/lib/location-presets";
import { getBoundsForArea, pointInArea } from "@/lib/location-presets";

const CIRCLE_STEPS = 96;

export interface EffectivePlayArea {
  mapArea: LocationArea;
  mapBounds: LocationBounds;
  radiusCenter: LocationLatLng;
  radiusMeters: number;
}

function closeRing(ring: LocationRing): LocationRing {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first.lat === last.lat && first.lng === last.lng) {
    return ring;
  }

  return [...ring, first];
}

function areaToTurfFeature(area: LocationArea): Feature<MultiPolygon> {
  return multiPolygon(
    area.map((polygon) =>
      polygon.map((ring) => closeRing(ring).map((point) => [point.lng, point.lat])),
    ),
  );
}

function polygonCoordinatesToArea(coordinates: Polygon["coordinates"]): LocationArea {
  return [
    coordinates.map((ring) =>
      ring.map(([lng, lat]) => ({
        lat,
        lng,
      })),
    ),
  ];
}

function multiPolygonCoordinatesToArea(coordinates: MultiPolygon["coordinates"]): LocationArea {
  return coordinates.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([lng, lat]) => ({
        lat,
        lng,
      })),
    ),
  );
}

function turfFeatureToArea(feature: Feature<Polygon | MultiPolygon>): LocationArea {
  if (feature.geometry.type === "Polygon") {
    return polygonCoordinatesToArea(feature.geometry.coordinates);
  }

  return multiPolygonCoordinatesToArea(feature.geometry.coordinates);
}

export function clipAreaToRadius(input: {
  area: LocationArea;
  center: LocationLatLng;
  radiusMeters: number;
}): EffectivePlayArea | null {
  if (!Number.isFinite(input.radiusMeters) || input.radiusMeters <= 0) {
    return null;
  }

  const baseFeature = areaToTurfFeature(input.area);
  const radiusFeature = circle([input.center.lng, input.center.lat], input.radiusMeters, {
    steps: CIRCLE_STEPS,
    units: "meters",
  });
  const features: Array<Feature<Polygon | MultiPolygon>> = [baseFeature, radiusFeature];
  const clipped = intersect(featureCollection(features));

  if (!clipped) {
    return null;
  }

  const mapArea = turfFeatureToArea(clipped);
  const mapBounds = getBoundsForArea(mapArea);

  if (!mapBounds) {
    return null;
  }

  return {
    mapArea,
    mapBounds,
    radiusCenter: input.center,
    radiusMeters: input.radiusMeters,
  };
}

export function pointInEffectivePlayArea(point: LocationLatLng, area: LocationArea) {
  return pointInArea(point, area);
}
