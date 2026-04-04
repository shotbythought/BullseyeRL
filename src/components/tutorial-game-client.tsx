"use client";

import { useReducer } from "react";
import { useRouter } from "next/navigation";

import { GameStageBoard, type RevealState } from "@/components/game-stage-board";
import { TutorialCoachmark } from "@/components/tutorial-coachmark";
import { TutorialFinishedScreen } from "@/components/tutorial-finished-screen";
import {
  TUTORIAL_TARGET_KEYS,
  type TutorialTargetKey,
  createInitialTutorialState,
  getTutorialSnapshot,
  tutorialReducer,
} from "@/lib/tutorial/state";

const TUTORIAL_TARGET_IDS: Record<TutorialTargetKey, string | null> = {
  [TUTORIAL_TARGET_KEYS.clueImage]: "tutorial-clue-image",
  [TUTORIAL_TARGET_KEYS.mapToggle]: "tutorial-map-toggle",
  [TUTORIAL_TARGET_KEYS.largeRadiusOption]: "tutorial-radius-large",
  [TUTORIAL_TARGET_KEYS.hintsButton]: "tutorial-hints-button",
  [TUTORIAL_TARGET_KEYS.getMeCloserHint]: "tutorial-get-me-closer",
  [TUTORIAL_TARGET_KEYS.walkAction]: null,
  [TUTORIAL_TARGET_KEYS.smallRadiusOption]: "tutorial-radius-small",
  [TUTORIAL_TARGET_KEYS.guessButton]: "tutorial-guess-button",
  [TUTORIAL_TARGET_KEYS.confirmButton]: "tutorial-confirm-button",
  [TUTORIAL_TARGET_KEYS.finishButton]: null,
} as const;

export function TutorialGameClient() {
  const router = useRouter();
  const [state, dispatch] = useReducer(tutorialReducer, undefined, createInitialTutorialState);
  const snapshot = getTutorialSnapshot(state);
  const activeRevealState: RevealState | null =
    snapshot.game.roundResolved && snapshot.game.target
      ? {
          target: snapshot.game.target,
          radiiMeters: snapshot.game.radiiMeters,
          isGameComplete: snapshot.game.status === "completed",
          timedOut: snapshot.game.roundTimedOut,
        }
      : null;

  if (snapshot.finished) {
    return (
      <TutorialFinishedScreen
        onRestart={() => dispatch({ type: "restart" })}
        score={snapshot.game.teamScore}
        successfulRadiusMeters={snapshot.game.bestSuccessfulRadiusMeters ?? snapshot.game.radiiMeters[0]}
      />
    );
  }

  return (
    <GameStageBoard
      activeRevealState={activeRevealState}
      completedActionLabel="Finish tutorial"
      error={null}
      extraMapAction={null}
      game={snapshot.game}
      geolocationError={null}
      guessConfirmDismissible={snapshot.guessConfirmDismissible}
      guessConfirmOpen={snapshot.guessConfirmOpen}
      hintsModalDismissible={snapshot.hintsModalDismissible}
      hintsOpen={snapshot.hintsOpen}
      howToPlayOpen={false}
      imageInteractive={snapshot.imageInteractive}
      interactionGate={snapshot.interactionGate}
      inviteJoinCode={null}
      mapInteractive={snapshot.mapInteractive}
      onAdvanceRound={() => dispatch({ type: "finish_tutorial" })}
      onClueImageClick={() => dispatch({ type: "acknowledge_clue" })}
      onGuess={() => dispatch({ type: "confirm_guess" })}
      onGuessConfirmOpenChange={(open) => {
        dispatch({ type: "set_guess_confirm_open", open });
      }}
      onHintsOpenChange={(open) => {
        dispatch({ type: "set_hints_open", open });
      }}
      onHowToPlayOpenChange={() => {
        // The tutorial keeps this closed to avoid conflicting overlays.
      }}
      onSelectedRadiusChange={(radius) => dispatch({ type: "select_radius", radius })}
      onStageModeChange={(mode) => dispatch({ type: "request_stage_mode", mode })}
      onUseHint={(hintType) => dispatch({ type: "use_hint", hintType })}
      overlay={
        <TutorialCoachmark
          canGoBack={snapshot.canGoBack}
          primaryAction={
            snapshot.currentStep.target === TUTORIAL_TARGET_KEYS.walkAction
              ? {
                  label: "Go to location",
                  onClick: () => dispatch({ type: "walk_to_location" }),
                }
              : snapshot.currentStep.target === TUTORIAL_TARGET_KEYS.finishButton
                ? {
                    label: "Finish tutorial",
                    onClick: () => dispatch({ type: "finish_tutorial" }),
                  }
              : null
          }
          onBack={() => dispatch({ type: "back" })}
          onRestart={() => dispatch({ type: "restart" })}
          onSkip={() => router.push("/")}
          step={snapshot.currentStep}
          stepCount={snapshot.stepCount}
          stepIndex={snapshot.stepIndex}
          targetId={TUTORIAL_TARGET_IDS[snapshot.currentStep.target]}
        />
      }
      pending={false}
      pendingAction={null}
      position={snapshot.position}
      roundTimeRemainingSeconds={null}
      roundTimerExpired={false}
      selectedRadius={snapshot.selectedRadius}
      showCompletedAction={false}
      showHintsButton
      showHowToPlayButton={false}
      showInviteButton={false}
      showPointMeHint={false}
      stageMode={snapshot.stageMode}
      targetIds={{
        clueImage: TUTORIAL_TARGET_IDS.clueImage ?? undefined,
        mapToggle: TUTORIAL_TARGET_IDS.mapToggle ?? undefined,
        radiusOptionIds: {
          50: TUTORIAL_TARGET_IDS.smallRadiusOption ?? undefined,
          5000: TUTORIAL_TARGET_IDS.largeRadiusOption ?? undefined,
        },
        hintsButton: TUTORIAL_TARGET_IDS.hintsButton ?? undefined,
        getMeCloserHint: TUTORIAL_TARGET_IDS.getMeCloserHint ?? undefined,
        walkAction: TUTORIAL_TARGET_IDS.walkAction ?? undefined,
        guessButton: TUTORIAL_TARGET_IDS.guessButton ?? undefined,
        confirmButton: TUTORIAL_TARGET_IDS.confirmButton ?? undefined,
        finishButton: TUTORIAL_TARGET_IDS.finishButton ?? undefined,
      }}
    />
  );
}
