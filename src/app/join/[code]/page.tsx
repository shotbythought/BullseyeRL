import Link from "next/link";

import { JoinGameForm } from "@/components/join-game-form";

export default async function JoinGamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <Link className="text-sm font-semibold uppercase tracking-[0.22em] text-ink/45" href="/">
        Home
      </Link>

      <section className="rounded-[1rem] border border-ink/10 bg-white/92 p-8 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
          Join game
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">
          Enter the team run
        </h1>
        <p className="mt-4 text-base leading-8 text-ink/65">
          Join code <span className="font-semibold uppercase text-ink">{code}</span>.
          You will share the same guess history, same round progress, and same team score.
        </p>

        <div className="mt-8">
          <JoinGameForm defaultJoinCode={code === "demo" ? "" : code} />
        </div>
      </section>
    </main>
  );
}
