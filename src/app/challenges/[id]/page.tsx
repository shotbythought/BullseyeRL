import { notFound } from "next/navigation";

import { HomeLink } from "@/components/brand-mark";
import { ChallengeLinkShare } from "@/components/challenge-link-share";
import { StartGameCard } from "@/components/start-game-card";
import { getChallengeWithRounds } from "@/lib/data/queries";
import { formatDurationLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const { challenge } = await getChallengeWithRounds(id);

    return (
      <main className="space-y-6">
        <HomeLink />

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1rem] border border-ink/10 bg-white/92 p-8 shadow-panel">
            <h1 className="text-4xl font-semibold tracking-tight text-ink">
              {challenge.title}
            </h1>

            <dl className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetaCard label="Rounds" value={String(challenge.location_count)} />
              <MetaCard label="Guess budget" value={String(challenge.guess_limit_per_round)} />
              <MetaCard
                label="Round timer"
                value={formatDurationLabel(challenge.round_time_limit_seconds)}
              />
            </dl>
          </div>

          <div className="space-y-6">
            <StartGameCard challengeId={challenge.id} />
            <ChallengeLinkShare challengeId={challenge.id} />
          </div>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}

function MetaCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[0.625rem] bg-mist p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
        {props.label}
      </dt>
      <dd className="mt-2 text-base font-semibold text-ink">{props.value}</dd>
    </div>
  );
}
