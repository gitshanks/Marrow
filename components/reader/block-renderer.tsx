"use client";

import { memo, useMemo } from "react";
import type { Block } from "@/lib/types";
import { useAssetUrl } from "@/lib/epub/assets";
import { cn } from "@/lib/utils";

export type RegisterBlock = (id: string, el: HTMLElement | null) => void;

interface BlockViewProps {
  bookId: string;
  block: Block;
  dimmed: boolean;
  register: RegisterBlock;
}

/** Undo escapeAttr from parse time — img blocks never pass through the HTML
 *  parser, so entities in src/alt would stay literal and the marrow-asset
 *  lookup key would never match the stored asset. */
function decodeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseImgHtml(html: string): { src?: string; alt: string }[] {
  const out: { src?: string; alt: string }[] = [];
  for (const tag of html.match(/<img [^>]*>/g) ?? []) {
    const src = /src="([^"]*)"/.exec(tag)?.[1];
    const alt = /alt="([^"]*)"/.exec(tag)?.[1] ?? "";
    out.push({ src: src ? decodeAttr(src) : undefined, alt: decodeAttr(alt) });
  }
  return out;
}

function OneImg({
  bookId,
  src,
  alt,
  className,
  refCb,
  blockId,
}: {
  bookId: string;
  src?: string;
  alt: string;
  className: string;
  refCb?: (el: HTMLElement | null) => void;
  blockId?: string;
}) {
  const url = useAssetUrl(bookId, src);
  if (!url) {
    return (
      <div
        ref={refCb}
        data-block-id={blockId}
        role="img"
        aria-label={alt || "Image"}
        className={cn(className, "my-6 h-40 rounded-md bg-muted/50")}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- object URLs from IndexedDB can't go through next/image
    <img
      ref={refCb}
      data-block-id={blockId}
      src={url}
      alt={alt}
      loading="lazy"
      className={className}
    />
  );
}

function ImgBlock({ bookId, block, dimmed, register }: BlockViewProps) {
  const imgs = useMemo(() => parseImgHtml(block.html), [block.html]);
  const cls = cn("reading-block", dimmed && "block-dim");
  const ref = (el: HTMLElement | null) => register(block.id, el);

  // New imports hold exactly one image per img block; data imported before
  // the parse-time split may hold several — render them all, registering the
  // block id on the first.
  if (imgs.length === 0) {
    return (
      <OneImg bookId={bookId} alt="" className={cls} refCb={ref} blockId={block.id} />
    );
  }
  return (
    <>
      {imgs.map((img, i) => (
        <OneImg
          key={i}
          bookId={bookId}
          src={img.src}
          alt={img.alt}
          className={cls}
          refCb={i === 0 ? ref : undefined}
          blockId={i === 0 ? block.id : undefined}
        />
      ))}
    </>
  );
}

export const BlockView = memo(function BlockView(props: BlockViewProps) {
  const { block, dimmed, register } = props;
  // no entrance animation on blocks: a fill-mode opacity would override the
  // .block-dim transition, and content-visibility keeps unstarted animations
  // stuck at their from-frame offscreen. Pills animate; blocks just appear.
  const cls = cn("reading-block", dimmed && "block-dim");
  const ref = (el: HTMLElement | null) => register(block.id, el);

  switch (block.type) {
    case "img":
      return <ImgBlock {...props} />;
    case "hr":
      return (
        <hr ref={ref} data-block-id={block.id} className={cls} aria-hidden />
      );
    case "li":
      return (
        <ul ref={ref} data-block-id={block.id} role="list" className={cls}>
          <li dangerouslySetInnerHTML={{ __html: block.html }} />
        </ul>
      );
    default: {
      const Tag = block.type;
      return (
        <Tag
          ref={ref}
          data-block-id={block.id}
          className={cls}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
    }
  }
});
