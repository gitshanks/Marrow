/**
 * Marrow — on-device chapter analysis. No network, no setup, no AI.
 *
 * Three complementary salience signals, combined and shaped by structure:
 *
 *  1. Centrality — windowed TextRank over a block-similarity graph (cosine
 *     over log-weighted significant terms). Blocks the rest of the chapter
 *     keeps "talking about" are load-bearing.
 *  2. Salience — Luhn-style density of the chapter's significant terms.
 *  3. Novelty — credit to the block where an important term FIRST appears
 *     (definitions and introductions read as core).
 *
 * Structure then shapes the scores: section-lead/closing bias, genre
 * detection (dialogue-share) that reweights cues for fiction vs. essay,
 * definition/argument/data boosts, example/recap/dialogue damping, and a
 * section quota so every section keeps its thread at Marrow. Tiers are
 * assigned by word-share quantiles so Marrow stays a 2–4 minute read.
 *
 * Pure, deterministic, dependency-free; ~10ms for a 100-block chapter.
 * Constants live in DEFAULT_TUNING and were fitted against gold tier labels
 * on real chapters (Thoreau, Carroll, Shelley) — see scripts/eval-local.mts.
 */
import type { Analysis, Block, GistRun, Tier } from "../types";

export interface Tuning {
  /** signal mix (sums to ~1) */
  wRank: number;
  wLuhn: number;
  wNovelty: number;
  /** TextRank neighborhood (± blocks) and iteration */
  window: number;
  damping: number;
  iters: number;
  /** structural multipliers */
  leadMult: number;
  closeMult: number;
  /** cue multipliers */
  defMult: number;
  argMult: number;
  dataMult: number;
  exampleMult: number;
  recapMult: number;
  dialogueMult: number;
  shortMult: number;
  /** essays: aphoristic present-tense generalizations are the argument */
  gnomicMult: number;
  /** essays: past-tense personal anecdotes are illustration */
  anecdoteMult: number;
  /** fiction: pivot beats (consequences, decisive moments) carry the plot */
  pivotMult: number;
  /** cumulative word-share boundaries for tiers 0 | 1 | 2 */
  share0: number;
  share1: number;
  share2: number;
  /** sections at least this many words are guaranteed one tier-0 block */
  sectionCoreMinWords: number;
  /** blocks longer than this can't be tier 0 — never "skeleton" material */
  maxCoreWords: number;
  /** same-section tier-0 candidates above this cosine demote (redundancy) */
  mmrSim: number;
  /** word-weighted dialogue share above which the chapter reads as fiction */
  fictionDialogueShare: number;
}

/* Fitted by coordinate descent against gold tier labels on five real
 * chapters (Thoreau ×2, Carroll ×2, Shelley) — see scripts/eval-local.mts.
 * Mean tier-0 F1 0.42, Skim-visibility F1 0.65, adjacent-tier 0.85
 * (inter-labeler human ceiling: adjacent 0.99, exact 0.80); chosen over
 * configs with a higher scalar mean that collapsed fiction tier-0. */
export const DEFAULT_TUNING: Tuning = {
  wRank: 0.4,
  wLuhn: 0.25,
  wNovelty: 0.3,
  window: 40,
  damping: 0.85,
  iters: 12,
  leadMult: 1.35,
  closeMult: 1.0,
  defMult: 1.45,
  argMult: 1.1,
  dataMult: 1.0,
  exampleMult: 0.7,
  recapMult: 0.5,
  dialogueMult: 0.6,
  shortMult: 0.6,
  gnomicMult: 2.2,
  anecdoteMult: 0.45,
  pivotMult: 2.2,
  share0: 0.22,
  share1: 0.6,
  share2: 0.84,
  sectionCoreMinWords: 150,
  maxCoreWords: 400,
  mmrSim: 0.6,
  fictionDialogueShare: 0.15,
};

const STOPWORDS = new Set(
  (
    "a an the and or but nor so yet for of in on at to from by with without " +
    "about into over after before between under above out off up down again " +
    "is are was were be been being am do does did doing have has had having " +
    "i you he she it we they me him her us them my your his its our their " +
    "this that these those there here when where which who whom whose what " +
    "why how all any both each few more most other some such no not only own " +
    "same than too very can will just should now then once as if because " +
    "while until though although s t don shan won shouldn wouldn couldn " +
    "said say says one two also may might must shall could would like went " +
    "came come go get got make made see saw know knew think thought upon " +
    "little much many still even never ever again away back well first last"
  ).split(/\s+/),
);

