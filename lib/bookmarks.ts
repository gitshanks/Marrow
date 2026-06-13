"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { bookmarkId, type Bookmark } from "@/lib/types";

/** Add or remove a bookmark at a position; returns the new state. */
export async function toggleBookmark(
  bookId: string,
  chapterIndex: number,
  blockId: string,
  excerpt: string,
): Promise<boolean> {
  const id = bookmarkId(bookId, chapterIndex, blockId);
  const existing = await db.bookmarks.get(id);
  if (existing) {
    await db.bookmarks.delete(id);
    return false;
  }
  await db.bookmarks.put({
    id,
    bookId,
    chapterIndex,
    blockId,
    excerpt,
    createdAt: Date.now(),
  });
  return true;
}

export async function removeBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}

/** All bookmarks for a book, in reading order. */
export function useBookmarks(bookId: string): Bookmark[] | undefined {
  return useLiveQuery(
    () =>
      db.bookmarks
        .where("bookId")
        .equals(bookId)
        .sortBy("createdAt")
        .then((list) =>
          [...list].sort((a, b) =>
            a.chapterIndex !== b.chapterIndex
              ? a.chapterIndex - b.chapterIndex
              : a.blockId.localeCompare(b.blockId, undefined, {
                  numeric: true,
                }),
          ),
        ),
    [bookId],
  );
}

/** Whether a specific block is bookmarked (live). */
export function useIsBookmarked(
  bookId: string,
  chapterIndex: number,
  blockId: string | null,
): boolean {
  const hit = useLiveQuery(
    () =>
      blockId
        ? db.bookmarks.get(bookmarkId(bookId, chapterIndex, blockId))
        : Promise.resolve(undefined),
    [bookId, chapterIndex, blockId],
  );
  return !!hit;
}
