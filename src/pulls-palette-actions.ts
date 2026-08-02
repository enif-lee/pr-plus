/** pulls palette actions/help */
import {
  CREATE_PR_ACTION_ID,
  PULLS_PALETTE_ACTIONS,
  PULLS_PALETTE_FILTERS,
  PULLS_PEER_OPT_ACTIONS,
  PULLS_PRESET_FILTERS,
  actionMatchesQuery,
  buildPullsPeerOptHoldSlots,
  filterPullsForPalette,
  matchCachedPrsForSearch,
  normLogin,
  parsePalettePrSearchQuery,
  parsePullsPaletteQuery,
  prMatchesFilter,
  prMatchesText,
  prSearchText,
  resolvePullsPeerOptAction,
  shouldKickPrSearchAsync,
} from './pulls-palette-core';

export function mergePrSearchResults(cacheHits: any, asyncHits: any) {
  const byNum = new Map();
  const order = [];
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
 * Build palette option items: PRs + matching peer actions (create/filters).
 * Actions/filters are **hidden by default** (empty query → PRs only).
 * New PR alias: **np**.
 *
 * When `query` starts with `#` (or `#$`), enters PR-search mode: cache hits
 * first, optional `asyncHits` merged in, optional `loading` status row.
 *
 * @param {object[]} prs
 * @param {{
 *   query?: string,
 *   filters?: string[],
 *   viewerLogin?: string|null,
 *   owner?: string,
 *   repo?: string,
 *   webOrigin?: string,
 *   asyncHits?: object[],
 *   prSearchLoading?: boolean,
 *   prSearchError?: string|null,
 * }} opts
 */
export function buildPullsPaletteItems(prs, opts: any = {}) {
  const owner = String(opts.owner || '').trim();
  const repo = String(opts.repo || '').trim();
  const origin = String(opts.webOrigin || 'https://github.com').replace(
    /\/+$/,
    ''
  );
  const query = String(opts.query || '');
  const prSearch = parsePalettePrSearchQuery(query);

  // PR-search mode (`#…` / `#$…`): cache-first + optional async merge
  if (prSearch.isPrSearch) {
    const cacheHits = matchCachedPrsForSearch(prs, prSearch.term);
    // Defense-in-depth: never surface async hits that fail the current term
    // (host may still hold a prior query's remote list until reset).
    const rawAsync = Array.isArray(opts.asyncHits) ? opts.asyncHits : [];
    const asyncHits = matchCachedPrsForSearch(rawAsync, prSearch.term);
    const merged = mergePrSearchResults(cacheHits, asyncHits);
    /** @type {Array<object>} */
    const items = [];
    if (opts.prSearchLoading) {
      items.push({
        id: 'pr-search-loading',
        kind: 'status',
        action: 'noop',
        title: 'Searching pull requests…',
        description: 'Fetching more matches',
        subtitle: 'Loading…',
        section: null,
        loading: true,
        disabled: true,
        digit: null,
      });
    }
    for (const pr of merged) {
      const num = Number(pr.number);
      const head = String(pr.headRef || pr.head?.ref || '').trim();
      const base = String(pr.baseRef || pr.base?.ref || '').trim();
      const author = String(pr.author || pr.user?.login || '').trim();
      const authorKey = author.toLowerCase();
      const avatarFromMap =
        pr.avatarUrls && typeof pr.avatarUrls === 'object'
          ? pr.avatarUrls[authorKey] || pr.avatarUrls[author]
          : '';
      const authorAvatarUrl = String(
        pr.authorAvatarUrl || pr.avatarUrl || avatarFromMap || ''
      ).trim();
      const refs = head || base ? `${head || '?'} → ${base || '?'}` : '';
      items.push({
        id: `pr-${num}`,
        kind: 'pr',
        action: 'openPullRequest',
        title: pr.title || `Pull request #${num}`,
        subtitle: [`#${num}`, author ? `@${author}` : '', refs]
          .filter(Boolean)
          .join(' · '),
        section: null,
        number: num,
        author: author || undefined,
        authorAvatarUrl: authorAvatarUrl || undefined,
        headRef: head || undefined,
        baseRef: base || undefined,
        draft: Boolean(pr.draft),
        owner: owner || undefined,
        repo: repo || undefined,
        href:
          pr.htmlUrl ||
          pr.html_url ||
          (owner && repo ? `${origin}/${owner}/${repo}/pull/${num}` : ''),
        digit: null,
      });
    }
    if (
      merged.length === 0 &&
      !opts.prSearchLoading &&
      !opts.prSearchError
    ) {
      items.push({
        id: 'pr-search-empty',
        kind: 'status',
        action: 'noop',
        title: prSearch.term
          ? `No pull requests match “${prSearch.term}”`
          : 'No pull requests found',
        description: 'Try another number or name',
        subtitle: 'No matches',
        section: null,
        empty: true,
        disabled: true,
        digit: null,
      });
    } else if (opts.prSearchError && merged.length === 0) {
      items.push({
        id: 'pr-search-error',
        kind: 'status',
        action: 'noop',
        title: 'Search failed',
        description: String(opts.prSearchError),
        subtitle: String(opts.prSearchError),
        section: null,
        disabled: true,
        digit: null,
      });
    }
    // Option+1..9 only on activatable PR rows (skip loading/empty/status)
    let dig = 1;
    for (let i = 0; i < items.length && dig <= 9; i++) {
      if (items[i].disabled || items[i].loading || items[i].empty) {
        items[i] = { ...items[i], digit: null };
        continue;
      }
      items[i] = { ...items[i], digit: dig++ };
    }
    return items;
  }

  const filtered = filterPullsForPalette(prs, {
    query,
    filters: opts.filters,
    viewerLogin: opts.viewerLogin || '',
  });

  const createHref =
    owner && repo ? `${origin}/${owner}/${repo}/compare` : `${origin}/`;

  /** @type {Array<object>} */
  const items = [];

  // Peer action rows (create / filters) — only when query matches; same shape as PRs
  for (const def of PULLS_PALETTE_ACTIONS) {
    if (!actionMatchesQuery(def, query)) continue;
    const aliasHint = (def.aliases || []).join(' · ');
    if (def.action === 'createPullRequest') {
      const repoLabel = owner && repo ? `${owner}/${repo}` : 'Open compare page';
      items.push({
        id: def.id,
        kind: 'action',
        action: 'createPullRequest',
        title: def.title,
        description: repoLabel,
        subtitle: [aliasHint, repoLabel].filter(Boolean).join(' · '),
        section: null,
        href: createHref,
        owner: owner || undefined,
        repo: repo || undefined,
        aliases: def.aliases,
        shortcut: 'opt+shift+n',
        digit: null,
      });
      continue;
    }
    if (def.action === 'applyFilter' && def.filterId) {
      const filterDef =
        PULLS_PALETTE_FILTERS[def.filterId] ||
        PULLS_PRESET_FILTERS[def.filterId] ||
        null;
      const desc =
        (filterDef && filterDef.githubQuery) ||
        (filterDef && filterDef.externalHref) ||
        (Array.isArray(def.keywords) ? def.keywords.slice(0, 4).join(', ') : '') ||
        def.filterId;
      const peerOpt = PULLS_PEER_OPT_ACTIONS.find(
        (p) => p.filterId === def.filterId
      );
      items.push({
        id: def.id,
        kind: 'action',
        action: 'applyFilter',
        filterId: def.filterId,
        title: def.title,
        description: desc,
        subtitle: [aliasHint, peerOpt?.labelMac, desc].filter(Boolean).join(' · '),
        section: null,
        aliases: def.aliases,
        shortcut: peerOpt ? `opt+shift+${peerOpt.key}` : null,
        digit: null,
      });
      continue;
    }
    if (def.action === 'toggleFiltersMenu') {
      const desc = 'Open GitHub Filters menu · ⌥⇧F';
      items.push({
        id: def.id,
        kind: 'action',
        action: 'toggleFiltersMenu',
        title: def.title,
        description: desc,
        subtitle: [aliasHint, desc].filter(Boolean).join(' · '),
        section: null,
        aliases: def.aliases,
        digit: null,
      });
      continue;
    }
    if (def.action === 'toggleHelp') {
      const desc = 'Show action aliases and shortcuts';
      items.push({
        id: def.id,
        kind: 'action',
        action: 'toggleHelp',
        title: def.title,
        description: desc,
        subtitle: [aliasHint, desc].filter(Boolean).join(' · '),
        section: null,
        aliases: def.aliases,
        digit: null,
      });
    }
  }

  for (const pr of filtered) {
    const num = Number(pr.number);
    const head = String(pr.headRef || pr.head?.ref || '').trim();
    const base = String(pr.baseRef || pr.base?.ref || '').trim();
    const author = String(pr.author || pr.user?.login || '').trim();
    const authorKey = author.toLowerCase();
    const avatarFromMap =
      pr.avatarUrls && typeof pr.avatarUrls === 'object'
        ? pr.avatarUrls[authorKey] || pr.avatarUrls[author]
        : '';
    const authorAvatarUrl = String(
      pr.authorAvatarUrl || pr.avatarUrl || avatarFromMap || ''
    ).trim();
    const refs = head || base ? `${head || '?'} → ${base || '?'}` : '';
    items.push({
      id: `pr-${num}`,
      kind: 'pr',
      action: 'openPullRequest',
      title: pr.title || `Pull request #${num}`,
      // Plain-text fallback for tests / a11y
      subtitle: [`#${num}`, author ? `@${author}` : '', refs]
        .filter(Boolean)
        .join(' · '),
      section: null,
      number: num,
      author: author || undefined,
      authorAvatarUrl: authorAvatarUrl || undefined,
      headRef: head || undefined,
      baseRef: base || undefined,
      draft: Boolean(pr.draft),
      owner: owner || undefined,
      repo: repo || undefined,
      href:
        pr.htmlUrl ||
        (owner && repo ? `${origin}/${owner}/${repo}/pull/${num}` : ''),
      digit: null,
    });
  }

  // Assign Option+1..9 digits to first 9 visible options
  for (let i = 0; i < items.length && i < 9; i++) {
    items[i] = { ...items[i], digit: i + 1 };
  }
  return items;
}

/**
 * Focus index step with wrap. current -1 → first/last by direction.
 * @param {number} current
 * @param {number} delta
 * @param {number} count
 */
export function nextPaletteFocusIndex(current: any, delta: any, count: any) {
  const n = Number(count) || 0;
  if (n <= 0) return -1;
  const d = delta < 0 ? -1 : 1;
  const cur = Number.isFinite(current) ? Number(current) : -1;
  if (cur < 0 || cur >= n) return d > 0 ? 0 : n - 1;
  let next = cur + d;
  if (next < 0) next = n - 1;
  if (next >= n) next = 0;
  return next;
}

/**
 * Option/Alt + Digit1–9 → 0-based index, or -1.
 */
export function resolveOptDigitIndex(opts: any = {}) {
  if (!opts.alt || opts.mod || opts.shift) return -1;
  const code = String(opts.code || '');
  const m = code.match(/^Digit([1-9])$/i) || code.match(/^Numpad([1-9])$/i);
  if (m) return Number(m[1]) - 1;
  const key = String(opts.key || '');
  if (/^[1-9]$/.test(key)) return Number(key) - 1;
  return -1;
}

/**
 * Normalize key for Option/Shift combos (macOS remaps key → glyphs).
 * Prefer KeyboardEvent.code for physical J/K/digits when alt or shift held.
 */
export function normalizePullsPaletteKey(opts: any = {}) {
  const alt = Boolean(opts.alt);
  const shift = Boolean(opts.shift);
  const code = String(opts.code || '');
  if (alt || shift) {
    if (code === 'KeyJ' || code === 'keyj') return 'j';
    if (code === 'KeyK' || code === 'keyk') return 'k';
    const dm = code.match(/^Digit([1-9])$/i);
    if (dm) return dm[1];
  }
  if (code === 'ArrowDown') return 'arrowdown';
  if (code === 'ArrowUp') return 'arrowup';
  if (code === 'Enter' || code === 'NumpadEnter') return 'enter';
  if (code === 'Escape') return 'escape';
  return String(opts.key || '').toLowerCase();
}

/**
 * Resolve keyboard action while pulls palette is open.
 */
export function resolvePullsPaletteShortcutAction(opts: any = {}) {
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  const paletteOpen = Boolean(opts.paletteOpen);
  const isPullsList = Boolean(opts.isPullsList);
  const hostEnabled = opts.hostEnabled !== false;
  const githubPaletteOpen = Boolean(opts.githubPaletteOpen);
  const modalOpen = Boolean(opts.modalOpen);

  if (!hostEnabled) return null;
  if (modalOpen) return null;
  if (githubPaletteOpen) return null;
  if (!isPullsList) return null;

  const key = normalizePullsPaletteKey({
    key: opts.key,
    code: opts.code,
    alt,
    shift,
  });
  const code = String(opts.code || '');

  // Open: ⌥⇧K / Alt+Shift+K (not ⌘K / ⌘⇧K — those stay with GH / in-modal palette)
  if (!paletteOpen) {
    if (alt && shift && !mod && key === 'k') return 'openPalette';
    return null;
  }

  if (key === 'escape' || code === 'Escape') return 'closePalette';

  const digitIdx = resolveOptDigitIndex({
    alt,
    mod,
    shift,
    code: opts.code,
    key: opts.key,
  });
  if (digitIdx >= 0) {
    return { action: 'selectDigit', digitIndex: digitIdx };
  }

  // Option+J/K only when shift is NOT held (⌥⇧K opens palette)
  if (!mod && !shift) {
    if (alt && key === 'j') return 'focusNext';
    if (alt && key === 'k') return 'focusPrev';
    if (key === 'arrowdown' || code === 'ArrowDown') return 'focusNext';
    if (key === 'arrowup' || code === 'ArrowUp') return 'focusPrev';
  }

  if (
    !mod &&
    !shift &&
    !alt &&
    (key === 'enter' || code === 'Enter' || code === 'NumpadEnter')
  ) {
    return 'activate';
  }

  return null;
}

/**
 * Pick which list index Enter should activate.
 * Prefer exact alias match (am/cm/hr/my/np) so filter/new-PR actions run even
 * if focus was left on a PR row.
 * @param {Array<{kind?:string, action?:string, filterId?:string, aliases?:string[]}>} items
 * @param {number} focusIndex
 * @param {string} query
 * @returns {number}
 */
export function resolveActivateIndex(items: any, focusIndex: any, query: any) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return -1;
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (q) {
    // Exact convenience / preset filter alias
    if (PULLS_PALETTE_FILTERS[q] || PULLS_PRESET_FILTERS[q]) {
      const fi = list.findIndex(
        (it) => it?.action === 'applyFilter' && it?.filterId === q
      );
      if (fi >= 0) return fi;
    }
    // Any action with exact alias match (np, ff, …)
    const byAlias = list.findIndex((it) =>
      (it?.aliases || []).some((a) => String(a).toLowerCase() === q)
    );
    if (byAlias >= 0) return byAlias;
    // New PR aliases (fallback)
    const createIdx = list.findIndex((it) => it?.action === 'createPullRequest');
    if (createIdx >= 0) {
      const aliases = list[createIdx].aliases || ['np', 'new'];
      if (aliases.some((a) => String(a).toLowerCase() === q)) return createIdx;
    }
  }
  const cur = Number(focusIndex);
  if (Number.isFinite(cur) && cur >= 0 && cur < list.length) return cur;
  return 0;
}

