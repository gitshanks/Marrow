/**
 * Marrow — pure EPUB parsing (no persistence).
 *
 * Browser-only: relies on DOMParser. Turns an EPUB ArrayBuffer into metadata,
 * flattened chapter blocks, and the binary assets those blocks reference.
 * Block html is verbatim book content with only safe inline tags preserved.
 */
import JSZip from "jszip";
import type { Block, BlockType } from "@/lib/types";

export class EpubImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EpubImportError";
  }
}

export interface ParsedChapter {
  title: string;
  href: string;
  blocks: Block[];
}

export interface ParsedAsset {
  href: string;
  blob: Blob;
}

export interface ParsedEpub {
  title: string;
  author: string;
  coverBlob?: Blob;
  chapters: ParsedChapter[];
  assets: ParsedAsset[];
}

const ASSET_SCHEME = "marrow-asset:";

/** Inline tags preserved verbatim in block html (attributes stripped except a[href]). */
const SAFE_INLINE = new Set([
  "em",
  "i",
  "strong",
  "b",
  "a",
  "span",
  "small",
  "sub",
  "sup",
  "br",
  "cite",
  "q",
]);

/** Elements whose content never reaches the reader. */
const SKIP_TAGS = new Set([
  "script",
  "style",
  "template",
  "head",
  "title",
  "link",
  "meta",
  "base",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas",
  "noscript",
  "map",
  "form",
  "input",
  "button",
  "select",
  "textarea",
]);

