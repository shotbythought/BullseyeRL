"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { GameMap } from "@/components/game-map";
import { useGeolocation } from "@/hooks/use-geolocation";
import { authorizedJsonFetch } from "@/lib/api/client";
import { calculateDifficultyRadiusMeters, DIFFICULTY_MODES } from "@/lib/domain/difficulty";
import { clipAreaToRadius } from "@/lib/domain/play-area";
import {
  getBoundsForArea,
  getLocationPresetArea,
  getLocationPresetExclusionArea,
  LOCATION_PRESETS,
  OPEN_LOCATION_PRESET_ID,
  type LocationArea,
  type LocationBounds,
  type LocationLatLng,
} from "@/lib/location-presets";
import { cn, formatMeters } from "@/lib/utils";

function parseRadii(input: string) {
  return input
    .split(",")
    .map((chunk) => Number(chunk.trim()))
    .filter((value) => Number.isFinite(value));
}

export function CreateChallengeForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [presetId, setPresetId] = useState("san-francisco");
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [roundTimeLimitMinutes, setRoundTimeLimitMinutes] = useState(60);
  const [difficultyModeId, setDifficultyModeId] = useState("infinite");
  const selectedOpenPreset = presetId === OPEN_LOCATION_PRESET_ID;
  const availableDifficultyModes = useMemo(
    () =>
      selectedOpenPreset
        ? DIFFICULTY_MODES.filter((mode) => mode.milesPerHour != null)
        : DIFFICULTY_MODES,
    [selectedOpenPreset],
  );
  const difficultyMode =
    availableDifficultyModes.find((mode) => mode.id === difficultyModeId) ??
    availableDifficultyModes[availableDifficultyModes.length - 1];
  const difficultyIndex = Math.max(
    0,
    availableDifficultyModes.findIndex((mode) => mode.id === difficultyMode.id),
  );
  const finiteDifficulty = difficultyMode.milesPerHour != null;
  const { position, error: geolocationError } = useGeolocation(finiteDifficulty);
  const roundTimeLimitSeconds = timerEnabled ? roundTimeLimitMinutes * 60 : null;
  const difficultyRadiusMeters = calculateDifficultyRadiusMeters({
    difficultyModeId: difficultyMode.id,
    roundTimeLimitSeconds,
  });
  const basePreview = useMemo(() => {
    const area = getLocationPresetArea(presetId);

    if (!area) {
      return null;
    }

    const bounds = getBoundsForArea(area);
    const excludedArea = getLocationPresetExclusionArea(presetId);

    return bounds ? { area, bounds, excludedArea } : null;
  }, [presetId]);
  const difficultyCenter: LocationLatLng | null = useMemo(
    () =>
      finiteDifficulty && position
        ? {
            lat: position.latitude,
            lng: position.longitude,
          }
        : null,
    [finiteDifficulty, position],
  );
  const clippedPreview = useMemo(() => {
    if (!basePreview || !finiteDifficulty || !difficultyCenter || difficultyRadiusMeters == null) {
      return null;
    }

    return clipAreaToRadius({
      area: basePreview.area,
      center: difficultyCenter,
      radiusMeters: difficultyRadiusMeters,
    });
  }, [basePreview, difficultyCenter, difficultyRadiusMeters, finiteDifficulty]);
  const previewArea: LocationArea | null = finiteDifficulty
    ? clippedPreview?.mapArea ?? null
    : basePreview?.area ?? null;
  const previewBounds: LocationBounds | null = finiteDifficulty
    ? clippedPreview?.mapBounds ?? null
    : basePreview?.bounds ?? null;
  const finiteDifficultyBlocked =
    finiteDifficulty && (!position || !!geolocationError || !clippedPreview);

  useEffect(() => {
    if (!availableDifficultyModes.some((mode) => mode.id === difficultyModeId)) {
      setDifficultyModeId(availableDifficultyModes[availableDifficultyModes.length - 1].id);
    }
  }, [availableDifficultyModes, difficultyModeId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (finiteDifficulty && (!position || !clippedPreview)) {
      setError(
        !position
          ? "Allow current location before creating a finite-radius challenge."
          : "The selected difficulty radius does not overlap the selected play area.",
      );
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = {
      presetId,
      locationCount: Number(formData.get("locationCount") ?? 3),
      guessLimitPerRound: Number(formData.get("guessLimitPerRound") ?? 5),
      roundTimeLimitSeconds,
      difficultyModeId: difficultyMode.id,
      difficultyOriginLat: finiteDifficulty ? position?.latitude : null,
      difficultyOriginLng: finiteDifficulty ? position?.longitude : null,
      radiiMeters: parseRadii(String(formData.get("radiiMeters") ?? "")),
    };

    startTransition(async () => {
      try {
        const response = await authorizedJsonFetch<{ challengeId: string }>(
          "/api/challenges/import",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );

        router.push(`/challenges/${response.challengeId}`);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Unable to create challenge.",
        );
      }
    });
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="presetId">
          Play area
        </label>
        <select
          className="w-full rounded-xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
          id="presetId"
          name="presetId"
          onChange={(event) => setPresetId(event.target.value)}
          required
          value={presetId}
        >
          {LOCATION_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <p className="text-sm leading-6 text-ink/55">Choose the city you want to play.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-ink/70" htmlFor="locationCount">
            Number of rounds
          </label>
          <input
            className="w-full rounded-xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
            defaultValue={3}
            id="locationCount"
            max={50}
            min={1}
            name="locationCount"
            required
            type="number"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-ink/70" htmlFor="guessLimitPerRound">
            Shared guesses per round
          </label>
          <input
            className="w-full rounded-xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
            defaultValue={5}
            id="guessLimitPerRound"
            max={50}
            min={1}
            name="guessLimitPerRound"
            required
            type="number"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-[0.75rem] border border-ink/10 bg-mist/70 p-4">
        <label className="flex items-center justify-between gap-4" htmlFor="roundTimerEnabled">
          <span>
            <span className="block text-sm font-medium text-ink/70">Round timer</span>
            <span className="mt-1 block text-sm leading-6 text-ink/55">
              Auto-time out each round, or disable the timer entirely.
            </span>
          </span>
          <input
            checked={timerEnabled}
            className="h-5 w-5 rounded border-ink/20 text-ink focus:ring-moss"
            id="roundTimerEnabled"
            onChange={(event) => setTimerEnabled(event.target.checked)}
            type="checkbox"
          />
        </label>

        <div className={timerEnabled ? "space-y-2" : "space-y-2 opacity-50"}>
          <label className="text-sm font-medium text-ink/70" htmlFor="roundTimeLimitMinutes">
            Time limit per round (minutes)
          </label>
          <input
            className="w-full rounded-xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10 disabled:cursor-not-allowed disabled:bg-white/70"
            disabled={!timerEnabled}
            id="roundTimeLimitMinutes"
            min={1}
            name="roundTimeLimitMinutes"
            onChange={(event) => setRoundTimeLimitMinutes(Number(event.target.value) || 1)}
            required={timerEnabled}
            type="number"
            value={roundTimeLimitMinutes}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-[0.75rem] border border-ink/10 bg-mist/70 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label className="text-sm font-medium text-ink/70" htmlFor="difficultySlider">
              Difficulty
            </label>
            <p className="mt-1 text-sm leading-6 text-ink/55">
              Restrict each round to the city play area clipped by travel radius.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">
            {difficultyMode.shortLabel}
          </span>
        </div>

        <input
          aria-label="Difficulty"
          aria-valuetext={difficultyMode.label}
          className="h-2.5 w-full cursor-grab appearance-none rounded-full bg-ink/15 [accent-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white/95 active:cursor-grabbing [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-thumb]:ring-2 [&::-moz-range-thumb]:ring-white/95 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white/95"
          id="difficultySlider"
          max={availableDifficultyModes.length - 1}
          min={0}
          onChange={(event) => {
            const nextIndex = Number.parseInt(event.target.value, 10);
            const nextMode = availableDifficultyModes[nextIndex];

            if (nextMode) {
              setDifficultyModeId(nextMode.id);
            }
          }}
          step={1}
          type="range"
          value={difficultyIndex}
        />

        <div className="flex flex-wrap justify-between gap-1">
          {availableDifficultyModes.map((mode) => (
            <button
              className={cn(
                "rounded-full border px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35",
                difficultyMode.id === mode.id
                  ? "border-ink/22 bg-ink text-white"
                  : "border-ink/10 bg-white text-ink/55 hover:border-ink/20 hover:text-ink",
              )}
              key={mode.id}
              onClick={() => setDifficultyModeId(mode.id)}
              type="button"
            >
              {mode.shortLabel}
            </button>
          ))}
        </div>

        <p className="text-sm leading-6 text-ink/60">
          {difficultyRadiusMeters == null
            ? "Targets may appear anywhere inside the selected play area."
            : `Radius: ${formatMeters(difficultyRadiusMeters)} per round from ${
                timerEnabled ? "the round timer" : "a one-hour no-timer baseline"
              }.`}
        </p>

        {finiteDifficulty ? (
          <p
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              finiteDifficultyBlocked
                ? "border-amber-300/40 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
            )}
          >
            {geolocationError
              ? geolocationError
              : !position
                ? "Allow current location to preview and create this finite-radius challenge."
                : clippedPreview
                  ? "Preview is clipped to your current location and the selected play area."
                  : "This radius does not overlap the selected play area."}
          </p>
        ) : null}

        {previewArea && previewBounds ? (
          <GameMap
            className="h-80 rounded-xl"
            closerHintCircle={null}
            currentAccuracy={finiteDifficulty ? position?.accuracy ?? null : null}
            currentPosition={
              finiteDifficulty && position
                ? {
                    latitude: position.latitude,
                    longitude: position.longitude,
                  }
                : null
            }
            guesses={[]}
            interactive={false}
            mapArea={previewArea}
            mapBounds={previewBounds}
            mapExcludedArea={basePreview?.excludedArea ?? null}
            revealTarget={null}
            roundKey={`${presetId}:${difficultyMode.id}:${difficultyRadiusMeters ?? "infinite"}:${
              position?.latitude ?? "none"
            }:${position?.longitude ?? "none"}`}
            selectedRadius={finiteDifficulty ? difficultyRadiusMeters : null}
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="radiiMeters">
          Bullseye radii (meters, ascending)
        </label>
        <input
          className="w-full rounded-xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
          defaultValue="50,500,2000,5000"
          id="radiiMeters"
          name="radiiMeters"
          placeholder="50,500,2000,5000"
          required
          type="text"
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          {error}
        </p>
      ) : null}

      <button
        className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending || finiteDifficultyBlocked}
        type="submit"
      >
        {pending ? "Generating..." : "Create challenge"}
      </button>
    </form>
  );
}
