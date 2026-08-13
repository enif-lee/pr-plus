/** @module modal/lib/session-view */
/**
 * SessionStorage view-state for PR modal.
 * Content-script origin is github.com — key by owner/repo#number (no secrets).
 *
 * Snapshots hold page UI only (layout, file/line selection, comment forms).
 * Restore only when PR identity **and** page (conversation|diff) match.
 */

export const STORAGE_PREFIX = 'prp:view:';
/** Page-level key: which PR modal was open (survives full page refresh). */
export const OPEN_MODAL_KEY = 'prp:modal:open';
/** Max age for restoring an open modal after reload (12h). */
export const OPEN_MODAL_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Snapshot schema version (v2 = identity + page gate + selection/forms). */
export const SESSION_VIEW_VERSION = 2;

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number|string} number
 */
export function sessionViewKey(owner: any, repo: any, number: any) {
  return `${STORAGE_PREFIX}${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number)}`;
}

function normalizePageToken(raw: unknown): 'conversation' | 'diff' | null {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'diff' || v === 'files' || v === 'review') return 'diff';
  if (
    v === 'conversation' ||
    v === 'centered' ||
    v === 'conv' ||
    v === 'description'
  ) {
    return 'conversation';
  }
  return null;
}

/**
 * Snapshot of an open modal identity for refresh restore.
 * Optional page (`conversation`|`diff`) + position (`c:{id}`) for URI parity.
 * @param {{ owner: string, repo: string, number: number|string, page?: string, position?: string }} payload
 */
export function serializeOpenModal(payload: any) {
  if (!payload || typeof payload !== 'object') return null;
  const owner = String(payload.owner || '').trim();
  const repo = String(payload.repo || '').trim();
  const number = Number(payload.number);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return null;
  const page = normalizePageToken(payload.page);
  const position =
    payload.position != null && String(payload.position).trim()
      ? String(payload.position).trim()
      : null;
  const snap: any = {
    v: 1,
    owner,
    repo,
    number,
    at: Number(payload.at) || Date.now(),
  };
  if (page) snap.page = page;
  if (position) snap.position = position;
  return snap;
}

/**
 * @param {unknown} raw
 * @param {{ now?: number, maxAgeMs?: number }} [opts]
 * @returns {{ owner: string, repo: string, number: number, page?: string|null, position?: string|null }|null}
 */
export function parseOpenModal(raw: any, opts: any = {}) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
  const owner = String(obj.owner || '').trim();
  const repo = String(obj.repo || '').trim();
  const number = Number(obj.number);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return null;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const maxAge =
    Number.isFinite(opts.maxAgeMs) && opts.maxAgeMs > 0
      ? opts.maxAgeMs
      : OPEN_MODAL_MAX_AGE_MS;
  const at = Number(obj.at) || 0;
  if (at > 0 && now - at > maxAge) return null;
  const page = normalizePageToken(obj.page);
  const position =
    obj.position != null && String(obj.position).trim()
      ? String(obj.position).trim()
      : null;
  return { owner, repo, number, page, position };
}

export function saveOpenModal(storage: any, payload: any) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const snap = serializeOpenModal({ ...payload, at: Date.now() });
  if (!snap) return false;
  try {
    storage.setItem(OPEN_MODAL_KEY, JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

export function loadOpenModal(storage: any, opts: any) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    return parseOpenModal(storage.getItem(OPEN_MODAL_KEY), opts);
  } catch {
    return null;
  }
}

export function clearOpenModal(storage: any) {
  if (!storage || typeof storage.removeItem !== 'function') return;
  try {
    storage.removeItem(OPEN_MODAL_KEY);
  } catch {
    /* ignore */
  }
}

/** @returns {object|null} serializable line selection (no rowIndex — rebuilt on restore) */
export function serializeLineSelection(sel: any) {
  if (!sel || typeof sel !== 'object') return null;
  if (sel.kind === 'file' || sel.subjectType === 'file') {
    const filePath = String(sel.filePath || '').trim();
    if (!filePath) return null;
    return { kind: 'file', subjectType: 'file', filePath };
  }
  const filePath = String(sel.filePath || '').trim();
  const anchorLine = Number(sel.anchorLine);
  const headLine = Number(sel.headLine ?? sel.anchorLine);
  if (!filePath || !Number.isFinite(anchorLine) || anchorLine < 1) return null;
  const side = (s: unknown) =>
    String(s || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  return {
    filePath,
    anchorLine: Math.floor(anchorLine),
    headLine: Number.isFinite(headLine) && headLine >= 1 ? Math.floor(headLine) : Math.floor(anchorLine),
    anchorSide: side(sel.anchorSide),
    headSide: side(sel.headSide ?? sel.anchorSide),
  };
}

export function parseLineSelection(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'file' || raw.subjectType === 'file') {
    const filePath = String(raw.filePath || '').trim();
    return filePath ? { kind: 'file', subjectType: 'file', filePath } : null;
  }
  return serializeLineSelection(raw);
}

/**
 * @param {object} state — UI snapshot (+ optional owner/repo/number for identity)
 * @returns {object|null} JSON-safe snapshot
 */