/**
 * Flatten resolve result to action string + optional digitIndex.
 */
export function unwrapPullsPaletteAction(resolved: any) {
  if (!resolved) return { action: null, digitIndex: -1 };
  if (typeof resolved === 'string') return { action: resolved, digitIndex: -1 };
  return {
    action: resolved.action || null,
    digitIndex: Number.isFinite(resolved.digitIndex)
      ? resolved.digitIndex
      : -1,
  };
}

/**
 * Rows for the palette footer help panel (title + primary aliases + opt shortcuts).
 * Pulls-scope only: create/filters/help — not modal Diff/Conversation chords.
 * @returns {Array<{ title: string, aliases: string[], primary: string, shortcut?: string|null }>}
 */
export function buildPullsPaletteHelpEntries() {
  return PULLS_PALETTE_ACTIONS.map((a) => {
    const aliases = Array.isArray(a.aliases)
      ? a.aliases.map((x) => String(x).toLowerCase()).filter(Boolean)
      : [];
    const peerOpt = a.filterId
      ? PULLS_PEER_OPT_ACTIONS.find((p) => p.filterId === a.filterId)
      : null;
    const shortcut = peerOpt ? `opt+shift+${peerOpt.key}` : null;
    const displayAliases = [
      ...aliases,
      ...(shortcut ? [shortcut] : []),
      ...(a.id === 'new-pull-request' ? ['opt+shift+n'] : []),
      ...(a.id === 'toggle-filters-menu' ? ['opt+shift+f'] : []),
    ];
    return {
      id: a.id,
      title: String(a.title || a.id),
      aliases: displayAliases,
      primary: aliases[0] || displayAliases[0] || '',
      action: a.action,
      filterId: a.filterId || null,
      shortcut,
    };
  }).filter((e) => e.primary);
}

