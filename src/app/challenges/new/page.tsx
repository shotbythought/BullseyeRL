import Link from "next/link";

import { CreateChallengeForm } from "@/components/create-challenge-form";

export default function NewChallengePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm font-semibold uppercase tracking-[0.22em] text-ink/45" href="/">
        Home
      </Link>

      <section className="rounded-[2.5rem] border border-ink/10 bg-white/92 p-8 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
          New challenge
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">
          Generate a challenge
        </h1>

        <div className="mt-6">
          <CreateChallengeForm />
        </div>
      </section>
    </main>
  );
}
