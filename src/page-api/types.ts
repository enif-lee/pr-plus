/** Public page-world PRPlus contract. */

export type PrPlusOpenArgs = {
  owner: string;
  repo: string;
  number: number;
  page?: 'conversation' | 'diff' | null;
  position?: string | null;
  presentation?: 'modal' | 'embed' | null;
  commitSha?: string | null;
  commitEndSha?: string | null;
  filePath?: string | null;
  fileKey?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  side?: 'LEFT' | 'RIGHT' | null;
  githubHost?: string | null;
  target?: 'auto' | 'extension-shell' | 'github-tab' | 'opener-embed';
};

export type PrPlusStatus = {
  ready: boolean;
  open: boolean;
  owner: string | null;
  repo: string | null;
  number: number | null;
  page: 'conversation' | 'diff' | null;
  presentation: 'modal' | 'embed' | 'shell' | null;
  githubHost: string | null;
  renderTarget: 'extension-shell' | 'github-tab' | 'opener-embed' | null;
  callerOrigin: string;
};

export const PRP_PAGE_API_CHANNEL = 'prp-page-api';
export const PRP_PAGE_API_VERSION = 1;
export const PRP_PAGE_API_NONCE_ATTR = 'data-prp-api-nonce';
export const PRP_PAGE_API_HELLO = 'prp-page-api-hello';

export type PrPlusWireReq = {
  channel: typeof PRP_PAGE_API_CHANNEL;
  v: typeof PRP_PAGE_API_VERSION;
  dir: 'req';
  id: string;
  nonce: string;
  op: 'ping' | 'open' | 'close' | 'status';
  args?: unknown;
};

export type PrPlusWireRes = {
  channel: typeof PRP_PAGE_API_CHANNEL;
  v: typeof PRP_PAGE_API_VERSION;
  dir: 'res';
  id: string;
  nonce: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};
