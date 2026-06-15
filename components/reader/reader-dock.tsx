"use client";

import { useState } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DensityLevel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DensitySlider } from "@/components/density/density-slider";

const WPM = 250;

function minutesLabel(mins: number): string {
  if (mins < 1) return "<1m left";
  if (mins < 60) return `${Math.round(mins)}m left`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

/**
 * Floating bottom control: chapter prev/next, the density slider, and a
 * tappable reading readout that cycles chapter-time-left → percent →
 * book-time-left (Kindle-style). Progress arrives as a MotionValue so scroll
 * updates never re-render the reader tree.
 */
export function ReaderDock({
  density,
  onDensityChange,
  sliderDisabled,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  progress,
  chapterWords,
  bookWordsAfter,
}: {
  density: DensityLevel;
  onDensityChange: (level: DensityLevel) => void;
  sliderDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  progress: MotionValue<number>;
  /** total words in the current chapter (for time-left-in-chapter) */
  chapterWords: number;
  /** words in all chapters after this one (for time-left-in-book) */
  bookWordsAfter: number;
}) {
  const [mode, setMode] = useState<0 | 1 | 2>(0);

  const chapterLeft = useTransform(progress, (v) =>
    minutesLabel((chapterWords * (1 - v)) / WPM),
  );
  const percent = useTransform(progress, (v) => `${Math.round(v * 100)}%`);
  const bookLeft = useTransform(progress, (v) =>
    minutesLabel((chapterWords * (1 - v) + bookWordsAfter) / WPM).replace(
      " left",
      "",
    ),
  );
  const value = mode === 0 ? chapterLeft : mode === 1 ? percent : bookLeft;
  const hint =
    mode === 0
      ? "Time left in chapter"
      : mode === 1
        ? "Percent of chapter read"
        : "Time left in book";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 font-sans">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-2xl border border-border bg-card/90 py-2.5 pr-2 pl-1.5 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          disabled={!hasPrev}
          onClick={onPrev}
          aria-label="Previous chapter"
          className="size-11 shrink-0 sm:size-9"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <DensitySlider
            value={density}
            onChange={onDensityChange}
            disabled={sliderDisabled}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={!hasNext}
          onClick={onNext}
          aria-label="Next chapter"
          className="size-11 shrink-0 sm:size-9"
        >
          <ChevronRight />
        </Button>
        <button
          type="button"
          onClick={() => setMode((m) => ((m + 1) % 3) as 0 | 1 | 2)}
          aria-label={`${hint} (tap to change)`}
          title={`${hint} (tap to change)`}
          className="ml-0.5 flex min-h-11 min-w-15 shrink-0 cursor-pointer items-center justify-end rounded-md border-l border-border py-1 pl-2 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
        >
          <motion.span>{value}</motion.span>
        </button>
      </div>
    </div>
  );
}
