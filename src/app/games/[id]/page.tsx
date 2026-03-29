import { LiveGameClient } from "@/components/live-game-client";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main>
      <LiveGameClient gameId={id} />
    </main>
  );
}
