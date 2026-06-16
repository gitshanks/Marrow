"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sparkles, X } from "lucide-react";

const SEEN_KEY = "marrow:density-hint-seen";
const SPRING = { type: "spring", stiffness: 380, damping: 38 } as const;

/**
 * One-time coachmark teaching the density slider (the signature feature).
 * Floats just above the dock the first time a reader opens with analysis
 * ready, then never again. Dismissed on tap, on first density change, or
 * after a while.
 */
export function DensityHint({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SEEN_KEY)) return;
    const t = window.setTimeout(() => setShow(true), 900);
    return () => window.clearTimeout(t);
  }, [active]);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — fine, it just shows again next time */
    }
  };

  // auto-dismiss so it never overstays its welcome
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(dismiss, 11000);
    return () => window.clearTimeout(t);
  }, [show]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 font-sans">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={reduce ? { duration: 0.12 } : SPRING}
            className="pointer-events-auto relative max-w-sm rounded-xl border border-gist-border bg-gist px-4 py-3 pr-9 shadow-lg"
          >
            <div className="flex gap-2.5">
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden
              />
              <p className="text-[13px] leading-relaxed text-foreground">
                <span className="font-medium">This is the marrow slider.</span>{" "}
                <span className="text-muted-foreground">
                  Slide left to dim, then collapse, the passages that don&apos;t
                  carry the argument. The author&apos;s words are always one tap
                  away.
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss hint"
              className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {/* little pointer toward the dock below */}
            <div
              aria-hidden
              className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b border-gist-border bg-gist"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
