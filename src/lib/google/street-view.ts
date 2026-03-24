import { bearingBetweenPoints } from "@/lib/domain/geodesy";
import { getServerEnv } from "@/lib/env";

export interface StreetViewMetadata {
  panoId: string | null;
  cameraLat: number;
  cameraLng: number;
  heading: number;
  pitch: number;
  fov: number;
}

interface StreetViewMetadataResponse {
  status: string;
  pano_id?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

const DEFAULT_PITCH = 0;
const DEFAULT_FOV = 90;

export async function resolveStreetViewMetadata(
  targetLat: number,
  targetLng: number,
): Promise<StreetViewMetadata> {
  const serverEnv = getServerEnv();
  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", `${targetLat},${targetLng}`);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", serverEnv.GOOGLE_STREET_VIEW_API_KEY ?? "");

  const response = await fetch(url, {
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Street View metadata.");
  }

  const payload = (await response.json()) as StreetViewMetadataResponse;

  if (payload.status !== "OK" || !payload.location) {
    throw new Error("Street View coverage is unavailable for this round.");
  }

  return {
    panoId: payload.pano_id ?? null,
    cameraLat: payload.location.lat,
    cameraLng: payload.location.lng,
    heading: bearingBetweenPoints(
      payload.location.lat,
      payload.location.lng,
      targetLat,
      targetLng,
    ),
    pitch: DEFAULT_PITCH,
    fov: DEFAULT_FOV,
  };
}

export function buildStreetViewStaticUrl(params: {
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  fov: number;
  panoId?: string | null;
  size?: string;
}) {
  const serverEnv = getServerEnv();
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", params.size ?? "1200x720");
  url.searchParams.set("location", `${params.lat},${params.lng}`);
  url.searchParams.set("heading", String(params.heading));
  url.searchParams.set("pitch", String(params.pitch));
  url.searchParams.set("fov", String(params.fov));
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", serverEnv.GOOGLE_STREET_VIEW_API_KEY ?? "");

  if (params.panoId) {
    url.searchParams.set("pano", params.panoId);
  }

  return url.toString();
}
