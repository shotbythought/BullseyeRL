"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { authorizedJsonFetch } from "@/lib/api/client";
import { LOCATION_PRESETS } from "@/lib/location-presets";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      presetId: String(formData.get("presetId") ?? ""),
      locationCount: Number(formData.get("locationCount") ?? 5),
      guessLimitPerRound: Number(formData.get("guessLimitPerRound") ?? 5),
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
          className="w-full rounded-3xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
          defaultValue="san-francisco"
          id="presetId"
          name="presetId"
          required
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
            className="w-full rounded-3xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
            defaultValue={5}
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
            className="w-full rounded-3xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
            defaultValue={4}
            id="guessLimitPerRound"
            max={50}
            min={1}
            name="guessLimitPerRound"
            required
            type="number"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="radiiMeters">
          Bullseye radii (meters, ascending)
        </label>
        <input
          className="w-full rounded-3xl border border-ink/10 bg-white/90 px-5 py-4 text-base shadow-sm outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
          defaultValue="50,150,2000,5000"
          id="radiiMeters"
          name="radiiMeters"
          placeholder="50,150,2000,5000"
          required
          type="text"
        />
      </div>

      {error ? (
        <p className="rounded-3xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          {error}
        </p>
      ) : null}

      <button
        className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Generating..." : "Create challenge"}
      </button>
    </form>
  );
}
