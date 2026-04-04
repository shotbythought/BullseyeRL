"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { authorizedJsonFetch } from "@/lib/api/client";

export function JoinGameForm(props?: {
  defaultJoinCode?: string;
  redirectExistingMember?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [resolvingExistingGame, setResolvingExistingGame] = useState(
    Boolean(props?.redirectExistingMember && props.defaultJoinCode),
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!props?.redirectExistingMember || !props.defaultJoinCode) {
      setResolvingExistingGame(false);
      return;
    }

    let active = true;
    setResolvingExistingGame(true);

    void (async () => {
      try {
        const response = await authorizedJsonFetch<{ gameId: string | null }>(
          `/api/games/join?joinCode=${encodeURIComponent(props.defaultJoinCode ?? "")}`,
        );

        if (!active) {
          return;
        }

        if (response.gameId) {
          router.replace(`/games/${response.gameId}`);
          return;
        }
      } catch {
        // Fall back to the normal join flow if the membership lookup fails.
      }

      if (active) {
        setResolvingExistingGame(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [props?.defaultJoinCode, props?.redirectExistingMember, router]);

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
        disabled={pending || resolvingExistingGame}
        name="joinCode"
        placeholder="Join code"
        required
        type="text"
      />
      <input
        className="w-full rounded-xl border border-ink/10 bg-white px-5 py-4 text-base outline-none transition focus:border-moss focus:ring-4 focus:ring-moss/10"
        disabled={pending || resolvingExistingGame}
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
        disabled={pending || resolvingExistingGame}
        type="submit"
      >
        {resolvingExistingGame ? "Checking..." : pending ? "Joining..." : "Join game"}
      </button>
    </form>
  );
}