/** Tags that terminate inline accumulation when walking a wrapper. */
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "center",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "img",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "svg",
  "table",
  "ul",
]);

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const XLINK_NS = "http://www.w3.org/1999/xlink";
const EPUB_OPS_NS = "http://www.idpf.org/2007/ops";

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Resolve an href against a base directory into a normalized zip entry path. */
function resolvePath(baseDir: string, href: string): string {
  let clean = href.split("#")[0].split("?")[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // keep raw on malformed escapes
  }
  const joined = clean.startsWith("/")
    ? clean.slice(1)
    : baseDir
      ? `${baseDir}/${clean}`
      : clean;
  const out: string[] = [];
  for (const part of joined.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function mimeFor(href: string, mediaTypes: Map<string, string>): string {
  const fromManifest = mediaTypes.get(href);
  if (fromManifest) return fromManifest;
  const ext = href.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/**
 * Keep only hrefs that can't break the reading session: same-document
 * fragments and web links. Relative document hrefs (cross-chapter footnotes
 * etc.) would hard-navigate the SPA to a 404 — drop them, keeping the text.
 */
function safeHref(raw: string | null): string | undefined {
  const href = raw?.trim();
  if (!href) return undefined;
  if (href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return undefined;
}

// ---------------------------------------------------------------------------
// Zip access (case-insensitive fallback for sloppy EPUBs)
// ---------------------------------------------------------------------------

interface ZipIndex {
  zip: JSZip;
  lower: Map<string, string>;
}

function indexZip(zip: JSZip): ZipIndex {
  const lower = new Map<string, string>();
  zip.forEach((relativePath) => {
    lower.set(relativePath.toLowerCase(), relativePath);
  });
  return { zip, lower };
}

/** Returns the actual (case-corrected) entry path, or undefined if absent. */
function resolveZipPath(index: ZipIndex, path: string): string | undefined {
  if (index.zip.file(path)) return path;
  const actual = index.lower.get(path.toLowerCase());
  return actual && index.zip.file(actual) ? actual : undefined;
}

async function zipText(index: ZipIndex, path: string): Promise<string | undefined> {
  const actual = resolveZipPath(index, path);
  return actual ? index.zip.file(actual)?.async("text") : undefined;
}

async function zipBlob(
  index: ZipIndex,
  path: string,
  mime: string,
): Promise<Blob | undefined> {
  const actual = resolveZipPath(index, path);
  const file = actual ? index.zip.file(actual) : null;
  if (!file) return undefined;
  const bytes = await file.async("uint8array");
  return new Blob([bytes as BlobPart], { type: mime });
}

// ---------------------------------------------------------------------------
// XML / XHTML parsing
// ---------------------------------------------------------------------------

// Lazy: this module is imported by client pages that Next still prerenders
// on the server, where DOMParser doesn't exist at module-evaluation time.
let parserInstance: DOMParser | undefined;
function getParser(): DOMParser {
  return (parserInstance ??= new DOMParser());
}

function parseXml(text: string, what: string): Document {
  const doc = getParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new EpubImportError(`Invalid EPUB: could not parse ${what}`);
  }
  return doc;
}

/** XHTML first, fall back to lenient HTML when the XML parser chokes. */
function parseChapterDoc(text: string): Document {
  const xhtml = getParser().parseFromString(text, "application/xhtml+xml");
  if (!xhtml.querySelector("parsererror")) return xhtml;
  return getParser().parseFromString(text, "text/html");
}

function firstByLocalName(root: Document | Element, name: string): Element | undefined {
  return root.getElementsByTagNameNS("*", name)[0];
}

function allByLocalName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}

function bodyOf(doc: Document): Element | undefined {
  return doc.body ?? firstByLocalName(doc, "body");
}

// ---------------------------------------------------------------------------
// Block flattening
// ---------------------------------------------------------------------------

type DraftBlock = Omit<Block, "id">;

interface FlattenCtx {
  index: ZipIndex;
  /** directory of the document currently being flattened */
  baseDir: string;
  /** resolved zip paths of every referenced image, filled while walking */
  neededAssets: Set<string>;
}

interface InlineResult {
  html: string;
  text: string;
}

/** Resolve an image reference to a zip path; undefined for external/missing. */
function resolveAsset(ctx: FlattenCtx, raw: string | null): string | undefined {
  const src = raw?.trim();
  if (!src || /^(https?|data|mailto|javascript):/i.test(src)) return undefined;
  const resolved = resolvePath(ctx.baseDir, src);
  return resolveZipPath(ctx.index, resolved);
}

function imgHtml(ctx: FlattenCtx, el: Element): string | undefined {
  const href = resolveAsset(ctx, el.getAttribute("src"));
  if (!href) return undefined;
  ctx.neededAssets.add(href);
  const alt = el.getAttribute("alt") ?? "";
  return `<img src="${escapeAttr(ASSET_SCHEME + href)}" alt="${escapeAttr(alt)}">`;
}

/** Inline <svg><image …> → plain img tags (the svg wrapper is dropped). */
function svgImagesHtml(ctx: FlattenCtx, svg: Element): string {
  let html = "";
  const alt = collapse(firstByLocalName(svg, "title")?.textContent ?? "");
  for (const image of allByLocalName(svg, "image")) {
    const raw =
      image.getAttributeNS(XLINK_NS, "href") ??
      image.getAttribute("xlink:href") ??
      image.getAttribute("href");
    const href = resolveAsset(ctx, raw);
    if (!href) continue;
    ctx.neededAssets.add(href);
    html += `<img src="${escapeAttr(ASSET_SCHEME + href)}" alt="${escapeAttr(alt)}">`;
  }
  return html;
}

/**
 * Sanitize a run of nodes into inline html + plain text. Safe inline tags are
 * kept (attributes rebuilt from scratch — only a[href] and img[src|alt]
 * survive); unknown wrappers are dropped but their content is preserved, with
 * a <br> seam after dropped block-level elements.
 */
function sanitizeNodes(ctx: FlattenCtx, nodes: Iterable<Node>): InlineResult {
  let html = "";
  let text = "";
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.nodeValue ?? "";
      html += escapeHtml(t);
      text += t;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.localName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (tag === "br") {
      html += "<br>";
      text += "\n";
      continue;
    }
    if (tag === "img") {
      html += imgHtml(ctx, el) ?? "";
      continue;
    }
    if (tag === "svg") {
      html += svgImagesHtml(ctx, el);
      continue;
    }
    if (SAFE_INLINE.has(tag)) {
      const inner = sanitizeNodes(ctx, Array.from(el.childNodes));
      let attrs = "";
      if (tag === "a") {
        const href = safeHref(el.getAttribute("href"));
        if (href) {
          attrs = ` href="${escapeAttr(href)}"`;
          if (!href.startsWith("#"))
            attrs += ` target="_blank" rel="noopener noreferrer"`;
        }
      }
      html += `<${tag}${attrs}>${inner.html}</${tag}>`;
      text += inner.text;
      continue;
    }
    // Dropped wrapper: keep content, mark block boundaries so paragraphs
    // nested inside (e.g. <p> within <blockquote>) stay visually separated.
    const inner = sanitizeNodes(ctx, Array.from(el.childNodes));
    html += inner.html;
    text += inner.text;
    if (BLOCK_TAGS.has(tag) && inner.text.trim()) {
      html += "<br>";
      text += "\n";
    }
  }
  return { html, text };
}

/** Trim whitespace and dangling <br> seams from a block's html. */
function tidyHtml(html: string): string {
  return html
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/^(?:\s|<br>)+/, "")
    .replace(/(?:\s*<br>\s*)+$/, "")
    .trim();
}

