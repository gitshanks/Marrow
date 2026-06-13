/**
 * Marrow — shared data model.
 *
 * CONTRACT FILE: do not change shapes without updating CONTRACTS.md and every
 * consumer. All persisted objects live in IndexedDB via lib/db.ts.
 */

export type BlockType =
  | "h1"
  | "h2"
  | "h3"
  | "p"
  | "blockquote"
  | "li"
  | "img"
  | "hr";

/** One flattened block of a chapter. `html` is verbatim book content (inline
 *  formatting preserved, scripts/styles stripped). Never AI-generated. */
export interface Block {
  /** Stable within a chapter: "b0", "b1", ... in document order. */
  id: string;
  type: BlockType;
  html: string;
  wordCount: number;
}

export interface ChapterRef {
  index: number;
  title: string;
  /** spine item href inside the EPUB container */
  href: string;
  wordCount: number;
}

export interface Book {
  /** sha256 hex of the imported file — natural dedupe key */
  id: string;
  title: string;
  author: string;
  coverBlob?: Blob;
  spine: ChapterRef[];
  addedAt: number;
}

export interface ChapterContent {
  /** `${bookId}:${chapterIndex}` */
  key: string;
  bookId: string;
  chapterIndex: number;
  blocks: Block[];
}

/** Binary asset (image) extracted from the EPUB. Block html references it as
 *  src="marrow-asset:<href>" and the reader resolves it to an object URL. */
export interface BookAsset {
  /** `${bookId}:${href}` */
  key: string;
  bookId: string;
  /** normalized path inside the EPUB container, e.g. "OEBPS/images/cover.jpg" */
  href: string;
  blob: Blob;
}

/**
 * Tiers (assigned per block by the analysis model):
 * 0 Core — thesis statements, definitions, key claims, conclusions, data points
 * 1 Supporting — necessary reasoning, evidence, context that earns the claim
 * 2 Illustrative — examples, anecdotes, case studies repeating a made point
 * 3 Fluff — throat-clearing, recaps, padding
 * Headings are always tier 0. Images/blockquotes default to tier 1.
 */
export type Tier = 0 | 1 | 2 | 3;

/** One-line label for a contiguous collapsed run of blocks: the passage's own
 *  opening words, verbatim and quoted. Styled as UI chrome in the reader —
 *  never presented as (or instead of) the author's prose. */
export interface GistRun {
  startId: string;
  endId: string;
  gist: string;
}

/** Produced on-device by lib/analysis/local.ts — no network, no setup. */
export interface Analysis {
  bookId: string;
  chapterIndex: number;
  /** blockId -> tier, covering every block id in the chapter */
  tiers: Record<string, Tier>;
  /** runs of consecutive tier 2–3 blocks (collapse at Skim) */
  skimRuns: GistRun[];
  /** runs of consecutive tier 1–3 blocks (collapse at Marrow) */
  marrowRuns: GistRun[];
}

/** The four slider detents. 100=Full, 75=Focus, 50=Skim, 25=Marrow. */
export type DensityLevel = 100 | 75 | 50 | 25;

export interface Bookmark {
  /** `${bookId}:${chapterIndex}:${blockId}` */
  id: string;
  bookId: string;
  chapterIndex: number;
  blockId: string;
  /** short verbatim excerpt of the bookmarked block, for the list */
  excerpt: string;
  createdAt: number;
}

export const bookmarkId = (
  bookId: string,
  chapterIndex: number,
  blockId: string,
) => `${bookId}:${chapterIndex}:${blockId}`;

export interface ReadingState {
  bookId: string;
  chapterIndex: number;
  /** topmost visible block id — restore scroll position to this block */
  anchorBlockId: string | null;
  density: DensityLevel;
  updatedAt: number;
}

export const chapterKey = (bookId: string, chapterIndex: number) =>
  `${bookId}:${chapterIndex}`;

export const assetKey = (bookId: string, href: string) => `${bookId}:${href}`;
