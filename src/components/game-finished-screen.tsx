"use client";

import { useState } from "react";

import { SCORE_STEP } from "@/lib/domain/scoring";
import { formatMeters, formatScore } from "@/lib/utils";
import type { LiveGameState } from "@/types/app";
import { StatusChip } from "@/components/status-chip";

export function GameFinishedScreen(props: { game: LiveGameState }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const completedRounds = props.game.completedRounds ?? [];
  const challengeUrl =
    typeof window === "undefined"
      ? `/challenges/${props.game.challengeId}`
      : `${window.location.origin}/challenges/${props.game.challengeId}`;

  async function handleCopyShare() {
    const shareText = buildShareText(props.game, challengeUrl);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareText;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopyState("copied");
      window.setTimeout(() => {
        setCopyState("idle");
      }, 1800);
    } catch {
      setCopyState("error");
      window.setTimeout(() => {
        setCopyState("idle");
      }, 2200);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.125rem] border border-ink/10 bg-white/95 shadow-panel">
        <div className="relative overflow-hidden bg-slate px-6 py-8 text-white sm:px-8">
          <div className="absolute inset-0 bg-grid bg-[size:38px_38px] opacity-[0.08]" />
          <div className="absolute -right-8 top-0 h-40 w-40 rounded-full bg-neon/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neon/80">
                Game finished
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                {props.game.challengeTitle}
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/68">
                Final scorecard with every clue from the run.
              </p>
              <div className="mt-6">
                <button
                  className="inline-flex items-center rounded-xl bg-neon px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45]"
                  onClick={() => void handleCopyShare()}
                  type="button"
                >
                  {copyState === "copied"
                    ? "Copied"
                    : copyState === "error"
                      ? "Copy failed"
                      : "Copy scorecard"}
                </button>
              </div>
            </div>

            <div className="rounded-[0.875rem] border border-white/10 bg-white/10 px-6 py-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                Team score
              </p>
              <p className="mt-3 text-4xl font-semibold text-white">
                {formatScore(props.game.teamScore)}
              </p>
              <p className="mt-2 text-sm text-white/60">
                Max {formatScore(props.game.maxRoundPoints * props.game.roundCount)}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-ink/10 bg-white px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip label={`${completedRounds.length} rounds`} />
            <StatusChip label={`Join ${props.game.joinCode}`} />
            <StatusChip label={buildEmojiScoreLine(props.game)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {completedRounds.map((round) => (
          <article
            className="overflow-hidden rounded-[0.875rem] border border-ink/10 bg-white/94 shadow-panel"
            key={round.challengeRoundId}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`Round ${round.roundIndex + 1} clue`}
              className="aspect-[16/10] w-full object-cover"
              draggable={false}
              src={round.clueImageUrl}
            />
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/45">
                    Round {round.roundIndex + 1}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-ink">
                    {formatScore(round.score)}
                  </p>
                </div>
                <StatusChip
                  label={scoreLabel(round.score, props.game.maxRoundPoints)}
                  tone={scoreTone(round.score, props.game.maxRoundPoints)}
                />
              </div>
              <p className="text-sm leading-7 text-ink/65">
                {round.bestSuccessfulRadiusMeters != null
                  ? `Best hit at ${formatMeters(round.bestSuccessfulRadiusMeters)}.`
                  : "No successful guess landed inside the bullseye tiers."}
              </p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function buildShareText(game: LiveGameState, challengeUrl: string) {
  const roundScores = (game.completedRounds ?? []).map((round) =>
    round.score === 0 ? "0" : `${Math.round(round.score / SCORE_STEP)}k`,
  );

  return [
    `BullseyeRL · ${game.challengeTitle}`,
    buildEmojiScoreLine(game),
    roundScores.join(" / "),
    challengeUrl,
  ].join("\n");
}

function buildEmojiScoreLine(game: LiveGameState) {
  return (game.completedRounds ?? [])
    .map((round) => scoreEmoji(round.score, game.maxRoundPoints))
    .join("");
}

function scoreEmoji(score: number, maxRoundPoints: number) {
  if (score <= 0) {
    return "⬛";
  }

  const ratio = score / Math.max(maxRoundPoints, SCORE_STEP);

  if (ratio >= 0.99) {
    return "🟩";
  }

  if (ratio >= 0.66) {
    return "🟨";
  }

  return "🟧";
}

function scoreTone(score: number, maxRoundPoints: number) {
  if (score <= 0) {
    return "danger" as const;
  }

  if (score >= maxRoundPoints) {
    return "success" as const;
  }

  return "warning" as const;
}

function scoreLabel(score: number, maxRoundPoints: number) {
  if (score <= 0) {
    return "Miss";
  }

  if (score >= maxRoundPoints) {
    return "Bullseye";
  }

  return "Scored";
}
