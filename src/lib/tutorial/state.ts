import type { GeolocationSnapshot } from "@/hooks/use-geolocation";
import {
  GET_ME_CLOSER_HINT_COST,
  POINT_ME_HINT_COST,
} from "@/lib/domain/hints";
import { haversineDistanceMeters } from "@/lib/domain/geodesy";
import {
  applyHintPenalty,
  maxPointsForRadii,
  pointsForRadius,
} from "@/lib/domain/scoring";
import type { LiveGameState } from "@/types/app";
import {
  TUTORIAL_CLUE,
  TUTORIAL_CLUE_IMAGE_URL,
  TUTORIAL_GET_ME_CLOSER_CIRCLE,
  TUTORIAL_MAP_AREA,
  TUTORIAL_MAP_BOUNDS,
  TUTORIAL_RADII,
  TUTORIAL_START_POSITION,
  TUTORIAL_TARGET,
  TUTORIAL_WALKED_POSITION,
} from "@/lib/tutorial/data";

export const TUTORIAL_TARGET_KEYS = {
  clueImage: "clueImage",
  mapToggle: "mapToggle",
  largeRadiusOption: "largeRadiusOption",
  hintsButton: "hintsButton",
  getMeCloserHint: "getMeCloserHint",
  walkAction: "walkAction",
  smallRadiusOption: "smallRadiusOption",
  guessButton: "guessButton",
  confirmButton: "confirmButton",
  finishButton: "finishButton",
} as const;

export type TutorialTargetKey =
  (typeof TUTORIAL_TARGET_KEYS)[keyof typeof TUTORIAL_TARGET_KEYS];

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  rationale: string;
  target: TutorialTargetKey;
}

export interface TutorialState {
  stepIndex: number;
  finished: boolean;
}

export type TutorialAction =
  | { type: "acknowledge_clue" }
  | { type: "request_stage_mode"; mode: "map" | "image" }
  | { type: "select_radius"; radius: number }
  | { type: "set_hints_open"; open: boolean }
  | { type: "use_hint"; hintType: "get_me_closer" | "point_me" }
  | { type: "walk_to_location" }
  | { type: "set_guess_confirm_open"; open: boolean }
  | { type: "confirm_guess" }
  | { type: "finish_tutorial" }
  | { type: "back" }
  | { type: "restart" };

export interface TutorialSnapshot {
  canGoBack: boolean;
  currentStep: TutorialStep;
  finished: boolean;
  game: LiveGameState;
  guessConfirmDismissible: boolean;
  guessConfirmOpen: boolean;
  hintsModalDismissible: boolean;
  hintsOpen: boolean;
  imageInteractive: boolean;
  interactionGate: {
    allowClueImage: boolean;
    allowImageToggle: boolean;
    allowMapToggle: boolean;
    allowRadiusSlider: boolean;
    allowHintsButton: boolean;
    allowGetMeCloserHint: boolean;
    allowPointMeHint: boolean;
    allowWalkAction: boolean;
    allowGuessButton: boolean;
    allowConfirmButton: boolean;
    allowFinishButton: boolean;
  };
  mapInteractive: boolean;
  position: GeolocationSnapshot;
  selectedRadius: number;
  stageMode: "map" | "image";
  stepCount: number;
  stepIndex: number;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "inspect-image",
    title: "Start on the clue",
    description: "Look at the Street View image first. It is fixed, so you read it instead of moving inside it.",
    rationale: "Each round starts with a single visual clue. Tap the image to continue.",
    target: TUTORIAL_TARGET_KEYS.clueImage,
  },
  {
    id: "switch-to-map",
    title: "Open the map",
    description: "When you have the clue in mind, switch over to the live map.",
    rationale: "The map is where your real-world position and guess radius live. Tap Map.",
    target: TUTORIAL_TARGET_KEYS.mapToggle,
  },
  {
    id: "pick-large-radius",
    title: "Choose a big safety ring",
    description: "Start wide when you are nearly in range but not confident enough to risk a tiny ring.",
    rationale: "Tap the 5.0 km option so you can test a safe first guess.",
    target: TUTORIAL_TARGET_KEYS.largeRadiusOption,
  },
  {
    id: "open-large-guess-confirm",
    title: "Take the safe shot",
    description: "Your spoofed position starts just outside the target, so this first guess is a close test rather than a lock.",
    rationale: "Hit Guess with the 5.0 km ring selected.",
    target: TUTORIAL_TARGET_KEYS.guessButton,
  },
  {
    id: "confirm-large-guess",
    title: "See the near miss",
    description: "Submit the large-ring guess so you can feel how close the opening position really is.",
    rationale: "Confirm it. This one misses by only a few meters, so the round stays alive.",
    target: TUTORIAL_TARGET_KEYS.confirmButton,
  },
  {
    id: "open-hints",
    title: "Ask for help",
    description: "That near miss is your signal to narrow the search with a shared hint.",
    rationale: "Open the hint tray.",
    target: TUTORIAL_TARGET_KEYS.hintsButton,
  },
  {
    id: "use-get-me-closer",
    title: "Use Get me closer",
    description: "This hint draws one shared circle that definitely contains the target.",
    rationale: "Apply the visual hint so the team can narrow the search area.",
    target: TUTORIAL_TARGET_KEYS.getMeCloserHint,
  },
  {
    id: "walk-to-location",
    title: "Go to the location",
    description: "Move your position closer so you can line up the final bullseye guess.",
    rationale: "Tap Go to location to spoof the walk and set up the final bullseye guess.",
    target: TUTORIAL_TARGET_KEYS.walkAction,
  },
  {
    id: "pick-small-radius",
    title: "Tighten the ring",
    description: "Once you are close, shrink the bullseye to the smallest radius you trust.",
    rationale: "Tap 50 m for the final bullseye attempt.",
    target: TUTORIAL_TARGET_KEYS.smallRadiusOption,
  },
  {
    id: "open-guess-confirm",
    title: "Submit a guess",
    description: "Guessing uses your current mocked GPS position, not a tapped point on the map.",
    rationale: "Hit Guess to review the shot.",
    target: TUTORIAL_TARGET_KEYS.guessButton,
  },
  {
    id: "confirm-guess",
    title: "Lock it in",
    description: "The confirmation step sends the guess from your current location at the chosen ring.",
    rationale: "Confirm the guess to land the bullseye.",
    target: TUTORIAL_TARGET_KEYS.confirmButton,
  },
  {
    id: "finish-tutorial",
    title: "Finish the round",
    description: "That successful guess resolves the tutorial round and reveals the true location.",
    rationale: "Open the tutorial scorecard to wrap up.",
    target: TUTORIAL_TARGET_KEYS.finishButton,
  },
] as const;

