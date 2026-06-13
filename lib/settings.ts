/**
 * Marrow — user settings (localStorage).
 *
 * CONTRACT FILE. Everything is local; analysis runs on-device, so there is
 * no API key. Theme is handled separately by next-themes. Reading-surface
 * preferences are pushed onto <html> as CSS variables that .reading-prose
 * consumes (see app/globals.css), so the book restyles live without React.
 */
"use client";

import { useSyncExternalStore } from "react";

export type ReadingFontId = "literata" | "source-serif" | "schibsted";

export interface ReadingFont {
  id: ReadingFontId;
  label: string;
  /** CSS font-family stack; the families are registered in app/layout.tsx */
  stack: string;
  kind: "serif" | "sans";
}

export const READING_FONTS: ReadingFont[] = [
  {
    id: "literata",
    label: "Literata",
    stack: '"Literata", Georgia, serif',
    kind: "serif",
  },
  {
    id: "source-serif",
    label: "Source Serif",
    stack: '"Source Serif 4", Georgia, serif',
    kind: "serif",
  },
  {
    id: "schibsted",
    label: "Schibsted",
    stack: '"Schibsted Grotesk", system-ui, sans-serif',
    kind: "sans",
  },
];

/** reading column width presets, in rem (max-width of the prose) */
export const READING_WIDTHS = { narrow: 32, normal: 38, wide: 44 } as const;
export type ReadingWidthId = keyof typeof READING_WIDTHS;

export interface MarrowSettings {
  /** reading font size in px (→ --reading-font-size on <html>) */
  fontSize: number;
  /** reading typeface (→ --reading-font-family) */
  fontFamily: ReadingFontId;
  /** line-height multiple, 1.4–2.0 (→ --reading-line-height) */
  lineHeight: number;
  /** column width preset (→ --reading-measure) */
  width: ReadingWidthId;
}

export const DEFAULT_SETTINGS: MarrowSettings = {
  fontSize: 19,
  fontFamily: "literata",
  lineHeight: 1.72,
  width: "normal",
};

const STORAGE_KEY = "marrow:settings";
const listeners = new Set<() => void>();
let cache: MarrowSettings | null = null;

function read(): MarrowSettings {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<MarrowSettings>) : null;
    // pick known fields only, with validation — older versions stored other shapes
    cache = {
      fontSize:
        typeof stored?.fontSize === "number"
          ? stored.fontSize
          : DEFAULT_SETTINGS.fontSize,
      fontFamily: READING_FONTS.some((f) => f.id === stored?.fontFamily)
        ? (stored!.fontFamily as ReadingFontId)
        : DEFAULT_SETTINGS.fontFamily,
      lineHeight:
        typeof stored?.lineHeight === "number"
          ? stored.lineHeight
          : DEFAULT_SETTINGS.lineHeight,
      width:
        stored?.width && stored.width in READING_WIDTHS
          ? (stored.width as ReadingWidthId)
          : DEFAULT_SETTINGS.width,
    };
  } catch {
    cache = DEFAULT_SETTINGS;
  }
  return cache;
}

export function getSettings(): MarrowSettings {
  return read();
}

export function updateSettings(patch: Partial<MarrowSettings>): void {
  const next = { ...read(), ...patch };
  cache = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  applyReadingStyle(next);
  listeners.forEach((l) => l());
}

/** Push every reading-surface preference onto <html> as CSS variables. */
export function applyReadingStyle(s: MarrowSettings = read()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--reading-font-size", `${s.fontSize / 16}rem`);
  root.setProperty(
    "--reading-font-family",
    READING_FONTS.find((f) => f.id === s.fontFamily)?.stack ??
      READING_FONTS[0].stack,
  );
  root.setProperty("--reading-line-height", `${s.lineHeight}`);
  root.setProperty("--reading-measure", `${READING_WIDTHS[s.width]}rem`);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live settings hook. SSR-safe (returns defaults on the server). */
export function useSettings(): MarrowSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS);
}
