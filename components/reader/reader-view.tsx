"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMotionValue } from "motion/react";
import { ArrowRight, Library, RotateCcw } from "lucide-react";

import { toast } from "sonner";

import { db, getChapter } from "@/lib/db";
import {
  toggleBookmark,
  useBookmarks,
  useIsBookmarked,
} from "@/lib/bookmarks";
import type {
  Analysis,
  Book,
  DensityLevel,
  ReadingState,
  Tier,
} from "@/lib/types";
import {
  computeLayout,
  runId,
  tierOf,
  weightedProgress,
  type RenderItem,
} from "@/lib/density";
import { prefetchChapterAnalysis, useChapterAnalysis } from "@/lib/analysis";
import { FontSizeBoot, SettingsSheet } from "@/components/settings/settings-sheet";
import { Button } from "@/components/ui/button";
import { BlockView } from "./block-renderer";
import { GistPill, ExpandedRun } from "@/components/density/collapsed-run";
import { ReaderTopBar } from "./top-bar";
import { ReaderDock } from "./reader-dock";
import { TocSheet } from "./toc-sheet";
import { DensityHint } from "./density-hint";
import { ShortcutsOverlay } from "./shortcuts-overlay";
import {
  BookNotFound,
  ChapterSkeleton,
  ReaderShellSkeleton,
} from "./reader-states";

/** px the restored anchor sits below the viewport top (clears the top bar) */
const TOP_OFFSET = 72;

const KEY_TO_DENSITY: Record<string, DensityLevel> = {
  "1": 100,
  "2": 75,
  "3": 50,
  "4": 25,
};