const INITIAL_STEP_INDEX = 0;
const FINAL_STEP_INDEX = TUTORIAL_STEPS.length - 1;
const STEP_INDEX = {
  inspectImage: 0,
  switchToMap: 1,
  pickLargeRadius: 2,
  openLargeGuessConfirm: 3,
  confirmLargeGuess: 4,
  openHints: 5,
  useGetMeCloser: 6,
  walkToLocation: 7,
  pickSmallRadius: 8,
  openFinalGuessConfirm: 9,
  confirmFinalGuess: 10,
  finishTutorial: 11,
} as const;
const INITIAL_RADIUS = TUTORIAL_RADII[0];
const LARGE_RADIUS = TUTORIAL_RADII[TUTORIAL_RADII.length - 1];
const SMALL_RADIUS = TUTORIAL_RADII[0];
const MAX_ROUND_POINTS = maxPointsForRadii([...TUTORIAL_RADII]);
const INITIAL_GUESS_DISTANCE_METERS = haversineDistanceMeters(
  TUTORIAL_START_POSITION.latitude,
  TUTORIAL_START_POSITION.longitude,
  TUTORIAL_TARGET.lat,
  TUTORIAL_TARGET.lng,
);
const FINAL_ROUND_SCORE = applyHintPenalty(
  pointsForRadius([...TUTORIAL_RADII], SMALL_RADIUS),
  GET_ME_CLOSER_HINT_COST,
);
const FINAL_GUESS_DISTANCE_METERS = haversineDistanceMeters(
  TUTORIAL_WALKED_POSITION.latitude,
  TUTORIAL_WALKED_POSITION.longitude,
  TUTORIAL_TARGET.lat,
  TUTORIAL_TARGET.lng,
);

export function createInitialTutorialState(): TutorialState {
  return {
    stepIndex: INITIAL_STEP_INDEX,
    finished: false,
  };
}