/** One img block per tag: only img-typed blocks get their marrow-asset: src
 *  resolved at render time, so an <img> left inline in text never loads. */
function pushImgBlocks(out: DraftBlock[], html: string): void {
  for (const img of html.match(/<img [^>]*>/g) ?? []) {
    out.push({ type: "img", html: img, wordCount: 0 });
  }
}

function pushSanitized(
  out: DraftBlock[],
  type: BlockType,
  inline: InlineResult,
): void {
  const words = countWords(inline.text);
  let html = tidyHtml(inline.html);
  if (words > 0) {
    if (html.includes("<img")) {
      // Mixed text + images: split the images out as adjacent img blocks.
      const withImgs = html;
      html = tidyHtml(html.replace(/<img [^>]*>/g, ""));
      if (html) out.push({ type, html, wordCount: words });
      pushImgBlocks(out, withImgs);
    } else {
      out.push({ type, html, wordCount: words });
    }
  } else if (html.includes("<img")) {
    // Image-only paragraph/heading/figure → one img block per image.
    pushImgBlocks(out, html);
  }
}

function emitLeaf(
  ctx: FlattenCtx,
  out: DraftBlock[],
  type: BlockType,
  el: Element,
): void {
  pushSanitized(out, type, sanitizeNodes(ctx, Array.from(el.childNodes)));
}

/** Table/pre keep only their plain text as a `p` block. */
function emitPlainText(out: DraftBlock[], el: Element, keepLines: boolean): void {
  const raw = el.textContent ?? "";
  const words = countWords(raw);
  if (words === 0) return;
  const html = keepLines
    ? escapeHtml(raw)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("<br>")
    : escapeHtml(collapse(raw));
  out.push({ type: "p", html, wordCount: words });
}

function emitListItem(ctx: FlattenCtx, out: DraftBlock[], li: Element): void {
  const content: Node[] = [];
  const nested: Element[] = [];
  for (const node of Array.from(li.childNodes)) {
    const tag =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element).localName.toLowerCase()
        : "";
    if (tag === "ul" || tag === "ol") nested.push(node as Element);
    else content.push(node);
  }
  pushSanitized(out, "li", sanitizeNodes(ctx, content));
  for (const list of nested) walkList(ctx, out, list);
}

/** Nested lists flatten in document order — every <li> becomes its own block. */
function walkList(ctx: FlattenCtx, out: DraftBlock[], list: Element): void {
  for (const child of Array.from(list.children)) {
    const tag = child.localName.toLowerCase();
    if (tag === "li") emitListItem(ctx, out, child);
    else if (tag === "ul" || tag === "ol") walkList(ctx, out, child);
  }
}

function handleBlockElement(
  ctx: FlattenCtx,
  out: DraftBlock[],
  tag: string,
  el: Element,
): void {
  switch (tag) {
    case "h1":
    case "h2":
      emitLeaf(ctx, out, tag, el);
      break;
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      emitLeaf(ctx, out, "h3", el);
      break;
    case "p":
      emitLeaf(ctx, out, "p", el);
      break;
    case "blockquote":
      emitLeaf(ctx, out, "blockquote", el);
      break;
    case "ul":
    case "ol":
      walkList(ctx, out, el);
      break;
    case "li":
      emitListItem(ctx, out, el);
      break;
    case "hr":
      out.push({ type: "hr", html: "", wordCount: 0 });
      break;
    case "img": {
      const html = imgHtml(ctx, el);
      if (html) out.push({ type: "img", html, wordCount: 0 });
      break;
    }
    case "svg": {
      // may hold several <image> elements — one img block per image
      pushImgBlocks(out, svgImagesHtml(ctx, el));
      break;
    }
    case "table":
      emitPlainText(out, el, false);
      break;
    case "pre":
      emitPlainText(out, el, true);
      break;
    default:
      // div/section/figure/etc — structural wrappers recurse.
      walkContainer(ctx, out, el);
  }
}