export function serializeSessionView(state: any) {
  if (!state || typeof state !== 'object') return null;
  const owner = String(state.owner || '').trim();
  const repo = String(state.repo || '').trim();
  const number = Number(state.number);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return null;

  const page =
    normalizePageToken(state.page) ||
    (state.layoutMode === 'diff' || state.layoutMode === LAYOUT_DIFF_ALIAS
      ? 'diff'
      : 'conversation');

  const collapsed =
    state.collapsedFiles instanceof Set
      ? [...state.collapsedFiles]
      : Array.isArray(state.collapsedFiles)
        ? state.collapsedFiles.slice()
        : [];
  const viewed =
    state.viewedPaths instanceof Set
      ? [...state.viewedPaths]
      : Array.isArray(state.viewedPaths)
        ? state.viewedPaths.slice()
        : [];

  const islandPhase =
    state.selectionIslandPhase === 'comment' ? 'comment' : 'actions';

  return {
    v: SESSION_VIEW_VERSION,
    owner,
    repo,
    number,
    page,
    // layoutMode kept for v1 readers / resolveRestore helpers
    layoutMode: page === 'diff' ? 'diff' : 'centered',
    diffMode: state.diffMode === 'split' ? 'split' : 'unified',
    hideWhitespace: Boolean(state.hideWhitespace),
    collapsedFiles: collapsed.filter((p: any) => typeof p === 'string' && p),
    viewedPaths: viewed.filter((p: any) => typeof p === 'string' && p),
    activeFilePath:
      typeof state.activeFilePath === 'string' && state.activeFilePath
        ? state.activeFilePath
        : null,
    lineSelection: serializeLineSelection(state.lineSelection),
    selectionDraft:
      typeof state.selectionDraft === 'string' ? state.selectionDraft : '',
    showSelectionComposer: Boolean(state.showSelectionComposer),
    selectionIslandPhase: islandPhase,
    commentText: typeof state.commentText === 'string' ? state.commentText : '',
    scrollTop:
      Number.isFinite(Number(state.scrollTop)) && Number(state.scrollTop) >= 0
        ? Math.floor(Number(state.scrollTop))
        : 0,
    at: Number(state.at) || Date.now(),
  };
}

const LAYOUT_DIFF_ALIAS = 'diff';

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseSessionView(raw: any) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const ver = Number(obj.v) || 0;
  if (ver !== 1 && ver !== SESSION_VIEW_VERSION) return null;

  const page =
    normalizePageToken(obj.page) ||
    (obj.layoutMode === 'diff' ? 'diff' : obj.layoutMode === 'centered' ? 'conversation' : null);

  const owner = String(obj.owner || '').trim();
  const repo = String(obj.repo || '').trim();
  const number = Number(obj.number);

  return {
    v: ver,
    owner: owner || null,
    repo: repo || null,
    number: Number.isFinite(number) && number > 0 ? number : null,
    page,
    layoutMode: page === 'diff' ? 'diff' : 'centered',
    diffMode: obj.diffMode === 'split' ? 'split' : 'unified',
    hideWhitespace: Boolean(obj.hideWhitespace),
    collapsedFiles: Array.isArray(obj.collapsedFiles)
      ? obj.collapsedFiles.filter((p: any) => typeof p === 'string')
      : [],
    viewedPaths: Array.isArray(obj.viewedPaths)
      ? obj.viewedPaths.filter((p: any) => typeof p === 'string')
      : [],
    activeFilePath:
      typeof obj.activeFilePath === 'string' ? obj.activeFilePath : null,
    lineSelection: parseLineSelection(obj.lineSelection),
    selectionDraft:
      typeof obj.selectionDraft === 'string' ? obj.selectionDraft : '',
    showSelectionComposer: Boolean(obj.showSelectionComposer),
    selectionIslandPhase:
      obj.selectionIslandPhase === 'comment' ? 'comment' : 'actions',
    commentText: typeof obj.commentText === 'string' ? obj.commentText : '',
    scrollTop:
      Number.isFinite(Number(obj.scrollTop)) && Number(obj.scrollTop) >= 0
        ? Math.floor(Number(obj.scrollTop))
        : 0,
  };
}

/**
 * Restore only when snap PR identity and page match the open target.
 * @param {object|null|undefined} stored parseSessionView result
 * @param {{ owner?: string, repo?: string, number?: number|string, page?: string|null }} identity
 */
export function canRestoreSessionView(stored: any, identity: any): boolean {
  if (!stored || typeof stored !== 'object') return false;
  const owner = String(identity?.owner || '').trim();
  const repo = String(identity?.repo || '').trim();
  const number = Number(identity?.number);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return false;

  // v2+ snaps embed identity — must match exactly when present
  if (stored.owner || stored.repo || stored.number != null) {
    if (
      String(stored.owner || '').toLowerCase() !== owner.toLowerCase() ||
      String(stored.repo || '').toLowerCase() !== repo.toLowerCase() ||
      Number(stored.number) !== number
    ) {
      return false;
    }
  }

  const wantPage = normalizePageToken(identity?.page);
  const havePage =
    normalizePageToken(stored.page) ||
    (stored.layoutMode === 'diff'
      ? 'diff'
      : stored.layoutMode === 'centered'
        ? 'conversation'
        : null);

  // Both sides know the page → must agree (conversation vs diff)
  if (wantPage && havePage && wantPage !== havePage) return false;

  return true;
}

/**
 * @param {Storage} storage sessionStorage-like
 */
export function loadSessionView(storage: any, owner: any, repo: any, number: any) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const key = sessionViewKey(owner, repo, number);
    return parseSessionView(storage.getItem(key));
  } catch {
    return null;
  }
}

/**
 * @param {Storage} storage
 */
export function saveSessionView(storage: any, owner: any, repo: any, number: any, state: any) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const snap = serializeSessionView({
    ...state,
    owner,
    repo,
    number,
  });
  if (!snap) return false;
  try {
    storage.setItem(sessionViewKey(owner, repo, number), JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

export function clearSessionView(storage: any, owner: any, repo: any, number: any) {
  if (!storage || typeof storage.removeItem !== 'function') return;
  try {
    storage.removeItem(sessionViewKey(owner, repo, number));
  } catch {
    /* ignore */
  }
}
