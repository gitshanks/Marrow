"use client";

import { use } from "react";

import { ReaderView } from "@/components/reader/reader-view";

export default function ReadPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  // Next 16: route params is a Promise in client pages — unwrap with use().
  const { bookId } = use(params);
  return <ReaderView bookId={bookId} />;
}
