"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type { GeolocationSnapshot } from "@/hooks/use-geolocation";
import type { PointHintDirection, RoundHintType } from "@/lib/domain/hints";
import { cn, formatCountdown, formatMeters, formatScore } from "@/lib/utils";
import type { LiveGameState, LiveGuess } from "@/types/app";
import { GameMap } from "@/components/game-map";
import { HowToPlay } from "@/components/how-to-play";
import { StatusChip } from "@/components/status-chip";
import { ZoomableClueImage } from "@/components/zoomable-clue-image";

export interface RevealState {
  target: {
    lat: number;
    lng: number;
  };
  radiiMeters: number[];
  isGameComplete: boolean;
  timedOut: boolean;
}

export type StageMode = "map" | "image";
export type PendingGameAction = "guess" | "advance" | RoundHintType | null;

export interface GameStageTargetIds {
  clueImage?: string;
  mapToggle?: string;
  radiusSlider?: string;
  radiusOptionIds?: Partial<Record<number, string>>;
  hintsButton?: string;
  getMeCloserHint?: string;
  walkAction?: string;
  guessButton?: string;
  confirmButton?: string;
  finishButton?: string;
}

export interface GameStageInteractionGate {
  allowClueImage?: boolean;
  allowImageToggle?: boolean;
  allowMapToggle?: boolean;
  allowRadiusSlider?: boolean;
  allowHintsButton?: boolean;
  allowGetMeCloserHint?: boolean;
  allowPointMeHint?: boolean;
  allowWalkAction?: boolean;
  allowGuessButton?: boolean;
  allowConfirmButton?: boolean;
  allowFinishButton?: boolean;
}

export interface GameStageExtraAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface GameStageBoardProps {
  game: LiveGameState;
  position: GeolocationSnapshot | null;
  geolocationError: string | null;
  error: string | null;
  selectedRadius: number | null;
  onSelectedRadiusChange: (radius: number) => void;
  pending: boolean;
  pendingAction: PendingGameAction;
  activeRevealState: RevealState | null;
  roundTimeRemainingSeconds: number | null;
  roundTimerExpired: boolean;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  hintsOpen: boolean;
  onHintsOpenChange: (open: boolean) => void;
  guessConfirmOpen: boolean;
  onGuessConfirmOpenChange: (open: boolean) => void;
  howToPlayOpen: boolean;
  onHowToPlayOpenChange: (open: boolean) => void;
  onGuess: () => void | Promise<void>;
  onAdvanceRound: () => void | Promise<void>;
  onUseHint: (hintType: RoundHintType) => void | Promise<void>;
  inviteJoinCode?: string | null;
  showInviteButton?: boolean;
  showHowToPlayButton?: boolean;
  showHintsButton?: boolean;
  showPointMeHint?: boolean;
  showCompletedAction?: boolean;
  completedActionLabel?: ReactNode;
  extraMapAction?: GameStageExtraAction | null;
  overlay?: ReactNode;
  targetIds?: GameStageTargetIds;
  interactionGate?: GameStageInteractionGate;
  imageInteractive?: boolean;
  mapInteractive?: boolean;
  onClueImageClick?: () => void;
  hintsModalDismissible?: boolean;
  guessConfirmDismissible?: boolean;
  hintsFooter?: ReactNode;
}

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

function isActionAllowed(value: boolean | undefined) {
  return value ?? true;
}

