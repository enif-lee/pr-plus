/** @module modal/lib/command-palette */
/**
 * Linear-style command palette registry + filter for the PR modal.
 * Commands are pure data; runners are injected by the App.
 *
 * Keyboard: most product chords are opt/⌥; Find stays mod/⌘F.
 *   mod+.        → opt+.
 *   mod+f        → mod+f (Find)
 *   mod+shift+X  → opt+shift+X
 */
import { allowedMergeMethods, canUpdateBranch } from './merge-box-status';


/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   section?: string,
 *   keywords?: string[],
 *   shortcut?: string,
 *   action: string,
 *   payload?: object,
 * }} PaletteCommand
 */

/**
 * PR detail actions on Option chords (former mod/⌘ → opt/⌥).
 * `shift: true`  → ⌥⇧letter
 * `shift: false` → ⌥letter (or ⌥.)
 *
 * Reserved plain Opt: j/k step-nav, 1–9 stack, [ ] adjacent.
 */
export function parsePalettePrSearchQuery(raw: unknown): {
  isPrSearch: boolean;
  term: string;
  raw: string;
} {
  const rawStr = raw == null ? '' : String(raw);
  const trimmed = rawStr.trim();
  if (!trimmed.startsWith('#')) {
    return { isPrSearch: false, term: '', raw: rawStr };
  }
  let rest = trimmed.slice(1);
  // Optional `$` after `#` (documented `#$pr_number_or_name` token)
  if (rest.startsWith('$')) rest = rest.slice(1);
  return { isPrSearch: true, term: rest.trim(), raw: rawStr };
}

/**
 * Sync filter of cached PRs by number and/or title/name/author/branch.
 * Empty term (bare `#`) returns the full cache (still immediate).
 */
export function matchCachedPrsForSearch(prs: unknown, term: unknown): any[] {
  const list = Array.isArray(prs) ? prs : [];
  const t = String(term || '')
    .trim()
    .toLowerCase();
  if (!t) return list.slice();
  const exactNum = /^\d+$/.test(t) ? Number(t) : NaN;
  const out: any[] = [];
  for (const pr of list) {
    if (!pr || typeof pr !== 'object') continue;
    const num = Number((pr as any).number);
    if (Number.isFinite(exactNum) && num === exactNum) {
      out.push(pr);
      continue;
    }
    if (Number.isFinite(num) && String(num).includes(t)) {
      out.push(pr);
      continue;
    }
    const title = String((pr as any).title || '').toLowerCase();
    const head = String(
      (pr as any).headRef || (pr as any).head?.ref || ''
    ).toLowerCase();
    const base = String(
      (pr as any).baseRef || (pr as any).base?.ref || ''
    ).toLowerCase();
    const author = String(
      (pr as any).author || (pr as any).user?.login || ''
    ).toLowerCase();
    if (
      title.includes(t) ||
      head.includes(t) ||
      base.includes(t) ||
      author.includes(t)
    ) {
      out.push(pr);
    }
  }
  return out;
}

/**
 * Merge cache hits + async hits by PR number. Cache order wins; async only
 * appends numbers not already present (no duplicates, cache never dropped).
 */
export function mergePrSearchResults(
  cacheHits: unknown,
  asyncHits: unknown
): any[] {
  const byNum = new Map<number, any>();
  const order: number[] = [];
  const push = (pr: any) => {
    if (!pr || typeof pr !== 'object') return;
    const n = Number(pr.number);
    if (!Number.isFinite(n) || n <= 0) return;
    if (byNum.has(n)) return;
    byNum.set(n, pr);
    order.push(n);
  };
  for (const pr of Array.isArray(cacheHits) ? cacheHits : []) push(pr);
  for (const pr of Array.isArray(asyncHits) ? asyncHits : []) push(pr);
  return order.map((n) => byNum.get(n));
}

/**
 * Build palette command rows for PR search results.
 */
export function buildPrSearchPaletteCommands(
  prs: unknown,
  opts: {
    owner?: string;
    repo?: string;
    webOrigin?: string;
    source?: 'cache' | 'async' | 'merged';
  } = {}
): any[] {
  const list = Array.isArray(prs) ? prs : [];
  const owner = String(opts.owner || '').trim();
  const repo = String(opts.repo || '').trim();
  const origin = String(opts.webOrigin || 'https://github.com').replace(
    /\/+$/,
    ''
  );
  const source = opts.source || 'merged';
  return list
    .map((pr: any) => {
      const num = Number(pr?.number);
      if (!Number.isFinite(num) || num <= 0) return null;
      const title = String(pr?.title || '').trim() || `Pull request #${num}`;
      const author = String(pr?.author || pr?.user?.login || '').trim();
      const authorKey = author.toLowerCase();
      const avatarFromMap =
        pr?.avatarUrls && typeof pr.avatarUrls === 'object'
          ? pr.avatarUrls[authorKey] || pr.avatarUrls[author]
          : '';
      const authorAvatarUrl = String(
        pr?.authorAvatarUrl || pr?.avatarUrl || avatarFromMap || ''
      ).trim();
      const head = String(pr?.headRef || pr?.head?.ref || '').trim();
      const base = String(pr?.baseRef || pr?.base?.ref || '').trim();
      const refs = head || base ? `${head || '?'} → ${base || '?'}` : '';
      const o = String(pr?.owner || owner || '').trim();
      const r = String(pr?.repo || repo || '').trim();
      return {
        id: `pr-search-${num}`,
        kind: 'pr',
        action: 'openPullRequest',
        title,
        section: 'Pull requests',
        keywords: [
          String(num),
          `#${num}`,
          title,
          author,
          head,
          base,
          'pr',
          'pull',
        ].filter(Boolean),
        description: [`#${num}`, author ? `@${author}` : '', refs]
          .filter(Boolean)
          .join(' · '),
        number: num,
        author: author || undefined,
        authorAvatarUrl: authorAvatarUrl || undefined,
        headRef: head || undefined,
        baseRef: base || undefined,
        draft: Boolean(pr?.draft),
        owner: o || undefined,
        repo: r || undefined,
        href:
          pr?.htmlUrl ||
          pr?.html_url ||
          (o && r ? `${origin}/${o}/${r}/pull/${num}` : ''),
        source,
        payload: { number: num, owner: o || undefined, repo: r || undefined },
      };
    })
    .filter(Boolean);
}

