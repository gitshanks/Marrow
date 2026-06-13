/**
 * Marrow — density engine (pure functions, no React).
 *
 * CONTRACT FILE: maps (blocks, analysis, density level, expanded runs) to the
 * list of items the reader renders. The author's text is always verbatim —
 * density only changes which blocks are in focus, dimmed, or collapsed behind
 * a gist pill the user can tap to expand.
 */
import type { Analysis, Block, DensityLevel, Tier } from "@/lib/types";

/** Slider detents in slider order (left/down = densest skim). */
export const DENSITY_LEVELS: readonly DensityLevel[] = [25, 50, 75, 100];

export const DENSITY_LABELS: Record<DensityLevel, string> = {
  100: "Full",
  75: "Focus",
  50: "Skim",
  25: "Marrow",
};

/** Weights for tier-weighted reading progress. */
export const TIER_WEIGHTS: Record<Tier, number> = {
  0: 1,
  1: 0.7,
  2: 0.4,
  3: 0.15,
};

export type RenderItem =
  | {
      kind: "block";
      block: Block;
      tier: Tier;
      /** Focus level renders tier-3 blocks dimmed instead of hiding them */
      dimmed: boolean;
      /** true when this block is shown because its run was expanded */
      expanded: boolean;
    }
  | {
      kind: "run";
      /** stable id: `${startId}:${endId}` — used in expandedRuns */
      id: string;
      blocks: Block[];
      /** AI gist (UI chrome, not prose); absent if the model gave none */
      gist?: string;
      wordCount: number;
    };

/** Headings are always tier 0 regardless of what the model returned. */
export function tierOf(block: Block, analysis: Analysis): Tier {
  if (block.type === "h1" || block.type === "h2" || block.type === "h3")
    return 0;
  return analysis.tiers[block.id] ?? 1;
}

export const runId = (startId: string, endId: string) => `${startId}:${endId}`;

/**
 * Compute the render list for a density level.
 * - 100 Full: every block, untouched.
 * - 75 Focus: every block; tier 3 dimmed.
 * - 50 Skim: maximal runs of consecutive tier>=2 blocks collapse into a pill.
 * - 25 Marrow: only tier 0 survives; runs of consecutive tier>=1 collapse.
 * Runs listed in `expandedRuns` render their blocks inline instead.
 */
export function computeLayout(
  blocks: Block[],
  analysis: Analysis,
  level: DensityLevel,
  expandedRuns: ReadonlySet<string>,
): RenderItem[] {
  if (level === 100 || level === 75) {
    return blocks.map((block) => {
      const tier = tierOf(block, analysis);
      return {
        kind: "block",
        block,
        tier,
        dimmed: level === 75 && tier === 3,
        expanded: false,
      };
    });
  }

  const collapseAt: Tier = level === 50 ? 2 : 1;
  const gists = buildGistLookup(
    level === 50 ? analysis.skimRuns : analysis.marrowRuns,
    blocks,
  );

  const items: RenderItem[] = [];
  let pending: Block[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const id = runId(pending[0].id, pending[pending.length - 1].id);
    if (expandedRuns.has(id)) {
      for (const block of pending) {
        items.push({
          kind: "block",
          block,
          tier: tierOf(block, analysis),
          dimmed: false,
          expanded: true,
        });
      }
    } else {
      items.push({
        kind: "run",
        id,
        blocks: pending,
        gist: gists(pending),
        wordCount: pending.reduce((n, b) => n + b.wordCount, 0),
      });
    }
    pending = [];
  };

  for (const block of blocks) {
    const tier = tierOf(block, analysis);
    if (tier >= collapseAt) {
      pending.push(block);
    } else {
      flush();
      items.push({ kind: "block", block, tier, dimmed: false, expanded: false });
    }
  }
  flush();
  return items;
}

/** Best gist for a structural run: exact start/end match, else max overlap. */
function buildGistLookup(
  runs: Analysis["skimRuns"],
  blocks: Block[],
): (run: Block[]) => string | undefined {
  const order = new Map(blocks.map((b, i) => [b.id, i]));
  const exact = new Map(runs.map((r) => [runId(r.startId, r.endId), r.gist]));
  return (run) => {
    const hit = exact.get(runId(run[0].id, run[run.length - 1].id));
    if (hit) return hit;
    const a0 = order.get(run[0].id) ?? 0;
    const a1 = order.get(run[run.length - 1].id) ?? 0;
    let best: string | undefined;
    let bestOverlap = 0;
    for (const r of runs) {
      const b0 = order.get(r.startId);
      const b1 = order.get(r.endId);
      if (b0 === undefined || b1 === undefined) continue;
      const overlap = Math.min(a1, b1) - Math.max(a0, b0) + 1;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = r.gist;
      }
    }
    return best;
  };
}

/**
 * Tier-weighted progress through a chapter, 0..1, given the id of the last
 * block at or above the top of the viewport.
 */
export function weightedProgress(
  blocks: Block[],
  analysis: Analysis | undefined,
  lastSeenBlockId: string | null,
): number {
  const weight = (b: Block) =>
    b.wordCount * (analysis ? TIER_WEIGHTS[tierOf(b, analysis)] : 1);
  const total = blocks.reduce((n, b) => n + weight(b), 0);
  if (total === 0) return 0;
  if (lastSeenBlockId === null) return 0;
  let seen = 0;
  for (const b of blocks) {
    seen += weight(b);
    if (b.id === lastSeenBlockId) break;
  }
  return Math.min(1, seen / total);
}