export function GameStageBoard(props: GameStageBoardProps) {
  const [hudOffsetTop, setHudOffsetTop] = useState(HUD_INSET_PX);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mapImageToggleRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const guessConfirmDismissible = props.guessConfirmDismissible;
  const guessConfirmOpen = props.guessConfirmOpen;
  const hintsModalDismissible = props.hintsModalDismissible;
  const hintsOpen = props.hintsOpen;
  const howToPlayOpen = props.howToPlayOpen;
  const onGuessConfirmOpenChange = props.onGuessConfirmOpenChange;
  const onHintsOpenChange = props.onHintsOpenChange;
  const onHowToPlayOpenChange = props.onHowToPlayOpenChange;

  const accuracyWarning =
    props.position?.accuracy != null &&
    props.selectedRadius != null &&
    props.position.accuracy > props.selectedRadius;

  const showAdvanceAction = props.activeRevealState != null || props.roundTimerExpired;
  const showCompletedAction =
    props.activeRevealState?.isGameComplete ? (props.showCompletedAction ?? true) : true;
  const getMeCloserHintRadius = props.game.radiiMeters[2] ?? null;
  const hudTimeLeftLine =
    props.game.roundTimeLimitSeconds == null
      ? "No time limit"
      : props.activeRevealState?.timedOut
        ? "Timed out"
        : props.game.roundResolved
          ? "Resolved"
          : `${formatCountdown(props.roundTimeRemainingSeconds)} left`;
  const hudRoundLine = `Round ${props.game.roundIndex + 1}/${props.game.roundCount}`;
  const guessBlocked =
    !props.position ||
    !props.selectedRadius ||
    props.pending ||
    props.game.status === "completed" ||
    !!props.activeRevealState ||
    props.roundTimerExpired;
  const canUseClueImage = isActionAllowed(props.interactionGate?.allowClueImage);
  const canToggleImage = isActionAllowed(props.interactionGate?.allowImageToggle);
  const canToggleMap = isActionAllowed(props.interactionGate?.allowMapToggle);
  const canChangeRadius = isActionAllowed(props.interactionGate?.allowRadiusSlider);
  const canOpenHints = isActionAllowed(props.interactionGate?.allowHintsButton);
  const canUseGetMeCloser = isActionAllowed(props.interactionGate?.allowGetMeCloserHint);
  const canUsePointMe = isActionAllowed(props.interactionGate?.allowPointMeHint);
  const canUseWalkAction = isActionAllowed(props.interactionGate?.allowWalkAction);
  const canGuess = isActionAllowed(props.interactionGate?.allowGuessButton);
  const canConfirmGuess = isActionAllowed(props.interactionGate?.allowConfirmButton);
  const canFinish = isActionAllowed(props.interactionGate?.allowFinishButton);
  const showUtilityCluster =
    (props.showInviteButton ?? true) ||
    (props.showHowToPlayButton ?? true) ||
    (props.showHintsButton ?? true);
  const activeStageInteractive =
    props.stageMode === "map"
      ? props.mapInteractive ?? true
      : props.imageInteractive ?? true;

  useEffect(() => {
    if (!hintsOpen && !guessConfirmOpen && !howToPlayOpen) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (guessConfirmOpen && guessConfirmDismissible !== false) {
        onGuessConfirmOpenChange(false);
        return;
      }

      if (hintsOpen && hintsModalDismissible !== false) {
        onHintsOpenChange(false);
        return;
      }

      if (howToPlayOpen) {
        onHowToPlayOpenChange(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    guessConfirmDismissible,
    guessConfirmOpen,
    hintsModalDismissible,
    hintsOpen,
    howToPlayOpen,
    onGuessConfirmOpenChange,
    onHintsOpenChange,
    onHowToPlayOpenChange,
  ]);

  useLayoutEffect(() => {
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
      const width = hud.offsetWidth;
      const height = hud.offsetHeight;

      let top = HUD_INSET_PX;
      const hudRect = {
        left: hr.left,
        top: sr.top + top,
        right: hr.left + width,
        bottom: sr.top + top + height,
      };

      if (rectsOverlapViewport(hudRect, tr, HUD_TOGGLE_GAP_PX)) {
        top = Math.max(HUD_INSET_PX, tr.bottom - sr.top + HUD_TOGGLE_GAP_PX);
      }
      setHudOffsetTop(top);
    }

    updateHudTop();
    const resizeObserver = new ResizeObserver(updateHudTop);
    resizeObserver.observe(stageNode);
    resizeObserver.observe(toggleNode);
    resizeObserver.observe(hudNode);
    window.addEventListener("resize", updateHudTop);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHudTop);
    };
  }, [
    accuracyWarning,
    activeStageInteractive,
    props.activeRevealState,
    props.game,
    props.geolocationError,
    props.roundTimeRemainingSeconds,
    props.stageMode,
  ]);

  return (
    <>
      <div
        className="max-sm:fixed max-sm:inset-0 max-sm:z-[5] max-sm:h-dvh max-sm:w-full bg-ink sm:relative sm:left-1/2 sm:z-auto sm:min-h-dvh sm:w-screen sm:-translate-x-1/2"
        ref={stageRef}
      >
        <div className="absolute inset-0 z-0">
          {props.stageMode === "map" ? (
            <GameMap
              className="h-full min-h-0 w-full rounded-none"
              closerHintCircle={props.game.hints.getMeCloser.circle}
              currentAccuracy={props.position?.accuracy ?? null}
              currentPosition={
                props.position
                  ? {
                      latitude: props.position.latitude,
                      longitude: props.position.longitude,
                    }
                  : null
              }
              guesses={props.game.guesses}
              interactive={props.mapInteractive ?? true}
              mapArea={props.game.mapArea}
              mapBounds={props.game.mapBounds}
              revealTarget={props.activeRevealState?.target ?? null}
              roundKey={props.game.currentChallengeRoundId}
              selectedRadius={props.selectedRadius}
            />
          ) : (
            <div
              className={cn(
                "h-full min-h-0 w-full",
                props.onClueImageClick && canUseClueImage ? "cursor-pointer" : undefined,
              )}
              onClick={() => {
                if (props.onClueImageClick && canUseClueImage) {
                  props.onClueImageClick();
                }
              }}
              onKeyDown={(event) => {
                if (
                  props.onClueImageClick &&
                  canUseClueImage &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  props.onClueImageClick();
                }
              }}
              role={props.onClueImageClick && canUseClueImage ? "button" : undefined}
              tabIndex={props.onClueImageClick && canUseClueImage ? 0 : undefined}
            >
              <ZoomableClueImage
                imageUrl={props.game.clueImageUrl}
                interactive={props.imageInteractive ?? true}
                roundKey={props.game.currentChallengeRoundId}
                targetId={props.targetIds?.clueImage}
              />
            </div>
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
            <AttemptTrack guesses={props.game.guesses} limit={props.game.guessLimitPerRound} />
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 border-t border-ink/10 pt-1 sm:gap-x-2 sm:pt-1.5">
              {props.game.players.map((player, index) => (
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
            {props.geolocationError || props.roundTimerExpired || accuracyWarning ? (
              <div className="space-y-0.5 border-t border-ink/10 pt-1 text-[0.58rem] leading-snug text-ink/70 sm:pt-1.5 sm:text-xs lg:text-sm">
                {props.geolocationError ? (
                  <p className="font-medium text-ember">{props.geolocationError}</p>
                ) : null}
                {props.roundTimerExpired ? (
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
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-45",
                  props.stageMode === "image" ? "bg-ink text-white" : "text-ink/60 hover:text-ink",
                )}
                disabled={!canToggleImage}
                onClick={() => props.onStageModeChange("image")}
                type="button"
              >
                Image
              </button>
              <button
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-45",
                  props.stageMode === "map" ? "bg-ink text-white" : "text-ink/60 hover:text-ink",
                )}
                data-tutorial-target={props.targetIds?.mapToggle}
                disabled={!canToggleMap}
                onClick={() => props.onStageModeChange("map")}
                type="button"
              >
                Map
              </button>
            </div>
          </div>

          {showUtilityCluster ? (
            <div className="pointer-events-auto absolute right-3 top-3 flex max-w-[calc(100%-8rem)] flex-wrap items-center justify-end gap-2">
              {(props.showInviteButton ?? true) && props.inviteJoinCode ? (
                <InviteIconButton joinCode={props.inviteJoinCode} />
              ) : null}
              {props.showHowToPlayButton ?? true ? (
                <button
                  aria-label="How to play"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/12 bg-white/90 text-ink shadow-[0_2px_12px_rgba(13,22,19,0.12)] backdrop-blur-sm transition hover:border-ink/20 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35"
                  onClick={() => props.onHowToPlayOpenChange(true)}
                  title="How to play"
                  type="button"
                >
                  <InfoIcon className="h-5 w-5" />
                </button>
              ) : null}
              {props.showHintsButton ?? true ? (
                <button
                  aria-label="Hint options"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/12 bg-white/90 text-ink shadow-[0_2px_12px_rgba(13,22,19,0.12)] backdrop-blur-sm transition hover:border-ink/20 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35 disabled:cursor-not-allowed disabled:opacity-45"
                  data-tutorial-target={props.targetIds?.hintsButton}
                  disabled={!canOpenHints}
                  onClick={() => props.onHintsOpenChange(true)}
                  type="button"
                >
                  <LightbulbIcon className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {props.stageMode === "map" ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto mx-auto flex max-w-7xl flex-nowrap items-stretch gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
              <div
                className="flex min-h-[4.75rem] min-w-0 flex-1 flex-col justify-center rounded-xl border border-ink/10 bg-white/92 px-2 py-2 shadow-[0_2px_16px_rgba(13,22,19,0.14)] backdrop-blur-md sm:min-h-0 sm:px-3"
              >
                <div className="relative z-10">
                  <input
                    aria-label="Radius"
                    aria-valuetext={props.selectedRadius != null ? formatMeters(props.selectedRadius) : undefined}
                    className="h-2.5 w-full cursor-grab appearance-none rounded-full bg-ink/15 [accent-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white/95 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45 [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-10 [&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-ink/15 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-thumb]:shadow-[0_2px_12px_rgba(13,22,19,0.38)] [&::-moz-range-thumb]:ring-2 [&::-moz-range-thumb]:ring-white/95 [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-[0_2px_12px_rgba(13,22,19,0.38)] [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white/95 [&::-webkit-slider-thumb]:transition-[box-shadow,transform] [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:hover:scale-[1.06] [&::-webkit-slider-thumb]:hover:shadow-[0_4px_18px_rgba(13,22,19,0.5)] [&::-webkit-slider-thumb]:active:scale-100 [&::-webkit-slider-thumb]:active:cursor-grabbing"
                    disabled={!canChangeRadius || !!props.activeRevealState || props.roundTimerExpired}
                    id="guess-radius-slider"
                    max={Math.max(0, props.game.radiiMeters.length - 1)}
                    min={0}
                    data-tutorial-target={props.targetIds?.radiusSlider}
                    onChange={(event) => {
                      const index = Number.parseInt(event.target.value, 10);
                      const next = props.game.radiiMeters[index];
                      if (next != null) {
                        props.onSelectedRadiusChange(next);
                      }
                    }}
                    step={1}
                    type="range"
                    value={Math.min(
                      Math.max(
                        0,
                        props.selectedRadius != null
                          ? props.game.radiiMeters.indexOf(props.selectedRadius)
                          : 0,
                      ),
                      Math.max(0, props.game.radiiMeters.length - 1),
                    )}
                  />
                </div>
                <div className="relative z-0 mt-2.5 flex flex-wrap justify-between gap-1 px-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] leading-none">
                  {props.game.radiiMeters.map((radius) => (
                    <button
                      className={cn(
                        "rounded-full border px-2 py-1 text-[0.58rem] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35 sm:text-[0.62rem]",
                        props.selectedRadius === radius
                          ? "border-ink/22 bg-ink text-white"
                          : "border-ink/10 bg-white text-ink/55 hover:border-ink/20 hover:text-ink",
                      )}
                      data-tutorial-target={props.targetIds?.radiusOptionIds?.[radius]}
                      disabled={!canChangeRadius || !!props.activeRevealState || props.roundTimerExpired}
                      key={radius}
                      onClick={() => props.onSelectedRadiusChange(radius)}
                      type="button"
                    >
                      {formatMeters(radius)}
                    </button>
                  ))}
                </div>
              </div>
              {props.extraMapAction ? (
                <button
                  className="inline-flex min-h-[4.75rem] shrink-0 items-center justify-center self-stretch whitespace-nowrap rounded-xl border border-ink/15 bg-white/92 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink shadow-[0_2px_16px_rgba(13,22,19,0.12)] transition hover:border-ink/25 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0 sm:min-w-[10.5rem] sm:px-5 sm:text-sm sm:tracking-[0.22em]"
                  data-tutorial-target={props.targetIds?.walkAction}
                  disabled={props.extraMapAction.disabled || !canUseWalkAction}
                  onClick={props.extraMapAction.onClick}
                  type="button"
                >
                  {props.extraMapAction.label}
                </button>
              ) : null}
              {showAdvanceAction && showCompletedAction ? (
                <button
                  className="inline-flex min-h-[4.75rem] shrink-0 items-center justify-center self-stretch whitespace-nowrap rounded-xl bg-ink px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_2px_16px_rgba(13,22,19,0.2)] transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-[10.5rem] sm:px-5 sm:text-sm sm:tracking-[0.22em]"
                  data-tutorial-target={
                    props.activeRevealState?.isGameComplete ? props.targetIds?.finishButton : undefined
                  }
                  disabled={props.pending || (props.activeRevealState?.isGameComplete ? !canFinish : false)}
                  onClick={() => void props.onAdvanceRound()}
                  type="button"
                >
                  {props.pendingAction === "advance"
                    ? "Continuing..."
                    : props.activeRevealState?.isGameComplete
                      ? props.completedActionLabel ?? (
                          <>
                            <span className="sm:hidden">Scorecard</span>
                            <span className="hidden sm:inline">View scorecard</span>
                          </>
                        )
                      : "Next round"}
                </button>
              ) : !showAdvanceAction ? (
                <button
                  className="inline-flex min-h-[4.75rem] shrink-0 items-center justify-center self-stretch whitespace-nowrap rounded-xl bg-neon px-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink shadow-[0_2px_16px_rgba(13,22,19,0.12)] transition hover:bg-[#cfff45] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-0 sm:px-4 sm:text-sm sm:tracking-[0.22em]"
                  data-tutorial-target={props.targetIds?.guessButton}
                  disabled={guessBlocked || !canGuess}
                  onClick={() => props.onGuessConfirmOpenChange(true)}
                  type="button"
                >
                  Guess
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {props.error ? (
        <p className="mt-2 rounded-xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          {props.error}
        </p>
      ) : null}

      {props.guessConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && props.guessConfirmDismissible !== false) {
              props.onGuessConfirmOpenChange(false);
            }
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-[0.875rem] border border-ink/10 bg-white/95 p-6 shadow-panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-labelledby="guess-confirm-title"
            aria-modal="true"
          >
            <p className="text-lg font-semibold text-ink" id="guess-confirm-title">
              Confirm guess
            </p>
            <p className="mt-3 text-sm leading-6 text-ink/68">
              Submit at <span className="font-semibold text-ink">{formatMeters(props.selectedRadius)}</span> from
              your current location?
            </p>
            <p className="mt-2 text-sm text-ink/65">
              GPS accuracy: {formatMeters(props.position?.accuracy ?? null)}
            </p>
            {accuracyWarning ? (
              <p className="mt-2 text-sm text-amber-700">
                Your reported accuracy is worse than the selected radius. You can still submit.
              </p>
            ) : null}
            <div className="mt-6 flex flex-row items-center justify-between gap-3">
              <button
                className="inline-flex justify-center rounded-xl border border-ink/15 bg-mist px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-ink/80 transition hover:border-ink/25 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                disabled={props.guessConfirmDismissible === false}
                onClick={() => props.onGuessConfirmOpenChange(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex justify-center rounded-xl bg-neon px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45] disabled:cursor-not-allowed disabled:opacity-60"
                data-tutorial-target={props.targetIds?.confirmButton}
                disabled={guessBlocked || props.pendingAction === "guess" || !canConfirmGuess}
                onClick={() => void props.onGuess()}
                type="button"
              >
                {props.pendingAction === "guess" ? "Submitting…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {props.hintsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && props.hintsModalDismissible !== false) {
              props.onHintsOpenChange(false);
            }
          }}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[0.875rem] border border-ink/10 bg-white/95 p-5 shadow-panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-labelledby="hint-modal-title"
            aria-modal="true"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45" id="hint-modal-title">
              Shared hints
            </p>
            <p className="mt-1 text-sm text-ink/55">Once per hint each round</p>
            <div className="mt-4 space-y-3">
              <HintControlCard
                actionLabel={
                  props.pendingAction === "get_me_closer"
                    ? "Applying..."
                    : props.game.hints.getMeCloser.used
                      ? "Used"
                      : props.game.hints.getMeCloser.isAvailable
                        ? "Use hint"
                        : "Unavailable"
                }
                description={
                  props.game.hints.getMeCloser.used && props.game.hints.getMeCloser.circle
                    ? `Hint circle live on the map at ${formatMeters(props.game.hints.getMeCloser.circle.radiusMeters)}.`
                    : props.game.hints.getMeCloser.isAvailable && getMeCloserHintRadius != null
                      ? `Show me a ${formatMeters(getMeCloserHintRadius)} circle containing the target.`
                      : "Requires at least 3 radius tiers in this challenge."
                }
                detail={`-${formatScore(props.game.hints.getMeCloser.costPoints)} points`}
                disabled={
                  props.pending ||
                  props.game.status === "completed" ||
                  !!props.activeRevealState ||
                  props.roundTimerExpired ||
                  props.game.hints.getMeCloser.used ||
                  !props.game.hints.getMeCloser.isAvailable ||
                  !canUseGetMeCloser
                }
                onClick={() => void props.onUseHint("get_me_closer")}
                targetId={props.targetIds?.getMeCloserHint}
                title="Get me closer"
              />
              {props.showPointMeHint ?? true ? (
                <HintControlCard
                  actionLabel={
                    props.pendingAction === "point_me"
                      ? "Applying..."
                      : props.game.hints.pointMe.used
                        ? "Used"
                        : "Use hint"
                  }
                  description={
                    props.game.hints.pointMe.used && props.game.hints.pointMe.direction
                      ? `Team direction: ${formatPointHintDirection(props.game.hints.pointMe.direction)}.`
                      : "Reveal one shared North / South / East / West direction from the requester."
                  }
                  detail={`-${formatScore(props.game.hints.pointMe.costPoints)} points`}
                  disabled={
                    props.pending ||
                    props.game.status === "completed" ||
                    !!props.activeRevealState ||
                    props.roundTimerExpired ||
                    props.game.hints.pointMe.used ||
                    !props.position ||
                    !canUsePointMe
                  }
                  onClick={() => void props.onUseHint("point_me")}
                  statusLabel={
                    props.game.hints.pointMe.direction
                      ? formatPointHintDirection(props.game.hints.pointMe.direction)
                      : null
                  }
                  title="Point me"
                />
              ) : null}
            </div>
            {props.hintsFooter ? (
              <div className="mt-4 border-t border-ink/10 pt-4">{props.hintsFooter}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.howToPlayOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              props.onHowToPlayOpenChange(false);
            }
          }}
          role="presentation"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[0.875rem] border border-ink/10 bg-white/95 p-5 shadow-panel sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-labelledby="how-to-play-modal-title"
            aria-modal="true"
          >
            <button
              aria-label="Close how to play"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white text-ink/72 shadow-[0_2px_10px_rgba(13,22,19,0.08)] transition hover:border-ink/20 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35"
              onClick={() => props.onHowToPlayOpenChange(false)}
              type="button"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <HowToPlay className="pr-12" titleId="how-to-play-modal-title" variant="dialog" />
          </div>
        </div>
      ) : null}

      {props.overlay}
    </>
  );
}

function AttemptTrack(props: { guesses: LiveGuess[]; limit: number }) {
  const limit = Math.max(0, props.limit);
  const hits = props.guesses.filter((guess) => guess.isSuccess).length;
  const misses = props.guesses.filter((guess) => !guess.isSuccess).length;
  const remaining = Math.max(0, limit - props.guesses.length);
  const ariaLabel = `${hits} hits, ${misses} misses, ${remaining} guesses remaining of ${limit}`;

  return (
    <div
      aria-label={ariaLabel}
      className="flex min-h-[1rem] flex-wrap items-center gap-1 leading-none sm:min-h-[1.125rem] sm:gap-1.5 lg:min-h-[1.25rem]"
      role="group"
    >
      {Array.from({ length: limit }, (_, index) => {
        const guess = props.guesses[index];
        if (!guess) {
          return (
            <span
              className="inline-flex h-3.5 w-3.5 select-none items-center justify-center text-[0.7rem] text-ink/30 sm:h-4 sm:w-4 sm:text-xs lg:h-[1.125rem] lg:w-[1.125rem]"
              key={`slot-${index}`}
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

/** Share three nodes with two branches. */
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

function InfoIcon(props: { className?: string }) {
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
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CloseIcon(props: { className?: string }) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
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
  targetId?: string;
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
        data-tutorial-target={props.targetId}
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
