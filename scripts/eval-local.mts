/**
 * Tooling: score lib/analysis/local.ts against gold tier labels produced by
 * capable readers on real chapters, then coordinate-descent the tuning
 * constants. Not part of the app bundle.
 *
 *   npx tsx scripts/eval-local.mts          # score DEFAULT_TUNING
 *   npx tsx scripts/eval-local.mts tune     # coordinate descent, print best
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLocalAnalysis, DEFAULT_TUNING, type Tuning } from "../lib/analysis/local";
import type { Block, Tier } from "../lib/types";

const GOLD_DIR = "/tmp/marrow-gold";

interface LabelSet {
  file: string; // e.g. "walden-ch22.txt"
  labeler: string;
  tiers: { id: string; tier: number }[];
}

interface Case {
  name: string;
  blocks: Block[];
  gold: Map<string, Tier>; // merged labels; ambiguous blocks excluded
}

function loadCases(): Case[] {
  const labels = JSON.parse(
    readFileSync(join(GOLD_DIR, "labels.json"), "utf8"),
  ) as LabelSet[];
  const books = new Map<string, { chapters: { index: number; blocks: Block[] }[] }>();
  for (const slug of ["alice", "frankenstein", "walden"]) {
    books.set(slug, JSON.parse(readFileSync(join(GOLD_DIR, `${slug}.json`), "utf8")));
  }

  const byFile = new Map<string, LabelSet[]>();
  for (const l of labels) {
    byFile.set(l.file, [...(byFile.get(l.file) ?? []), l]);
  }

  const cases: Case[] = [];
  for (const [file, sets] of byFile) {
    const m = /^([a-z]+)-ch(\d+)\.txt$/.exec(file);
    if (!m) continue;
    const book = books.get(m[1]);
    const chapter = book?.chapters.find((c) => c.index === Number(m[2]));
    if (!chapter) continue;

    const gold = new Map<string, Tier>();
    const a = new Map(sets[0].tiers.map((t) => [t.id, t.tier]));
    const b = sets[1] ? new Map(sets[1].tiers.map((t) => [t.id, t.tier])) : a;
    for (const block of chapter.blocks) {
      const ta = a.get(block.id);
      const tb = b.get(block.id);
      if (ta === undefined || tb === undefined) continue;
      if (Math.abs(ta - tb) >= 2) continue; // labelers disagree — exclude
      gold.set(block.id, Math.round((ta + tb) / 2) as Tier);
    }
    cases.push({ name: file.replace(".txt", ""), blocks: chapter.blocks, gold });
  }
  return cases;
}

interface Score {
  exact: number;
  adjacent: number;
  t0f1: number; // word-weighted tier-0 F1 (what Marrow shows)
  skimF1: number; // word-weighted "visible at Skim" (tier<=1) F1
  objective: number;
}

function scoreCase(c: Case, tuning: Tuning): Score {
  const analysis = buildLocalAnalysis("x", 0, c.blocks, tuning);
  const words = new Map(c.blocks.map((b) => [b.id, b.wordCount]));

  let okExact = 0;
  let okAdj = 0;
  let total = 0;
  let tp0 = 0, fp0 = 0, fn0 = 0;
  let tpS = 0, fpS = 0, fnS = 0;
  for (const [id, gold] of c.gold) {
    const pred = analysis.tiers[id];
    if (pred === undefined) continue;
    const w = words.get(id) ?? 0;
    total++;
    if (pred === gold) okExact++;
    if (Math.abs(pred - gold) <= 1) okAdj++;
    if (pred === 0 && gold === 0) tp0 += w;
    else if (pred === 0) fp0 += w;
    else if (gold === 0) fn0 += w;
    const predS = pred <= 1, goldS = gold <= 1;
    if (predS && goldS) tpS += w;
    else if (predS) fpS += w;
    else if (goldS) fnS += w;
  }
  const f1 = (tp: number, fp: number, fn: number) =>
    tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
  const t0f1 = f1(tp0, fp0, fn0);
  const skimF1 = f1(tpS, fpS, fnS);
  const exact = okExact / Math.max(1, total);
  const adjacent = okAdj / Math.max(1, total);
  return {
    exact,
    adjacent,
    t0f1,
    skimF1,
    objective: 0.4 * t0f1 + 0.25 * skimF1 + 0.2 * adjacent + 0.15 * exact,
  };
}

function scoreAll(cases: Case[], tuning: Tuning): { mean: Score; per: [string, Score][] } {
  const per: [string, Score][] = cases.map((c) => [c.name, scoreCase(c, tuning)]);
  const mean = { exact: 0, adjacent: 0, t0f1: 0, skimF1: 0, objective: 0 };
  for (const [, s] of per) {
    mean.exact += s.exact / per.length;
    mean.adjacent += s.adjacent / per.length;
    mean.t0f1 += s.t0f1 / per.length;
    mean.skimF1 += s.skimF1 / per.length;
    mean.objective += s.objective / per.length;
  }
  return { mean, per };
}

const fmt = (s: Score) =>
  `obj=${s.objective.toFixed(3)} t0F1=${s.t0f1.toFixed(3)} skimF1=${s.skimF1.toFixed(3)} adj=${s.adjacent.toFixed(3)} exact=${s.exact.toFixed(3)}`;

const cases = loadCases();
console.log(
  `cases: ${cases.map((c) => `${c.name}(${c.gold.size}/${c.blocks.length})`).join(", ")}\n`,
);

if (process.argv[2] !== "tune") {
  const { mean, per } = scoreAll(cases, DEFAULT_TUNING);
  for (const [name, s] of per) console.log(`  ${name.padEnd(20)} ${fmt(s)}`);
  console.log(`  ${"MEAN".padEnd(20)} ${fmt(mean)}`);
} else {
  // coordinate descent over a candidate grid, two passes
  const grid: Partial<Record<keyof Tuning, number[]>> = {
    wRank: [0.2, 0.3, 0.4, 0.5],
    wLuhn: [0.15, 0.25, 0.35],
    wNovelty: [0.15, 0.25, 0.35, 0.45],
    window: [20, 40, 60],
    leadMult: [1.2, 1.35, 1.55, 1.8],
    closeMult: [1.0, 1.15, 1.3],
    defMult: [1.2, 1.45, 1.7],
    argMult: [1.1, 1.3, 1.5],
    dataMult: [1.0, 1.2],
    exampleMult: [0.55, 0.7, 0.85],
    recapMult: [0.4, 0.5, 0.65],
    dialogueMult: [0.6, 0.75, 0.9],
    shortMult: [0.45, 0.6, 0.8],
    gnomicMult: [1.6, 2.2, 3.0, 4.0],
    anecdoteMult: [0.45, 0.65, 0.85],
    pivotMult: [1.5, 2.2, 3.0],
    maxCoreWords: [300, 400, 600, 100000],
    share0: [0.15, 0.18, 0.22, 0.26, 0.3],
    share1: [0.45, 0.5, 0.55, 0.6],
    share2: [0.72, 0.78, 0.84],
    sectionCoreMinWords: [100, 150, 250],
    mmrSim: [0.45, 0.6, 0.8],
    fictionDialogueShare: [0.1, 0.15, 0.22],
  };
  let best: Tuning = { ...DEFAULT_TUNING };
  let bestScore = scoreAll(cases, best).mean.objective;
  console.log(`start: obj=${bestScore.toFixed(4)}`);
  for (let pass = 0; pass < 3; pass++) {
    for (const key of Object.keys(grid) as (keyof Tuning)[]) {
      for (const v of grid[key] ?? []) {
        const candidate = { ...best, [key]: v };
        const s = scoreAll(cases, candidate).mean.objective;
        if (s > bestScore + 1e-6) {
          bestScore = s;
          best = candidate;
          console.log(`  pass${pass} ${key}=${v} -> obj=${s.toFixed(4)}`);
        }
      }
    }
  }
  console.log(`\nBEST obj=${bestScore.toFixed(4)}`);
  console.log(JSON.stringify(best, null, 2));
  const { per, mean } = scoreAll(cases, best);
  for (const [name, s] of per) console.log(`  ${name.padEnd(20)} ${fmt(s)}`);
  console.log(`  ${"MEAN".padEnd(20)} ${fmt(mean)}`);
}

// debug mode: show gold vs pred per block for a case
if (process.argv[2] === "debug") {
  const name = process.argv[3];
  const c = cases.find((x) => x.name === name);
  if (!c) throw new Error("no case " + name);
  const analysis = buildLocalAnalysis("x", 0, c.blocks, DEFAULT_TUNING);
  for (const b of c.blocks) {
    const gold = c.gold.get(b.id);
    const pred = analysis.tiers[b.id];
    const text = b.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
    const mark = gold === 0 || pred === 0 ? (gold === 0 && pred === 0 ? "==" : gold === 0 ? "MISS" : "FP") : "";
    console.log(`${b.id.padEnd(5)} gold=${gold ?? "-"} pred=${pred} w=${String(b.wordCount).padStart(4)} ${mark.padEnd(4)} ${text}`);
  }
}