/**
 * Walk a wrapper's children. Stray inline content between block-level
 * children (common in loosely structured EPUBs) is gathered into `p` blocks.
 */
function walkContainer(ctx: FlattenCtx, out: DraftBlock[], el: Element): void {
  let inline: Node[] = [];
  const flushInline = () => {
    if (inline.length === 0) return;
    pushSanitized(out, "p", sanitizeNodes(ctx, inline));
    inline = [];
  };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      inline.push(node);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as Element;
    const tag = child.localName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (!BLOCK_TAGS.has(tag)) {
      inline.push(child);
      continue;
    }
    flushInline();
    handleBlockElement(ctx, out, tag, child);
  }
  flushInline();
}

function flattenBody(ctx: FlattenCtx, body: Element): Block[] {
  const drafts: DraftBlock[] = [];
  walkContainer(ctx, drafts, body);
  return drafts.map((d, i) => ({ id: `b${i}`, ...d }));
}

// ---------------------------------------------------------------------------
// OPF / TOC
// ---------------------------------------------------------------------------

interface ManifestItem {
  id: string;
  /** resolved zip path */
  href: string;
  mediaType: string;
  properties: string[];
}

async function readOpf(index: ZipIndex): Promise<{ doc: Document; path: string }> {
  const containerXml = await zipText(index, "META-INF/container.xml");
  if (!containerXml) {
    throw new EpubImportError("Invalid EPUB: missing META-INF/container.xml");
  }
  const container = parseXml(containerXml, "container.xml");
  const rootfile = allByLocalName(container, "rootfile").find((el) =>
    el.getAttribute("full-path"),
  );
  const opfPath = resolvePath("", rootfile?.getAttribute("full-path") ?? "");
  const opfXml = opfPath ? await zipText(index, opfPath) : undefined;
  if (!opfXml) {
    throw new EpubImportError("Invalid EPUB: package document not found");
  }
  return { doc: parseXml(opfXml, "package document"), path: opfPath };
}

/** Build href → title from the EPUB3 nav doc, falling back to the NCX. */
async function buildTocMap(
  index: ZipIndex,
  manifest: Map<string, ManifestItem>,
  tocId: string | null,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const navItem = [...manifest.values()].find((m) =>
    m.properties.includes("nav"),
  );
  if (navItem) {
    try {
      const text = await zipText(index, navItem.href);
      if (text) {
        const doc = parseChapterDoc(text);
        const navs = allByLocalName(doc, "nav");
        const toc =
          navs.find((n) =>
            (
              n.getAttribute("epub:type") ??
              n.getAttributeNS(EPUB_OPS_NS, "type") ??
              ""
            )
              .split(/\s+/)
              .includes("toc"),
          ) ?? navs[0];
        const navDir = dirname(navItem.href);
        for (const a of toc ? allByLocalName(toc, "a") : []) {
          const raw = a.getAttribute("href");
          const label = collapse(a.textContent ?? "");
          if (!raw || !label) continue;
          const path = resolvePath(navDir, raw);
          if (!map.has(path)) map.set(path, label);
        }
      }
    } catch {
      // unreadable nav doc — fall through to NCX
    }
  }
  if (map.size > 0) return map;

  const ncxItem = tocId ? manifest.get(tocId) : undefined;
  if (ncxItem) {
    try {
      const text = await zipText(index, ncxItem.href);
      if (text) {
        const doc = parseXml(text, "NCX");
        const ncxDir = dirname(ncxItem.href);
        for (const point of allByLocalName(doc, "navPoint")) {
          const src = firstByLocalName(point, "content")?.getAttribute("src");
          const label = collapse(
            firstByLocalName(point, "text")?.textContent ?? "",
          );
          if (!src || !label) continue;
          const path = resolvePath(ncxDir, src);
          if (!map.has(path)) map.set(path, label);
        }
      }
    } catch {
      // unreadable NCX — chapter titles fall back to headings
    }
  }
  return map;
}

