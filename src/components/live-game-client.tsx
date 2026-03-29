"use client";

import { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

import { authorizedJsonFetch } from "@/lib/api/client";
import type { PointHintDirection, RoundHintType } from "@/lib/domain/hints";
import { createReloadController } from "@/lib/reload-controller";
import { cn, formatCountdown, formatMeters, formatScore } from "@/lib/utils";
import { useGeolocation } from "@/hooks/use-geolocation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { LiveGameState, LiveGuess } from "@/types/app";
import { BirthdaySetNextRoundButton } from "@/components/temp/birthday-set-next-round-button";
import { GameFinishedScreen } from "@/components/game-finished-screen";
import { GameMap } from "@/components/game-map";
import { StatusChip } from "@/components/status-chip";
import { ZoomableClueImage } from "@/components/zoomable-clue-image";

interface RevealState {
  target: {
    lat: number;
    lng: number;
  };
  radiiMeters: number[];
  isGameComplete: boolean;
  timedOut: boolean;
}

type StageMode = "map" | "image";

/** Distinct on solid white HUD; names cycle */
const PLAYER_PANEL_COLORS = [
  "text-amber-800",
  "text-sky-800",
  "text-rose-700",
  "text-lime-800",
  "text-violet-800",
  "text-orange-800",
  "text-teal-800",
  "text-fuchsia-800",
] as const;

const HUD_INSET_PX = 12;
const HUD_TOGGLE_GAP_PX = 8;

function rectsOverlapViewport(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRectReadOnly,
  pad: number,
) {
  return !(
    a.right + pad <= b.left ||
    a.left - pad >= b.right ||
    a.bottom + pad <= b.top ||
    a.top - pad >= b.bottom
  );
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
  const localMutationPendingRef = useRef(false);
  const requestReloadRef = useRef<(() => void) | null>(null);
  const setReloadSuppressedRef = useRef<((suppressed: boolean) => void) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [birthdayBusy, setBirthdayBusy] = useState(false);
  const [birthdayNotice, setBirthdayNotice] = useState<string | null>(null);
  const [stageMode, setStageMode] = useState<StageMode>("image");
  const [hintsOpen, setHintsOpen] = useState(false);
  const [guessConfirmOpen, setGuessConfirmOpen] = useState(false);
  const [hudOffsetTop, setHudOffsetTop] = useState(HUD_INSET_PX);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mapImageToggleRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);

  const accuracyWarning =
    position?.accuracy != null &&
    selectedRadius != null &&
    position.accuracy > selectedRadius;

  function applyGameState(response: LiveGameState) {
    setGame(response);
    setSelectedRadius((previous) =>
      previous && response.radiiMeters.includes(previous)
        ? previous
        : response.radiiMeters[0] ?? null,
    );
  }

  function syncReloadSuppression() {
    const suppressed = revealLockRef.current || localMutationPendingRef.current;
    setReloadSuppressedRef.current?.(suppressed);
  }

  function setRevealLock(nextRevealLock: boolean) {
    revealLockRef.current = nextRevealLock;
    syncReloadSuppression();
  }

  function setLocalMutationPending(nextPending: boolean) {
    localMutationPendingRef.current = nextPending;
    syncReloadSuppression();
  }

  function applyMutationGameState(response: LiveGameState) {
    applyGameState(response);
    setRevealState(buildRevealState(response));
    setRevealLock(response.roundResolved && !!response.target);
    setError(null);
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

    const controller = createReloadController(loadState);
    requestReloadRef.current = () => {
      controller.request();
    };
    setReloadSuppressedRef.current = (suppressed) => {
      controller.setSuppressed(suppressed);
    };
    controller.setSuppressed(revealLockRef.current || localMutationPendingRef.current);
    controller.request();

    const subscribe = (table: string, filter: string) =>
      supabase
        .channel(`bullseye:${props.gameId}:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          () => {
            controller.request();
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
      requestReloadRef.current = null;
      setReloadSuppressedRef.current = null;
      controller.dispose();
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
      requestReloadRef.current?.();
    }, Math.max(0, new Date(game.roundExpiresAt).getTime() - Date.now()) + 250);

    return () => {
      window.clearInterval(tickInterval);
      window.clearTimeout(refreshTimeout);
    };
  }, [game?.currentRoundId, game?.roundExpiresAt, game?.roundResolved]);

  useEffect(() => {
    if (!hintsOpen && !guessConfirmOpen) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setHintsOpen(false);
        setGuessConfirmOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hintsOpen, guessConfirmOpen]);

  useLayoutEffect(() => {
    if (
      !game ||
      (game.status === "completed" && game.completedRounds && !revealState)
    ) {
      return;
    }

    const stageNode = stageRef.current;
    const toggleNode = mapImageToggleRef.current;
    const hudNode = hudRef.current;
    if (!stageNode || !toggleNode || !hudNode) {
      return;
    }

    function updateHudTop() {
      const stage = stageRef.current;
      const toggle = mapImageToggleRef.current;
      const hud = hudRef.current;
      if (!stage || !toggle || !hud) {
        return;
      }
      const sr = stage.getBoundingClientRect();
      const tr = toggle.getBoundingClientRect();
      const hr = hud.getBoundingClientRect();
      const w = hud.offsetWidth;
      const h = hud.offsetHeight;

      let top = HUD_INSET_PX;
      const hudRect = {
        left: hr.left,
        top: sr.top + top,
        right: hr.left + w,
        bottom: sr.top + top + h,
      };

      if (rectsOverlapViewport(hudRect, tr, HUD_TOGGLE_GAP_PX)) {
        top = Math.max(HUD_INSET_PX, tr.bottom - sr.top + HUD_TOGGLE_GAP_PX);
      }
      setHudOffsetTop(top);
    }

    updateHudTop();
    const ro = new ResizeObserver(updateHudTop);
    ro.observe(stageNode);
    ro.observe(toggleNode);
    ro.observe(hudNode);
    window.addEventListener("resize", updateHudTop);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateHudTop);
    };
  }, [
    accuracyWarning,
    game,
    game?.roundExpiresAt,
    game?.roundResolved,
    game?.roundTimeLimitSeconds,
    geolocationError,
    now,
    revealState,
    stageMode,
  ]);

  async function handleGuess() {
    if (!position || !game || !selectedRadius) {
      return;
    }

    setGuessConfirmOpen(false);
    setPendingAction("guess");
    setLocalMutationPending(true);
    startTransition(async () => {
      try {
        const response = await authorizedJsonFetch<LiveGameState>(`/api/games/${props.gameId}/guess`, {
          method: "POST",
          body: JSON.stringify({
            gameId: props.gameId,
            selectedRadiusMeters: selectedRadius,
            currentLat: position.latitude,
            currentLng: position.longitude,
            accuracyMeters: position.accuracy,
          }),
        });
        applyMutationGameState(response);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Unable to submit guess.",
        );
      } finally {
        setLocalMutationPending(false);
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
      setRevealLock(false);
      setRevealState(null);
      return;
    }

    setPendingAction("advance");
    setLocalMutationPending(true);
    startTransition(async () => {
      try {
        const refreshed = await authorizedJsonFetch<LiveGameState>(`/api/games/${props.gameId}/advance`, {
          method: "POST",
          body: JSON.stringify({
            gameId: props.gameId,
          }),
        });

        applyMutationGameState(refreshed);
      } catch (advanceError) {
        setError(
          advanceError instanceof Error
            ? advanceError.message
            : "Unable to advance to the next round.",
        );
      } finally {
        setLocalMutationPending(false);
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

    setStageMode("map");
    setHintsOpen(false);
    setPendingAction(hintType);
    setLocalMutationPending(true);
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

        applyMutationGameState(refreshed);
      } catch (hintError) {
        setError(
          hintError instanceof Error ? hintError.message : "Unable to use that hint.",
        );
      } finally {
        setLocalMutationPending(false);
        setPendingAction(null);
      }
    });
  }

  if (error && !game) {
    return (
      <div className="space-y-6">
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
      <div className="rounded-[0.875rem] border border-ink/10 bg-white/95 p-6 text-sm text-ink/65 shadow-panel">
        Loading live game...
      </div>
    );
  }

  const activeRevealState =
    revealState ?? buildRevealState(game);
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
  const showAdvanceAction = !!activeRevealState || roundTimerExpired;
  const getMeCloserHintRadius = game.radiiMeters[2] ?? null;
  const hudTimeLeftLine =
    game.roundTimeLimitSeconds == null
      ? "No time limit"
      : activeRevealState?.timedOut
        ? "Timed out"
        : game.roundResolved
          ? "Resolved"
          : `${formatCountdown(roundTimeRemainingSeconds)} left`;
  const hudRoundLine = `Round ${game.roundIndex + 1}/${game.roundCount}`;

  if (game.status === "completed" && game.completedRounds && !revealState) {
    return <GameFinishedScreen game={game} />;
  }

  const guessBlocked =
    !position ||
    !selectedRadius ||
    pending ||
    game.status === "completed" ||
    !!activeRevealState ||
    roundTimerExpired;

  return (
    <>
      <div
        className="max-sm:fixed max-sm:inset-0 max-sm:z-[5] max-sm:h-dvh max-sm:w-full bg-ink sm:relative sm:left-1/2 sm:z-auto sm:min-h-dvh sm:w-screen sm:-translate-x-1/2"
        ref={stageRef}
      >
        <div className="absolute inset-0 z-0">
          {stageMode === "map" ? (
            <GameMap
              className="h-full min-h-0 w-full rounded-none"
              closerHintCircle={game.hints.getMeCloser.circle}
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
              mapArea={game.mapArea}
              mapBounds={game.mapBounds}
              revealTarget={activeRevealState?.target ?? null}
              roundKey={game.currentChallengeRoundId}
              selectedRadius={selectedRadius}
            />
          ) : (
            <ZoomableClueImage imageUrl={game.clueImageUrl} roundKey={game.currentChallengeRoundId} />
          )}
        </div>

        <div className="pointer-events-none absolute inset-0 z-10">
          <div
            className="pointer-events-auto absolute left-3 max-h-[min(42vh,calc(100dvh-16rem))] max-w-[min(calc(100vw-8rem),15rem)] space-y-1 overflow-y-auto rounded-[0.625rem] border border-ink/10 bg-white px-2 py-1.5 pr-1 shadow-[0_2px_12px_rgba(13,22,19,0.12)] sm:left-4 sm:max-h-[min(46vh,calc(100dvh-15rem))] sm:max-w-[min(calc(100vw-9rem),19rem)] sm:space-y-1.5 sm:rounded-lg sm:px-3 sm:py-2 sm:pr-1.5 lg:left-5 lg:max-h-[min(50vh,calc(100dvh-13rem))] lg:max-w-[min(calc(100vw-14rem),26rem)] lg:space-y-2 lg:rounded-xl lg:px-4 lg:py-2.5 lg:pr-2"
            ref={hudRef}
            style={{ top: hudOffsetTop }}
          >
            <p className="text-[0.62rem] font-medium leading-snug tracking-wide text-ink sm:text-xs lg:text-sm">
              {hudRoundLine}
            </p>
            <p className="text-[0.62rem] font-semibold leading-snug tabular-nums text-ink sm:text-xs lg:text-sm">
              {hudTimeLeftLine}
            </p>
            <AttemptTrack guesses={game.guesses} limit={game.guessLimitPerRound} />
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 border-t border-ink/10 pt-1 sm:gap-x-2 sm:pt-1.5">
              {game.players.map((player, index) => (
                <span
                  className={cn(
                    "text-[0.58rem] font-semibold tracking-[0.03em] sm:text-[0.65rem] lg:text-xs",
                    PLAYER_PANEL_COLORS[index % PLAYER_PANEL_COLORS.length],
                  )}
                  key={player.id}
                >
                  {player.nickname}
                </span>
              ))}
            </div>
            {geolocationError || roundTimerExpired || accuracyWarning ? (
              <div className="space-y-0.5 border-t border-ink/10 pt-1 text-[0.58rem] leading-snug text-ink/70 sm:pt-1.5 sm:text-xs lg:text-sm">
                {geolocationError ? (
                  <p className="font-medium text-ember">{geolocationError}</p>
                ) : null}
                {roundTimerExpired ? (
                  <p className="font-medium text-amber-800">The round timer just expired.</p>
                ) : null}
                {accuracyWarning ? (
                  <p className="font-medium text-amber-800">
                    Your reported accuracy is worse than the selected radius. You can still guess.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className="pointer-events-auto absolute left-1/2 top-3 z-[11] -translate-x-1/2"
            ref={mapImageToggleRef}
          >
            <div className="flex rounded-full border border-ink/12 bg-white/90 p-0.5 shadow-[0_2px_12px_rgba(13,22,19,0.12)] backdrop-blur-sm">
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  stageMode === "image" ? "bg-ink text-white" : "text-ink/60 hover:text-ink"
                }`}
                onClick={() => {
                  setStageMode("image");
                  setGuessConfirmOpen(false);
                }}
                type="button"
              >
                Image
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  stageMode === "map" ? "bg-ink text-white" : "text-ink/60 hover:text-ink"
                }`}
                onClick={() => setStageMode("map")}
                type="button"
              >
                Map
              </button>
            </div>
          </div>

          <div className="pointer-events-auto absolute right-3 top-3 flex max-w-[calc(100%-8rem)] flex-wrap items-center justify-end gap-2">
            <InviteIconButton joinCode={game.joinCode} />
            <button
              aria-label="Hint options"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/12 bg-white/90 text-ink shadow-[0_2px_12px_rgba(13,22,19,0.12)] backdrop-blur-sm transition hover:border-ink/20 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35"
              onClick={() => setHintsOpen(true)}
              type="button"
            >
              <LightbulbIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {stageMode === "map" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto flex max-w-7xl flex-nowrap items-stretch gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <div className="flex min-h-[4.75rem] min-w-0 flex-1 flex-col justify-center rounded-xl border border-ink/10 bg-white/92 px-2 py-2 shadow-[0_2px_16px_rgba(13,22,19,0.14)] backdrop-blur-md sm:min-h-0 sm:px-3">
              <div className="relative z-10">
                <input
                  aria-label="Radius"
                  aria-valuetext={selectedRadius != null ? formatMeters(selectedRadius) : undefined}
                  className="h-2.5 w-full cursor-grab appearance-none rounded-full bg-ink/15 [accent-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white/95 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45 [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-10 [&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-ink/15 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-thumb]:shadow-[0_2px_12px_rgba(13,22,19,0.38)] [&::-moz-range-thumb]:ring-2 [&::-moz-range-thumb]:ring-white/95 [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-[0_2px_12px_rgba(13,22,19,0.38)] [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white/95 [&::-webkit-slider-thumb]:transition-[box-shadow,transform] [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:hover:scale-[1.06] [&::-webkit-slider-thumb]:hover:shadow-[0_4px_18px_rgba(13,22,19,0.5)] [&::-webkit-slider-thumb]:active:scale-100 [&::-webkit-slider-thumb]:active:cursor-grabbing"
                  disabled={!!activeRevealState || roundTimerExpired}
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
                      selectedRadius != null ? game.radiiMeters.indexOf(selectedRadius) : 0,
                    ),
                    Math.max(0, game.radiiMeters.length - 1),
                  )}
                />
              </div>
              <div className="relative z-0 mt-2.5 flex justify-between gap-1 px-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-ink/40 leading-none pointer-events-none">
                {game.radiiMeters.map((radius) => (
                  <span className={selectedRadius === radius ? "text-ink" : undefined} key={radius}>
                    {formatMeters(radius)}
                  </span>
                ))}
              </div>
            </div>
            {showAdvanceAction ? (
              <button
                className="inline-flex min-h-[4.75rem] shrink-0 items-center justify-center self-stretch whitespace-nowrap rounded-xl bg-ink px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_2px_16px_rgba(13,22,19,0.2)] transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-[10.5rem] sm:px-5 sm:text-sm sm:tracking-[0.22em]"
                disabled={pending}
                onClick={() => {
                  if (roundTimerExpired && !activeRevealState) {
                    requestReloadRef.current?.();
                    return;
                  }
                  void handleAdvanceRound();
                }}
                type="button"
              >
                {pendingAction === "advance"
                  ? "Continuing..."
                  : activeRevealState?.isGameComplete
                    ? (
                        <>
                          <span className="sm:hidden">Scorecard</span>
                          <span className="hidden sm:inline">View scorecard</span>
                        </>
                      )
                    : "Next round"}
              </button>
            ) : (
              <button
                className="inline-flex min-h-[4.75rem] shrink-0 items-center justify-center self-stretch whitespace-nowrap rounded-xl bg-neon px-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink shadow-[0_2px_16px_rgba(13,22,19,0.12)] transition hover:bg-[#cfff45] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-0 sm:px-4 sm:text-sm sm:tracking-[0.22em]"
                disabled={guessBlocked}
                onClick={() => setGuessConfirmOpen(true)}
                type="button"
              >
                Guess
              </button>
            )}
          </div>
        </div>
        ) : null}
      </div>

      {birthdayNotice ? (
        <p
          className={`mt-2 text-center text-sm ${
            birthdayNotice === "Next round updated." ? "text-emerald-800" : "text-ember"
          }`}
        >
          {birthdayNotice}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      ) : null}

      {guessConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setGuessConfirmOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-[0.875rem] border border-ink/10 bg-white/95 p-6 shadow-panel"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guess-confirm-title"
          >
            <p className="text-lg font-semibold text-ink" id="guess-confirm-title">
              Confirm guess
            </p>
            <p className="mt-3 text-sm leading-6 text-ink/68">
              Submit at <span className="font-semibold text-ink">{formatMeters(selectedRadius)}</span> from
              your current location?
            </p>
            <p className="mt-2 text-sm text-ink/65">
              GPS accuracy: {formatMeters(position?.accuracy ?? null)}
            </p>
            {accuracyWarning ? (
              <p className="mt-2 text-sm text-amber-700">
                Your reported accuracy is worse than the selected radius. You can still submit.
              </p>
            ) : null}
            <div className="mt-6 flex flex-row items-center justify-between gap-3">
              <button
                className="inline-flex justify-center rounded-xl border border-ink/15 bg-mist px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-ink/80 transition hover:border-ink/25 hover:text-ink"
                onClick={() => setGuessConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex justify-center rounded-xl bg-neon px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={guessBlocked || pendingAction === "guess"}
                onClick={() => void handleGuess()}
                type="button"
              >
                {pendingAction === "guess" ? "Submitting…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hintsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setHintsOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[0.875rem] border border-ink/10 bg-white/95 p-5 shadow-panel"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hint-modal-title"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45" id="hint-modal-title">
              Shared hints
            </p>
            <p className="mt-1 text-sm text-ink/55">Once per hint each round</p>
            <div className="mt-4 space-y-3">
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
            {game.viewerIsCaptain && game.roundIndex + 1 < game.roundCount ? (
              <div className="mt-4 border-t border-ink/10 pt-4">
                <BirthdaySetNextRoundButton
                  disabled={birthdayBusy || game.status === "completed"}
                  gameId={props.gameId}
                  hasNextRound
                  onBusyChange={setBirthdayBusy}
                  onMessage={setBirthdayNotice}
                  pending={birthdayBusy}
                  viewerIsCaptain
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function AttemptTrack(props: { guesses: LiveGuess[]; limit: number }) {
  const limit = Math.max(0, props.limit);
  const hits = props.guesses.filter((g) => g.isSuccess).length;
  const misses = props.guesses.filter((g) => !g.isSuccess).length;
  const remaining = Math.max(0, limit - props.guesses.length);
  const ariaLabel = `${hits} hits, ${misses} misses, ${remaining} guesses remaining of ${limit}`;

  return (
    <div
      aria-label={ariaLabel}
      className="flex min-h-[1rem] flex-wrap items-center gap-1 leading-none sm:min-h-[1.125rem] sm:gap-1.5 lg:min-h-[1.25rem]"
      role="group"
    >
      {Array.from({ length: limit }, (_, i) => {
        const guess = props.guesses[i];
        if (!guess) {
          return (
            <span
              className="inline-flex h-3.5 w-3.5 select-none items-center justify-center text-[0.7rem] text-ink/30 sm:h-4 sm:w-4 sm:text-xs lg:h-[1.125rem] lg:w-[1.125rem]"
              key={`slot-${i}`}
              title="Unused guess"
            >
              ○
            </span>
          );
        }
        if (guess.isSuccess) {
          return (
            <span
              className="inline-flex h-3.5 w-3.5 select-none items-center justify-center text-[0.7rem] font-semibold text-moss sm:h-4 sm:w-4 sm:text-xs lg:h-[1.125rem] lg:w-[1.125rem]"
              key={guess.id}
              title="Hit"
            >
              ✓
            </span>
          );
        }
        return (
          <span
            className="inline-flex h-3.5 w-3.5 select-none items-center justify-center text-[0.75rem] font-semibold leading-none text-ember sm:h-4 sm:w-4 sm:text-sm lg:h-[1.125rem] lg:w-[1.125rem]"
            key={guess.id}
            title="Miss"
          >
            ×
          </span>
        );
      })}
    </div>
  );
}

function buildRevealState(game: LiveGameState): RevealState | null {
  if (!game.roundResolved || !game.target) {
    return null;
  }

  return {
    target: game.target,
    radiiMeters: game.radiiMeters,
    isGameComplete: game.status === "completed",
    timedOut: game.roundTimedOut,
  };
}

function InviteIconButton(props: { joinCode: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopyInviteLink() {
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
      }, 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => {
        setCopyState("idle");
      }, 2000);
    }
  }

  const label =
    copyState === "copied"
      ? "Invite link copied"
      : copyState === "error"
        ? "Copy failed"
        : `Copy invite link for join code ${props.joinCode}`;

  return (
    <div className="relative inline-flex flex-col items-center">
      <button
        aria-label={label}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white/90 shadow-[0_2px_12px_rgba(13,22,19,0.12)] backdrop-blur-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35 ${
          copyState === "copied"
            ? "border-emerald-400/45 text-emerald-700"
            : copyState === "error"
              ? "border-ember/35 text-ember"
              : "border-ink/12 text-ink hover:border-ink/20 hover:bg-white"
        }`}
        onClick={() => void handleCopyInviteLink()}
        title={label}
        type="button"
      >
        <span
          className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
            copyState === "copied" ? "scale-50 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          <SharePostIcon className="h-5 w-5 text-ink/70" />
        </span>
        <span
          className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
            copyState === "copied" ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        >
          <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
        </span>
      </button>
      {copyState === "copied" ? (
        <span
          aria-live="polite"
          className="copy-link-toast pointer-events-none absolute top-full z-30 mt-1.5 whitespace-nowrap rounded-md border border-white/15 bg-ink px-2 py-1 text-[0.7rem] font-semibold text-white shadow-[0_2px_12px_rgba(13,22,19,0.45)]"
        >
          Link copied
        </span>
      ) : null}
    </div>
  );
}

function CheckCircleIcon(props: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={props.className}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** Share — three nodes with two branches (classic share-post glyph). */
function SharePostIcon(props: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={props.className}
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
    >
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
        x1="8.35"
        x2="15.95"
        y1="10.35"
        y2="6.55"
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
        x1="8.35"
        x2="15.95"
        y1="13.65"
        y2="17.45"
      />
      <circle cx="6" cy="12" fill="currentColor" r="2.4" />
      <circle cx="18" cy="6.55" fill="currentColor" r="2.4" />
      <circle cx="18" cy="17.45" fill="currentColor" r="2.4" />
    </svg>
  );
}

function LightbulbIcon(props: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={props.className}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
    >
      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
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
