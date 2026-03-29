"use client";

import { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { authorizedJsonFetch } from "@/lib/api/client";
import { formatCountdown, formatDurationLabel, formatMeters, formatScore } from "@/lib/utils";
import { useGeolocation } from "@/hooks/use-geolocation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { LiveGameState } from "@/types/app";
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
  const [revealState, setRevealState] = useState<RevealState | null>(null);
  const revealLockRef = useRef(false);
  const loadStateRef = useRef<(() => Promise<void>) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [birthdayBusy, setBirthdayBusy] = useState(false);
  const [birthdayNotice, setBirthdayNotice] = useState<string | null>(null);

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

        setGame(response);
        setSelectedRadius((previous) =>
          previous && response.radiiMeters.includes(previous)
            ? previous
            : response.radiiMeters[0] ?? null,
        );
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
            setGame(refreshed);
            setSelectedRadius((previous) =>
              previous && refreshed.radiiMeters.includes(previous)
                ? previous
                : refreshed.radiiMeters[0] ?? null,
            );
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

    startTransition(async () => {
      try {
        const refreshed = await authorizedJsonFetch<LiveGameState>(`/api/games/${props.gameId}/advance`, {
          method: "POST",
          body: JSON.stringify({
            gameId: props.gameId,
          }),
        });

        setGame(refreshed);
        setSelectedRadius((previous) =>
          previous && refreshed.radiiMeters.includes(previous)
            ? previous
            : refreshed.radiiMeters[0] ?? null,
        );
        setRevealState(null);
        revealLockRef.current = false;
        setError(null);
      } catch (advanceError) {
        setError(
          advanceError instanceof Error
            ? advanceError.message
            : "Unable to advance to the next round.",
        );
      }
    });
  }

  if (error && !game) {
    return (
      <div className="rounded-[2rem] border border-ember/20 bg-white/95 p-6 shadow-panel">
        <p className="text-lg font-semibold text-ink">Unable to open this game.</p>
        <p className="mt-2 text-sm text-ink/65">{error}</p>
        <Link
          className="mt-4 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white"
          href="/"
        >
          Back home
        </Link>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="rounded-[2rem] border border-ink/10 bg-white/95 p-6 text-sm text-ink/65 shadow-panel">
        Loading live game...
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

  if (game.status === "completed" && game.completedRounds && !revealState) {
    return <GameFinishedScreen game={game} />;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-[2rem] border border-ink/10 bg-white/92 p-5 shadow-panel md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Round" value={`${game.roundIndex + 1} / ${game.roundCount}`} />
        <StatCard label="Time left" value={roundTimerValue} />
        <StatCard label="Attempts left" value={String(game.attemptsRemaining)} />
        <StatCard label="Best so far" value={formatMeters(game.bestSuccessfulRadiusMeters)} />
        <StatCard label="Round points" value={formatScore(game.provisionalRoundPoints)} />
        <StatCard label="Team score" value={formatScore(game.teamScore)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <FixedStreetViewClue
            fov={game.clueFov}
            heading={game.clueHeading}
            imageUrl={game.clueImageUrl}
            pitch={game.cluePitch}
          />

          <div className="rounded-[2rem] border border-ink/10 bg-white/92 p-4 shadow-panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                  Live guess map
                </p>
                <p className="text-sm text-ink/65">
                  Your blue marker is live. Green and red circles are previous team guesses.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusChip label={`Join ${game.joinCode}`} />
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
              guesses={game.guesses}
              mapBounds={game.mapBounds}
              revealRadii={activeRevealState?.radiiMeters ?? []}
              revealTarget={activeRevealState?.target ?? null}
              roundKey={game.currentChallengeRoundId}
              selectedRadius={selectedRadius}
            />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[2rem] border border-ink/10 bg-white/92 p-5 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
              Guess controls
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {game.radiiMeters.map((radius) => (
                <button
                  className={`rounded-3xl border px-4 py-4 text-left transition ${
                    selectedRadius === radius
                      ? "border-ink bg-ink text-white"
                      : "border-ink/10 bg-mist text-ink hover:border-moss"
                  }`}
                  key={radius}
                  onClick={() => setSelectedRadius(radius)}
                  type="button"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
                    Radius
                  </p>
                  <p className="mt-1 text-lg font-semibold">{formatMeters(radius)}</p>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3 rounded-[1.5rem] bg-mist p-4 text-sm text-ink/70">
              <p>
                GPS accuracy:{" "}
                <span className="font-semibold text-ink">
                  {formatMeters(position?.accuracy ?? null)}
                </span>
              </p>
              <p>
                Round timer:{" "}
                <span className="font-semibold text-ink">
                  {formatDurationLabel(game.roundTimeLimitSeconds)}
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

            {error ? (
              <p className="mt-4 rounded-3xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
                {error}
              </p>
            ) : null}

            {activeRevealState ? (
              <div className="mt-4 rounded-[1.6rem] border border-ink/10 bg-mist p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                  Round resolved
                </p>
                <p className="mt-2 text-sm leading-7 text-ink/68">
                  {activeRevealState.timedOut
                    ? "Time expired for this round. Review the reveal on the map, then continue when your team is ready."
                    : "Review the reveal on the map, then continue when your team is ready."}
                </p>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  onClick={() => void handleAdvanceRound()}
                  type="button"
                >
                  {pending
                    ? "Continuing..."
                    : activeRevealState.isGameComplete
                      ? "View scorecard"
                      : "Next round"}
                </button>
              </div>
            ) : null}

            <button
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-neon px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45] disabled:cursor-not-allowed disabled:opacity-60"
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
              {pending ? "Submitting..." : "Guess"}
            </button>
          </div>

          <div className="rounded-[2rem] border border-ink/10 bg-white/92 p-5 shadow-panel">
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

          <div className="rounded-[2rem] border border-ink/10 bg-white/92 p-5 shadow-panel">
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
                      className="rounded-[1.4rem] border border-ink/10 bg-mist p-4"
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
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] bg-mist p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-ink">{props.value}</p>
    </div>
  );
}
