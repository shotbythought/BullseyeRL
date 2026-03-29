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
  /** Omit outer panel; use in compact HUD (e.g. live game overlays). */
  compact?: boolean;
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

  const button = (
    <button
      className={
        props.compact
          ? "rounded-lg border border-ink/15 bg-white/90 px-2.5 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-ink/75 shadow-[0_1px_0_rgba(15,23,28,0.06)] transition hover:border-ink/25 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          : "w-full rounded-xl border border-ink/15 bg-mist px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink/70 transition hover:border-ink/25 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      }
      disabled={props.disabled}
      onClick={() => void handleClick()}
      type="button"
    >
      {props.pending ? "Updating…" : "Set next round"}
    </button>
  );

  if (props.compact) {
    return button;
  }

  return (
    <div className="rounded-[0.875rem] border border-ink/10 bg-white/92 p-4 shadow-panel">
      {button}
    </div>
  );
}
