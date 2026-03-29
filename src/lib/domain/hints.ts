import { SCORE_STEP } from "@/lib/domain/scoring";

export const ROUND_HINT_TYPES = ["get_me_closer", "point_me"] as const;
export type RoundHintType = (typeof ROUND_HINT_TYPES)[number];

export const POINT_HINT_DIRECTIONS = ["north", "east", "south", "west"] as const;
export type PointHintDirection = (typeof POINT_HINT_DIRECTIONS)[number];

export const GET_ME_CLOSER_HINT_COST = 2 * SCORE_STEP;
export const POINT_ME_HINT_COST = SCORE_STEP;

export function getGetMeCloserHintRadius(radii: number[]) {
  return radii[2] ?? null;
}

export function pointHintDirectionFromBearing(bearing: number): PointHintDirection {
  const normalizedBearing = ((bearing % 360) + 360) % 360;

  if (normalizedBearing >= 315 || normalizedBearing < 45) {
    return "north";
  }

  if (normalizedBearing >= 45 && normalizedBearing < 135) {
    return "east";
  }

  if (normalizedBearing >= 135 && normalizedBearing < 225) {
    return "south";
  }

  return "west";
}
