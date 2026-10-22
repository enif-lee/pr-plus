/** Plugin-wide viewer identity: shared by every repository for one host/PAT. */
import { listIndicatorsScope } from './sw-list-indicators-cache';

const STORAGE_KEY = 'githubViewerIdentitiesV1';
export type ViewerIdentity = { id: string | number; login: string };

export function applyViewerIdentity(prs: any[], viewer: ViewerIdentity | null) {
  if (!viewer) return prs;
  return prs.map(pr => {
    if (pr.authorId != null) return { ...pr, viewerDidAuthor: String(pr.authorId) === String(viewer.id) };
    if (typeof pr.viewerDidAuthor === 'boolean') return pr;
    return typeof pr.author === 'string' && pr.author
      ? { ...pr, viewerDidAuthor: pr.author.toLowerCase() === viewer.login.toLowerCase() } : pr;
  });
}

export function createViewerIdentityCache(area: any = (globalThis as any).chrome?.storage?.local) {
  const lookups = new Map<string, Promise<ViewerIdentity | null>>();
  const resolved = new Map<string, ViewerIdentity>();
  let writes = Promise.resolve();
  const read = (): Promise<Record<string, ViewerIdentity>> => new Promise(resolve => {
    if (!area) return resolve({});
    try {
      area.get([STORAGE_KEY], (saved: any) => {
        if ((globalThis as any).chrome?.runtime?.lastError) return resolve({});
        resolve(saved?.[STORAGE_KEY] || {});
      });
    } catch { resolve({}); }
  });
  const save = (scope: string, identity: ViewerIdentity) => {
    writes = writes.then(async () => {
      const saved = await read();
      delete saved[scope];
      const entries = Object.fromEntries([...Object.entries(saved), [scope, identity]].slice(-64));
      await new Promise<void>(resolve => {
        if (!area) return resolve();
        try {
          area.set({ [STORAGE_KEY]: entries }, () => {
            void (globalThis as any).chrome?.runtime?.lastError;
            resolve();
          });
        } catch { resolve(); }
      });
    }).catch(() => {});
    return writes;
  };

  async function peek(host: string, token: string | null): Promise<ViewerIdentity | null> {
    const scope = await listIndicatorsScope(host, '', '', token).catch(() => '');
    if (!scope) return null;
    if (resolved.has(scope)) return resolved.get(scope);
    const identity = (await read())[scope];
    if (!identity?.id || !identity.login) return null;
    resolved.set(scope, identity);
    return identity;
  }

  async function get(host: string, token: string | null, load: () => Promise<ViewerIdentity | null>) {
    const scope = await listIndicatorsScope(host, '', '', token).catch(() => '');
    if (!scope) return null;
    if (!lookups.has(scope)) {
      const pending = (async () => {
        const saved = await peek(host, token);
        if (saved) return saved;
        const identity = await load().catch((): ViewerIdentity | null => null);
        if (!identity?.id || !identity.login) return null;
        resolved.set(scope, identity);
        await save(scope, identity);
        return identity;
      })();
      lookups.set(scope, pending);
    }
    const identity = await lookups.get(scope);
    if (!identity) lookups.delete(scope);
    return identity;
  }
  return { get, peek };
}

export const viewerIdentityCache = createViewerIdentityCache();
