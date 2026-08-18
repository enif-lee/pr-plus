/**
 * Single source of truth for github.com static `content_scripts` and
 * Enterprise `chrome.scripting.registerContentScripts`.
 *
 * Keep `manifest.json` `content_scripts[0]` in lockstep — gated by
 * `tests/content-scripts-injection.rstest.ts`.
 */
export const CONTENT_SCRIPT_JS = [
  'src/tree.js',
  'src/dom.js',
  'src/pr-list-focus.js',
  'src/pulls-palette.js',
  'src/github-endpoints.js',
  'src/content-bridge.js',
  'src/content-bootstrap.js',
  'src/onboarding.js',
  'src/content.js',
  'src/modal/pure/detail-idb-cache.js',
  'src/modal/pure/detail-cache.js',
  'src/modal/pure/detail-merge.js',
  'src/modal/pure/detail-store.js',
  'src/modal/pure/load-progress.js',
  'src/modal/pure/page-embed.js',
  'src/modal/pure/floating-scrollbar.js',
  'src/modal/pure/auto-refresh.js',
  'src/modal/pure/rate-limit.js',
  'src/modal/pure/graphql-cost-log.js',
  'src/modal/pure/open-pulls-lifecycle.js',
  'src/modal/pure/conversation-timeline.js',
  'src/modal/pure/review-threads.js',
  'src/modal/pure/locale-resolve.js',
  'src/modal/pure/i18n.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
] as const;

export const CONTENT_SCRIPT_CSS = [
  'src/styles.css',
  'src/modal/dist/pr-modal.css',
] as const;

export type ContentScriptJs = (typeof CONTENT_SCRIPT_JS)[number];
export type ContentScriptCss = (typeof CONTENT_SCRIPT_CSS)[number];

/** MAIN-world PRPlus shim (github.com static + partner register). */
export const PARTNER_CS_MAIN_JS = ['src/page-api/prplus-main.js'] as const;
/** Isolated PRPlus bridge. */
export const PARTNER_CS_ISOLATED_JS = ['src/page-api/prplus-isolated.js'] as const;

const PARTNER_HOST_SHARED = [
  'src/github-endpoints.js',
  'src/content-bridge.js',
  'src/modal/pure/detail-idb-cache.js',
  'src/modal/pure/detail-cache.js',
  'src/modal/pure/detail-merge.js',
  'src/modal/pure/detail-store.js',
  'src/modal/pure/load-progress.js',
  'src/modal/pure/page-embed.js',
  'src/modal/pure/floating-scrollbar.js',
  'src/modal/pure/auto-refresh.js',
  'src/modal/pure/rate-limit.js',
  'src/modal/pure/graphql-cost-log.js',
  'src/modal/pure/open-pulls-lifecycle.js',
  'src/modal/pure/conversation-timeline.js',
  'src/modal/pure/review-threads.js',
  'src/modal/pure/locale-resolve.js',
  'src/modal/pure/i18n.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
] as const;

/** Linear overlay — no list/onboarding/content.ts. */
export const PARTNER_HOST_JS = [
  ...PARTNER_HOST_SHARED,
  'src/partner/partner.js',
] as const;

export const PARTNER_HOST_CSS = [
  'src/styles.css',
  'src/modal/dist/pr-modal.css',
] as const;

/** Extension-origin shell tab. */
export const SHELL_SCRIPT_JS = [
  ...PARTNER_HOST_SHARED,
  'src/shell/shell.js',
] as const;

export const SHELL_SCRIPT_CSS = PARTNER_HOST_CSS;
