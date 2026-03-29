import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  href?: string;
  iconClassName?: string;
};

export function BrandMark({ className, href, iconClassName }: BrandMarkProps) {
  const content = (
    <>
      <span aria-hidden="true" className={cn("text-[1.15em] leading-none", iconClassName)}>
        🎯
      </span>
      <span>BullseyeRL</span>
    </>
  );

  const classes = cn("inline-flex items-center gap-2", className);

  if (href) {
    return (
      <Link className={classes} href={href}>
        {content}
      </Link>
    );
  }

  return <span className={classes}>{content}</span>;
}

export function HomeLink({ className }: { className?: string }) {
  return (
    <BrandMark
      className={cn(
        "text-sm font-semibold uppercase tracking-[0.22em] text-ink/45 transition hover:text-ink/65",
        className,
      )}
      href="/"
    />
  );
}
