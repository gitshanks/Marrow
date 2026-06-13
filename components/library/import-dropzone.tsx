"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookDown, BookPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Whole-page drag-and-drop target. Listens at the window level so the user
 * can drop an EPUB anywhere; shows a dimmed, dashed-border overlay while a
 * file drag is in progress.
 */
export function ImportDropOverlay({
  onFiles,
}: {
  onFiles: (files: File[]) => void;
}) {
  const [active, setActive] = useState(false);
  // dragenter/dragleave fire for every child element — count the nesting
  // depth so the overlay doesn't flicker while moving across the page.
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer !== null &&
      Array.from(e.dataTransfer.types).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      // Required for the drop event to fire instead of the browser opening the file.
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-50 bg-background/90 p-5 sm:p-8"
        >
          <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-primary/40">
            <div className="text-center">
              <BookDown
                className="mx-auto h-4 w-4 text-primary"
                aria-hidden
              />
              <p className="mt-3 font-serif text-2xl italic tracking-tight">
                Drop EPUB to import
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                It stays on this device.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** "Import EPUB" button backed by a hidden multi-select file input. */
export function ImportButton({
  onFiles,
  variant = "default",
  size = "default",
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // reset so picking the same file again re-fires onChange
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
        onClick={() => inputRef.current?.click()}
      >
        {children ?? (
          <>
            <BookPlus aria-hidden />
            Import EPUB
          </>
        )}
      </Button>
    </>
  );
}
