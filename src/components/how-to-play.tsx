import { cn } from "@/lib/utils";

const HOW_TO_PLAY_STEPS = [
  {
    number: "01",
    title: "Create or join with one code",
    description:
      "Start a challenge run or join an existing one with the live code and your nickname. Everyone lands in the same team game.",
  },
  {
    number: "02",
    title: "Read the clue, then switch to the map",
    description:
      "The clue image is fixed. You can swap between Image and Map while you move in the real world, but you cannot pan or walk the clue itself.",
  },
  {
    number: "03",
    title: "Guess from your real GPS position",
    description:
      "When you tap Guess, the app submits your current location. Pick the smallest radius you trust, because tighter successful rings are worth more points.",
  },
  {
    number: "04",
    title: "Play the round as one shared team",
    description:
      "Attempts, timer, score, and hint costs are shared. A hint helps everyone, but its penalty comes out of the team's available round points.",
  },
] as const;

const HOW_TO_PLAY_RULES = [
  {
    title: "Shared attempts",
    description:
      "Every guess spends one team attempt. A round ends when the team lands a successful guess, runs out of attempts, or hits the timer.",
  },
  {
    title: "Two shared hints",
    description:
      "\"Get me closer\" adds a shared circle containing the target, and \"Point me\" gives one shared cardinal direction from the requester.",
  },
  {
    title: "Best ring wins",
    description:
      "Your round score comes from the best successful radius the team earns. Smaller winning rings beat larger ones and hints reduce the max available score.",
  },
] as const;

type HowToPlayProps = {
  className?: string;
  titleId?: string;
  variant?: "section" | "dialog";
};

export function HowToPlay(props: HowToPlayProps) {
  const variant = props.variant ?? "section";
  const isDialog = variant === "dialog";

  return (
    <section
      className={cn(
        isDialog
          ? "space-y-5"
          : "relative overflow-hidden rounded-[1.25rem] border border-ink/10 bg-white/92 p-6 shadow-panel sm:p-8 lg:p-10",
        props.className,
      )}
    >
      {isDialog ? null : (
        <>
          <div className="absolute inset-0 bg-grid bg-[size:36px_36px] opacity-[0.05]" />
          <div className="absolute right-[-4rem] top-[-5rem] h-44 w-44 rounded-full bg-neon/25 blur-3xl" />
          <div className="absolute bottom-[-6rem] left-[-3rem] h-48 w-48 rounded-full bg-moss/12 blur-3xl" />
        </>
      )}

        <div className={cn("relative", isDialog ? "space-y-5" : "space-y-8")}>
          <div className={cn(isDialog ? "space-y-3" : "flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between")}>
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">
                How to play
            </p>
            <h2
              className={cn(
                "mt-3 font-semibold tracking-tight text-ink",
                isDialog ? "text-2xl sm:text-[2rem]" : "text-3xl sm:text-4xl",
              )}
              id={props.titleId}
            >
              How to play BullseyeRL
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/68 sm:text-base">
              Read the clue, move through the real world, and lock in the tightest ring your team
              can actually support.
            </p>
          </div>
        </div>

        <ol className={cn("grid gap-3", isDialog ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4")}>
          {HOW_TO_PLAY_STEPS.map((step) => (
            <li
              className="rounded-[1rem] border border-ink/10 bg-mist/85 p-5 shadow-[0_1px_0_rgba(13,22,19,0.03)]"
              key={step.number}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/38">
                {step.number}
              </p>
              <p className="mt-3 text-lg font-semibold tracking-tight text-ink">{step.title}</p>
              <p className="mt-3 text-sm leading-6 text-ink/68">{step.description}</p>
            </li>
          ))}
        </ol>

        <div className="rounded-[1rem] border border-ink/10 bg-slate px-5 py-5 text-white shadow-[0_16px_40px_rgba(13,22,19,0.14)] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">
                Shared round rules
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/72">
                BullseyeRL works best when the whole team plays the same board state and the same
                tradeoffs.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {HOW_TO_PLAY_RULES.map((rule) => (
              <div className="rounded-[0.875rem] border border-white/10 bg-white/5 p-4" key={rule.title}>
                <p className="text-sm font-semibold text-white">{rule.title}</p>
                <p className="mt-2 text-sm leading-6 text-white/72">{rule.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