const DEFINITION_CUES =
  /\b(?:is defined as|means that|in other words|that is to say|refers to|the (?:key|point|principle|lesson|idea) (?:is|here)|i mean by)\b/i;
const ARGUMENT_CUES =
  /\b(?:therefore|thus|hence|consequently|in short|the upshot|crucially|in essence|fundamentally|the answer|must be|it follows)\b/i;
const EXAMPLE_CUES =
  /\b(?:for example|for instance|for one thing|consider the|imagine|suppose|suppose that|one day|once upon|case in point|to illustrate|such as when)\b/i;
const RECAP_CUES =
  /\b(?:in this chapter|in the (?:next|previous|last) chapter|as we (?:saw|discussed|noted)|as mentioned (?:earlier|above)|to recap|to summarize what|so far we)\b/i;
const DATA_CUES =
  /\d+(?:[.,]\d+)?\s*(?:%|percent|million|billion|dollars|acres|miles|feet)|\$\d|\b(?:17|18|19|20)\d{2}\b/;

/* Essay signals: the argument lives in aphoristic present-tense
 * generalizations; past-tense personal anecdotes illustrate it. */
const EVALUATIVE_CUES =
  /\b(?:most|best|finest|greatest|perfect|fairest|noblest|purest|truest|deepest|highest|essential|expressive)\b/i;
