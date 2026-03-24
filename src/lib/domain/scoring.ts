export const SCORE_STEP = 1000;

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

export function didImproveBestRadius(
  currentBestRadius: number | null,
  candidateRadius: number,
) {
  return currentBestRadius == null || candidateRadius < currentBestRadius;
}
