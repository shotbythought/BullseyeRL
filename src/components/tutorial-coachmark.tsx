"use client";

import { useEffect, useState } from "react";

import type { TutorialStep } from "@/lib/tutorial/state";

interface TutorialCoachmarkProps {
  canGoBack: boolean;
  primaryAction?: {
    label: string;
    onClick: () => void;
  } | null;
  onBack: () => void;
  onRestart: () => void;
  onSkip: () => void;
  step: TutorialStep;
  stepCount: number;
  stepIndex: number;
  targetId: string | null;
}

interface OverlayLayout {
  targetRect: DOMRect | null;
  viewportHeight: number;
  viewportWidth: number;
}

type MobileDock = "top" | "bottom";

const CARD_WIDTH_PX = 360;
const CARD_EDGE_GAP_PX = 16;
const CARD_TARGET_GAP_PX = 20;
const SPOTLIGHT_PADDING_PX = 12;
const COMPACT_HEIGHT_BREAKPOINT_PX = 540;
const ESTIMATED_CARD_HEIGHT_PX = 360;

export function TutorialCoachmark(props: TutorialCoachmarkProps) {
  const [layout, setLayout] = useState<OverlayLayout>({
    targetRect: null,
    viewportHeight: 0,
    viewportWidth: 0,
  });

  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;

    function updateLayout() {
      const target = props.targetId
        ? document.querySelector<HTMLElement>(
            `[data-tutorial-target="${props.targetId}"]`,
          )
        : null;

      if (target) {
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(updateLayout);
        resizeObserver.observe(target);
      }

      setLayout({
        targetRect: target?.getBoundingClientRect() ?? null,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      });
    }

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [props.targetId]);

  const spotlightStyle = buildSpotlightStyle(layout.targetRect);
  const isStandaloneStep = layout.targetRect == null;
  const useEdgeDock = shouldUseEdgeDock(layout);
  const mobileDock = useEdgeDock ? resolveMobileDock(layout) : null;
  const cardStyle = buildCardStyle(layout, useEdgeDock, mobileDock);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {spotlightStyle ? (
        <>
          <div
            className="pointer-events-none absolute rounded-[1.5rem] border border-neon/90 shadow-[0_0_0_9999px_rgba(6,11,9,0.72)]"
            style={spotlightStyle}
          />
          <div
            className="tutorial-target-pulse pointer-events-none absolute rounded-[1.75rem] border-2 border-white/90"
            style={spotlightStyle}
          />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-ink/72" />
      )}

      <aside
        className="pointer-events-auto fixed rounded-[1.5rem] border border-white/12 bg-[#101713]/96 p-4 text-white shadow-[0_24px_80px_rgba(6,11,9,0.45)] supports-[backdrop-filter]:bg-[#101713]/90 supports-[backdrop-filter]:backdrop-blur-md sm:p-5"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-neon/75">
              Step {props.stepIndex + 1} of {props.stepCount}
            </p>
            <h2
              className={
                isStandaloneStep
                  ? "mt-3 text-[1.75rem] font-semibold tracking-tight text-white sm:text-3xl"
                  : "mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl"
              }
            >
              {props.step.title}
            </h2>
          </div>
          <button
            className="inline-flex rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-white/72 transition hover:border-white/30 hover:text-white"
            onClick={props.onSkip}
            type="button"
          >
            Skip
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-white/82">{props.step.description}</p>
        <p className="mt-3 rounded-[1rem] border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-white/72">
          {props.step.rationale}
        </p>

        {props.primaryAction ? (
          <div className="mt-5 rounded-[1rem] border border-neon/20 bg-neon/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neon/80">
              Tutorial-only action
            </p>
            <button
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-neon px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-ink transition hover:bg-[#cfff45]"
              onClick={props.primaryAction.onClick}
              type="button"
            >
              {props.primaryAction.label}
            </button>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex rounded-xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white/78 transition hover:border-white/24 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!props.canGoBack}
            onClick={props.onBack}
            type="button"
          >
            Back
          </button>
          <button
            className="inline-flex rounded-xl border border-neon/25 bg-neon/12 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-neon transition hover:bg-neon/18"
            onClick={props.onRestart}
            type="button"
          >
            Restart
          </button>
        </div>
      </aside>
    </div>
  );
}

function buildSpotlightStyle(targetRect: DOMRect | null) {
  if (!targetRect) {
    return null;
  }

  return {
    top: Math.max(8, targetRect.top - SPOTLIGHT_PADDING_PX),
    left: Math.max(8, targetRect.left - SPOTLIGHT_PADDING_PX),
    width: targetRect.width + SPOTLIGHT_PADDING_PX * 2,
    height: targetRect.height + SPOTLIGHT_PADDING_PX * 2,
  };
}