/**
 * Product chords on the pulls list that must appear as palette rows (help or list)
 * with a matching shortcut label.
 * @returns {Array<{ id: string, shortcut: string, action: string }>}
 */
export function listRequiredPullsPaletteShortcutCoverage() {
  const peer = PULLS_PEER_OPT_ACTIONS.map((p) => ({
    id: `filter-${p.filterId}`,
    shortcut: `opt+shift+${p.key}`,
    action: 'applyFilter',
    filterId: p.filterId,
  }));
  return [
    {
      id: CREATE_PR_ACTION_ID,
      shortcut: 'opt+shift+n',
      action: 'createPullRequest',
    },
    ...peer,
  ];
}

/**
 * Build GitHub compare / new PR URL for repo.
 */
export function buildCreatePullRequestUrl(owner, repo, webOrigin = 'https://github.com') {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const origin = String(webOrigin || 'https://github.com').replace(/\/+$/, '');
  if (!o || !r) return `${origin}/`;
  return `${origin}/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare`;
}

/**
 * GitHub search `q` string for a filter id (am/cm/hr/my or preset oi/yi/…).
 * @param {string} filterId
 * @returns {string}
 */
export function githubQueryForFilter(filterId: any) {
  const id = String(filterId || '').toLowerCase();
  if (PULLS_PALETTE_FILTERS[id]?.githubQuery) {
    return String(PULLS_PALETTE_FILTERS[id].githubQuery);
  }
  if (PULLS_PRESET_FILTERS[id]?.githubQuery) {
    return String(PULLS_PRESET_FILTERS[id].githubQuery);
  }
  return '';
}

