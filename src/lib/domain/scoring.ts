export const SCORE_STEP = 1000;
export const SCORECARD_SUCCESS_LABELS = [
  "Bullseye",
  "Fair",
  "mid minus",
  "garbo",
] as const;

export type ScorecardLabel = (typeof SCORECARD_SUCCESS_LABELS)[number] | "Miss";

export function validateRadii(radii: number[]) {
  if (!radii.length) {
    throw new Error("At least one radius tier is required.");
  }

  const seen = new Set<number>();

  radii.forEach((radius, index) => {
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("Radius tiers must be positive numbers.");
    }

    if (seen.has(radius)) {
      throw new Error("Radius tiers must be unique.");
    }

    if (index > 0 && radii[index - 1] >= radius) {
      throw new Error("Radius tiers must be strictly ascending.");
    }

    seen.add(radius);
  });

  return radii;
}

export function pointsForRadius(radii: number[], successfulRadius: number | null) {
  if (successfulRadius == null) {
    return 0;
  }

  const index = radii.findIndex((radius) => radius === successfulRadius);

  if (index < 0) {
    throw new Error("Successful radius was not found in challenge tiers.");
  }

  return (radii.length - index) * SCORE_STEP;
}

export function scorecardLabelForRadius(radii: number[], successfulRadius: number | null): ScorecardLabel {
  if (successfulRadius == null) {
    return "Miss";
  }

  const index = radii.findIndex((radius) => radius === successfulRadius);

  if (index < 0) {
    throw new Error("Successful radius was not found in challenge tiers.");
  }

  return SCORECARD_SUCCESS_LABELS[Math.min(index, SCORECARD_SUCCESS_LABELS.length - 1)];
}

export function applyHintPenalty(rawPoints: number, hintPenaltyPoints: number) {
  return Math.max(0, rawPoints - Math.max(0, hintPenaltyPoints));
}

export function maxPointsForRadii(radii: number[]) {
  return radii.length * SCORE_STEP;
}

export function didImproveBestRadius(
  currentBestRadius: number | null,
  candidateRadius: number,
) {
  return currentBestRadius == null || candidateRadius < currentBestRadius;
}
