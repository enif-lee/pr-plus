/**
 * Shared host closure contract for src/host/modules/*.
 *
 * Modules are assembled into one IIFE (build-host.mjs) so they share these
 * bindings by lexical closure — not ES imports. This declaration documents
 * the boundary: extract/refactor only against this shape, never mid-expression.
 *
 * Runtime source remains classic JS modules under src/host/modules/ until a
 * full HostContext TS port; this file is the typed boundary for tooling.
 */

export type SideKey =
  | 'files'
  | 'commits'
  | 'comments'
  | 'reviews'
  | 'checks'
  | 'development';

export interface HostLoadStage {
  label?: string | null;
  busy?: boolean;
  phase?: string | null;
  percent?: number | null;
}

export interface HostCurrentSession {
  owner?: string | null;
  repo?: string | null;
  number?: number | null;
  detail?: any;
  detailStore?: any;
  loadStage?: HostLoadStage | null;
  sidePending?: Record<SideKey, boolean> | any;
  sideSettled?: Record<SideKey, boolean> | any;
  open?: boolean;
  [key: string]: unknown;
}

/**
 * Documented host module responsibilities (function-boundary starts only).
 * Assembly order: scripts/build-host.mjs HOST_MODULE_ORDER.
 *
 * host-core-detail-store — HOST_ID, current bag, detail-store writers, publish
 * side-fetch-progress-assets — side fetches, progress, assets/cache
 * props-render-session — buildProps, render, close/session
 * open-modal — openModal
 * restore-embed-list-focus — restore, embed watch, list focus
 * list-row-lifecycle — pulls list open / hotkeys
 * pulls-palette — pulls-page palette
 * auto-refresh-watch — head.sha poll (modal + embed), activity gate
 * click-intercept — onClickCapture + install
 */
export interface HostModuleBoundary {
  /** First non-comment statement must be a function declaration / const HOST_ID */
  startsWithFunction: true;
  maxLines: 1500;
}
