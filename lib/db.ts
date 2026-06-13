/**
 * Marrow — Dexie (IndexedDB) database.
 *
 * CONTRACT FILE: schema + cascade helpers. Query with dexie-react-hooks'
 * useLiveQuery in components.
 */
import Dexie, { type EntityTable } from "dexie";
import type {
  Book,
  BookAsset,
  Bookmark,
  ChapterContent,
  ReadingState,
} from "@/lib/types";

class MarrowDB extends Dexie {
  books!: EntityTable<Book, "id">;
  chapters!: EntityTable<ChapterContent, "key">;
  assets!: EntityTable<BookAsset, "key">;
  readingState!: EntityTable<ReadingState, "bookId">;
  bookmarks!: EntityTable<Bookmark, "id">;

  constructor() {
    super("marrow");
    this.version(1).stores({
      books: "id, addedAt",
      chapters: "key, bookId, [bookId+chapterIndex]",
      assets: "key, bookId",
      analyses: "key, bookId, [bookId+modelId]",
      readingState: "bookId",
    });
    // v2: analysis became on-device and on-demand — nothing to persist
    this.version(2).stores({ analyses: null });
    // v3: per-position bookmarks
    this.version(3).stores({
      bookmarks: "id, bookId, [bookId+chapterIndex], createdAt",
    });
  }
}

export const db = new MarrowDB();

/** Remove a book and everything derived from it. */
export async function deleteBook(bookId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.books, db.chapters, db.assets, db.readingState, db.bookmarks],
    async () => {
      await db.chapters.where("bookId").equals(bookId).delete();
      await db.assets.where("bookId").equals(bookId).delete();
      await db.bookmarks.where("bookId").equals(bookId).delete();
      await db.readingState.delete(bookId);
      await db.books.delete(bookId);
    },
  );
}

export async function getChapter(
  bookId: string,
  chapterIndex: number,
): Promise<ChapterContent | undefined> {
  return db.chapters.get(`${bookId}:${chapterIndex}`);
}

