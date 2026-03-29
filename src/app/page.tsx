import Link from "next/link";

import { JoinGameForm } from "@/components/join-game-form";

export default function HomePage() {
  return (
    <main className="space-y-8">
      <section className="relative overflow-hidden rounded-[1.25rem] border border-ink/10 bg-slate text-white shadow-panel">
        <div className="absolute inset-0 bg-grid bg-[size:42px_42px] opacity-[0.08]" />
        <div className="absolute left-[-5rem] top-20 h-56 w-56 rounded-full bg-neon/18 blur-3xl" />
        <div className="absolute right-[-6rem] top-[-3rem] h-72 w-72 rounded-full bg-moss/25 blur-3xl" />

        <div className="relative grid items-center gap-8 px-6 py-8 xl:grid-cols-[1.15fr_0.85fr] xl:px-10 xl:py-10">
          <div className="space-y-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.34em] text-neon/80">
                BullseyeRL
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.9] tracking-tight sm:text-6xl xl:text-7xl">
                Walk the city. Hit the bullseye.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/68">
                Build a challenge, send one join code to the crew, and chase the smallest winning
                ring together.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                className="inline-flex items-center rounded-xl bg-neon px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-[#cfff45]"
                href="/challenges/new"
              >
                Create challenge
              </Link>
            </div>
          </div>

          <div>
            <div className="rounded-[1rem] border border-white/12 bg-white p-6 text-ink shadow-[0_24px_80px_rgba(6,11,9,0.32)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                Join by code
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                Drop into a live run
              </h2>
              <div className="mt-5">
                <JoinGameForm />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