export function ReaderView({ bookId }: { bookId: string }) {
  const book = useLiveQuery(
    async () => (await db.books.get(bookId)) ?? null,
    [bookId],
  );
  // Keyed to the book it was loaded for — a stale entry derives back to
  // "loading" rather than being reset synchronously inside the effect.
  const [boot, setBoot] = useState<
    { forBook: string; rs: ReadingState | null } | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    db.readingState.get(bookId).then((rs) => {
      if (!cancelled) setBoot({ forBook: bookId, rs: rs ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const bootRs = boot !== undefined && boot.forBook === bookId ? boot.rs : undefined;
  if (book === undefined || bootRs === undefined) return <ReaderShellSkeleton />;
  if (book === null) return <BookNotFound />;
  return <ReaderInner key={bookId} book={book} boot={bootRs} />;
}

function ReaderInner({
  book,
  boot,
}: {
  book: Book;
  boot: ReadingState | null;
}) {
  const bookId = book.id;
  const maxChapter = book.spine.length - 1;
  const clampChapter = useCallback(
    (i: number) => Math.max(0, Math.min(maxChapter, i)),
    [maxChapter],
  );

  const [chapterIndex, setChapterIndex] = useState(() =>
    clampChapter(boot?.chapterIndex ?? 0),
  );
  /** what the user picked (persisted) vs. what's rendered (forced to Full
   *  until an analysis exists) */
  const [chosenDensity, setChosenDensity] = useState<DensityLevel>(
    boot?.density ?? 100,
  );
  const [appliedDensity, setAppliedDensity] = useState<DensityLevel>(100);
  /** the analysis the current layout was computed from — swapped (e.g.
   *  built-in -> AI upgrade) only through the anchored two-phase commit */
  const [appliedAnalysis, setAppliedAnalysis] = useState<Analysis | undefined>(
    undefined,
  );
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [topBarHidden, setTopBarHidden] = useState(false);
  /** run whose pill should regain focus after a keyboard-driven collapse */
  const [refocusRunId, setRefocusRunId] = useState<string | null>(null);
  /** current top-visible block, reactive but only updated when it changes */
  const [anchorBlockId, setAnchorBlockId] = useState<string | null>(
    boot?.anchorBlockId ?? null,
  );
  const anchorIdRef = useRef<string | null>(boot?.anchorBlockId ?? null);
  const settingsOpenRef = useRef(false);
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);
  const tocOpenRef = useRef(false);
  useEffect(() => {
    tocOpenRef.current = tocOpen;
  }, [tocOpen]);
  const shortcutsOpenRef = useRef(false);
  useEffect(() => {
    shortcutsOpenRef.current = shortcutsOpen;
  }, [shortcutsOpen]);

  const chapterRow = useLiveQuery(
    async () => (await getChapter(bookId, chapterIndex)) ?? null,
    [bookId, chapterIndex],
  );
  // useLiveQuery returns the previous result while the new query resolves —
  // treat a row from another chapter as still-loading to avoid a stale flash.
  const chapter =
    chapterRow === undefined || chapterRow === null
      ? chapterRow
      : chapterRow.chapterIndex === chapterIndex
        ? chapterRow
        : undefined;
  const blocks = chapter?.blocks;
  const { analysis } = useChapterAnalysis(bookId, chapterIndex);

  useEffect(() => {
    if (analysis) prefetchChapterAnalysis(bookId, chapterIndex);
  }, [analysis, bookId, chapterIndex]);

  /* ---------- block registry + visibility tracking ---------- */

  const blockEls = useRef(new Map<string, HTMLElement>());
  const visibleIds = useRef(new Set<string>());
  const topIdRef = useRef<string | null>(boot?.anchorBlockId ?? null);
  const orderRef = useRef(new Map<string, number>());
  const ioRef = useRef<IntersectionObserver | null>(null);
  const rafRef = useRef(0);
  const progressMV = useMotionValue(0);
  const updateTopRef = useRef<() => void>(() => {});

  /* ---------- persistence (declared early: visibility tracking saves) ---- */

  const chapterIndexRef = useRef(chapterIndex);
  const chosenDensityRef = useRef(chosenDensity);
  const saveTimer = useRef<number | null>(null);

  // bookId is constant within ReaderInner (keyed by it), so this is stable.
  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) return;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void db.readingState.put({
        bookId,
        chapterIndex: chapterIndexRef.current,
        anchorBlockId: topIdRef.current,
        density: chosenDensityRef.current,
        updatedAt: Date.now(),
      });
    }, 1000);
  }, [bookId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    orderRef.current = new Map((blocks ?? []).map((b, i) => [b.id, i]));
  }, [blocks]);

  useEffect(() => {
    updateTopRef.current = () => {
      // topmost visible block anchors position restore; the bottommost
      // ("read frontier") drives progress so reaching the end reads 100%.
      let top: string | null = null;
      let topOrder = Infinity;
      let frontier: string | null = null;
      let frontierOrder = -1;
      for (const id of visibleIds.current) {
        const o = orderRef.current.get(id);
        if (o === undefined) continue;
        if (o < topOrder) {
          topOrder = o;
          top = id;
        }
        if (o > frontierOrder) {
          frontierOrder = o;
          frontier = id;
        }
      }
      if (top !== null) {
        topIdRef.current = top;
        // reflect the current spot reactively (for the bookmark toggle) but
        // only when the block actually changes — not on every scroll frame
        if (top !== anchorIdRef.current) {
          anchorIdRef.current = top;
          setAnchorBlockId(top);
        }
      }
      if (blocks && frontier !== null)
        progressMV.set(weightedProgress(blocks, appliedAnalysis, frontier));
      scheduleSave();
    };
  }, [blocks, appliedAnalysis, progressMV, scheduleSave]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.blockId;
          if (!id) continue;
          if (e.isIntersecting) visibleIds.current.add(id);
          else visibleIds.current.delete(id);
        }
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => updateTopRef.current());
      },
      // whole viewport below the top bar: min visible = anchor, max = frontier
      { rootMargin: "-56px 0px 0px 0px", threshold: 0 },
    );
    ioRef.current = io;
    blockEls.current.forEach((el) => io.observe(el));
    return () => {
      cancelAnimationFrame(rafRef.current);
      io.disconnect();
      ioRef.current = null;
    };
  }, []);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    const prev = blockEls.current.get(id);
    if (el === prev) return;
    if (prev) {
      ioRef.current?.unobserve(prev);
      blockEls.current.delete(id);
      visibleIds.current.delete(id);
    }
    if (el) {
      blockEls.current.set(id, el);
      ioRef.current?.observe(el);
    }
  }, []);

  // persist immediately on chapter/density change
  useEffect(() => {
    chapterIndexRef.current = chapterIndex;
    chosenDensityRef.current = chosenDensity;
    void db.readingState.put({
      bookId,
      chapterIndex,
      anchorBlockId: topIdRef.current,
      density: chosenDensity,
      updatedAt: Date.now(),
    });
  }, [bookId, chapterIndex, chosenDensity]);

  /* ---------- position anchoring across density changes ---------- */

  const anchorRef = useRef<{ id: string; top: number } | null>(null);

  const captureAnchor = useCallback(() => {
    if (!blocks?.length) return;
    const ids = [...visibleIds.current].sort(
      (a, b) =>
        (orderRef.current.get(a) ?? Infinity) -
        (orderRef.current.get(b) ?? Infinity),
    );
    let anchorId: string | undefined;
    if (appliedAnalysis) {
      // a tier-0 block (under the RENDERED analysis) survives every level
      anchorId = ids.find((id) => {
        const idx = orderRef.current.get(id);
        return idx !== undefined && tierOf(blocks[idx], appliedAnalysis) === 0;
      });
      if (!anchorId && ids.length > 0) {
        // nearest preceding tier-0 block
        const firstIdx = orderRef.current.get(ids[0]) ?? 0;
        for (let i = firstIdx; i >= 0; i--) {
          if (tierOf(blocks[i], appliedAnalysis) === 0) {
            anchorId = blocks[i].id;
            break;
          }
        }
      }
    }
    anchorId = anchorId ?? ids[0];
    if (!anchorId) return;
    const el = blockEls.current.get(anchorId);
    if (!el) return;
    anchorRef.current = { id: anchorId, top: el.getBoundingClientRect().top };
  }, [blocks, appliedAnalysis]);

  // Apply the chosen density once any analysis exists (built-in or AI), and
  // swap analyses (built-in -> AI upgrade, model change) through the same
  // anchored two-phase commit: the anchor must be measured from the CURRENT
  // layout (DOM read) before the new layout renders, so this cannot be
  // derived during render.
  useEffect(() => {
    const targetDensity: DensityLevel = analysis ? chosenDensity : 100;
    if (analysis !== appliedAnalysis || targetDensity !== appliedDensity) {
      captureAnchor();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setAppliedAnalysis(analysis);
      setAppliedDensity(targetDensity);
    }
  }, [analysis, chosenDensity, appliedAnalysis, appliedDensity, captureAnchor]);

  // After the new layout commits, restore the anchor's viewport offset.
  // Absolute math (element's document position minus stored offset) — a
  // relative scrollBy would compose wrongly with the browser clamping the
  // stale scroll position when the document shrinks (e.g. Full -> Marrow).
  useLayoutEffect(() => {
    const a = anchorRef.current;
    if (!a) return;
    anchorRef.current = null;
    const el = blockEls.current.get(a.id);
    if (!el) return;
    const target = el.getBoundingClientRect().top + window.scrollY - a.top;
    window.scrollTo({ top: Math.max(0, target) });
  }, [appliedDensity, appliedAnalysis]);

  /* ---------- boot scroll restore ---------- */

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !blocks?.length) return;
    restoredRef.current = true;
    const anchor = boot?.anchorBlockId;
    if (!anchor || (boot?.chapterIndex ?? 0) !== chapterIndex) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = blockEls.current.get(anchor);
        if (!el) return;
        const top =
          el.getBoundingClientRect().top + window.scrollY - TOP_OFFSET;
        window.scrollTo({ top: Math.max(0, top) });
      }),
    );
  }, [blocks, boot, chapterIndex]);

  /* ---------- top bar fade ---------- */

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        const delta = y - lastY;
        lastY = y;
        if (y < 80) setTopBarHidden(false);
        else if (delta > 4) setTopBarHidden(true);
        else if (delta < -4) setTopBarHidden(false);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- navigation + density actions ---------- */

  const goToChapter = useCallback(
    (next: number) => {
      const clamped = clampChapter(next);
      if (clamped === chapterIndexRef.current) return;
      setChapterIndex(clamped);
      setExpandedRuns(new Set());
      visibleIds.current.clear();
      topIdRef.current = null;
      progressMV.set(0);
      restoredRef.current = true; // boot restore is for the initial chapter only
      window.scrollTo({ top: 0 });
    },
    [clampChapter, progressMV],
  );

  const changeDensity = useCallback((level: DensityLevel) => {
    setChosenDensity(level);
    // using the slider counts as learning it — don't coach again
    try {
      localStorage.setItem("marrow:density-hint-seen", "1");
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------- bookmarks ---------- */

  const bookmarks = useBookmarks(bookId);
  const currentBookmarked = useIsBookmarked(
    bookId,
    chapterIndex,
    anchorBlockId,
  );

  const scrollToBlock = useCallback((blockId: string, smooth = true) => {
    const el = blockEls.current.get(blockId);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - TOP_OFFSET;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: smooth && !reduce ? "smooth" : "auto",
    });
  }, []);

  const pendingBlockRef = useRef<string | null>(null);
  const goToBlock = useCallback(
    (ci: number, blockId: string) => {
      if (ci === chapterIndexRef.current) {
        scrollToBlock(blockId);
      } else {
        pendingBlockRef.current = blockId;
        goToChapter(ci);
      }
    },
    [goToChapter, scrollToBlock],
  );

  // after a cross-chapter jump renders, land on the requested block
  useEffect(() => {
    if (!blocks?.length) return;
    const target = pendingBlockRef.current;
    if (!target) return;
    pendingBlockRef.current = null;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => scrollToBlock(target, false)),
    );
  }, [blocks, scrollToBlock]);

  const toggleBookmarkHere = useCallback(() => {
    const blockId = anchorIdRef.current;
    if (!blockId || !blocks) return;
    const block = blocks.find((b) => b.id === blockId);
    const excerpt = block
      ? block.html
          .replace(/<[^>]+>/g, " ")
          .replace(/&[a-z#0-9]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80)
      : "";
    void toggleBookmark(
      bookId,
      chapterIndexRef.current,
      blockId,
      excerpt,
    ).then((added) =>
      toast(added ? "Bookmarked this spot" : "Bookmark removed"),
    );
  }, [bookId, blocks]);

  const toggleBookmarkRef = useRef(toggleBookmarkHere);
  useEffect(() => {
    toggleBookmarkRef.current = toggleBookmarkHere;
  }, [toggleBookmarkHere]);

  const goToChapterRef = useRef(goToChapter);
  useEffect(() => {
    goToChapterRef.current = goToChapter;
  }, [goToChapter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (settingsOpenRef.current) return;
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable
      )
        return;
      if (e.key === "?") {
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === "t") {
        setTocOpen((v) => !v);
        return;
      }
      // other shortcuts are suppressed while an overlay owns the screen
      if (tocOpenRef.current || shortcutsOpenRef.current) return;
      if (e.key === "j" || e.key === "ArrowRight") {
        goToChapterRef.current(chapterIndexRef.current + 1);
      } else if (e.key === "k" || e.key === "ArrowLeft") {
        goToChapterRef.current(chapterIndexRef.current - 1);
      } else if (e.key === "b") {
        toggleBookmarkRef.current();
      } else if (e.key in KEY_TO_DENSITY) {
        setChosenDensity(KEY_TO_DENSITY[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const expandRun = useCallback((id: string) => {
    setRefocusRunId(null);
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const collapseRun = useCallback((id: string) => {
    setRefocusRunId(id);
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // EPUB-internal relative links were stripped at parse time, but books
  // imported before that fix may still carry them — never let one navigate
  // the SPA away from the reader.
  const onArticleClickCapture = useCallback((e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      if (!a.getAttribute("target")) {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } else if (!href.startsWith("#")) {
      e.preventDefault();
    }
  }, []);

  /* ---------- layout ---------- */

  const items: RenderItem[] = useMemo(() => {
    if (!blocks) return [];
    if (!appliedAnalysis || appliedDensity === 100) {
      return blocks.map((block) => ({
        kind: "block" as const,
        block,
        tier: appliedAnalysis ? tierOf(block, appliedAnalysis) : (1 as Tier),
        dimmed: false,
        expanded: false,
      }));
    }
    return computeLayout(blocks, appliedAnalysis, appliedDensity, expandedRuns);
  }, [blocks, appliedAnalysis, appliedDensity, expandedRuns]);

  // the chapter's opening paragraph gets a drop cap whenever it's shown as a
  // block (i.e. not collapsed into a pill), at any density level
  const dropCapBlockId = useMemo(
    () => blocks?.find((b) => b.type === "p")?.id,
    [blocks],
  );

  const rendered = useMemo(() => {
    const out: React.ReactNode[] = [];
    let group: Extract<RenderItem, { kind: "block" }>[] = [];
    const flushGroup = () => {
      if (group.length === 0) return;
      const id = runId(group[0].block.id, group[group.length - 1].block.id);
      const grouped = group;
      group = [];
      out.push(
        <ExpandedRun key={`x:${id}`} onCollapse={() => collapseRun(id)}>
          {grouped.map((g) => (
            <BlockView
              key={g.block.id}
              bookId={bookId}
              block={g.block}
              dimmed={false}
              register={register}
              dropCap={g.block.id === dropCapBlockId}
            />
          ))}
        </ExpandedRun>,
      );
    };
    for (const item of items) {
      if (item.kind === "block" && item.expanded) {
        group.push(item);
        continue;
      }
      flushGroup();
      if (item.kind === "block") {
        out.push(
          <BlockView
            key={item.block.id}
            bookId={bookId}
            block={item.block}
            dimmed={item.dimmed}
            register={register}
            dropCap={item.block.id === dropCapBlockId}
          />,
        );
      } else {
        out.push(
          <GistPill
            key={`r:${item.id}`}
            gist={item.gist}
            wordCount={item.wordCount}
            onExpand={() => expandRun(item.id)}
            blockIds={item.blocks.map((b) => b.id)}
            register={register}
            autoFocus={item.id === refocusRunId}
          />,
        );
      }
    }
    flushGroup();
    return out;
  }, [items, bookId, register, expandRun, collapseRun, refocusRunId, dropCapBlockId]);

  const chapterTitle = book.spine[chapterIndex]?.title;
  const nextTitle =
    chapterIndex < maxChapter ? book.spine[chapterIndex + 1]?.title : undefined;
  const chapterWords = book.spine[chapterIndex]?.wordCount ?? 0;
  const bookWordsAfter = useMemo(
    () =>
      book.spine
        .slice(chapterIndex + 1)
        .reduce((n, ref) => n + ref.wordCount, 0),
    [book.spine, chapterIndex],
  );

  return (
    <div className="min-h-dvh">
      <FontSizeBoot />
      <ReaderTopBar
        hidden={topBarHidden}
        bookTitle={book.title}
        chapterTitle={chapterTitle}
        bookmarked={currentBookmarked}
        onToggleBookmark={toggleBookmarkHere}
        onOpenToc={() => setTocOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="reading-measure px-6 pb-44 pt-24">
        {chapter === undefined ? (
          <ChapterSkeleton />
        ) : chapter === null || !blocks?.length ? (
          <EmptyChapter
            hasNext={chapterIndex < maxChapter}
            onNext={() => goToChapter(chapterIndex + 1)}
          />
        ) : (
          <>
            <article
              key={chapterIndex}
              aria-label={chapterTitle ?? book.title}
              className="reading-prose chapter-enter"
              onClickCapture={onArticleClickCapture}
            >
              {rendered}
            </article>
            <div className="mb-6 mt-16 font-sans">
              {nextTitle !== undefined ? (
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    onClick={() => goToChapter(chapterIndex + 1)}
                    className="text-muted-foreground"
                  >
                    Next: <span className="text-foreground">{nextTitle}</span>
                    <ArrowRight />
                  </Button>
                </div>
              ) : (
                <EndOfBook
                  title={book.title}
                  onRestart={() => goToChapter(0)}
                />
              )}
            </div>
          </>
        )}
      </main>
      <ReaderDock
        density={chosenDensity}
        onDensityChange={changeDensity}
        sliderDisabled={!appliedAnalysis}
        onPrev={() => goToChapter(chapterIndex - 1)}
        onNext={() => goToChapter(chapterIndex + 1)}
        hasPrev={chapterIndex > 0}
        hasNext={chapterIndex < maxChapter}
        progress={progressMV}
        chapterWords={chapterWords}
        bookWordsAfter={bookWordsAfter}
      />
      <DensityHint active={!!appliedAnalysis && !tocOpen && !settingsOpen} />
      <TocSheet
        open={tocOpen}
        onOpenChange={setTocOpen}
        book={book}
        currentChapter={chapterIndex}
        bookmarks={bookmarks ?? []}
        onJump={(index) => {
          setTocOpen(false);
          goToChapter(index);
        }}
        onJumpToBookmark={(b) => {
          setTocOpen(false);
          goToBlock(b.chapterIndex, b.blockId);
        }}
      />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function EndOfBook({
  title,
  onRestart,
}: {
  title: string;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span
        className="text-xl tracking-[0.5em] text-primary/70"
        aria-hidden
      >
        ⁂
      </span>
      <p className="mt-5 font-serif text-lg text-foreground">The end</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        You&apos;ve reached the end of{" "}
        <span className="text-foreground">{title}</span>.
      </p>
      <div className="mt-7 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onRestart}>
          <RotateCcw />
          Start over
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <Library />
            Library
          </Link>
        </Button>
      </div>
    </div>
  );
}

function EmptyChapter({
  hasNext,
  onNext,
}: {
  hasNext: boolean;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center pt-24 text-center font-sans">
      <span className="text-lg tracking-[0.4em] text-muted-foreground">⁂</span>
      <p className="mt-4 text-sm text-muted-foreground">
        This chapter has no readable content.
      </p>
      {hasNext ? (
        <Button variant="outline" className="mt-6" onClick={onNext}>
          Skip to the next chapter
          <ArrowRight />
        </Button>
      ) : null}
    </div>
  );
}
