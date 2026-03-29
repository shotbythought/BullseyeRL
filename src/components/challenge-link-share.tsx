"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "error";

export function ChallengeLinkShare(props: { challengeId: string }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function handleCopyLink() {
    const url = buildChallengeUrl(props.challengeId);

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
      window.setTimeout(() => {
        setCopyState("idle");
      }, 1800);
    } catch {
      setCopyState("error");
      window.setTimeout(() => {
        setCopyState("idle");
      }, 2200);
    }
  }

  return (
    <div className="rounded-[2rem] border border-ink/10 bg-white/90 p-6 shadow-panel">
      <h2 className="text-xl font-semibold text-ink">Challenge another team</h2>
      <p className="mt-2 text-sm leading-7 text-ink/65">
        Copy the challenge link and send it out when you want another team to take a shot.
      </p>
      <button
        className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-slate"
        onClick={() => void handleCopyLink()}
        type="button"
      >
        {copyState === "copied"
          ? "Copied"
          : copyState === "error"
            ? "Copy failed"
            : "Copy challenge link"}
      </button>
    </div>
  );
}

function buildChallengeUrl(challengeId: string) {
  if (typeof window === "undefined") {
    return `/challenges/${challengeId}`;
  }

  return `${window.location.origin}/challenges/${challengeId}`;
}
