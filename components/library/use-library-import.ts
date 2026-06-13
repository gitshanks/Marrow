"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { EpubImportError, importEpub, importSample } from "@/lib/epub/import";
import { db } from "@/lib/db";

async function resolveTitle(bookId: string, fallback: string): Promise<string> {
  const book = await db.books.get(bookId);
  return book?.title ?? fallback;
}

/**
 * Library import orchestration: sequential multi-file import with per-file
 * toast lifecycle, plus sample-book fetching with a pending flag for buttons.
 */
export function useLibraryImport(): {
  importFiles: (files: File[]) => Promise<void>;
  importSampleBook: (path: string, label: string) => Promise<void>;
  /** path of the sample currently being fetched, or null */
  pendingSample: string | null;
} {
  const [pendingSample, setPendingSample] = useState<string | null>(null);

  const importFiles = useCallback(async (files: File[]) => {
    // Sequential on purpose: imports write to IndexedDB and dedupe by hash.
    for (const file of files) {
      const toastId = toast.loading(`Importing ${file.name}…`);
      try {
        const { bookId, alreadyExisted } = await importEpub(file, file.name);
        const title = await resolveTitle(bookId, file.name);
        if (alreadyExisted) {
          toast.info("Already in your library", {
            id: toastId,
            description: title,
          });
        } else {
          toast.success(`Added ${title}`, { id: toastId });
        }
      } catch (error) {
        toast.error(
          error instanceof EpubImportError
            ? error.message
            : `Couldn't import ${file.name}`,
          { id: toastId },
        );
      }
    }
  }, []);

  const importSampleBook = useCallback(async (path: string, label: string) => {
    setPendingSample(path);
    try {
      const { bookId, alreadyExisted } = await importSample(path);
      const title = await resolveTitle(bookId, label);
      if (alreadyExisted) {
        toast.info("Already in your library", { description: title });
      } else {
        toast.success(`Added ${title}`);
      }
    } catch (error) {
      toast.error(
        error instanceof EpubImportError
          ? error.message
          : `Couldn't load ${label}`,
      );
    } finally {
      setPendingSample(null);
    }
  }, []);

  return { importFiles, importSampleBook, pendingSample };
}
