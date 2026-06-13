/**
 * Marrow — resolve "marrow-asset:<href>" srcs to object URLs.
 */
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { assetKey } from "@/lib/types";

const ASSET_SCHEME = "marrow-asset:";

interface Resolved {
  /** assetKey the object URL belongs to — guards against stale state */
  key: string;
  url: string;
}

/**
 * Resolve a block img src to a displayable URL.
 * - "marrow-asset:<href>" → object URL backed by the blob in db.assets,
 *   revoked on unmount or when inputs change.
 * - anything else passes through untouched.
 * Returns undefined while loading or when the asset is missing.
 */
export function useAssetUrl(
  bookId: string,
  src: string | undefined,
): string | undefined {
  const isAsset = src !== undefined && src.startsWith(ASSET_SCHEME);
  const key = isAsset
    ? assetKey(bookId, src.slice(ASSET_SCHEME.length))
    : undefined;
  const [resolved, setResolved] = useState<Resolved | undefined>(undefined);

  useEffect(() => {
    if (!key) return;
    let objectUrl: string | undefined;
    let cancelled = false;

    db.assets.get(key).then((asset) => {
      if (cancelled || !asset) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setResolved({ key, url: objectUrl });
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  if (src === undefined) return undefined;
  if (!isAsset) return src;
  return resolved !== undefined && resolved.key === key
    ? resolved.url
    : undefined;
}
