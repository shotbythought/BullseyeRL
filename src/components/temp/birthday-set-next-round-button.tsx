"use client";

/**
 * TEMPORARY — remove with src/lib/temp/birthday-next-round/
 */

import { authorizedJsonFetch } from "@/lib/api/client";

export function BirthdaySetNextRoundButton(props: {
  gameId: string;
  viewerIsCaptain: boolean;
  hasNextRound: boolean;
  disabled: boolean;
  pending: boolean;
  onBusyChange: (busy: boolean) => void;
  onMessage: (message: string | null) => void;
}) {
  if (!props.viewerIsCaptain || !props.hasNextRound) {
    return null;
  }

  async function handleClick() {
    props.onMessage(null);
    props.onBusyChange(true);
    try {
      await authorizedJsonFetch<{ ok: boolean }>(`/api/games/${props.gameId}/set-next-round`, {
        method: "POST",
        body: JSON.stringify({ gameId: props.gameId }),
      });
      props.onMessage("Next round updated.");
    } catch (error) {
      props.onMessage(
        error instanceof Error ? error.message : "Could not update the next round.",
      );
    } finally {
      props.onBusyChange(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-ink/10 bg-white/92 p-4 shadow-panel">
      <button
        className="w-full rounded-full border border-ink/15 bg-mist px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink/70 transition hover:border-ink/25 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        disabled={props.disabled}
        onClick={() => void handleClick()}
        type="button"
      >
        {props.pending ? "Updating…" : "Set next round"}
      </button>
    </div>
  );
}
