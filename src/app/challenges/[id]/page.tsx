import Link from "next/link";
import { notFound } from "next/navigation";

import { StartGameCard } from "@/components/start-game-card";
import { StatusChip } from "@/components/status-chip";
import { getChallengeWithRounds } from "@/lib/data/queries";
import { getLocationPreset } from "@/lib/location-presets";
import { formatDurationLabel, formatRadiusList } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const { challenge, rounds } = await getChallengeWithRounds(id);
    const preset = getLocationPreset(challenge.source_map_id);

    return (
      <main className="space-y-6">
        <Link className="text-sm font-semibold uppercase tracking-[0.22em] text-ink/45" href="/">
          Home
        </Link>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2.5rem] border border-ink/10 bg-white/92 p-8 shadow-panel">
            <div className="flex flex-wrap gap-2">
              <StatusChip label={`${challenge.location_count} rounds`} />
              <StatusChip label={`${challenge.guess_limit_per_round} shared guesses`} />
              <StatusChip
                label={
                  challenge.round_time_limit_seconds == null
                    ? "No round timer"
                    : `${formatDurationLabel(challenge.round_time_limit_seconds)} timer`
                }
              />
              <StatusChip label={challenge.status} />
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink">
              {challenge.title}
            </h1>
            <p className="mt-4 text-base leading-8 text-ink/65">
              Generated from the{" "}
              <span className="font-semibold">{preset?.label ?? challenge.source_map_id}</span>{" "}
              preset. Challenge rounds are fixed now, so every future game starts from the same
              snapshot.
            </p>

            <dl className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetaCard label="Radii" value={formatRadiusList(challenge.radii_meters)} />
              <MetaCard label="Rounds" value={String(challenge.location_count)} />
              <MetaCard label="Guess budget" value={String(challenge.guess_limit_per_round)} />
              <MetaCard
                label="Round timer"
                value={formatDurationLabel(challenge.round_time_limit_seconds)}
              />
            </dl>

            <div className="mt-8 rounded-[2rem] border border-ink/10 bg-mist p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                Snapshot preview
              </p>
              <div className="mt-4 grid gap-3">
                {rounds.map((round) => (
                  <div
                    className="flex items-center justify-between rounded-[1.4rem] border border-ink/10 bg-white px-4 py-4"
                    key={round.id}
                  >
                    <div>
                      <p className="font-semibold text-ink">Round {round.round_index + 1}</p>
                      <p className="text-sm text-ink/55">
                        Target {round.target_lat.toFixed(4)}, {round.target_lng.toFixed(4)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-ink/70">
                      FOV {Math.round(round.street_view_fov)} · clue locked
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <StartGameCard challengeId={challenge.id} />
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}

function MetaCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] bg-mist p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
        {props.label}
      </dt>
      <dd className="mt-2 text-base font-semibold text-ink">{props.value}</dd>
    </div>
  );
}
