"use client";

import Link from "next/link";
import { ArrowLeft, BookX } from "lucide-react";

import { Button } from "@/components/ui/button";

const PARAGRAPHS: number[][] = [
  [100, 96, 100, 88, 62],
  [100, 92, 100, 97, 41],
  [100, 100, 94, 78],
  [96, 100, 91, 100, 55],
];

/** Text-line skeleton that mirrors the .reading-prose rhythm. */
export function ChapterSkeleton() {
  return (
    <div className="animate-pulse pt-10" aria-hidden>
      <div className="mb-10 h-8 w-3/5 rounded-md bg-muted" />
      {PARAGRAPHS.map((widths, i) => (
        <div key={i} className="mb-8 space-y-3.5">
          {widths.map((w, j) => (
            <div
              key={j}
              className="h-4 rounded bg-muted"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full-page skeleton shown while the book row / reading state load. */
export function ReaderShellSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="fixed inset-x-0 top-0 z-40 h-14 border-b border-border bg-background/85 backdrop-blur" />
      <main className="reading-measure px-6 pt-24 pb-44">
        <ChapterSkeleton />
      </main>
    </div>
  );
}

export function BookNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center font-sans">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <BookX className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="mt-6 font-serif text-2xl text-foreground">
        This book is not on your shelf
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        It may have been removed, or the link points to a book that was never
        imported on this device. Everything in Marrow lives locally.
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">
          <ArrowLeft />
          Back to library
        </Link>
      </Button>
    </main>
  );
}
