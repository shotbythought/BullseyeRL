import type { LiveGameState } from "@/types/app";

type CompletedRevealSnapshot = Pick<
  LiveGameState,
  "currentRoundId" | "roundResolved" | "status" | "target"
>;

export function shouldShowJustCompletedReveal(
  previousGame: CompletedRevealSnapshot | null,
  nextGame: CompletedRevealSnapshot,
) {
  if (nextGame.status !== "completed" || !nextGame.roundResolved || !nextGame.target) {
    return false;
  }

  if (!previousGame || previousGame.currentRoundId !== nextGame.currentRoundId) {
    return false;
  }

  return previousGame.status !== "completed" || !previousGame.roundResolved;
}
