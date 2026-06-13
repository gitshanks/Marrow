/**
 * Marrow analysis — public API (see CONTRACTS.md "Module: Analysis").
 * Fully on-device: no API key, no network.
 */
export {
  buildLocalAnalysis,
  DEFAULT_TUNING,
  type Tuning,
} from "./local";
export {
  ensureChapterAnalysis,
  prefetchChapterAnalysis,
  useChapterAnalysis,
} from "./use";