function resolveMobileDock(layout: OverlayLayout): MobileDock {
  if (!layout.targetRect || layout.viewportHeight === 0) {
    return "bottom";
  }

  const targetCenter = layout.targetRect.top + layout.targetRect.height / 2;
  return targetCenter >= layout.viewportHeight * 0.5 ? "top" : "bottom";
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect,
  pad: number,
) {
  return !(
    a.right + pad <= b.left ||
    a.left - pad >= b.right ||
    a.bottom + pad <= b.top ||
    a.top - pad >= b.bottom
  );
}

function buildFloatingCardRect(
  layout: OverlayLayout,
  width: number,
  height: number,
) {
  if (!layout.targetRect || layout.viewportWidth === 0 || layout.viewportHeight === 0) {
    return null;
  }

  const prefersRight = layout.targetRect.left < layout.viewportWidth / 2;
  let left = prefersRight
    ? layout.targetRect.right + CARD_TARGET_GAP_PX
    : layout.targetRect.left - width - CARD_TARGET_GAP_PX;

  if (left + width > layout.viewportWidth - CARD_EDGE_GAP_PX) {
    left = layout.viewportWidth - width - CARD_EDGE_GAP_PX;
  }

  if (left < CARD_EDGE_GAP_PX) {
    left = CARD_EDGE_GAP_PX;
  }

  let top = layout.targetRect.top + layout.targetRect.height / 2 - height / 2;
  if (top < CARD_EDGE_GAP_PX) {
    top = CARD_EDGE_GAP_PX;
  }

  if (top + height > layout.viewportHeight - CARD_EDGE_GAP_PX) {
    top = Math.max(CARD_EDGE_GAP_PX, layout.viewportHeight - height - CARD_EDGE_GAP_PX);
  }

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function shouldUseEdgeDock(layout: OverlayLayout) {
  if (layout.viewportWidth === 0) {
    return false;
  }

  if (!layout.targetRect) {
    return false;
  }

  if (
    layout.viewportWidth < 768 ||
    layout.viewportHeight < COMPACT_HEIGHT_BREAKPOINT_PX
  ) {
    return true;
  }

  if (!layout.targetRect) {
    return false;
  }

  const width = Math.min(CARD_WIDTH_PX, layout.viewportWidth - CARD_EDGE_GAP_PX * 2);
  const floatingRect = buildFloatingCardRect(
    layout,
    width,
    ESTIMATED_CARD_HEIGHT_PX,
  );

  return floatingRect
    ? rectsOverlap(floatingRect, layout.targetRect, CARD_TARGET_GAP_PX)
    : false;
}

function buildCardStyle(
  layout: OverlayLayout,
  useEdgeDock: boolean,
  mobileDock: MobileDock | null,
) {
  if (useEdgeDock) {
    const availableHeight = layout.targetRect
      ? mobileDock === "top"
        ? Math.max(
            96,
            layout.targetRect.top - CARD_TARGET_GAP_PX - CARD_EDGE_GAP_PX,
          )
        : Math.max(
            96,
            layout.viewportHeight -
              layout.targetRect.bottom -
              CARD_TARGET_GAP_PX -
              CARD_EDGE_GAP_PX,
          )
      : Math.max(96, layout.viewportHeight - CARD_EDGE_GAP_PX * 2);

    return {
      left: 16,
      right: 16,
      maxHeight: Math.min(304, availableHeight),
      overflowY: "auto" as const,
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
      ...(mobileDock === "top" ? { top: 16 } : { bottom: 16 }),
      width: "auto",
    };
  }

  if (!layout.targetRect || layout.viewportWidth === 0 || layout.viewportHeight === 0) {
    const width =
      layout.viewportWidth > 0
        ? Math.min(340, layout.viewportWidth - CARD_EDGE_GAP_PX * 2)
        : CARD_WIDTH_PX;
    const maxHeight =
      layout.viewportHeight > 0
        ? Math.min(520, layout.viewportHeight - CARD_EDGE_GAP_PX * 2)
        : 520;

    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width,
      maxHeight,
      overflowY: "auto" as const,
    };
  }

  const width = Math.min(CARD_WIDTH_PX, layout.viewportWidth - CARD_EDGE_GAP_PX * 2);
  const floatingRect = buildFloatingCardRect(
    layout,
    width,
    ESTIMATED_CARD_HEIGHT_PX,
  );

  if (!floatingRect) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return {
    top: floatingRect.top,
    left: floatingRect.left,
    width,
  };
}
