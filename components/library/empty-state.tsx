"use client";

import { Fragment } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportButton } from "@/components/library/import-dropzone";

const SAMPLES = [
  { label: "Alice in Wonderland", path: "/samples/alice-in-wonderland.epub" },
  { label: "Frankenstein", path: "/samples/frankenstein.epub" },
  { label: "Walden", path: "/samples/walden.epub" },
] as const;

/** First-run composition: large wordmark, the pitch, import CTA. */
export function EmptyState({
  onFiles,
  onSample,
  pendingSample,
}: {
  onFiles: (files: File[]) => void;
  onSample: (path: string, label: string) => void;
  /** path of the sample currently importing, or null */
  pendingSample: string | null;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto flex min-h-[72dvh] max-w-xl flex-col items-center justify-center px-6 text-center"
    >
      <h1 className="font-serif text-6xl italic tracking-tight sm:text-7xl">
        Marrow
      </h1>
      <p className="mt-4 text-xs tracking-[0.22em] text-muted-foreground uppercase">
        Read the marrow. Skip the bone.
      </p>

      <div className="mt-12 max-w-md space-y-3 text-[15px]/relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">
            Bring your own books:
          </span>{" "}
          import any DRM-free EPUB and it stays on this device.
        </p>
        <p>
          <span className="font-medium text-foreground">
            Nothing to set up:
          </span>{" "}
          Marrow reads each chapter on this device and learns which passages
          carry the argument — no account, no key, no cloud.
        </p>
      </div>

      <div className="mt-12 flex flex-col items-center gap-5">
        <ImportButton onFiles={onFiles} size="lg" />
        <div className="flex flex-wrap items-center justify-center gap-y-1 text-sm">
          <span className="mr-1.5 text-muted-foreground">or try</span>
          {SAMPLES.map((sample, i) => (
            <Fragment key={sample.path}>
              <Button
                variant="ghost"
                size="sm"
                disabled={pendingSample !== null}
                onClick={() => onSample(sample.path, sample.label)}
                className="px-2 font-serif italic"
              >
                {pendingSample === sample.path && (
                  <Loader2 className="animate-spin" aria-hidden />
                )}
                {sample.label}
              </Button>
              {i < SAMPLES.length - 1 && (
                <span className="text-border select-none" aria-hidden>
                  ·
                </span>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
