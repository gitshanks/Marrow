/**
 * Marrow — export the "marrow view" of a book as markdown.
 *
 * Reuses the density engine at the Marrow level (25): tier-0 blocks appear
 * verbatim; every collapsed run becomes an italic gist line marked as elision.
 * AI text is clearly labeled — the author's words are never paraphrased.
 */
import { db, getChapter } from "@/lib/db";
import { computeLayout } from "@/lib/density";
import { buildLocalAnalysis } from "@/lib/analysis/local";
import type { Block } from "@/lib/types";

export interface MarrowExport {
  markdown: string;
  filename: string;
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function blockToMarkdown(block: Block): string {
  const text = htmlToText(block.html);
  switch (block.type) {
    case "h1":
      return `## ${text}`;
    case "h2":
      return `### ${text}`;
    case "h3":
      return `#### ${text}`;
    case "blockquote":
      return text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "li":
      return `- ${text}`;
    case "hr":
      return "---";
    case "img":
      return ""; // images are skipped in the text export
    default:
      return text;
  }
}

export async function exportMarrowMarkdown(
  bookId: string,
): Promise<MarrowExport> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found.");

  const lines: string[] = [
    `# ${book.title}`,
    "",
    `*${book.author}*`,
    "",
    `> Marrow view exported from Marrow — the author's core passages, verbatim. Asterisk lines stand in for elided text; the quote is the hidden passage's own opening words.`,
    "",
  ];

  for (const ref of book.spine) {
    const chapter = await getChapter(bookId, ref.index);
    if (!chapter || chapter.blocks.length === 0) continue;

    const analysis = buildLocalAnalysis(bookId, ref.index, chapter.blocks);
    const items = computeLayout(chapter.blocks, analysis, 25, new Set());
    const startsWithHeading =
      items[0]?.kind === "block" && items[0].block.type.startsWith("h");
    if (!startsWithHeading) lines.push(`## ${ref.title}`, "");
    for (const item of items) {
      if (item.kind === "block") {
        const md = blockToMarkdown(item.block);
        if (md) lines.push(md, "");
      } else {
        const gist = item.gist ? `*${item.gist}*` : "*passage elided*";
        lines.push(`> ✳︎ ${gist} — ${item.wordCount.toLocaleString()} words elided`, "");
      }
    }
  }

  const filename =
    book.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) + "-marrow.md";

  return { markdown: lines.join("\n"), filename };
}

/** Trigger a client-side download of the markdown text. */
export function downloadMarkdown(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
