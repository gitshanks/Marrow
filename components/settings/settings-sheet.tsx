"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  applyReadingStyle,
  getSettings,
  READING_FONTS,
  READING_WIDTHS,
  updateSettings,
  useSettings,
  type ReadingWidthId,
} from "@/lib/settings";

const WIDTH_OPTIONS: { id: ReadingWidthId; label: string }[] = [
  { id: "narrow", label: "Narrow" },
  { id: "normal", label: "Normal" },
  { id: "wide", label: "Wide" },
];

/* Literal paper/ink values mirror the per-theme tokens in app/globals.css.
 * Swatches must show every theme's paper color regardless of the active
 * theme, so the cascading CSS variables can't be used here. */
const THEME_SWATCHES = [
  { id: "light", label: "Light", paper: "oklch(0.972 0.008 85)", ink: "oklch(0.245 0.015 50)" },
  { id: "sepia", label: "Sepia", paper: "oklch(0.93 0.028 88)", ink: "oklch(0.31 0.035 60)" },
  { id: "dark", label: "Dark", paper: "oklch(0.185 0.009 55)", ink: "oklch(0.895 0.014 85)" },
] as const;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
      {children}
    </h3>
  );
}

const emptySubscribe = () => () => {};

export function SettingsSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const { open, onOpenChange } = props;
  const settings = useSettings();
  const { theme, setTheme } = useTheme();

  // next-themes is hydration-unsafe before mount; gate selection state on it.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="px-5 pt-5 pb-0">
          <SheetTitle className="font-sans">Settings</SheetTitle>
          <SheetDescription className="font-sans">
            Reading and appearance.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-9 px-5 py-7 font-sans">
          {/* ---------------------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeading>Typography</SectionHeading>

            {/* live preview, styled exactly like the reading surface */}
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p
                className="text-card-foreground"
                style={{
                  fontFamily: READING_FONTS.find(
                    (f) => f.id === settings.fontFamily,
                  )?.stack,
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                }}
              >
                She had read of such things, but had never thought to live
                inside one.
              </p>
            </div>

            {/* typeface */}
            <div className="space-y-2">
              <Label className="text-sm">Typeface</Label>
              <div className="grid grid-cols-3 gap-2">
                {READING_FONTS.map((font) => {
                  const active = settings.fontFamily === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateSettings({ fontFamily: font.id })}
                      style={{ fontFamily: font.stack }}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-md border px-2 py-2.5 transition-colors",
                        active
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="text-lg leading-none">Aa</span>
                      <span className="font-sans text-[11px]">{font.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* font size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="settings-font-size" className="text-sm">
                  Font size
                </Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {settings.fontSize}px
                </span>
              </div>
              <Slider
                id="settings-font-size"
                aria-label="Reading font size"
                min={16}
                max={24}
                step={1}
                value={[settings.fontSize]}
                onValueChange={([v]) => updateSettings({ fontSize: v })}
              />
            </div>

            {/* line spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="settings-line-height" className="text-sm">
                  Line spacing
                </Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {settings.lineHeight.toFixed(2)}
                </span>
              </div>
              <Slider
                id="settings-line-height"
                aria-label="Line spacing"
                min={1.4}
                max={2}
                step={0.04}
                value={[settings.lineHeight]}
                onValueChange={([v]) =>
                  updateSettings({ lineHeight: Math.round(v * 100) / 100 })
                }
              />
            </div>

            {/* reading width */}
            <div className="space-y-2">
              <Label className="text-sm">Width</Label>
              <div className="grid grid-cols-3 gap-2">
                {WIDTH_OPTIONS.map((opt) => {
                  const active = settings.width === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateSettings({ width: opt.id })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 font-sans text-[11px] transition-colors",
                        active
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-2.5 rounded-full",
                          active ? "bg-primary/60" : "bg-border",
                        )}
                        style={{
                          width: `${(READING_WIDTHS[opt.id] / READING_WIDTHS.wide) * 100}%`,
                        }}
                      />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------- */}
          <section className="space-y-3">
            <SectionHeading>Theme</SectionHeading>
            <div className="flex gap-4">
              {THEME_SWATCHES.map((swatch) => {
                const active = mounted && theme === swatch.id;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTheme(swatch.id)}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <span
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-lg border border-border transition-shadow",
                        active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      )}
                      style={{ backgroundColor: swatch.paper, color: swatch.ink }}
                    >
                      <span className="font-serif text-lg">Aa</span>
                    </span>
                    <span
                      className={cn(
                        "text-xs transition-colors",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      {swatch.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---------------------------------------------------------- */}
          <section className="space-y-3">
            <SectionHeading>Analysis</SectionHeading>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Marrow reads each chapter on this device to find the passages
              that carry the argument — no account, no API, no cloud. The
              whole book is always there; density only changes what&apos;s in
              focus, and collapsed text is quoted, never paraphrased.
            </p>
          </section>
        </div>

        <SheetFooter className="px-5 pb-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Marrow never uploads your books. Everything stays in this browser.
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Mount once per page (reader and library do) so the persisted reading
 *  preferences are applied to <html> before any reading surface renders. */
export function FontSizeBoot(): null {
  useEffect(() => {
    applyReadingStyle(getSettings());
  }, []);
  return null;
}
