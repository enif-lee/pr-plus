/** Extension-private, bounded SWR cache for /pulls badges; no PR detail blobs. */
const STORAGE_KEY = 'pullsListIndicatorsCacheV1';
/** Checks/diff expire; the account-scoped author flag remains valid across commits. */
export const LIST_INDICATORS_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const FIELDS = ['viewerDidAuthor', 'additions', 'deletions', 'changedFiles',
  'listChecksState', 'listChecksPassed', 'listChecksTotal'] as const;

type Entry = {
  at: number;
  headSha: string;
  baseSha: string;
  fields: Record<string, unknown>;
};

/** Account separation without persisting or exposing the PAT itself. */
export async function listIndicatorsScope(host: string, owner: string, repo: string, token: string | null) {
  if (!token) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const auth = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  return JSON.stringify([host.toLowerCase(), owner.toLowerCase(), repo.toLowerCase(), auth]);
}

export function mergeCachedListIndicators(prs: any[], entries: Record<string, Entry>) {
  return prs.map(pr => {
    const entry = entries[pr.number];
    if (!entry) return pr;
    const sameCommit = pr.headSha && pr.baseSha &&
      entry.headSha === pr.headSha && entry.baseSha === pr.baseSha;
    const knownAuthor = typeof entry.fields.viewerDidAuthor === 'boolean';
    if (!sameCommit && !knownAuthor) return pr;
    // Copy only badge fields; cached data cannot change the REST tree structure.
    const next = { ...pr };
    for (const field of FIELDS) {
      if (field !== 'viewerDidAuthor' && !sameCommit) continue;
      if (Object.prototype.hasOwnProperty.call(entry.fields, field)) next[field] = entry.fields[field];
    }
    return next;
  });
}

export function createListIndicatorsCache(
  area: any = (globalThis as any).chrome?.storage?.local,
  now: () => number = () => Date.now()
) {
  let writes = Promise.resolve();
  let clearedAt = -Infinity;
  const fresh = (entry: Entry) => entry && Number.isFinite(entry.at) &&
    entry.at <= now() && now() - entry.at < LIST_INDICATORS_MAX_AGE_MS;

  async function load(): Promise<Record<string, Entry>> {
    if (!area) return {};
    return new Promise(resolve => {
      try {
        area.get([STORAGE_KEY], (saved: any) => {
          if ((globalThis as any).chrome?.runtime?.lastError) return resolve({});
          resolve(saved?.[STORAGE_KEY] || {});
        });
      } catch { resolve({}); }
    });
  }

  async function store(entries: Record<string, Entry>) {
    if (!area) return;
    await new Promise<void>(resolve => {
      try {
        area.set({ [STORAGE_KEY]: entries }, () => {
          // Reading lastError consumes optional storage failures without failing REST.
          void (globalThis as any).chrome?.runtime?.lastError;
          resolve();
        });
      } catch { resolve(); }
    });
  }

  async function read(scope: string): Promise<Record<string, Entry>> {
    if (!scope) return {};
    const all = await load();
    const entries: Record<string, Entry> = {};
    const prefix = `${scope}#`;
    for (const [key, entry] of Object.entries(all)) {
      if (!key.startsWith(prefix)) continue;
      if (fresh(entry)) entries[key.slice(prefix.length)] = entry;
      else if (typeof entry.fields?.viewerDidAuthor === 'boolean') {
        entries[key.slice(prefix.length)] = { ...entry, fields: { viewerDidAuthor: entry.fields.viewerDidAuthor } };
      }
    }
    return entries;
  }

  function save(scope: string, prs: any[], patches: any[], observedAt: number = now()) {
    if (!scope || observedAt <= clearedAt) return Promise.resolve();
    const run = async () => {
      const all = await load();
      if (observedAt <= clearedAt) return;
      const entries: Record<string, Entry> = {};
      for (const [key, entry] of Object.entries(all)) {
        if (fresh(entry) || typeof entry.fields?.viewerDidAuthor === 'boolean') entries[key] = entry;
      }
      const byNumber = new Map(prs.map(pr => [pr.number, pr]));
      for (const patch of patches) {
        const pr = byNumber.get(patch.number);
        if (!pr?.headSha || !pr?.baseSha) continue;
        const key = `${scope}#${pr.number}`;
        if (entries[key]?.at > observedAt) continue;
        const fields: Record<string, unknown> = {};
        for (const field of FIELDS) {
          if (field === 'viewerDidAuthor') continue;
          if (Object.prototype.hasOwnProperty.call(patch, field)) fields[field] = patch[field];
        }
        // An optional GraphQL failure returns only Magic links: keep the last success.
        const knownAuthor = entries[key]?.fields.viewerDidAuthor;
        if (!Object.keys(fields).length && typeof knownAuthor === 'boolean') continue;
        if (typeof knownAuthor === 'boolean') fields.viewerDidAuthor = knownAuthor;
        else if (typeof patch.viewerDidAuthor === 'boolean') fields.viewerDidAuthor = patch.viewerDidAuthor;
        if (!Object.keys(fields).length) continue;
        entries[key] = { at: observedAt, headSha: pr.headSha, baseSha: pr.baseSha, fields };
      }
      const recent = Object.entries(entries).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
      await store(Object.fromEntries(recent));
    };
    writes = writes.then(run, run).catch(() => {});
    return writes;
  }

  function clear() {
    clearedAt = now();
    writes = writes.then(() => store({}), () => store({}));
    return writes;
  }
  return { read, save, clear };
}

export const listIndicatorsCache = createListIndicatorsCache();
