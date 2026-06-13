"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark as BookmarkIcon, Check, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Book, Bookmark } from "@/lib/types";
import { removeBookmark } from "@/lib/bookmarks";
import { cn } from "@/lib/utils";

type Tab = "contents" | "bookmarks";

export function TocSheet({
  open,
  onOpenChange,
  book,
  currentChapter,
  bookmarks,
  onJump,
  onJumpToBookmark,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book;
  currentChapter: number;
  bookmarks: Bookmark[];
  onJump: (index: number) => void;
  onJumpToBookmark: (bookmark: Bookmark) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const [tab, setTab] = useState<Tab>("contents");
  // reset to Contents whenever the drawer (re)opens — render-phase, no effect
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setTab("contents");
  }

  // Hide unreadable cover/spacer spine items (0 words) — but never the one
  // you're on, so the highlight always has a home.
  const entries = book.spine
    .map((ref, index) => ({ ref, index }))
    .filter(({ ref, index }) => ref.wordCount > 0 || index === currentChapter);

  // scroll the current chapter into view each time the drawer opens
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      activeRef.current?.scrollIntoView({ block: "center" }),
    );
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-sm"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 pt-4 pb-0 backdrop-blur">
          <SheetTitle className="font-sans text-sm">
            <span className="block font-serif text-base italic">
              {book.title}
            </span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              {book.author}
            </span>
          </SheetTitle>
          <div className="-mb-px mt-3 flex gap-1 font-sans text-sm">
            {(["contents", "bookmarks"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "border-b-2 px-2 pb-2 capitalize transition-colors",
                  tab === t
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
                {t === "bookmarks" && bookmarks.length > 0 && (
                  <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                    {bookmarks.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </SheetHeader>

        {tab === "contents" ? (
          <nav aria-label="Table of contents" className="px-2 py-2 font-sans">
            <ol>
              {entries.map(({ ref, index }) => {
                const active = index === currentChapter;
                const empty = ref.wordCount === 0;
                return (
                  <li key={index}>
                    <button
                      ref={active ? activeRef : undefined}
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onJump(index)}
                      className={cn(
                        "group flex w-full items-baseline gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-right text-xs tabular-nums",
                          active ? "text-primary" : "text-muted-foreground/60",
                        )}
                      >
                        {active ? (
                          <Check className="ml-auto h-3.5 w-3.5" aria-hidden />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="flex-1 [text-wrap:balance]">
                        {ref.title}
                      </span>
                      {!empty && (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
                          {Math.max(1, Math.round(ref.wordCount / 250))}m
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : (
          <div className="px-2 py-2 font-sans">
            {bookmarks.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <BookmarkIcon
                  className="h-6 w-6 text-muted-foreground/40"
                  aria-hidden
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  No bookmarks yet
                </p>
                <p className="mt-1 max-w-[14rem] text-xs text-muted-foreground/70">
                  Tap the bookmark icon (or press B) to save your spot.
                </p>
              </div>
            ) : (
              <ul aria-label="Bookmarks">
                {bookmarks.map((b) => (
                  <li key={b.id} className="group/bm relative">
                    <button
                      type="button"
                      onClick={() => onJumpToBookmark(b)}
                      className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2.5 pr-9 text-left transition-colors hover:bg-accent"
                    >
                      <span className="text-[11px] tracking-wide text-primary/80">
                        {book.spine[b.chapterIndex]?.title ??
                          `Chapter ${b.chapterIndex + 1}`}
                      </span>
                      <span className="line-clamp-2 font-serif text-sm text-foreground">
                        {b.excerpt || "Saved spot"}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Remove bookmark"
                      onClick={() => void removeBookmark(b.id)}
                      className="absolute top-2.5 right-2 rounded-md p-1.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/bm:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
