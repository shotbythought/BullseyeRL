"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { authorizedJsonFetch } from "@/lib/api/client";

export function StartGameCard(props: { challengeId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const response = await authorizedJsonFetch<{ gameId: string }>("/api/games", {
          method: "POST",
          body: JSON.stringify({
            challengeId: props.challengeId,
            nickname: String(formData.get("nickname") ?? ""),
          }),
        });

        router.push(`/games/${response.gameId}`);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Unable to start the game.",
        );
      }
    });
  }

  return (
    <div className="rounded-[0.875rem] border border-ink/10 bg-white/90 p-6 shadow-panel">
      <h2 className="text-xl font-semibold text-ink">Start a collaborative game</h2>
      <p className="mt-2 text-sm text-ink/65">
        The creator joins immediately and shares one live score, one shared guess budget, and one
        guess history with the whole team.
      </p>
      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <input
          className="w-full rounded-xl border border-ink/10 bg-mist px-5 py-4 text-base outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
          defaultValue="Captain"
          name="nickname"
          placeholder="Your nickname"
          required
          type="text"
        />
        {error ? (
          <p className="rounded-xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
            {error}
          </p>
        ) : null}
        <button
          className="inline-flex w-full items-center justify-center rounded-xl bg-neon px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Starting..." : "Start game"}
        </button>
      </form>
    </div>
  );
}