/**
 * Build pulls/issues URL that applies a convenience or preset filter.
 *
 * Prefer GitHub’s path shortcuts when available:
 *   am → /pulls/assigned/@me
 *   cm → /pulls/created_by/@me
 *   hr → /pulls/review-requested/@me
 * Presets from Filters ▾ use /issues?q=… (matches GH).
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} filterId
 * @param {string} [webOrigin]
 * @returns {string}
 */
export function buildPullsListFilterUrl(
  owner,
  repo,
  filterId,
  webOrigin = 'https://github.com'
) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const origin = String(webOrigin || 'https://github.com').replace(/\/+$/, '');
  const id = String(filterId || '').toLowerCase();

  // External docs link
  const preset = PULLS_PRESET_FILTERS[id];
  if (preset?.externalHref) return String(preset.externalHref);

  if (!o || !r) return `${origin}/`;
  const pullsBase = `${origin}/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls`;
  const issuesBase = `${origin}/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues`;

  // Reset → clean open PR list (drop q= and subpaths)
  if (id === 'rs' || PULLS_PALETTE_FILTERS[id]?.reset) {
    return pullsBase;
  }

  const pathByFilter = {
    am: `${pullsBase}/assigned/@me`,
    cm: `${pullsBase}/created_by/@me`,
    hr: `${pullsBase}/review-requested/@me`,
  };
  if (pathByFilter[id]) return pathByFilter[id];

  const q = githubQueryForFilter(id);
  if (!q) return pullsBase;
  const params = new URLSearchParams();
  params.set('q', q);
  const surface =
    preset?.surface === 'issues' || PULLS_PRESET_FILTERS[id]
      ? issuesBase
      : pullsBase;
  // Convenience pulls filters (am/cm/…/df/rd/my) stay on /pulls
  if (id === 'my' || PULLS_PALETTE_FILTERS[id]) {
    return `${pullsBase}?${params.toString()}`;
  }
  return `${surface}?${params.toString()}`;
}

