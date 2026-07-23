/** @module modal/lib/session-view */
/**
 * SessionStorage view-state for PR modal (layout, collapse, viewed, diff mode).
 * Content-script origin is github.com — key by owner/repo#number (no secrets).
 */

export const STORAGE_PREFIX = 'prp:view:';
/** Page-level key: which PR modal was open (survives full page refresh). */
export const OPEN_MODAL_KEY = 'prp:modal:open';
/** Max age for restoring an open modal after reload (12h). */
export const OPEN_MODAL_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number|string} number
 */
export function sessionViewKey(owner, repo, number) {
  return `${STORAGE_PREFIX}${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number)}`;
}

/**
 * Snapshot of an open modal identity for refresh restore.
 * Optional page (`conversation`|`diff`) + position (`c:{id}`) for URI parity.
 * @param {{ owner: string, repo: string, number: number|string, page?: string, position?: string }} payload
 */
export function serializeOpenModal(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const owner = String(payload.owner || '').trim();
  const repo = String(payload.repo || '').trim();
  const number = Number(payload.number);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return null;
  const pageRaw = String(payload.page || '').trim().toLowerCase();
  const page =
    pageRaw === 'diff' || pageRaw === 'files' || pageRaw === 'review'
      ? 'diff'
      : pageRaw === 'conversation' || pageRaw === 'centered' || pageRaw === 'conv'
        ? 'conversation'
        : null;
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
export function parseOpenModal(raw, opts: any = {}) {
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
  const pageRaw = String(obj.page || '').trim().toLowerCase();
  const page =
    pageRaw === 'diff'
      ? 'diff'
      : pageRaw === 'conversation'
        ? 'conversation'
        : null;
  const position =
    obj.position != null && String(obj.position).trim()
      ? String(obj.position).trim()
      : null;
  return { owner, repo, number, page, position };
}

export function saveOpenModal(storage, payload) {
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

export function loadOpenModal(storage, opts) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    return parseOpenModal(storage.getItem(OPEN_MODAL_KEY), opts);
  } catch {
    return null;
  }
}

export function clearOpenModal(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return;
  try {
    storage.removeItem(OPEN_MODAL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} state
 * @returns {object|null} JSON-safe snapshot
 */
export function serializeSessionView(state) {
  if (!state || typeof state !== 'object') return null;
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
  return {
    v: 1,
    layoutMode: state.layoutMode === 'diff' ? 'diff' : 'centered',
    diffMode: state.diffMode === 'split' ? 'split' : 'unified',
    collapsedFiles: collapsed.filter((p) => typeof p === 'string' && p),
    viewedPaths: viewed.filter((p) => typeof p === 'string' && p),
    activeFilePath:
      typeof state.activeFilePath === 'string' ? state.activeFilePath : null,
  };
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseSessionView(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
  return {
    layoutMode: obj.layoutMode === 'diff' ? 'diff' : 'centered',
    diffMode: obj.diffMode === 'split' ? 'split' : 'unified',
    collapsedFiles: Array.isArray(obj.collapsedFiles)
      ? obj.collapsedFiles.filter((p) => typeof p === 'string')
      : [],
    viewedPaths: Array.isArray(obj.viewedPaths)
      ? obj.viewedPaths.filter((p) => typeof p === 'string')
      : [],
    activeFilePath:
      typeof obj.activeFilePath === 'string' ? obj.activeFilePath : null,
  };
}

/**
 * @param {Storage} storage sessionStorage-like
 */
export function loadSessionView(storage, owner, repo, number) {
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
export function saveSessionView(storage, owner, repo, number, state) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const snap = serializeSessionView(state);
  if (!snap) return false;
  try {
    storage.setItem(sessionViewKey(owner, repo, number), JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

export function clearSessionView(storage, owner, repo, number) {
  if (!storage || typeof storage.removeItem !== 'function') return;
  try {
    storage.removeItem(sessionViewKey(owner, repo, number));
  } catch {
    /* ignore */
  }
}
