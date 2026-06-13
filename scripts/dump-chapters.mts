/**
 * Tooling: run the real EPUB parser in Node (linkedom DOM shim) and dump
 * chapter blocks for algorithm evaluation. Not part of the app bundle.
 *
 *   npx tsx scripts/dump-chapters.ts            # list all chapters
 *   npx tsx scripts/dump-chapters.ts dump       # write JSON + labeler files
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOMParser } from "linkedom";

// parse.ts instantiates DOMParser lazily — shim before import side effects run
(globalThis as Record<string, unknown>).DOMParser = DOMParser;
// parse.ts reads Node.TEXT_NODE / Node.ELEMENT_NODE constants
(globalThis as Record<string, unknown>).Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };

const { parseEpub } = await import("../lib/epub/parse");

const SAMPLES = [
  { file: "alice-in-wonderland.epub", slug: "alice" },
  { file: "frankenstein.epub", slug: "frankenstein" },
  { file: "walden.epub", slug: "walden" },
];

const OUT = "/tmp/marrow-gold";
const mode = process.argv[2] ?? "list";
mkdirSync(OUT, { recursive: true });

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

for (const s of SAMPLES) {
  const buf = readFileSync(join("public/samples", s.file));
  const parsed = await parseEpub(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  console.log(`\n=== ${s.slug}: ${parsed.title} — ${parsed.author} ===`);
  parsed.chapters.forEach((ch, i) => {
    const words = ch.blocks.reduce((n, b) => n + b.wordCount, 0);
    console.log(
      `  [${i}] ${ch.title.slice(0, 50).padEnd(50)} blocks=${ch.blocks.length} words=${words}`,
    );
  });

  if (mode === "dump") {
    writeFileSync(
      join(OUT, `${s.slug}.json`),
      JSON.stringify(
        {
          title: parsed.title,
          author: parsed.author,
          chapters: parsed.chapters.map((ch, i) => ({
            index: i,
            title: ch.title,
            blocks: ch.blocks,
          })),
        },
        null,
        1,
      ),
    );
    // labeler-friendly plain-text files per mid-size chapter
    parsed.chapters.forEach((ch, i) => {
      const words = ch.blocks.reduce((n, b) => n + b.wordCount, 0);
      if (ch.blocks.length < 30 || ch.blocks.length > 280 || words < 1200) return;
      const lines = ch.blocks.map((b) => {
        const t =
          b.type === "img"
            ? `[image: ${/alt="([^"]*)"/.exec(b.html)?.[1] ?? ""}]`
            : b.type === "hr"
              ? "[horizontal rule]"
              : plain(b.html);
        return `[${b.id}] (${b.type}) ${t}`;
      });
      writeFileSync(
        join(OUT, `${s.slug}-ch${i}.txt`),
        `BOOK: ${parsed.title} — ${parsed.author}\nCHAPTER: ${ch.title}\nBLOCKS: ${ch.blocks.length}  WORDS: ${words}\n\n${lines.join("\n")}\n`,
      );
    });
  }
}
