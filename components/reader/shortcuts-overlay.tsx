"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: "Navigate",
    rows: [
      { keys: ["J", "→"], label: "Next chapter" },
      { keys: ["K", "←"], label: "Previous chapter" },
      { keys: ["T"], label: "Table of contents" },
      { keys: ["B"], label: "Bookmark this spot" },
    ],
  },
  {
    title: "Density",
    rows: [
      { keys: ["1"], label: "Full — the whole book" },
      { keys: ["2"], label: "Focus — dim the padding" },
      { keys: ["3"], label: "Skim — collapse asides" },
      { keys: ["4"], label: "Marrow — only the argument" },
    ],
  },
  {
    title: "General",
    rows: [
      { keys: ["?"], label: "This list" },
      { keys: ["Esc"], label: "Close any panel" },
    ],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-sans text-xs font-medium text-foreground shadow-[0_1px_0_var(--border)]">
      {children}
    </kbd>
  );
}

export function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="font-sans">
            Everything in Marrow is a keystroke away.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 font-sans">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
                {group.title}
              </h3>
              <dl className="mt-2 space-y-1.5">
                {group.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4"
                  >
                    <dt className="text-sm text-foreground">{row.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {row.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              or
                            </span>
                          )}
                          <Key>{k}</Key>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