/** Synthetic loading row for PR-search mode. */
export function buildPrSearchLoadingCommand(): any {
  return {
    id: 'pr-search-loading',
    kind: 'status',
    action: 'noop',
    title: 'Searching pull requests…',
    section: 'Pull requests',
    keywords: ['loading', 'search'],
    description: 'Fetching more matches',
    loading: true,
    disabled: true,
  };
}

/** Empty-state row when cache + async both miss. */
export function buildPrSearchEmptyCommand(term = ''): any {
  const t = String(term || '').trim();
  return {
    id: 'pr-search-empty',
    kind: 'status',
    action: 'noop',
    title: t ? `No pull requests match “${t}”` : 'No pull requests found',
    section: 'Pull requests',
    keywords: ['empty', 'none'],
    description: 'Try another number or name',
    empty: true,
    disabled: true,
  };
}

/**
 * UI state for cache-first + async PR search.
 * Pure transitions — hosts own the in-flight promise / abort.
 */
export type PalettePrSearchState = {
  isPrSearch: boolean;
  term: string;
  cacheHits: any[];
  asyncHits: any[];
  items: any[];
  loading: boolean;
  error: string | null;
};

export function createPalettePrSearchState(): PalettePrSearchState {
  return {
    isPrSearch: false,
    term: '',
    cacheHits: [],
    asyncHits: [],
    items: [],
    loading: false,
    error: null,
  };
}

function rebuildPrSearchItems(s: PalettePrSearchState): any[] {
  return mergePrSearchResults(s.cacheHits, s.asyncHits);
}

/**
 * Whether the host/modal should kick a debounced remote PR search.
 * Bare `#` / `#$` (empty term) is cache-only — no network until the user types
 * a search term after the prefix.
 */
export function shouldKickPrSearchAsync(term: unknown): boolean {
  return String(term ?? '').trim().length > 0;
}

/**
 * Apply a new query: parse, sync cache filter, and mark loading when a remote
 * search should follow (non-empty term). Bare `#` stays cache-only.
 */
export function applyPrSearchQuery(
  state: PalettePrSearchState | null | undefined,
  query: unknown,
  cachedPrs: unknown
): PalettePrSearchState {
  const parsed = parsePalettePrSearchQuery(query);
  if (!parsed.isPrSearch) {
    return createPalettePrSearchState();
  }
  const cacheHits = matchCachedPrsForSearch(cachedPrs, parsed.term);
  const kickAsync = shouldKickPrSearchAsync(parsed.term);
  const next: PalettePrSearchState = {
    isPrSearch: true,
    term: parsed.term,
    cacheHits,
    asyncHits: [],
    items: cacheHits.slice(),
    loading: kickAsync,
    error: null,
  };
  next.items = rebuildPrSearchItems(next);
  return next;
}

/** Async search resolved successfully for the given term (ignore stale). */
export function applyPrSearchAsyncResult(
  state: PalettePrSearchState | null | undefined,
  term: unknown,
  asyncHits: unknown
): PalettePrSearchState {
  const s = state && state.isPrSearch ? state : createPalettePrSearchState();
  const t = String(term || '').trim();
  if (!s.isPrSearch || s.term !== t) {
    // Stale response — leave state unchanged (still pure copy)
    return {
      ...s,
      items: rebuildPrSearchItems(s),
    };
  }
  const next: PalettePrSearchState = {
    ...s,
    asyncHits: Array.isArray(asyncHits) ? asyncHits.slice() : [],
    loading: false,
    error: null,
  };
  next.items = rebuildPrSearchItems(next);
  return next;
}

/** Async search failed (keep cache hits; loading ends). */
export function applyPrSearchAsyncError(
  state: PalettePrSearchState | null | undefined,
  term: unknown,
  error: unknown
): PalettePrSearchState {
  const s = state && state.isPrSearch ? state : createPalettePrSearchState();
  const t = String(term || '').trim();
  if (!s.isPrSearch || s.term !== t) {
    return { ...s, items: rebuildPrSearchItems(s) };
  }
  return {
    ...s,
    loading: false,
    error: error == null ? 'Search failed' : String(error),
    items: rebuildPrSearchItems(s),
  };
}

/**
 * Build help-panel rows for the modal palette (Conversation / Diff scoped).
 * Lists scope-applicable actions with aliases/shortcuts; omits other-scope-only.
 */
