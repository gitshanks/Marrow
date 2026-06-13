"use client";

import Link from "next/link";
import { ArrowLeft, Bookmark, BookmarkCheck, List, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 44px tap target on touch, compact 36px on desktop pointers */
const TOUCH = "size-11 sm:size-9";

export function ReaderTopBar({
  hidden,
  bookTitle,
  chapterTitle,
  bookmarked,
  onToggleBookmark,
  onOpenToc,
  onOpenSettings,
}: {
  hidden: boolean;
  bookTitle: string;
  chapterTitle?: string;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenToc: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur transition-transform duration-300",
        hidden && "-translate-y-full",
      )}
    >
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-0.5 px-1.5 font-sans sm:gap-2 sm:px-4">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label="Back to library"
          className={TOUCH}
        >
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Table of contents"
          onClick={onOpenToc}
          className={TOUCH}
        >
          <List />
        </Button>
        <p className="min-w-0 flex-1 truncate text-center text-sm text-muted-foreground">
          <span className="text-foreground">{bookTitle}</span>
          {chapterTitle ? <span> · {chapterTitle}</span> : null}
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark this spot"}
          aria-pressed={bookmarked}
          onClick={onToggleBookmark}
          className={TOUCH}
        >
          {bookmarked ? (
            <BookmarkCheck className="text-primary" />
          ) : (
            <Bookmark />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          onClick={onOpenSettings}
          className={TOUCH}
        >
          <Settings2 />
        </Button>
      </div>
    </header>
  );
}
