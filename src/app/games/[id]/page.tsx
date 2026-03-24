import Link from "next/link";

import { LiveGameClient } from "@/components/live-game-client";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm font-semibold uppercase tracking-[0.22em] text-ink/45" href="/">
          Home
        </Link>
        <p className="text-sm text-ink/55">Game {id.slice(0, 8)}</p>
      </div>

      <LiveGameClient gameId={id} />
    </main>
  );
}
