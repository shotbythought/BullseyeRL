"use client";

import { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { BirthdaySetNextRoundButton } from "@/components/temp/birthday-set-next-round-button";
import {
  GameStageBoard,
  type PendingGameAction,
  type RevealState,
  type StageMode,
} from "@/components/game-stage-board";
import { GameFinishedScreen } from "@/components/game-finished-screen";
import { useGeolocation } from "@/hooks/use-geolocation";
import { authorizedJsonFetch } from "@/lib/api/client";
import type { RoundHintType } from "@/lib/domain/hints";
import { shouldShowJustCompletedReveal } from "@/lib/live-game-reveal";
import { createReloadController } from "@/lib/reload-controller";
import { ensureAnonymousSession } from "@/lib/session/anonymous";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { LiveGameState } from "@/types/app";

export function LiveGameClient(props: { gameId: string }) {
  const { position, error: geolocationError } = useGeolocation();
  const [game, setGame] = useState<LiveGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRadius, setSelectedRadius] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<PendingGameAction>(null);
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
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const previousRoundIdRef = useRef<string | null>(null);
  const previousGameRef = useRef<LiveGameState | null>(null);

  function syncRoundLocalState(nextRoundId: string) {
    const previousRoundId = previousRoundIdRef.current;
    previousRoundIdRef.current = nextRoundId;

    if (previousRoundId && previousRoundId !== nextRoundId) {
      setRevealState(null);
      setRevealLock(false);
      setStageMode("image");
      setHintsOpen(false);
      setGuessConfirmOpen(false);
    }
  }

  function applyGameState(response: LiveGameState) {
    const previousGame = previousGameRef.current;
    syncRoundLocalState(response.currentRoundId);
    setGame(response);
    previousGameRef.current = response;
    setSelectedRadius((previous) =>
      previous && response.radiiMeters.includes(previous)
        ? previous
        : response.radiiMeters[0] ?? null,
    );

    if (shouldShowJustCompletedReveal(previousGame, response)) {
      setRevealState(buildRevealState(response));
      setRevealLock(true);
    }
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
    const channels: RealtimeChannel[] = [];

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
    void (async () => {
      try {
        await ensureAnonymousSession();

        if (!mounted) {
          return;
        }

        const subscriptionResults = await Promise.allSettled(
          [
            ["games", `id=eq.${props.gameId}`],
            ["game_players", `game_id=eq.${props.gameId}`],
            ["game_rounds", `game_id=eq.${props.gameId}`],
            ["guesses", `game_id=eq.${props.gameId}`],
          ].map(async ([table, filter]) => {
            const channel = supabase
              .channel(`bullseye:${props.gameId}:${table}`)
              .on(
                "postgres_changes",
                { event: "*", schema: "public", table, filter },
                () => {
                  controller.request();
                },
              );

            channels.push(channel);
            await waitForChannelSubscription(channel, {
              onProblem: (status, subscribeError) => {
                console.error(
                  `Realtime subscription ${status.toLowerCase()} for ${table}.`,
                  subscribeError,
                );
              },
              onSubscribed: () => {
                controller.request();
              },
              table,
            });
          }),
        );

        if (!mounted) {
          return;
        }

        if (subscriptionResults.some((result) => result.status === "rejected")) {
          console.error("One or more realtime subscriptions failed to initialize.", {
            gameId: props.gameId,
          });
        }

        controller.request();
      } catch (initializationError) {
        if (!mounted) {
          return;
        }

        setError(
          initializationError instanceof Error
            ? initializationError.message
            : "Unable to start live sync.",
        );
      }
    })();

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

  const activeRevealState = revealState ?? buildRevealState(game);
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

  if (game.status === "completed" && game.completedRounds && !revealState) {
    return <GameFinishedScreen game={game} />;
  }

  return (
    <>
      <GameStageBoard
        activeRevealState={activeRevealState}
        error={null}
        game={game}
        geolocationError={geolocationError}
        guessConfirmOpen={guessConfirmOpen}
        hintsFooter={
          game.viewerIsCaptain && game.roundIndex + 1 < game.roundCount ? (
            <BirthdaySetNextRoundButton
              disabled={birthdayBusy || game.status === "completed"}
              gameId={props.gameId}
              hasNextRound
              onBusyChange={setBirthdayBusy}
              onMessage={setBirthdayNotice}
              pending={birthdayBusy}
              viewerIsCaptain
            />
          ) : null
        }
        hintsOpen={hintsOpen}
        howToPlayOpen={howToPlayOpen}
        inviteJoinCode={game.joinCode}
        onAdvanceRound={() => {
          if (roundTimerExpired && !activeRevealState) {
            requestReloadRef.current?.();
            return;
          }
          void handleAdvanceRound();
        }}
        onGuess={() => void handleGuess()}
        onGuessConfirmOpenChange={setGuessConfirmOpen}
        onHintsOpenChange={setHintsOpen}
        onHowToPlayOpenChange={setHowToPlayOpen}
        onSelectedRadiusChange={setSelectedRadius}
        onStageModeChange={(mode) => {
          setStageMode(mode);
          if (mode === "image") {
            setGuessConfirmOpen(false);
          }
        }}
        onUseHint={(hintType) => void handleUseHint(hintType)}
        pending={pending}
        pendingAction={pendingAction}
        position={position}
        roundTimeRemainingSeconds={roundTimeRemainingSeconds}
        roundTimerExpired={roundTimerExpired}
        selectedRadius={selectedRadius}
        stageMode={stageMode}
      />

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
        <p className="mt-2 rounded-xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          {error}
        </p>
      ) : null}
    </>
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

function waitForChannelSubscription(
  channel: RealtimeChannel,
  options: {
    table: string;
    onSubscribed: () => void;
    onProblem: (status: "timed_out" | "channel_error" | "closed", error?: Error) => void;
  },
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        options.onSubscribed();

        if (!settled) {
          settled = true;
          resolve();
        }

        return;
      }

      if (status === "TIMED_OUT") {
        options.onProblem("timed_out", error);

        if (!settled) {
          settled = true;
          reject(error ?? new Error(`Timed out subscribing to ${options.table}.`));
        }

        return;
      }

      if (status === "CHANNEL_ERROR") {
        options.onProblem("channel_error", error);

        if (!settled) {
          settled = true;
          reject(error ?? new Error(`Channel error subscribing to ${options.table}.`));
        }

        return;
      }

      if (status === "CLOSED") {
        options.onProblem("closed", error);

        if (!settled) {
          settled = true;
          reject(new Error(`Channel closed before subscribing to ${options.table}.`));
        }
      }
    });
  });
}
