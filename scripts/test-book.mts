/**
 * Run the shipped on-device heuristic on a real EPUB and SHOW what survives at
 * Marrow level, so we can judge whether the kept text reads like the argument.
 *
 *   npx tsx scripts/test-book.mts "<path-to.epub>" [chapterIndex]
 */
import { readFileSync } from "node:fs";
import { DOMParser } from "linkedom";

(globalThis as Record<string, unknown>).DOMParser = DOMParser;
(globalThis as Record<string, unknown>).Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };

const { parseEpub } = await import("../lib/epub/parse");
const { buildLocalAnalysis } = await import("../lib/analysis/local");
const { tierOf } = await import("../lib/density");
import type { Block } from "../lib/types";

const path = process.argv[2];
const onlyIdx = process.argv[3] ? Number(process.argv[3]) : null;
const buf = readFileSync(path);
const parsed = await parseEpub(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
);

console.log(`\n=== ${parsed.title} — ${parsed.author} ===`);
parsed.chapters.forEach((ch, i) => {
  const w = ch.blocks.reduce((n, b) => n + b.wordCount, 0);
  console.log(`  [${i}] ${ch.title.slice(0, 46).padEnd(46)} blocks=${String(ch.blocks.length).padStart(3)} words=${w}`);
});

const plain = (h: string) =>
  h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
   .replace(/\s+/g, " ").trim();
const isHeading = (b: Block) => b.type === "h1" || b.type === "h2" || b.type === "h3";

// pick chapters to showcase: substantial content chapters
const candidates = parsed.chapters
  .map((ch, i) => ({ ch, i, w: ch.blocks.reduce((n, b) => n + b.wordCount, 0) }))
  .filter((x) => (onlyIdx !== null ? x.i === onlyIdx : x.w >= 1500));
const picks = onlyIdx !== null ? candidates : candidates.slice(0, 2);

for (const { ch, i, w } of picks) {
  const a = buildLocalAnalysis("book", i, ch.blocks);
  const counts = [0, 0, 0, 0];
  const tierWords = [0, 0, 0, 0];
  for (const b of ch.blocks) {
    const t = tierOf(b, a);
    counts[t]++; tierWords[t] += b.wordCount;
  }
  const marrowWords = tierWords[0];
  console.log(`\n\n############ [${i}] ${ch.title} ############`);
  console.log(`total: ${ch.blocks.length} blocks, ${w} words (~${(w / 250).toFixed(0)} min full read)`);
  console.log(`tier blocks: 0=${counts[0]} 1=${counts[1]} 2=${counts[2]} 3=${counts[3]}`);
  console.log(`tier words:  0=${tierWords[0]} 1=${tierWords[1]} 2=${tierWords[2]} 3=${tierWords[3]}`);
  console.log(`MARROW keeps ${marrowWords} words (${((100 * marrowWords) / w).toFixed(0)}% of chapter, ~${(marrowWords / 250).toFixed(1)} min read)\n`);

  console.log(`--- THE MARROW (what survives at the densest setting) ---`);
  let shown = 0;
  for (const b of ch.blocks) {
    if (tierOf(b, a) !== 0) continue;
    const txt = plain(b.html);
    if (!txt) continue;
    const mark = isHeading(b) ? "§ " : "• ";
    console.log(`${mark}${txt.split(" ").slice(0, 45).join(" ")}${txt.split(" ").length > 45 ? "…" : ""}`);
    if (++shown >= 18) { console.log("  …(more)"); break; }
  }
}
