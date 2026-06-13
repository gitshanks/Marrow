/**
 * Marrow — EPUB import: hash, dedupe, parse, persist.
 *
 * Browser-only (crypto.subtle + DOMParser via parse.ts). Book.id is the
 * sha256 hex of the file bytes, so re-importing the same file is a no-op.
 */
import { db } from "@/lib/db";
import {
  assetKey,
  chapterKey,
  type Book,
  type BookAsset,
  type ChapterContent,
  type ChapterRef,
} from "@/lib/types";
import { EpubImportError, parseEpub } from "@/lib/epub/parse";

export { EpubImportError };

export interface ImportResult {
  bookId: string;
  alreadyExisted: boolean;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cleanFallbackName(name: string | undefined): string {
  return (name ?? "").replace(/\.epub$/i, "").trim();
}

/** Parse file, dedupe by sha256, persist book+chapters+assets. */
export async function importEpub(
  file: File | Blob,
  fallbackName?: string,
): Promise<ImportResult> {
  const data = await file.arrayBuffer();
  const bookId = toHex(await crypto.subtle.digest("SHA-256", data));

  if (await db.books.get(bookId)) {
    return { bookId, alreadyExisted: true };
  }

  let parsed: Awaited<ReturnType<typeof parseEpub>>;
  try {
    parsed = await parseEpub(data);
  } catch (err) {
    if (err instanceof EpubImportError) throw err;
    throw new EpubImportError("Could not read this EPUB", { cause: err });
  }

  const fallback =
    cleanFallbackName(fallbackName) ||
    cleanFallbackName(file instanceof File ? file.name : undefined);

  const spine: ChapterRef[] = parsed.chapters.map((chapter, index) => ({
    index,
    title: chapter.title,
    href: chapter.href,
    wordCount: chapter.blocks.reduce((n, b) => n + b.wordCount, 0),
  }));

  const book: Book = {
    id: bookId,
    title: parsed.title || fallback || "Untitled",
    author: parsed.author || "Unknown author",
    coverBlob: parsed.coverBlob,
    spine,
    addedAt: Date.now(),
  };

  const chapterRows: ChapterContent[] = parsed.chapters.map(
    (chapter, index) => ({
      key: chapterKey(bookId, index),
      bookId,
      chapterIndex: index,
      blocks: chapter.blocks,
    }),
  );

  const assetRows: BookAsset[] = parsed.assets.map(({ href, blob }) => ({
    key: assetKey(bookId, href),
    bookId,
    href,
    blob,
  }));

  await db.transaction("rw", [db.books, db.chapters, db.assets], async () => {
    await db.books.put(book);
    await db.chapters.bulkPut(chapterRows);
    if (assetRows.length > 0) await db.assets.bulkPut(assetRows);
  });

  return { bookId, alreadyExisted: false };
}

/** Fetch a bundled sample (e.g. /samples/walden.epub) and import it. */
export async function importSample(url: string): Promise<ImportResult> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new EpubImportError("Could not download the sample book", {
      cause: err,
    });
  }
  if (!res.ok) {
    throw new EpubImportError(`Could not load sample (HTTP ${res.status})`);
  }
  const blob = await res.blob();

  // "alice-in-wonderland.epub" → "Alice In Wonderland" (used only when the
  // EPUB itself carries no dc:title).
  let slug = url.split("/").pop()?.split(/[?#]/)[0] ?? "";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep raw on malformed escapes
  }
  const name = slug
    .replace(/\.epub$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return importEpub(blob, name || undefined);
}
