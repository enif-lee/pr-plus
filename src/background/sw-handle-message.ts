/** SW unit: sw-handle-message.ts */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

export const ENTERPRISE_CS_ID = 'prp-enterprise-hosts';
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
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
];

/**
 * Stateless API context from RPC message (webHost from content page).
 * No process-global mutation — pass returned ctx into every PRTreeFetch call.
 * @param {object|null|undefined} message
 */
import { handleMessagePartA } from './sw-handle-a';
import { handleMessagePartB } from './sw-handle-b';

export async function handleMessage(message: any): Promise<any> {
  const a = await handleMessagePartA(message);
  if (a !== undefined) return a;
  return handleMessagePartB(message);
}