export function tutorialReducer(
  state: TutorialState,
  action: TutorialAction,
): TutorialState {
  switch (action.type) {
    case "restart":
      return createInitialTutorialState();
    case "back":
      if (state.finished) {
        return {
          ...state,
          finished: false,
        };
      }

      return {
        ...state,
        stepIndex: Math.max(INITIAL_STEP_INDEX, state.stepIndex - 1),
      };
    case "acknowledge_clue":
      return advanceToNextStep(state, state.stepIndex === STEP_INDEX.inspectImage);
    case "request_stage_mode":
      return advanceToNextStep(
        state,
        state.stepIndex === STEP_INDEX.switchToMap && action.mode === "map",
      );
    case "select_radius":
      return advanceToNextStep(
        state,
        (state.stepIndex === STEP_INDEX.pickLargeRadius &&
          action.radius === LARGE_RADIUS) ||
          (state.stepIndex === STEP_INDEX.pickSmallRadius &&
            action.radius === SMALL_RADIUS),
      );
    case "set_hints_open":
      return advanceToNextStep(
        state,
        state.stepIndex === STEP_INDEX.openHints && action.open,
      );
    case "use_hint":
      return advanceToNextStep(
        state,
        state.stepIndex === STEP_INDEX.useGetMeCloser &&
          action.hintType === "get_me_closer",
      );
    case "walk_to_location":
      return advanceToNextStep(
        state,
        state.stepIndex === STEP_INDEX.walkToLocation,
      );
    case "set_guess_confirm_open":
      return advanceToNextStep(
        state,
        action.open &&
          (state.stepIndex === STEP_INDEX.openLargeGuessConfirm ||
            state.stepIndex === STEP_INDEX.openFinalGuessConfirm),
      );
    case "confirm_guess":
      return advanceToNextStep(
        state,
        state.stepIndex === STEP_INDEX.confirmLargeGuess ||
          state.stepIndex === STEP_INDEX.confirmFinalGuess,
      );
    case "finish_tutorial":
      if (state.stepIndex !== FINAL_STEP_INDEX) {
        return state;
      }

      return {
        ...state,
        finished: true,
      };
    default:
      return state;
  }
}

export function getTutorialSnapshot(state: TutorialState): TutorialSnapshot {
  const initialGuessSubmitted = state.stepIndex >= STEP_INDEX.openHints;
  const hintsUsed = state.stepIndex >= STEP_INDEX.walkToLocation;
  const hasWalked = state.stepIndex >= STEP_INDEX.pickSmallRadius;
  const hasSmallRadiusSelected = state.stepIndex >= STEP_INDEX.openFinalGuessConfirm;
  const finalGuessConfirmed = state.stepIndex >= STEP_INDEX.finishTutorial;
  const selectedRadius = hasSmallRadiusSelected
    ? SMALL_RADIUS
    : state.stepIndex >= STEP_INDEX.openLargeGuessConfirm
      ? LARGE_RADIUS
      : INITIAL_RADIUS;
  const position = hasWalked ? TUTORIAL_WALKED_POSITION : TUTORIAL_START_POSITION;

  return {
    canGoBack: state.finished || state.stepIndex > 0,
    currentStep: TUTORIAL_STEPS[state.stepIndex] ?? TUTORIAL_STEPS[INITIAL_STEP_INDEX],
    finished: state.finished,
    game: buildTutorialGameState({
      finalGuessConfirmed,
      hintsUsed,
      initialGuessSubmitted,
    }),
    guessConfirmDismissible: false,
    guessConfirmOpen:
      state.stepIndex === STEP_INDEX.confirmLargeGuess ||
      state.stepIndex === STEP_INDEX.confirmFinalGuess,
    hintsModalDismissible: false,
    hintsOpen: state.stepIndex === STEP_INDEX.useGetMeCloser,
    imageInteractive: false,
    interactionGate: {
      allowClueImage: state.stepIndex === STEP_INDEX.inspectImage,
      allowImageToggle: false,
      allowMapToggle: state.stepIndex === STEP_INDEX.switchToMap,
      allowRadiusSlider:
        state.stepIndex === STEP_INDEX.pickLargeRadius ||
        state.stepIndex === STEP_INDEX.pickSmallRadius,
      allowHintsButton: state.stepIndex === STEP_INDEX.openHints,
      allowGetMeCloserHint: state.stepIndex === STEP_INDEX.useGetMeCloser,
      allowPointMeHint: false,
      allowWalkAction: state.stepIndex === STEP_INDEX.walkToLocation,
      allowGuessButton:
        state.stepIndex === STEP_INDEX.openLargeGuessConfirm ||
        state.stepIndex === STEP_INDEX.openFinalGuessConfirm,
      allowConfirmButton:
        state.stepIndex === STEP_INDEX.confirmLargeGuess ||
        state.stepIndex === STEP_INDEX.confirmFinalGuess,
      allowFinishButton: state.stepIndex === STEP_INDEX.finishTutorial,
    },
    mapInteractive: false,
    position,
    selectedRadius,
    stageMode:
      state.stepIndex <= STEP_INDEX.switchToMap ? "image" : "map",
    stepCount: TUTORIAL_STEPS.length,
    stepIndex: state.stepIndex,
  };
}

function advanceToNextStep(state: TutorialState, shouldAdvance: boolean): TutorialState {
  if (!shouldAdvance || state.finished) {
    return state;
  }

  return {
    ...state,
    stepIndex: Math.min(FINAL_STEP_INDEX, state.stepIndex + 1),
  };
}

