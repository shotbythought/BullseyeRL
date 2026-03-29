"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { HomeLink } from "@/components/brand-mark";

function isLiveGamePath(pathname: string) {
  return /^\/games\/[^/]+\/?$/.test(pathname);
}

function HeaderCopyJoinButton(props: { joinCode: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    const url = `${window.location.origin}/join/${encodeURIComponent(props.joinCode)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  return (
    <button
      aria-label={`Copy invite link for join code ${props.joinCode}`}
      className="inline-flex max-w-full items-center gap-2.5 rounded-[0.5rem] border border-ink/15 bg-white/92 px-4 py-2.5 text-left text-sm text-ink/70 shadow-[0_1px_0_rgba(15,23,28,0.04)] transition hover:border-ink/25 hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/35"
      onClick={() => void handleCopy()}
      type="button"
    >
      <svg
        aria-hidden
        className="h-4 w-4 shrink-0 text-ink/55"
        fill="none"
        height="16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="16"
      >
        <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <span className="min-w-0 font-semibold uppercase tracking-[0.22em] text-ink/70">
        Join link
        {copyState === "copied" ? (
          <span className="ml-2 whitespace-nowrap text-xs font-medium text-emerald-700">Copied</span>
        ) : null}
        {copyState === "error" ? (
          <span className="ml-2 whitespace-nowrap text-xs font-medium text-ember">Copy failed</span>
        ) : null}
      </span>
    </button>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? "";

  if (isLiveGamePath(pathname)) {
    return null;
  }

  const joinMatch = pathname.match(/^\/join\/([^/]+)\/?$/);
  const rawCode = joinMatch?.[1];
  const showJoinCopy =
    rawCode != null && rawCode.length > 0 && rawCode.toLowerCase() !== "demo";

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <HomeLink />
      {showJoinCopy ? <HeaderCopyJoinButton joinCode={decodeURIComponent(rawCode)} /> : null}
    </header>
  );
}
