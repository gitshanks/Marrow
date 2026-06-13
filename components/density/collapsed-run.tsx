"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Asterisk, ChevronDown, ChevronUp } from "lucide-react";

const SPRING = { type: "spring", stiffness: 380, damping: 38 } as const;

/**
 * Collapsed run of low-tier blocks. The gist is AI-written UI chrome —
 * sans-serif, italic, pill-shaped — unmistakably not the author's prose.
 *
 * The pill registers itself under every block id it hides, so position
 * restore can land on it when the saved anchor sits inside a collapsed run,
 * and its data-block-id (the run's LAST block) lets the visibility tracker
 * count the whole run as read when the pill scrolls past.
 */
export function GistPill({
  gist,
  wordCount,
  onExpand,
  blockIds,
  register,
  autoFocus = false,
}: {
  gist?: string;
  wordCount: number;
  onExpand: () => void;
  blockIds?: string[];
  register?: (id: string, el: HTMLElement | null) => void;
  /** refocus the pill after its run was collapsed (keyboard continuity) */
  autoFocus?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (autoFocus) btnRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const refCb = (el: HTMLButtonElement | null) => {
    btnRef.current = el;
    if (register && blockIds) for (const id of blockIds) register(id, el);
  };

  const words = `${wordCount.toLocaleString()} words`;
  return (
    <button
      ref={refCb}
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label={`Expand ${words}${gist ? `: ${gist}` : ""}`}
      data-block-id={blockIds?.[blockIds.length - 1]}
      className="density-in group my-3 flex w-full items-start gap-2.5 rounded-lg border border-gist-border bg-gist px-4 py-2.5 text-left font-sans text-sm transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Asterisk className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="line-clamp-2 min-w-0 flex-1 italic text-muted-foreground">
        {gist ?? "Hidden passage"}
      </span>
      <span className="shrink-0 whitespace-nowrap pt-px text-xs tabular-nums text-muted-foreground/70">
        · {words}
      </span>
      <ChevronDown
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-y-0.5"
        aria-hidden
      />
    </button>
  );
}

/**
 * The verbatim blocks of an expanded run — animated open with the house
 * spring, hairline-bordered so the reader sees what was hidden, with a quiet
 * collapse control at the end. Collapse animates closed before unmounting.
 * Focus moves into the group on mount so keyboard/AT users follow the reveal.
 */
export function ExpandedRun({
  children,
  onCollapse,
}: {
  children: React.ReactNode;
  onCollapse: () => void;
}) {
  const reduce = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const groupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    groupRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.div
      initial={reduce ? false : { height: 0, opacity: 0 }}
      animate={
        closing ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }
      }
      transition={reduce ? { duration: 0 } : SPRING}
      onAnimationComplete={() => {
        if (closing) onCollapse();
      }}
      className="overflow-hidden"
    >
      <div
        ref={groupRef}
        role="group"
        aria-label="Expanded passage"
        tabIndex={-1}
        className="my-1 border-l-2 border-gist-border pl-4 outline-none"
      >
        {children}
        <div className="mb-3 mt-1 flex justify-center">
          <button
            type="button"
            onClick={() => (reduce ? onCollapse() : setClosing(true))}
            className="inline-flex items-center gap-1 rounded-full border border-gist-border bg-gist px-3 py-1 font-sans text-xs text-muted-foreground transition-colors hover:border-primary/40"
          >
            <ChevronUp className="h-3 w-3" aria-hidden />
            Collapse
          </button>
        </div>
      </div>
    </motion.div>
  );
}