/**
 * Read viewer login from a GitHub document (best-effort).
 * @param {Document|null|undefined} doc
 */
export function readViewerLoginFromDocument(doc: any) {
  if (!doc) return '';
  try {
    const meta =
      doc.querySelector?.('meta[name="user-login"]') ||
      doc.querySelector?.('meta[name="octolytics-actor-login"]');
    const content = meta?.getAttribute?.('content') || '';
    if (content) return String(content).trim();
  } catch {
    /* ignore */
  }
  try {
    const el =
      doc.querySelector?.('[data-login]') ||
      doc.querySelector?.('img.avatar[alt^="@"]');
    const data = el?.getAttribute?.('data-login');
    if (data) return String(data).trim();
    const alt = el?.getAttribute?.('alt') || '';
    if (alt.startsWith('@')) return alt.slice(1).trim();
  } catch {
    /* ignore */
  }
  return '';
}

export const pullsPaletteApi = {
  PULLS_PALETTE_FILTERS,
  PULLS_PRESET_FILTERS,
  PULLS_PALETTE_ACTIONS,
  PULLS_PEER_OPT_ACTIONS,
  CREATE_PR_ACTION_ID,
  parsePullsPaletteQuery,
  prMatchesFilter,
  prMatchesText,
  prSearchText,
  filterPullsForPalette,
  actionMatchesQuery,
  buildPullsPaletteItems,
  nextPaletteFocusIndex,
  resolveOptDigitIndex,
  normalizePullsPaletteKey,
  resolvePullsPaletteShortcutAction,
  unwrapPullsPaletteAction,
  resolveActivateIndex,
  buildPullsPaletteHelpEntries,
  listRequiredPullsPaletteShortcutCoverage,
  parsePalettePrSearchQuery,
  shouldKickPrSearchAsync,
  matchCachedPrsForSearch,
  mergePrSearchResults,
  buildCreatePullRequestUrl,
  githubQueryForFilter,
  resolvePullsPeerOptAction,
  buildPullsPeerOptHoldSlots,
  buildPullsListFilterUrl,
  readViewerLoginFromDocument,
  normLogin,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = pullsPaletteApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRPullsPalette = pullsPaletteApi;
}