function findCoverHref(
  opf: Document,
  manifest: Map<string, ManifestItem>,
  opfDir: string,
): string | undefined {
  const byProperty = [...manifest.values()].find((m) =>
    m.properties.includes("cover-image"),
  );
  if (byProperty) return byProperty.href;

  const meta = allByLocalName(opf, "meta").find(
    (el) => el.getAttribute("name") === "cover",
  );
  const content = meta?.getAttribute("content");
  if (!content) return undefined;
  const item = manifest.get(content);
  if (item) return item.href;
  // Some EPUBs put an href (not a manifest id) in the content attribute.
  return resolvePath(opfDir, content);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function parseEpub(data: ArrayBuffer): Promise<ParsedEpub> {
  let zip: JSZip;
  try {
    zip = await new JSZip().loadAsync(data);
  } catch (err) {
    throw new EpubImportError("Not a valid EPUB: could not read the archive", {
      cause: err,
    });
  }
  const index = indexZip(zip);

  const { doc: opf, path: opfPath } = await readOpf(index);
  const opfDir = dirname(opfPath);

  // --- manifest ---
  const manifest = new Map<string, ManifestItem>();
  const mediaTypes = new Map<string, string>();
  for (const el of allByLocalName(opf, "item")) {
    const id = el.getAttribute("id");
    const rawHref = el.getAttribute("href");
    if (!id || !rawHref) continue;
    const href = resolvePath(opfDir, rawHref);
    const mediaType = el.getAttribute("media-type") ?? "";
    const properties = (el.getAttribute("properties") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    manifest.set(id, { id, href, mediaType, properties });
    if (mediaType) mediaTypes.set(href, mediaType);
  }

  // --- metadata ---
  const metadata = firstByLocalName(opf, "metadata") ?? opf.documentElement;
  const title = collapse(
    firstByLocalName(metadata, "title")?.textContent ?? "",
  );
  const author = allByLocalName(metadata, "creator")
    .map((el) => collapse(el.textContent ?? ""))
    .filter(Boolean)
    .join(", ");

  // --- spine ---
  const spineEl = firstByLocalName(opf, "spine");
  if (!spineEl) throw new EpubImportError("Invalid EPUB: missing spine");
  const tocId = spineEl.getAttribute("toc");
  const spineRefs = allByLocalName(spineEl, "itemref")
    .filter((el) => el.getAttribute("linear")?.toLowerCase() !== "no")
    .map((el) => el.getAttribute("idref"))
    .filter((id): id is string => Boolean(id));

  const tocMap = await buildTocMap(index, manifest, tocId);

  // --- chapters ---
  const neededAssets = new Set<string>();
  const chapters: ParsedChapter[] = [];
  for (const idref of spineRefs) {
    const item = manifest.get(idref);
    if (!item) continue;
    if (item.mediaType && !/x?html/i.test(item.mediaType)) continue;
    const text = await zipText(index, item.href);
    if (!text) continue;

    const doc = parseChapterDoc(text);
    const body = bodyOf(doc);
    if (!body) continue;

    const ctx: FlattenCtx = {
      index,
      baseDir: dirname(item.href),
      neededAssets,
    };
    const blocks = flattenBody(ctx, body);
    // Boilerplate-only documents (empty pages, spacer files) are dropped.
    if (blocks.length === 0) continue;

    const headingTitle = collapse(
      body.querySelector("h1, h2, h3")?.textContent ?? "",
    );
    chapters.push({
      title:
        tocMap.get(item.href) || headingTitle || `Chapter ${chapters.length + 1}`,
      href: item.href,
      blocks,
    });
  }

  if (chapters.reduce((n, c) => n + c.blocks.length, 0) === 0) {
    throw new EpubImportError("No readable content found");
  }

  // --- referenced assets ---
  const assets: ParsedAsset[] = [];
  for (const href of neededAssets) {
    const blob = await zipBlob(index, href, mimeFor(href, mediaTypes));
    if (blob) assets.push({ href, blob });
  }

  // --- cover ---
  let coverBlob: Blob | undefined;
  const coverHref = findCoverHref(opf, manifest, opfDir);
  if (coverHref) {
    coverBlob = await zipBlob(index, coverHref, mimeFor(coverHref, mediaTypes));
  }

  return { title, author, coverBlob, chapters, assets };
}
