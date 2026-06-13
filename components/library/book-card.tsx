"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { FileDown, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { downloadMarkdown, exportMarrowMarkdown } from "@/lib/export";
import { deleteBook } from "@/lib/db";
import type { Book } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Object URL for a stored cover blob; revoked when the blob changes or the card unmounts. */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!blob) return;
    // The URL's lifecycle must be owned by the effect: creating it in
    // render/useMemo leaks under StrictMode's double-render and serves a
    // revoked URL after the simulated remount.
    const next = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return blob ? url : undefined;
}

/** Fallback when the EPUB ships no cover: title set in Literata on bone paper. */
function TypographicCover({ book }: { book: Book }) {
  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="h-px w-7 bg-primary/70" aria-hidden />
      <p className="line-clamp-6 font-serif text-base/snug font-medium text-secondary-foreground [text-wrap:balance]">
        {book.title}
      </p>
      <p className="line-clamp-2 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {book.author}
      </p>
    </div>
  );
}

export function BookCard({ book, index }: { book: Book; index: number }) {
  const router = useRouter();
  const coverUrl = useObjectUrl(book.coverBlob);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleExport = () => {
    void exportMarrowMarkdown(book.id)
      .then(({ markdown, filename }) => {
        downloadMarkdown(filename, markdown);
        toast(`Exported the marrow of “${book.title}”`);
      })
      .catch(() => toast.error("Export failed."));
  };

  const handleDelete = () => {
    // Close first: the card (and this dialog) unmounts once the live query
    // sees the deletion, and unmounting an open radix dialog can leave the
    // body scroll-locked.
    setConfirmOpen(false);
    void deleteBook(book.id)
      .then(() => toast(`Removed “${book.title}”`))
      .catch(() => toast.error(`Couldn't remove “${book.title}”`));
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.38,
        delay: Math.min(index * 0.05, 0.45),
        ease: "easeOut",
      }}
      className="group relative"
    >
      <button
        type="button"
        onClick={() => router.push(`/read/${book.id}`)}
        aria-label={`Read “${book.title}”`}
        className="block w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="aspect-2/3 overflow-hidden rounded-md border border-border bg-secondary shadow-xs transition-transform duration-300 ease-out group-hover:-translate-y-1">
          {coverUrl ? (
            // Covers are blob: URLs out of IndexedDB — next/image can't optimize those.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <TypographicCover book={book} />
          )}
        </div>
        <div className="mt-2.5">
          <h3 className="truncate font-serif text-sm font-medium">
            {book.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {book.author}
          </p>
        </div>
      </button>

      <div className="absolute top-1.5 right-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={`Options for “${book.title}”`}
              className="border border-border opacity-0 shadow-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={handleExport}>
              <FileDown aria-hidden />
              Export marrow view
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 aria-hidden />
              Delete from library
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif font-medium">
              Delete “{book.title}”?
            </DialogTitle>
            <DialogDescription>
              This removes the book, its text, and any analysis from this
              device. Your original file is untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.article>
  );
}
