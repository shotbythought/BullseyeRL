"use client";

import { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";

import { useEffect, useRef, useState, useTransition } from "react";

import { authorizedJsonFetch } from "@/lib/api/client";
import type { PointHintDirection, RoundHintType } from "@/lib/domain/hints";
import { formatCountdown, formatMeters, formatScore } from "@/lib/utils";
import { useGeolocation } from "@/hooks/use-geolocation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { LiveGameState } from "@/types/app";
import { BrandMark } from "@/components/brand-mark";
import { BirthdaySetNextRoundButton } from "@/components/temp/birthday-set-next-round-button";
import { FixedStreetViewClue } from "@/components/fixed-street-view-clue";
import { GameFinishedScreen } from "@/components/game-finished-screen";
import { GameMap } from "@/components/game-map";
import { StatusChip } from "@/components/status-chip";

interface RevealState {
  target: {
    lat: number;
    lng: number;
  };
  radiiMeters: number[];
  isGameComplete: boolean;
  timedOut: boolean;
}

export function LiveGameClient(props: { gameId: string }) {
  const { position, error: geolocationError } = useGeolocation();
  const [game, setGame] = useState<LiveGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRadius, setSelectedRadius] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "guess" | "advance" | RoundHintType | null
  >(null);
  const [revealState, setRevealState] = useState<RevealState | null>(null);
  const revealLockRef = useRef(false);
  const loadStateRef = useRef<(() => Promise<void>) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [birthdayBusy, setBirthdayBusy] = useState(false);
  const [birthdayNotice, setBirthdayNotice] = useState<string | null>(null);

  function applyGameState(response: LiveGameState) {
    setGame(response);
    setSelectedRadius((previous) =>
      previous && response.radiiMeters.includes(previous)
        ? previous
        : response.radiiMeters[0] ?? null,
    );
  }

  useEffect(() => {
    let mounted = true;
    const supabase = getBrowserSupabaseClient();
    let channels: RealtimeChannel[] = [];

    async function loadState() {
      try {
        const response = await authorizedJsonFetch<LiveGameState>(`/api/games/${props.gameId}`);

        if (!mounted) {
          return;
        }

        applyGameState(response);
        setError(null);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Unable to load game state.",
        );
      }
    }

    loadStateRef.current = loadState;
    void loadState();

    const subscribe = (table: string, filter: string) =>
      supabase
        .channel(`bullseye:${props.gameId}:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          () => {
            if (!revealLockRef.current) {
              void loadState();
            }
          },
        )
        .subscribe();

    channels = [
      subscribe("games", `id=eq.${props.gameId}`),
      subscribe("game_players", `game_id=eq.${props.gameId}`),
      subscribe("game_rounds", `game_id=eq.${props.gameId}`),
      subscribe("guesses", `game_id=eq.${props.gameId}`),
    ];

    return () => {
      mounted = false;
      loadStateRef.current = null;
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [props.gameId]);

  useEffect(() => {
    setNow(Date.now());

    if (!game?.roundExpiresAt || game.roundResolved) {
      return;
    }

    const tickInterval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    const refreshTimeout = window.setTimeout(() => {
      void loadStateRef.current?.();
    }, Math.max(0, new Date(game.roundExpiresAt).getTime() - Date.now()) + 250);

    return () => {
      window.clearInterval(tickInterval);
      window.clearTimeout(refreshTimeout);
    };
  }, [game?.currentRoundId, game?.roundExpiresAt, game?.roundResolved]);

  async function handleGuess() {
    if (!position || !game || !selectedRadius) {
      return;
    }

    setPendingAction("guess");
    startTransition(async () => {
      try {
        const response = await authorizedJsonFetch<
          Record<string, unknown> & { reveal: RevealState | null }
        >(`/api/games/${props.gameId}/guess`, {
          method: "POST",
          body: JSON.stringify({
            gameId: props.gameId,
            selectedRadiusMeters: selectedRadius,
            currentLat: position.latitude,
            currentLng: position.longitude,
            accuracyMeters: position.accuracy,
          }),
        });

        if (response.reveal) {
          revealLockRef.current = true;
          setRevealState({
            ...response.reveal,
            isGameComplete: response.gameStatus === "completed",
            timedOut: response.reveal.timedOut === true,
          });

          try {
            const refreshed = await authorizedJsonFetch<LiveGameState>(`/api/games/${props.gameId}`);
            applyGameState(refreshed);
            setError(null);
          } catch (refreshError) {
            setError(
              refreshError instanceof Error
                ? refreshError.message
                : response.gameStatus === "completed"
                  ? "Unable to load the finished game."
                  : "Unable to refresh the resolved round.",
            );
          }
        }
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Unable to submit guess.",
        );
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function handleAdvanceRound() {
    const resolvedRevealState =
      revealState ??
      (game?.roundResolved && game.target
        ? {
            target: game.target,
            radiiMeters: game.radiiMeters,
            isGameComplete: game.status === "completed",
            timedOut: game.roundTimedOut,
          }
        : null);

    if (!game || !resolvedRevealState) {
      return;
    }

    if (resolvedRevealState.isGameComplete) {
      revealLockRef.current = false;
      setRevealState(null);
      return;
    }

    setPendingAction("advance");
    startTransition(async () => {
      try {
        const refreshed = await authorizedJsonFetch<LiveGameState>(`/api/games/${props.gameId}/advance`, {
          method: "POST",
          body: JSON.stringify({
            gameId: props.gameId,
          }),
        });

        applyGameState(refreshed);
        setRevealState(null);
        revealLockRef.current = false;
        setError(null);
      } catch (advanceError) {
        setError(
          advanceError instanceof Error
            ? advanceError.message
            : "Unable to advance to the next round.",
        );
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function handleUseHint(hintType: RoundHintType) {
    if (!game) {
      return;
    }

    if (hintType === "point_me" && !position) {
      return;
    }

    setPendingAction(hintType);
    startTransition(async () => {
      try {
        const refreshed = await authorizedJsonFetch<LiveGameState>(`/api/games/${props.gameId}/hint`, {
          method: "POST",
          body: JSON.stringify({
            gameId: props.gameId,
            hintType,
            currentLat: hintType === "point_me" ? position?.latitude : undefined,
            currentLng: hintType === "point_me" ? position?.longitude : undefined,
          }),
        });

        applyGameState(refreshed);
        setError(null);
      } catch (hintError) {
        setError(
          hintError instanceof Error ? hintError.message : "Unable to use that hint.",
        );
      } finally {
        setPendingAction(null);
      }
    });
  }

  if (error && !game) {
    return (
      <div className="space-y-6">
        <GamePageHeader joinCode={null} />
        <div className="rounded-[0.875rem] border border-ember/20 bg-white/95 p-6 shadow-panel">
          <p className="text-lg font-semibold text-ink">Unable to open this game.</p>
          <p className="mt-2 text-sm text-ink/65">{error}</p>
          <Link
            className="mt-4 inline-flex rounded-xl bg-ink px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white"
            href="/"
          >
            Back home
          </Link>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="space-y-6">
        <GamePageHeader joinCode={null} />
        <div className="rounded-[0.875rem] border border-ink/10 bg-white/95 p-6 text-sm text-ink/65 shadow-panel">
          Loading live game...
        </div>
      </div>
    );
  }

  const accuracyWarning =
    position?.accuracy != null &&
    selectedRadius != null &&
    position.accuracy > selectedRadius;
  const activeRevealState =
    revealState ??
    (game.roundResolved && game.target
      ? {
          target: game.target,
          radiiMeters: game.radiiMeters,
          isGameComplete: game.status === "completed",
          timedOut: game.roundTimedOut,
        }
      : null);
  const roundTimeRemainingSeconds =
    game.roundExpiresAt == null
      ? null
      : game.roundResolved
        ? 0
        : Math.max(0, Math.ceil((new Date(game.roundExpiresAt).getTime() - now) / 1000));
  const roundTimerExpired =
    game.roundTimeLimitSeconds != null &&
    !game.roundResolved &&
    roundTimeRemainingSeconds === 0;
  const roundTimerValue =
    game.roundTimeLimitSeconds == null
      ? "No limit"
      : activeRevealState?.timedOut
        ? "Timed out"
        : game.roundResolved
          ? "Resolved"
          : formatCountdown(roundTimeRemainingSeconds);
  const getMeCloserHintRadius = game.radiiMeters[2] ?? null;

  if (game.status === "completed" && game.completedRounds && !revealState) {
    return (
      <div className="space-y-6">
        <GamePageHeader joinCode={game.joinCode} />
        <GameFinishedScreen game={game} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GamePageHeader joinCode={game.joinCode} />
      <div className="space-y-5">
      <section className="grid gap-4 rounded-[0.875rem] border border-ink/10 bg-white/92 p-5 shadow-panel md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Round" value={`${game.roundIndex + 1} / ${game.roundCount}`} />
        <StatCard label="Time left" value={roundTimerValue} />
        <StatCard label="Attempts left" value={String(game.attemptsRemaining)} />
        <StatCard label="Best so far" value={formatMeters(game.bestSuccessfulRadiusMeters)} />
        <StatCard label="Max now" value={formatScore(game.maxAvailableRoundPoints)} />
        <StatCard label="Hint penalty" value={formatScore(game.hintPenaltyPoints)} />
        <StatCard label="Round points" value={formatScore(game.provisionalRoundPoints)} />
        <StatCard label="Team score" value={formatScore(game.teamScore)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <FixedStreetViewClue imageUrl={game.clueImageUrl} />

          <div className="rounded-[0.875rem] border border-ink/10 bg-white/92 p-4 shadow-panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                Live guess map
              </p>
              <div className="flex flex-wrap gap-2">
                <StatusChip
                  label={game.status === "completed" ? "Completed" : "Live game"}
                  tone={game.status === "completed" ? "success" : "neutral"}
                />
              </div>
            </div>
            <GameMap
              currentAccuracy={position?.accuracy ?? null}
              currentPosition={
                position
                  ? {
                      latitude: position.latitude,
                      longitude: position.longitude,
                    }
                  : null
              }
              closerHintCircle={game.hints.getMeCloser.circle}
              guesses={game.guesses}
              mapBounds={game.mapBounds}
              revealTarget={activeRevealState?.target ?? null}
              roundKey={game.currentChallengeRoundId}
              selectedRadius={selectedRadius}
            />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[0.875rem] border border-ink/10 bg-white/92 p-5 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
              Guess controls
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <label
                  className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45"
                  htmlFor="guess-radius-slider"
                >
                  Radius
                </label>
                <output
                  className="text-lg font-semibold tabular-nums text-ink"
                  htmlFor="guess-radius-slider"
                >
                  {selectedRadius != null ? formatMeters(selectedRadius) : "—"}
                </output>
              </div>
              <input
                aria-valuetext={
                  selectedRadius != null ? formatMeters(selectedRadius) : undefined
                }
                className="mt-2 h-2.5 w-full cursor-grab appearance-none rounded-full bg-ink/15 [accent-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white/95 active:cursor-grabbing [&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-ink/15 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-thumb]:shadow-[0_2px_12px_rgba(13,22,19,0.38)] [&::-moz-range-thumb]:ring-2 [&::-moz-range-thumb]:ring-white/95 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-[0_2px_12px_rgba(13,22,19,0.38)] [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white/95 [&::-webkit-slider-thumb]:transition-[box-shadow,transform] [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:hover:scale-[1.06] [&::-webkit-slider-thumb]:hover:shadow-[0_4px_18px_rgba(13,22,19,0.5)] [&::-webkit-slider-thumb]:active:scale-100 [&::-webkit-slider-thumb]:active:cursor-grabbing"
                id="guess-radius-slider"
                max={Math.max(0, game.radiiMeters.length - 1)}
                min={0}
                onChange={(event) => {
                  const index = Number.parseInt(event.target.value, 10);
                  const next = game.radiiMeters[index];
                  if (next != null) {
                    setSelectedRadius(next);
                  }
                }}
                step={1}
                type="range"
                value={Math.min(
                  Math.max(
                    0,
                    selectedRadius != null
                      ? game.radiiMeters.indexOf(selectedRadius)
                      : 0,
                  ),
                  Math.max(0, game.radiiMeters.length - 1),
                )}
              />
              <div className="flex justify-between gap-1 px-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ink/40">
                {game.radiiMeters.map((radius) => (
                  <span
                    className={
                      selectedRadius === radius ? "text-ink" : undefined
                    }
                    key={radius}
                  >
                    {formatMeters(radius)}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-[0.625rem] bg-mist p-4 text-sm text-ink/70">
              <p>
                GPS accuracy:{" "}
                <span className="font-semibold text-ink">
                  {formatMeters(position?.accuracy ?? null)}
                </span>
              </p>
              {geolocationError ? (
                <p className="text-ember">{geolocationError}</p>
              ) : null}
              {roundTimerExpired ? (
                <p className="text-amber-700">The round timer just expired. Refreshing the reveal.</p>
              ) : null}
              {accuracyWarning ? (
                <p className="text-amber-700">
                  Your reported accuracy is worse than the selected radius. You can still guess.
                </p>
              ) : null}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                  Shared hints
                </p>
                <span className="text-sm text-ink/55">
                  Once per hint each round
                </span>
              </div>
              <div className="mt-3 space-y-3">
                <HintControlCard
                  actionLabel={
                    pendingAction === "get_me_closer"
                      ? "Applying..."
                      : game.hints.getMeCloser.used
                        ? "Used"
                        : game.hints.getMeCloser.isAvailable
                          ? "Use hint"
                          : "Unavailable"
                  }
                  description={
                    game.hints.getMeCloser.used && game.hints.getMeCloser.circle
                      ? `Hint circle live on the map at ${formatMeters(game.hints.getMeCloser.circle.radiusMeters)}.`
                      : game.hints.getMeCloser.isAvailable && getMeCloserHintRadius != null
                        ? `Show me a ${formatMeters(getMeCloserHintRadius)} circle containing the target.`
                        : "Requires at least 3 radius tiers in this challenge."
                  }
                  detail={`-${formatScore(game.hints.getMeCloser.costPoints)} points`}
                  disabled={
                    pending ||
                    game.status === "completed" ||
                    !!activeRevealState ||
                    roundTimerExpired ||
                    game.hints.getMeCloser.used ||
                    !game.hints.getMeCloser.isAvailable
                  }
                  onClick={() => void handleUseHint("get_me_closer")}
                  title="Get me closer"
                />
                <HintControlCard
                  actionLabel={
                    pendingAction === "point_me"
                      ? "Applying..."
                      : game.hints.pointMe.used
                        ? "Used"
                        : "Use hint"
                  }
                  description={
                    game.hints.pointMe.used && game.hints.pointMe.direction
                      ? `Team direction: ${formatPointHintDirection(game.hints.pointMe.direction)}.`
                      : "Reveal one shared North / South / East / West direction from the requester."
                  }
                  detail={`-${formatScore(game.hints.pointMe.costPoints)} points`}
                  disabled={
                    pending ||
                    game.status === "completed" ||
                    !!activeRevealState ||
                    roundTimerExpired ||
                    game.hints.pointMe.used ||
                    !position
                  }
                  onClick={() => void handleUseHint("point_me")}
                  statusLabel={
                    game.hints.pointMe.direction
                      ? formatPointHintDirection(game.hints.pointMe.direction)
                      : null
                  }
                  title="Point me"
                />
              </div>
            </div>

            {error ? (
              <p className="mt-4 rounded-xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
                {error}
              </p>
            ) : null}

            {activeRevealState ? (
              <div className="mt-4 rounded-[0.75rem] border border-ink/10 bg-mist p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                  Round resolved
                </p>
                <p className="mt-2 text-sm leading-7 text-ink/68">
                  {activeRevealState.timedOut
                    ? "Time expired for this round. Review the reveal on the map, then continue when your team is ready."
                    : "Review the reveal on the map, then continue when your team is ready."}
                </p>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  onClick={() => void handleAdvanceRound()}
                  type="button"
                >
                  {pendingAction === "advance"
                    ? "Continuing..."
                    : activeRevealState.isGameComplete
                      ? "View scorecard"
                      : "Next round"}
                </button>
              </div>
            ) : null}

            <button
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-neon px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                !position ||
                !selectedRadius ||
                pending ||
                game.status === "completed" ||
                !!activeRevealState ||
                roundTimerExpired
              }
              onClick={() => void handleGuess()}
              type="button"
            >
              {pendingAction === "guess" ? "Submitting..." : "Guess"}
            </button>
          </div>

          <div className="rounded-[0.875rem] border border-ink/10 bg-white/92 p-5 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                Team roster
              </p>
              <span className="text-sm text-ink/55">{game.players.length} players</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {game.players.map((player) => (
                <StatusChip key={player.id} label={player.nickname} />
              ))}
            </div>
          </div>

          <div className="rounded-[0.875rem] border border-ink/10 bg-white/92 p-5 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
              Guess history
            </p>
            <div className="mt-4 space-y-3">
              {game.guesses.length ? (
                game.guesses
                  .slice()
                  .reverse()
                  .map((guess) => (
                    <div
                      className="rounded-[0.625rem] border border-ink/10 bg-mist p-4"
                      key={guess.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-ink">{guess.nickname}</p>
                        <StatusChip
                          label={guess.isSuccess ? "Hit" : "Miss"}
                          tone={guess.isSuccess ? "success" : "danger"}
                        />
                      </div>
                      <p className="mt-2 text-sm text-ink/65">
                        Radius {formatMeters(guess.selectedRadiusMeters)}
                      </p>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-ink/55">No guesses yet this round.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="space-y-2">
        <BirthdaySetNextRoundButton
          disabled={birthdayBusy || game.status === "completed"}
          gameId={props.gameId}
          hasNextRound={game.roundIndex + 1 < game.roundCount}
          onBusyChange={setBirthdayBusy}
          onMessage={setBirthdayNotice}
          pending={birthdayBusy}
          viewerIsCaptain={game.viewerIsCaptain}
        />
        {birthdayNotice ? (
          <p
            className={`text-center text-sm ${
              birthdayNotice === "Next round updated."
                ? "text-emerald-800"
                : "text-ember"
            }`}
          >
            {birthdayNotice}
          </p>
        ) : null}
      </div>
      </div>
    </div>
  );
}

function GamePageHeader(props: { joinCode: string | null }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopyInviteLink() {
    if (!props.joinCode) {
      return;
    }

    const url = `${window.location.origin}/join/${encodeURIComponent(props.joinCode)}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
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
      }, 1500);
    } catch {
      setCopyState("error");
      window.setTimeout(() => {
        setCopyState("idle");
      }, 2000);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <BrandMark
        className="text-sm font-semibold uppercase tracking-[0.22em] text-ink/45 transition hover:text-ink/65"
        href="/"
      />
      {props.joinCode ? (
        <button
          aria-label={`Copy invite link for join code ${props.joinCode}`}
          className="inline-flex max-w-full items-center gap-2.5 rounded-[0.5rem] border border-ink/15 bg-white/92 px-4 py-2.5 text-left text-sm text-ink/70 shadow-[0_1px_0_rgba(15,23,28,0.04)] transition hover:border-ink/25 hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35"
          onClick={() => void handleCopyInviteLink()}
          type="button"
        >
          <CopyInviteIcon className="h-4 w-4 shrink-0 text-ink/55" />
          <span className="min-w-0 font-semibold uppercase tracking-[0.22em] text-ink/70">
            Join link
            {copyState === "copied" ? (
              <span className="ml-2 whitespace-nowrap text-xs font-medium text-emerald-700">
                Copied
              </span>
            ) : null}
            {copyState === "error" ? (
              <span className="ml-2 whitespace-nowrap text-xs font-medium text-ember">Copy failed</span>
            ) : null}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function CopyInviteIcon(props: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={props.className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[0.75rem] bg-mist p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-ink">{props.value}</p>
    </div>
  );
}

function HintControlCard(props: {
  title: string;
  detail: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  onClick: () => void;
  statusLabel?: string | null;
}) {
  return (
    <div className="rounded-[0.625rem] border border-ink/10 bg-mist p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{props.title}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-ink/45">
            {props.detail}
          </p>
        </div>
        {props.statusLabel ? <StatusChip label={props.statusLabel} tone="neutral" /> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/65">{props.description}</p>
      <button
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-ink px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
        disabled={props.disabled}
        onClick={props.onClick}
        type="button"
      >
        {props.actionLabel}
      </button>
    </div>
  );
}

function formatPointHintDirection(direction: PointHintDirection) {
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}
