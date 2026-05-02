export const METERS_PER_MILE = 1609.344;
export const DEFAULT_DIFFICULTY_TIMER_SECONDS = 3600;

export interface DifficultyMode {
  id: string;
  label: string;
  shortLabel: string;
  milesPerHour: number | null;
}

export const DIFFICULTY_MODES = [
  {
    id: "quarter-mile",
    label: "0.5 mi/hr",
    shortLabel: "0.5",
    milesPerHour: 0.5,
  },
  {
    id: "public-transport",
    label: "Public transport",
    shortLabel: "Transit",
    milesPerHour: 1,
  },
  {
    id: "three-quarter-mile",
    label: "1.5 mi/hr",
    shortLabel: "1.5",
    milesPerHour: 1.5,
  },
  {
    id: "biking",
    label: "Biking",
    shortLabel: "Bike",
    milesPerHour: 2,
  },
  {
    id: "one-and-half-mile",
    label: "3 mi/hr",
    shortLabel: "3",
    milesPerHour: 3,
  },
  {
    id: "driving",
    label: "Driving",
    shortLabel: "Drive",
    milesPerHour: 4,
  },
  {
    id: "infinite",
    label: "Infinite radius",
    shortLabel: "Infinite",
    milesPerHour: null,
  },
] as const satisfies readonly DifficultyMode[];

export type DifficultyModeId = (typeof DIFFICULTY_MODES)[number]["id"];

const DIFFICULTY_MODE_LOOKUP: Map<string, DifficultyMode> = new Map(
  DIFFICULTY_MODES.map((mode) => [mode.id, mode]),
);

export function getDifficultyMode(modeId: string | null | undefined) {
  return DIFFICULTY_MODE_LOOKUP.get(modeId ?? "infinite") ?? null;
}

export function isFiniteDifficultyMode(modeId: string | null | undefined) {
  return getDifficultyMode(modeId)?.milesPerHour != null;
}

export function calculateDifficultyRadiusMeters(input: {
  difficultyModeId: string;
  roundTimeLimitSeconds: number | null | undefined;
}) {
  const mode = getDifficultyMode(input.difficultyModeId);

  if (!mode) {
    throw new Error("Unknown difficulty mode.");
  }

  if (mode.milesPerHour == null) {
    return null;
  }

  const effectiveSeconds =
    input.roundTimeLimitSeconds == null
      ? DEFAULT_DIFFICULTY_TIMER_SECONDS
      : input.roundTimeLimitSeconds;

  return Math.round(mode.milesPerHour * METERS_PER_MILE * (effectiveSeconds / 3600));
}