function buildTutorialGameState(progress: {
  finalGuessConfirmed: boolean;
  hintsUsed: boolean;
  initialGuessSubmitted: boolean;
}): LiveGameState {
  const hintPenaltyPoints = progress.hintsUsed ? GET_ME_CLOSER_HINT_COST : 0;
  const completedRounds = progress.finalGuessConfirmed
    ? [
        {
          roundIndex: 0,
          challengeRoundId: "tutorial-round-1",
          clueImageUrl: TUTORIAL_CLUE_IMAGE_URL,
          score: FINAL_ROUND_SCORE,
          bestSuccessfulRadiusMeters: SMALL_RADIUS,
        },
      ]
    : null;
  const guesses = progress.initialGuessSubmitted
    ? [
        {
          id: "tutorial-guess-1",
          nickname: "You",
          guessLat: TUTORIAL_START_POSITION.latitude,
          guessLng: TUTORIAL_START_POSITION.longitude,
          gpsAccuracyMeters: TUTORIAL_START_POSITION.accuracy,
          selectedRadiusMeters: LARGE_RADIUS,
          distanceToTargetMeters: INITIAL_GUESS_DISTANCE_METERS,
          isSuccess: false,
          improvedBestResult: false,
          createdAt: "2026-04-04T16:03:00.000Z",
        },
        ...(progress.finalGuessConfirmed
          ? [
              {
                id: "tutorial-guess-2",
                nickname: "You",
                guessLat: TUTORIAL_WALKED_POSITION.latitude,
                guessLng: TUTORIAL_WALKED_POSITION.longitude,
                gpsAccuracyMeters: TUTORIAL_WALKED_POSITION.accuracy,
                selectedRadiusMeters: SMALL_RADIUS,
                distanceToTargetMeters: FINAL_GUESS_DISTANCE_METERS,
                isSuccess: true,
                improvedBestResult: true,
                createdAt: "2026-04-04T16:08:00.000Z",
              },
            ]
          : []),
      ]
    : [];
  const attemptsUsed = guesses.length;

  return {
    gameId: "tutorial-game",
    challengeId: "tutorial-challenge",
    challengeTitle: "BullseyeRL Tutorial",
    joinCode: "TUTOR",
    status: progress.finalGuessConfirmed ? "completed" : "in_progress",
    roundIndex: 0,
    roundCount: 1,
    attemptsRemaining: Math.max(0, 5 - attemptsUsed),
    attemptsUsed,
    guessLimitPerRound: 5,
    roundTimeLimitSeconds: null,
    roundStartedAt: "2026-04-04T16:00:00.000Z",
    roundExpiresAt: null,
    roundTimeRemainingSeconds: null,
    roundTimedOut: false,
    radiiMeters: [...TUTORIAL_RADII],
    bestSuccessfulRadiusMeters: progress.finalGuessConfirmed ? SMALL_RADIUS : null,
    hintPenaltyPoints,
    maxAvailableRoundPoints: applyHintPenalty(MAX_ROUND_POINTS, hintPenaltyPoints),
    provisionalRoundPoints: progress.finalGuessConfirmed ? FINAL_ROUND_SCORE : 0,
    maxRoundPoints: MAX_ROUND_POINTS,
    teamScore: progress.finalGuessConfirmed ? FINAL_ROUND_SCORE : 0,
    currentRoundId: "tutorial-round",
    currentChallengeRoundId: "tutorial-round-1",
    mapBounds: TUTORIAL_MAP_BOUNDS,
    mapArea: TUTORIAL_MAP_AREA,
    clueImageUrl: TUTORIAL_CLUE_IMAGE_URL,
    clueHeading: TUTORIAL_CLUE.heading,
    cluePitch: TUTORIAL_CLUE.pitch,
    clueFov: TUTORIAL_CLUE.fov,
    guesses,
    players: [
      {
        id: "tutorial-player",
        user_id: "tutorial-user",
        nickname: "You",
        last_seen_at: "2026-04-04T16:08:00.000Z",
      },
    ],
    viewerIsCaptain: false,
    hints: {
      getMeCloser: {
        costPoints: GET_ME_CLOSER_HINT_COST,
        isAvailable: true,
        used: progress.hintsUsed,
        circle: progress.hintsUsed ? { ...TUTORIAL_GET_ME_CLOSER_CIRCLE } : null,
      },
      pointMe: {
        costPoints: POINT_ME_HINT_COST,
        used: false,
        direction: null,
      },
    },
    roundResolved: progress.finalGuessConfirmed,
    completedRounds,
    target: progress.finalGuessConfirmed ? { ...TUTORIAL_TARGET } : null,
  };
}
