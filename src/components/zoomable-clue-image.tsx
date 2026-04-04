"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DRAG_THRESHOLD_PX = 4;
const SUPPRESS_CLICK_WINDOW_MS = 300;

function touchDistance(touches: TouchList) {
  if (touches.length < 2) {
    return 0;
  }
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMidpoint(touches: TouchList) {
  if (touches.length < 2) {
    const touch = touches[0];
    return {
      x: touch?.clientX ?? 0,
      y: touch?.clientY ?? 0,
    };
  }
  const a = touches[0];
  const b = touches[1];
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ZoomableClueImage(props: {
  imageUrl: string;
  roundKey: string;
  interactive?: boolean;
  targetId?: string;
}) {
  const [scale, setScale] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const xRef = useRef(x);
  xRef.current = x;
  const yRef = useRef(y);
  yRef.current = y;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const touchDragRef = useRef<{
    identifier: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchRef = useRef<{
    initialDist: number;
    initialScale: number;
    initialX: number;
    initialY: number;
    initialCenterX: number;
    initialCenterY: number;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  function clampPosition(nextScale: number, nextX: number, nextY: number) {
    const container = containerRef.current;
    const image = imageRef.current;

    if (!container || !image) {
      return {
        x: nextX,
        y: nextY,
      };
    }

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imageWidth = image.clientWidth;
    const imageHeight = image.clientHeight;

    if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
      return {
        x: nextX,
        y: nextY,
      };
    }

    const maxX = Math.max(0, (imageWidth * nextScale - containerWidth) / 2);
    const maxY = Math.max(0, (imageHeight * nextScale - containerHeight) / 2);

    return {
      x: clamp(nextX, -maxX, maxX),
      y: clamp(nextY, -maxY, maxY),
    };
  }

  function applyTransform(nextScale: number, nextX: number, nextY: number) {
    const clamped = clampPosition(nextScale, nextX, nextY);
    setScale(nextScale);
    setX(clamped.x);
    setY(clamped.y);
  }

  function getRelativePoint(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return {
        x: 0,
        y: 0,
      };
    }

    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }

  function getTranslateForScale(
    previousScale: number,
    previousX: number,
    previousY: number,
    nextScale: number,
    pointX: number,
    pointY: number,
  ) {
    const ratio = nextScale / previousScale;

    return {
      x: pointX - ratio * (pointX - previousX),
      y: pointY - ratio * (pointY - previousY),
    };
  }

  function zoomAroundPoint(clientX: number, clientY: number, nextScale: number) {
    const point = getRelativePoint(clientX, clientY);
    const nextPosition = getTranslateForScale(
      scaleRef.current,
      xRef.current,
      yRef.current,
      nextScale,
      point.x,
      point.y,
    );

    applyTransform(nextScale, nextPosition.x, nextPosition.y);
  }

  function suppressNextClick() {
    suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_WINDOW_MS;
  }

  useEffect(() => {
    suppressClickUntilRef.current = 0;
    dragRef.current = null;
    touchDragRef.current = null;
    pinchRef.current = null;
    setScale(1);
    setX(0);
    setY(0);
  }, [props.roundKey, props.imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const onWheel = (e: WheelEvent) => {
      if (props.interactive === false) {
        return;
      }
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const nextScale = clamp(scaleRef.current * factor, MIN_SCALE, MAX_SCALE);
      zoomAroundPoint(e.clientX, e.clientY, nextScale);
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    const onTouchStart = (e: TouchEvent) => {
      if (props.interactive === false) {
        return;
      }
      if (e.touches.length === 2) {
        const center = touchMidpoint(e.touches);
        pinchRef.current = {
          initialDist: touchDistance(e.touches),
          initialScale: scaleRef.current,
          initialX: xRef.current,
          initialY: yRef.current,
          initialCenterX: center.x,
          initialCenterY: center.y,
        };
        touchDragRef.current = null;
        return;
      }
      if (e.touches.length === 1 && scaleRef.current > MIN_SCALE) {
        const touch = e.touches[0];
        touchDragRef.current = {
          identifier: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originX: xRef.current,
          originY: yRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (props.interactive === false) {
        return;
      }
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = touchDistance(e.touches);
        const {
          initialCenterX,
          initialCenterY,
          initialDist,
          initialScale,
          initialX,
          initialY,
        } = pinchRef.current;
        if (initialDist <= 0) {
          return;
        }
        suppressNextClick();
        const ratio = d / initialDist;
        const nextScale = clamp(initialScale * ratio, MIN_SCALE, MAX_SCALE);
        const zoomPosition = getTranslateForScale(
          initialScale,
          initialX,
          initialY,
          nextScale,
          initialCenterX,
          initialCenterY,
        );
        const center = touchMidpoint(e.touches);
        applyTransform(
          nextScale,
          zoomPosition.x + (center.x - initialCenterX),
          zoomPosition.y + (center.y - initialCenterY),
        );
        return;
      }

      if (e.touches.length === 1 && touchDragRef.current && scaleRef.current > MIN_SCALE) {
        const touch = Array.from(e.touches).find(
          (candidate) => candidate.identifier === touchDragRef.current?.identifier,
        );

        if (!touch) {
          return;
        }

        e.preventDefault();
        const nextX = touchDragRef.current.originX + (touch.clientX - touchDragRef.current.startX);
        const nextY = touchDragRef.current.originY + (touch.clientY - touchDragRef.current.startY);

        if (
          Math.abs(touch.clientX - touchDragRef.current.startX) > DRAG_THRESHOLD_PX ||
          Math.abs(touch.clientY - touchDragRef.current.startY) > DRAG_THRESHOLD_PX
        ) {
          suppressNextClick();
        }

        applyTransform(scaleRef.current, nextX, nextY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (props.interactive === false) {
        return;
      }

      if (e.touches.length === 2) {
        const center = touchMidpoint(e.touches);
        pinchRef.current = {
          initialDist: touchDistance(e.touches),
          initialScale: scaleRef.current,
          initialX: xRef.current,
          initialY: yRef.current,
          initialCenterX: center.x,
          initialCenterY: center.y,
        };
        touchDragRef.current = null;
        return;
      }

      pinchRef.current = null;

      if (e.touches.length === 1 && scaleRef.current > MIN_SCALE) {
        const touch = e.touches[0];
        touchDragRef.current = {
          identifier: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originX: xRef.current,
          originY: yRef.current,
        };
        return;
      }

      touchDragRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // These listeners intentionally read the latest view state from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.interactive]);

  useEffect(() => {
    const container = containerRef.current;
    const image = imageRef.current;

    if (!container || !image || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      applyTransform(scaleRef.current, xRef.current, yRef.current);
    });

    observer.observe(container);
    observer.observe(image);

    return () => {
      observer.disconnect();
    };
    // This observer only needs the latest transform state from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.imageUrl]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (
      props.interactive === false ||
      e.pointerType === "touch" ||
      e.button !== 0 ||
      scaleRef.current <= MIN_SCALE
    ) {
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: xRef.current,
      originY: yRef.current,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (props.interactive === false || e.pointerType === "touch") {
      return;
    }
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    const nextX = d.originX + (e.clientX - d.startX);
    const nextY = d.originY + (e.clientY - d.startY);

    if (
      !d.moved &&
      (Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD_PX ||
        Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD_PX)
    ) {
      d.moved = true;
      suppressNextClick();
    }

    applyTransform(scaleRef.current, nextX, nextY);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") {
      return;
    }
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative h-full min-h-0 w-full overflow-hidden bg-ink",
        props.interactive === false
          ? "cursor-default"
          : scale > MIN_SCALE
            ? "cursor-grab active:cursor-grabbing touch-none"
            : "cursor-zoom-in touch-none",
      )}
      data-tutorial-target={props.targetId}
      onClickCapture={(event) => {
        if (Date.now() > suppressClickUntilRef.current) {
          return;
        }
        suppressClickUntilRef.current = 0;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          alt="Street View clue"
          className="max-h-full max-w-full select-none object-contain will-change-transform"
          draggable={false}
          onLoad={() => {
            applyTransform(scaleRef.current, xRef.current, yRef.current);
          }}
          src={props.imageUrl}
          style={{
            transform: `translate(${x}px, ${y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>
  );
}
