export const BULLSEYE_RADIUS_METERS = 50;
export const FIRST_NON_BULLSEYE_RADIUS_METERS = 250;
export const FIRST_NON_BULLSEYE_POINTS = 90;
export const INFINITE_GUESS_RADIUS_MAX_METERS = 5000;
export const MAX_ROUND_POINTS = 100;
export const RADIUS_SLIDER_MAX = 1000;
export const RADIUS_SLIDER_BULLSEYE_LOCK_END = 120;
export const SCORECARD_SUCCESS_LABELS = [
  "Bullseye",
  "Fair",
  "mid minus",
  "garbo",
] as const;

export type ScorecardLabel = (typeof SCORECARD_SUCCESS_LABELS)[number] | "Miss";

export function getGuessRadiusMaxMeters(difficultyRadiusMeters: number | null | undefined) {
  return difficultyRadiusMeters ?? INFINITE_GUESS_RADIUS_MAX_METERS;
}

export function validateGuessRadiusBounds(input: {
  minRadiusMeters?: number;
  maxRadiusMeters: number;
}) {
  const minRadiusMeters = input.minRadiusMeters ?? BULLSEYE_RADIUS_METERS;

  if (!Number.isFinite(input.maxRadiusMeters) || input.maxRadiusMeters < minRadiusMeters) {
    throw new Error(`Max guess radius must be at least ${minRadiusMeters} meters.`);
  }

  return {
    minRadiusMeters,
    maxRadiusMeters: Math.round(input.maxRadiusMeters),
  };
}

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

export function pointsForRadius(
  successfulRadius: number | null,
  maxRadiusMeters: number,
  minRadiusMeters = BULLSEYE_RADIUS_METERS,
) {
  if (successfulRadius == null) {
    return 0;
  }

  const { maxRadiusMeters: maxRadius, minRadiusMeters: minRadius } =
    validateGuessRadiusBounds({
      minRadiusMeters,
      maxRadiusMeters,
    });

  if (successfulRadius <= minRadius || maxRadius === minRadius) {
    return MAX_ROUND_POINTS;
  }

  if (successfulRadius >= maxRadius) {
    return 1;
  }

  const firstNonBullseyeRadius = Math.min(FIRST_NON_BULLSEYE_RADIUS_METERS, maxRadius);

  if (successfulRadius <= firstNonBullseyeRadius) {
    return FIRST_NON_BULLSEYE_POINTS;
  }

  if (maxRadius === firstNonBullseyeRadius) {
    return 1;
  }

  const logProgress =
    Math.log(maxRadius / successfulRadius) / Math.log(maxRadius / firstNonBullseyeRadius);

  return Math.max(
    1,
    Math.min(
      FIRST_NON_BULLSEYE_POINTS,
      Math.round(1 + (FIRST_NON_BULLSEYE_POINTS - 1) * logProgress),
    ),
  );
}

export function scorecardLabelForRadius(
  successfulRadius: number | null,
  maxRadiusMeters: number,
  minRadiusMeters = BULLSEYE_RADIUS_METERS,
): ScorecardLabel {
  if (successfulRadius == null) {
    return "Miss";
  }

  const points = pointsForRadius(successfulRadius, maxRadiusMeters, minRadiusMeters);
  const ratio = points / MAX_ROUND_POINTS;

  if (ratio >= 0.95) {
    return "Bullseye";
  }

  if (ratio >= 0.67) {
    return "Fair";
  }

  if (ratio >= 0.34) {
    return "mid minus";
  }

  return "garbo";
}

export function applyHintPenalty(rawPoints: number, hintPenaltyPoints: number) {
  return Math.max(0, rawPoints - Math.max(0, hintPenaltyPoints));
}

export function maxPointsForRadii(radii: number[]) {
  validateRadii(radii);
  return MAX_ROUND_POINTS;
}

export function maxPointsForRadiusBounds() {
  return MAX_ROUND_POINTS;
}

export function didImproveBestRadius(
  currentBestRadius: number | null,
  candidateRadius: number,
) {
  return currentBestRadius == null || candidateRadius < currentBestRadius;
}

export function radiusFromSliderPosition(
  sliderPosition: number,
  maxRadiusMeters: number,
  minRadiusMeters = BULLSEYE_RADIUS_METERS,
) {
  const { maxRadiusMeters: maxRadius, minRadiusMeters: minRadius } =
    validateGuessRadiusBounds({
      minRadiusMeters,
      maxRadiusMeters,
    });
  const position = Math.max(0, Math.min(RADIUS_SLIDER_MAX, Math.round(sliderPosition)));

  if (position <= RADIUS_SLIDER_BULLSEYE_LOCK_END || maxRadius === minRadius) {
    return minRadius;
  }

  if (position >= RADIUS_SLIDER_MAX) {
    return maxRadius;
  }

  const firstNonBullseyeRadius = Math.min(FIRST_NON_BULLSEYE_RADIUS_METERS, maxRadius);

  if (position === RADIUS_SLIDER_BULLSEYE_LOCK_END + 1 || maxRadius === firstNonBullseyeRadius) {
    return firstNonBullseyeRadius;
  }

  const ratio =
    (position - RADIUS_SLIDER_BULLSEYE_LOCK_END - 1) /
    (RADIUS_SLIDER_MAX - RADIUS_SLIDER_BULLSEYE_LOCK_END - 1);
  const rawRadius = firstNonBullseyeRadius * (maxRadius / firstNonBullseyeRadius) ** ratio;

  return Math.max(firstNonBullseyeRadius, Math.min(maxRadius, roundPracticalRadius(rawRadius)));
}

export function sliderPositionFromRadius(
  radiusMeters: number,
  maxRadiusMeters: number,
  minRadiusMeters = BULLSEYE_RADIUS_METERS,
) {
  const { maxRadiusMeters: maxRadius, minRadiusMeters: minRadius } =
    validateGuessRadiusBounds({
      minRadiusMeters,
      maxRadiusMeters,
    });

  if (radiusMeters <= minRadius || maxRadius === minRadius) {
    return 0;
  }

  if (radiusMeters >= maxRadius) {
    return RADIUS_SLIDER_MAX;
  }

  const firstNonBullseyeRadius = Math.min(FIRST_NON_BULLSEYE_RADIUS_METERS, maxRadius);

  if (radiusMeters <= firstNonBullseyeRadius || maxRadius === firstNonBullseyeRadius) {
    return RADIUS_SLIDER_BULLSEYE_LOCK_END + 1;
  }

  return Math.round(
    RADIUS_SLIDER_BULLSEYE_LOCK_END +
      1 +
      (RADIUS_SLIDER_MAX - RADIUS_SLIDER_BULLSEYE_LOCK_END - 1) *
        (Math.log(radiusMeters / firstNonBullseyeRadius) /
          Math.log(maxRadius / firstNonBullseyeRadius)),
  );
}

function roundPracticalRadius(radiusMeters: number) {
  if (radiusMeters < 100) {
    return Math.round(radiusMeters);
  }

  if (radiusMeters < 500) {
    return Math.round(radiusMeters / 5) * 5;
  }

  if (radiusMeters < 1000) {
    return Math.round(radiusMeters / 10) * 10;
  }

  if (radiusMeters < 5000) {
    return Math.round(radiusMeters / 50) * 50;
  }

  return Math.round(radiusMeters / 100) * 100;
}
