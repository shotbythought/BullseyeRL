"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { authorizedJsonFetch } from "@/lib/api/client";

export function JoinGameForm(props?: { defaultJoinCode?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const response = await authorizedJsonFetch<{ gameId: string }>("/api/games/join", {
          method: "POST",
          body: JSON.stringify({
            joinCode: String(formData.get("joinCode") ?? ""),
            nickname: String(formData.get("nickname") ?? ""),
          }),
        });

        router.push(`/games/${response.gameId}`);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Unable to join game.",
        );
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <input
        className="w-full rounded-xl border border-ink/10 bg-white px-5 py-4 text-base uppercase outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
        defaultValue={props?.defaultJoinCode ?? ""}
        name="joinCode"
        placeholder="Join code"
        required
        type="text"
      />
      <input
        className="w-full rounded-xl border border-ink/10 bg-white px-5 py-4 text-base outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
        name="nickname"
        placeholder="Nickname"
        required
        type="text"
      />
      {error ? (
        <p className="rounded-xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          {error}
        </p>
      ) : null}
      <button
        className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Joining..." : "Join game"}
      </button>
    </form>
  );
}
