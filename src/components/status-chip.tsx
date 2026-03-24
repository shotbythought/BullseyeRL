import { cn } from "@/lib/utils";

export function StatusChip(props: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]",
        props.tone === "success" &&
          "border-moss/50 bg-moss/10 text-moss",
        props.tone === "warning" &&
          "border-amber-500/50 bg-amber-500/10 text-amber-700",
        props.tone === "danger" &&
          "border-ember/50 bg-ember/10 text-ember",
        (!props.tone || props.tone === "neutral") &&
          "border-ink/10 bg-white/80 text-ink/60",
      )}
    >
      {props.label}
    </span>
  );
}
