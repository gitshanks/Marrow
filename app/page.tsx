"use client";

import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Settings } from "lucide-react";

import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { FontSizeBoot, SettingsSheet } from "@/components/settings/settings-sheet";
import { BookCard } from "@/components/library/book-card";
import { EmptyState } from "@/components/library/empty-state";
import {
  ImportButton,
  ImportDropOverlay,
} from "@/components/library/import-dropzone";
import { useLibraryImport } from "@/components/library/use-library-import";

const GRID =
  "grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

function LibrarySkeleton() {
  return (
    <div className={GRID} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="animate-pulse" style={{ opacity: 1 - i * 0.15 }}>
          <div className="aspect-2/3 rounded-md bg-muted" />
          <div className="mt-3 h-3.5 w-3/4 rounded-sm bg-muted" />
          <div className="mt-2 h-3 w-1/2 rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const books = useLiveQuery(
    () => db.books.orderBy("addedAt").reverse().toArray(),
    [],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { importFiles, importSampleBook, pendingSample } = useLibraryImport();

  const handleFiles = useCallback(
    (files: File[]) => void importFiles(files),
    [importFiles],
  );
  const handleSample = useCallback(
    (path: string, label: string) => void importSampleBook(path, label),
    [importSampleBook],
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const loading = books === undefined;
  const empty = books !== undefined && books.length === 0;

  return (
    <div className="min-h-dvh">
      <FontSizeBoot />
      <ImportDropOverlay onFiles={handleFiles} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />

      <div className="mx-auto max-w-6xl px-6 pt-8 pb-24 sm:px-10">
        <header className="flex items-start justify-between gap-4">
          {/* In the first-run state the wordmark moves into the centered
              composition; the header keeps only the gear. */}
          {empty ? (
            <span aria-hidden />
          ) : (
            <div>
              <h1 className="font-serif text-3xl italic tracking-tight">
                Marrow
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Read the marrow. Skip the bone.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {books !== undefined && books.length > 0 && (
              <ImportButton onFiles={handleFiles} variant="outline" size="sm" />
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Settings"
              onClick={openSettings}
            >
              <Settings aria-hidden />
            </Button>
          </div>
        </header>

        <main className="mt-10">
          {loading && <LibrarySkeleton />}
          {empty && (
            <EmptyState
              onFiles={handleFiles}
              onSample={handleSample}
              pendingSample={pendingSample}
            />
          )}
          {books !== undefined && books.length > 0 && (
            <div className={GRID}>
              {books.map((book, i) => (
                <BookCard key={book.id} book={book} index={i} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
