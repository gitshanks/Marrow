"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type { DensityLevel } from "@/lib/types";
import { DENSITY_LABELS, DENSITY_LEVELS } from "@/lib/density";
import { cn } from "@/lib/utils";

const THUMB = 18; // px
const SPRING = { type: "spring", stiffness: 380, damping: 38 } as const;

/**
 * The density slider — four detents (Marrow · Skim · Focus · Full), a
 * draggable spring-loaded thumb. The level commits live as the thumb crosses
 * detents; on release the thumb snaps to the active detent.
 */
export function DensitySlider({
  value,
  onChange,
  disabled = false,
}: {
  value: DensityLevel;
  onChange: (level: DensityLevel) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const fill = useTransform(x, (v) => v + THUMB / 2);
  const dragging = useRef(false);
  const activePointer = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const range = Math.max(1, width - THUMB);
  const posFor = useCallback(
    (level: DensityLevel) =>
      range * (DENSITY_LEVELS.indexOf(level) / (DENSITY_LEVELS.length - 1)),
    [range],
  );
  const levelAt = useCallback(
    (px: number): DensityLevel => {
      const t = Math.max(0, Math.min(1, px / range));
      return DENSITY_LEVELS[Math.round(t * (DENSITY_LEVELS.length - 1))];
    },
    [range],
  );

  // keep the thumb on the active detent (unless mid-drag)
  useEffect(() => {
    if (dragging.current || width === 0) return;
    if (reduce) {
      x.set(posFor(value));
      return;
    }
    const controls = animate(x, posFor(value), SPRING);
    return () => controls.stop();
  }, [value, width, posFor, reduce, x]);

  const activeIndex = DENSITY_LEVELS.indexOf(value);

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = activeIndex + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
      next = activeIndex - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = DENSITY_LEVELS.length - 1;
    if (next === null) return;
    e.preventDefault();
    const clamped = Math.max(0, Math.min(DENSITY_LEVELS.length - 1, next));
    if (clamped !== activeIndex) onChange(DENSITY_LEVELS[clamped]);
  };

  // Whole-track pointer dragging: a press or slide anywhere on the track moves
  // the thumb and commits live. Pointer capture keeps the drag alive even if
  // the finger drifts off the (short) track, and touch-action:none stops the
  // browser from claiming the horizontal gesture as a scroll.
  const clampPos = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, Math.min(range, clientX - rect.left - THUMB / 2));
    },
    [range],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const track = trackRef.current;
    if (!track) return;
    try {
      track.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released; dragging still works without capture */
    }
    activePointer.current = e.pointerId;
    dragging.current = true;
    const pos = clampPos(e.clientX);
    x.set(pos);
    const lvl = levelAt(pos);
    if (lvl !== value) onChange(lvl);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || e.pointerId !== activePointer.current) return;
    const pos = clampPos(e.clientX);
    x.set(pos);
    const lvl = levelAt(pos);
    if (lvl !== value) onChange(lvl);
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (e.pointerId !== activePointer.current) return;
    dragging.current = false;
    activePointer.current = null;
    const lvl = levelAt(x.get());
    if (lvl !== value) onChange(lvl);
    if (reduce) x.set(posFor(lvl));
    else animate(x, posFor(lvl), SPRING);
  };

  return (
    <div
      className={cn(
        "select-none font-sans",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Reading density"
        aria-valuemin={0}
        aria-valuemax={DENSITY_LEVELS.length - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={DENSITY_LABELS[value]}
        aria-disabled={disabled}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="relative h-8 cursor-pointer touch-none rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
        <motion.div
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/30"
          style={{ width: fill }}
        />
        {DENSITY_LEVELS.map((lvl, i) => (
          <span
            key={lvl}
            aria-hidden
            className={cn(
              "absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
              i <= activeIndex ? "bg-primary/60" : "bg-border",
            )}
            style={{
              left: `calc(${THUMB / 2}px + ${
                (i / (DENSITY_LEVELS.length - 1)) * 100
              }% - ${(i / (DENSITY_LEVELS.length - 1)) * THUMB}px)`,
            }}
          />
        ))}
        <motion.div
          aria-hidden
          style={{ x }}
          className="pointer-events-none absolute top-1/2 z-10 -mt-[9px] h-[18px] w-[18px] rounded-full bg-primary shadow-md ring-2 ring-background"
        />
      </div>
      <div className="mt-0.5 flex justify-between">
        {DENSITY_LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            tabIndex={-1}
            onClick={() => !disabled && onChange(lvl)}
            className={cn(
              "text-[11px] tracking-wide transition-colors",
              lvl === value
                ? "font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {DENSITY_LABELS[lvl]}
          </button>
        ))}
      </div>
    </div>
  );
}
