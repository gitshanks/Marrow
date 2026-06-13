/**
 * Marrow — analysis access for components. Analysis is computed on-device
 * (lib/analysis/local.ts): instant, free, nothing leaves the browser.
 */
"use client";

import { useEffect, useState } from "react";
import { getChapter } from "@/lib/db";
import type { Analysis } from "@/lib/types";
import { buildLocalAnalysis } from "./local";

const cache = new Map<string, Analysis>();
const CACHE_MAX = 24;

export async function ensureChapterAnalysis(
  bookId: string,
  chapterIndex: number,
): Promise<Analysis | undefined> {
  const key = `${bookId}:${chapterIndex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const chapter = await getChapter(bookId, chapterIndex);
  if (!chapter) return undefined;
  const analysis = buildLocalAnalysis(bookId, chapterIndex, chapter.blocks);
  if (cache.size >= CACHE_MAX)
    cache.delete(cache.keys().next().value as string);
  cache.set(key, analysis);
  return analysis;
}

/** Warm the next chapter so navigation feels instant. */
export function prefetchChapterAnalysis(
  bookId: string,
  chapterIndex: number,
): void {
  void ensureChapterAnalysis(bookId, chapterIndex + 1).catch(() => {});
}

export function useChapterAnalysis(
  bookId: string,
  chapterIndex: number,
): { analysis: Analysis | undefined } {
  const key = `${bookId}:${chapterIndex}`;
  const [state, setState] = useState<{
    key: string;
    analysis: Analysis | undefined;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureChapterAnalysis(bookId, chapterIndex).then((analysis) => {
      if (!cancelled) setState({ key, analysis });
    });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapterIndex, key]);

  // state keyed to its request: a stale entry derives back to "not yet"
  return { analysis: state?.key === key ? state.analysis : undefined };
}
