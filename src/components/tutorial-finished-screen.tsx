"use client";

import Link from "next/link";

import { HomeLink } from "@/components/brand-mark";
import { StatusChip } from "@/components/status-chip";
import { formatMeters, formatScore } from "@/lib/utils";

export function TutorialFinishedScreen(props: {
  onRestart: () => void;
  score: number;
  successfulRadiusMeters: number;
}) {
  return (
    <div className="px-4 pt-6 pb-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <HomeLink />
      </header>

      <section className="overflow-hidden rounded-[2.8rem] border border-ink/10 bg-white/95 shadow-panel">
        <div className="relative overflow-hidden bg-slate px-6 py-8 text-white sm:px-8">
          <div className="absolute inset-0 bg-grid bg-[size:38px_38px] opacity-[0.08]" />
          <div className="absolute -right-8 top-0 h-40 w-40 rounded-full bg-neon/20 blur-3xl" />

          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neon/80">
                Tutorial complete
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                You hit the bullseye.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/72 sm:text-base">
                You read the clue, opened the map, used a hint, walked the mocked location in, and
                finished with the tightest ring.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  className="inline-flex items-center rounded-full bg-neon px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45]"
                  href="/challenges/new"
                >
                  Create a challenge
                </Link>
                <button
                  className="inline-flex items-center rounded-full border border-white/14 bg-white/8 px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:border-white/24 hover:bg-white/12"
                  onClick={props.onRestart}
                  type="button"
                >
                  Replay tutorial
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/10 px-6 py-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                Tutorial score
              </p>
              <p className="mt-3 text-4xl font-semibold text-white">
                {formatScore(props.score)}
              </p>
              <p className="mt-2 text-sm text-white/60">
                Bullseye at {formatMeters(props.successfulRadiusMeters)}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-ink/10 bg-white px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip label="1 tutorial round" />
            <StatusChip label={`Score ${formatScore(props.score)}`} />
            <StatusChip label={`Best ring ${formatMeters(props.successfulRadiusMeters)}`} />
          </div>
        </div>
      </section>
    </div>
  );
}