const GENERIC_SUBJECT =
  /(?:^|[.!?]\s+)[“"]?(?:A|An|The|No|Every|All|Such|Nothing|It|What|This|These|Men|We|You)\b[^.!?]{0,80}\b(?:is|are)\b/;
/* declarations of purpose read as core in essays and memoirs */
const CREDO_CUES =
  /\bbecause i (?:wished|wanted|hoped|meant)\b|\bi (?:resolved|determined|set out) to\b/i;
/* aphorisms speak in abstractions; descriptions speak in measurements */
const ABSTRACT_CUES =
  /\b(?:beauty|beautiful|character|nature|heaven|soul|spirit|life|truth|thought|world|god|earth|sky|light|love|wisdom|virtue|imagination|memory|eternity|silence|solitude|freedom|conscience|justice|moral)\b/i;
const MEASUREMENT_CUES =
  /\b(?:feet|foot|inches?|rods?|miles?|yards?|acres?|pounds?|degrees|fathoms?|per\s?cent)\b|\b\d/i;
const ANECDOTE_OPENER =
  /^[“"]?(?:sometimes|occasionally|once,?\s|one (?:day|evening|morning|afternoon|night|winter|summer)|in (?:warm|cold|such)\b|when i (?:first|was|had)|after (?:a|the|my|\w+ing))/i;

/* Fiction signals: pivot beats — decisive moments and their consequences. */
const PIVOT_CUES =
  /\b(?:suddenly|at last|at length|finally|at that moment|just then|all at once|began to|cried|exclaimed|declared|announced|insisted|resolved)\b/i;
const CONSEQUENCE_OPENER =
  /^(?:this (?:speech|question|answer|remark|proposal)|at this|whereupon|so they all|thereupon|on hearing)/i;

/** present-tense share of copular verbs — high in gnomic claims */
function presentCopulaRatio(text: string): number {
  const present = (text.match(/\b(?:is|are)\b/gi) ?? []).length;
  const past = (text.match(/\b(?:was|were|had been)\b/gi) ?? []).length;
  return present / (present + past + 1);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
}

const isHeading = (b: Block) =>
  b.type === "h1" || b.type === "h2" || b.type === "h3";
const isProse = (b: Block) =>
  !isHeading(b) && b.type !== "img" && b.type !== "hr";

/** Fraction of characters sitting inside quotation marks (dialogue). */
function dialogueRatio(text: string): number {
  if (text.length === 0) return 0;
  let inQuote = false;
  let quoted = 0;
  for (const ch of text) {
    if (ch === "“" || (ch === '"' && !inQuote)) inQuote = true;
    else if (ch === "”" || (ch === '"' && inQuote)) inQuote = false;
    else if (inQuote) quoted++;
  }
  return quoted / text.length;
}

/** Verbatim opening words of a run — the pill label. */
function excerptOf(blocks: Block[], texts: Map<string, string>): string {
  for (const b of blocks) {
    const text = texts.get(b.id) ?? "";
    if (!text) continue;
    const words = text.split(" ");
    const head = words.slice(0, 9).join(" ");
    return `“${head}${words.length > 9 ? "…" : ""}”`;
  }
  return "";
}

function buildRuns(
  blocks: Block[],
  tiers: Record<string, Tier>,
  minTier: Tier,
  texts: Map<string, string>,
): GistRun[] {
  const runs: GistRun[] = [];
  let current: Block[] = [];
  const flush = () => {
    if (current.length === 0) return;
    runs.push({
      startId: current[0].id,
      endId: current[current.length - 1].id,
      gist: excerptOf(current, texts),
    });
    current = [];
  };
  for (const b of blocks) {
    if ((tiers[b.id] ?? 1) >= minTier) current.push(b);
    else flush();
  }
  flush();
  return runs;
}

interface ProseInfo {
  block: Block;
  index: number; // position in blocks[]
  section: number;
  text: string;
  tokens: string[];
  vec: Map<string, number>; // significant-term vector
  norm: number;
  dialogue: number;
  example: boolean;
  recap: boolean;
  emb?: number[]; // optional dense sentence embedding
  embNorm?: number;
}

/** Block similarity for the centrality graph. Uses dense embeddings when both
 *  blocks carry one (semantic), else falls back to significant-term overlap. */
function cosine(a: ProseInfo, b: ProseInfo): number {
  if (a.emb && b.emb && a.embNorm && b.embNorm) {
    let dot = 0;
    for (let i = 0; i < a.emb.length; i++) dot += a.emb[i] * b.emb[i];
    return dot / (a.embNorm * b.embNorm);
  }
  if (a.norm === 0 || b.norm === 0) return 0;
  // iterate the smaller vector
  const [s, l] = a.vec.size <= b.vec.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of s.vec) {
    const lw = l.vec.get(t);
    if (lw !== undefined) dot += w * lw;
  }
  return dot / (a.norm * b.norm);
}

export function buildLocalAnalysis(
  bookId: string,
  chapterIndex: number,
  blocks: Block[],
  tuning: Tuning = DEFAULT_TUNING,
  /** optional precomputed dense embeddings per block id (experimental: when
   *  present, the centrality graph uses semantic similarity instead of
   *  significant-term overlap) */
  blockEmbeddings?: Map<string, number[]>,
): Analysis {
  const T = tuning;
  const texts = new Map<string, string>();
  for (const b of blocks) texts.set(b.id, plainText(b.html));
  const totalWords = blocks.reduce((n, b) => n + b.wordCount, 0);
  const tiers: Record<string, Tier> = {};

  const finish = (): Analysis => ({
    bookId,
    chapterIndex,
    tiers,
    skimRuns: buildRuns(blocks, tiers, 2, texts),
    marrowRuns: buildRuns(blocks, tiers, 1, texts),
  });

  // Tiny chapters (front matter, dedications): nothing is padding.
  if (totalWords < 250 || blocks.length < 5) {
    for (const b of blocks) tiers[b.id] = isHeading(b) ? 0 : 1;
    return finish();
  }

  /* ---------- term statistics ---------- */

  const freq = new Map<string, number>();
  const tokensOf = new Map<string, string[]>();
  for (const b of blocks) {
    if (!isProse(b)) continue;
    const toks = tokenize(texts.get(b.id) ?? "");
    tokensOf.set(b.id, toks);
    for (const w of toks) {
      if (!STOPWORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const termWeight = new Map<string, number>();
  for (const [t, n] of freq) if (n >= 2) termWeight.set(t, Math.log2(1 + n));

  /* ---------- per-block features ---------- */

  let section = 0;
  const prose: ProseInfo[] = [];
  const sectionOf = new Map<string, number>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (isHeading(b)) {
      tiers[b.id] = 0;
      section++;
      sectionOf.set(b.id, section);
      continue;
    }
    sectionOf.set(b.id, section);
    if (!isProse(b)) {
      tiers[b.id] = 1;
      continue;
    }
    const text = texts.get(b.id) ?? "";
    const toks = tokensOf.get(b.id) ?? [];
    const tf = new Map<string, number>();
    for (const w of toks) {
      const tw = termWeight.get(w);
      if (tw !== undefined) tf.set(w, (tf.get(w) ?? 0) + 1);
    }
    const vec = new Map<string, number>();
    let normSq = 0;
    for (const [t, n] of tf) {
      const w = (termWeight.get(t) ?? 0) * (1 + Math.log2(n));
      vec.set(t, w);
      normSq += w * w;
    }
    const emb = blockEmbeddings?.get(b.id);
    const embNorm = emb
      ? Math.sqrt(emb.reduce((s, x) => s + x * x, 0))
      : undefined;
    prose.push({
      block: b,
      index: i,
      section,
      text,
      tokens: toks,
      vec,
      norm: Math.sqrt(normSq),
      dialogue: dialogueRatio(text),
      example: EXAMPLE_CUES.test(text),
      recap: RECAP_CUES.test(text),
      emb,
      embNorm,
    });
  }
  if (prose.length === 0) return finish();

  /* ---------- genre ---------- */

  const proseWords = prose.reduce((n, p) => n + p.block.wordCount, 0);
  const dialogueShare =
    prose.reduce((n, p) => n + p.dialogue * p.block.wordCount, 0) /
    Math.max(1, proseWords);
  const fiction = dialogueShare > T.fictionDialogueShare;

  /* ---------- signal 1: windowed TextRank centrality ---------- */

  const n = prose.length;
  const edges: { to: number; w: number }[][] = Array.from(
    { length: n },
    () => [],
  );
  const outSum = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n && j <= i + T.window; j++) {
      const w = cosine(prose[i], prose[j]);
      if (w > 0.05) {
        edges[i].push({ to: j, w });
        edges[j].push({ to: i, w });
        outSum[i] += w;
        outSum[j] += w;
      }
    }
  }
  let rank = new Array<number>(n).fill(1 / n);
  for (let iter = 0; iter < T.iters; iter++) {
    const next = new Array<number>(n).fill((1 - T.damping) / n);
    for (let i = 0; i < n; i++) {
      if (outSum[i] === 0) continue;
      const share = (T.damping * rank[i]) / outSum[i];
      for (const e of edges[i]) next[e.to] += share * e.w;
    }
    rank = next;
  }

  /* ---------- signals 2 & 3: salience + novelty ---------- */

  const firstSeen = new Map<string, number>(); // term -> prose idx of first use
  for (let i = 0; i < n; i++) {
    for (const t of prose[i].vec.keys()) {
      if (!firstSeen.has(t)) firstSeen.set(t, i);
    }
  }
  const luhn = new Array<number>(n).fill(0);
  const novelty = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = prose[i];
    const damp = Math.sqrt(p.tokens.length + 10);
    let l = 0;
    for (const w of p.tokens) l += termWeight.get(w) ?? 0;
    luhn[i] = l / damp;
    let nov = 0;
    for (const t of p.vec.keys()) {
      if (firstSeen.get(t) === i) nov += termWeight.get(t) ?? 0;
    }
    novelty[i] = nov / damp;
  }

  const meanOf = (xs: number[]) =>
    xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length) || 1;
  const mRank = meanOf(rank);
  const mLuhn = meanOf(luhn);
  const mNov = meanOf(novelty);

  /* ---------- combine + structural/cue multipliers ---------- */

  const score = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = prose[i];
    let s =
      T.wRank * (rank[i] / mRank) +
      T.wLuhn * (luhn[i] / mLuhn) +
      T.wNovelty * (novelty[i] / mNov);

    const prevBlock = p.index > 0 ? blocks[p.index - 1] : undefined;
    const nextBlock =
      p.index + 1 < blocks.length ? blocks[p.index + 1] : undefined;
    if (p.index === 0 || (prevBlock && isHeading(prevBlock))) s *= T.leadMult;
    if (!nextBlock || isHeading(nextBlock)) s *= T.closeMult;

    if (DEFINITION_CUES.test(p.text)) s *= T.defMult;
    if (ARGUMENT_CUES.test(p.text)) s *= T.argMult;
    if (p.example) s *= T.exampleMult;
    if (p.recap) s *= T.recapMult;

    if (fiction) {
      // pivot beats: a decisive moment, or a block whose successor reacts.
      // Pivots are often short dialogue with weak term salience — lift to at
      // least average before boosting (the signals are orthogonal).
      const next = prose[i + 1];
      const pivotal =
        PIVOT_CUES.test(p.text) ||
        (next !== undefined && CONSEQUENCE_OPENER.test(next.text));
      if (pivotal) s = Math.max(s, 1) * T.pivotMult;
      if (p.dialogue > 0.6 && novelty[i] / mNov < 1.5 && !pivotal)
        s *= T.dialogueMult;
      if (p.tokens.length < 8) s *= Math.max(T.shortMult, 0.8);
    } else {
      if (DATA_CUES.test(p.text)) s *= T.dataMult;
      // Aphoristic generalization: predominantly present-tense copulas plus
      // a generic subject or evaluative superlative. Aphorisms are short by
      // nature (long matches are descriptions with a reflective line inside)
      // and use abstract vocabulary that term salience undervalues — so gate
      // by length and lift to at least average before boosting.
      const gnomic =
        p.block.wordCount <= 300 &&
        presentCopulaRatio(p.text) >= 0.6 &&
        GENERIC_SUBJECT.test(p.text) &&
        (ABSTRACT_CUES.test(p.text) || EVALUATIVE_CUES.test(p.text)) &&
        !MEASUREMENT_CUES.test(p.text);
      const credo =
        p.block.wordCount <= 300 &&
        CREDO_CUES.test(p.text) &&
        ABSTRACT_CUES.test(p.text);
      if (gnomic || credo) s = Math.max(s, 1) * T.gnomicMult;
      // past-tense personal anecdote opener: illustration, not argument
      if (ANECDOTE_OPENER.test(p.text) && presentCopulaRatio(p.text) < 0.5)
        s *= T.anecdoteMult;
      if (p.tokens.length < 8) s *= T.shortMult;
    }

    score[i] = s;
  }

  /* ---------- tier assignment: section quotas + word-share quantiles ----- */

  const order = [...prose.keys()].sort((a, b) => score[b] - score[a]);

  // every substantial section keeps its best block at tier 0
  const guaranteed = new Set<number>();
  const bySection = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const list = bySection.get(prose[i].section) ?? [];
    list.push(i);
    bySection.set(prose[i].section, list);
  }
  for (const [, idxs] of bySection) {
    const words = idxs.reduce((s, i) => s + prose[i].block.wordCount, 0);
    if (words < T.sectionCoreMinWords) continue;
    let best = idxs[0];
    for (const i of idxs) if (score[i] > score[best]) best = i;
    guaranteed.add(best);
  }

  const tier0: number[] = [];
  const t0Budget = T.share0 * proseWords;
  let t0Spent = 0;
  let seenWords = 0;
  const assign = (i: number, tier: Tier) => {
    const p = prose[i];
    let t = tier;
    if (!guaranteed.has(i)) {
      if (p.example && t < 2) t = 2;
      if (p.recap) t = 3;
    }
    tiers[p.block.id] = t;
  };

  // guaranteed blocks spend tier-0 budget first
  for (const i of order) {
    if (!guaranteed.has(i)) continue;
    assign(i, 0);
    tier0.push(i);
    t0Spent += prose[i].block.wordCount;
    seenWords += prose[i].block.wordCount;
  }
  for (const i of order) {
    if (guaranteed.has(i)) continue;
    const at = seenWords / Math.max(1, proseWords);
    // Only words actually assigned tier 0 spend the core budget — an
    // ineligible block (too long, near-duplicate) must not lock out true
    // core blocks ranked after it. Eligible blocks can claim leftover core
    // budget while they'd otherwise still land in the supporting band.
    const eligible0 =
      t0Spent < t0Budget &&
      at < T.share1 &&
      prose[i].block.wordCount <= T.maxCoreWords &&
      !tier0.some(
        (j) =>
          prose[j].section === prose[i].section &&
          cosine(prose[i], prose[j]) >= T.mmrSim,
      );
    let tier: Tier;
    if (eligible0) {
      tier = 0;
      tier0.push(i);
      t0Spent += prose[i].block.wordCount;
    } else {
      tier = at < T.share1 ? 1 : at < T.share2 ? 2 : 3;
    }
    assign(i, tier);
    seenWords += prose[i].block.wordCount;
  }

  return finish();
}
