/** pulls palette core */
/**
 * Pulls-page command palette — pure helpers.
 * Search/filter current-page PRs; peer action rows (create/filters) match query.
 */

/**
 * Filter tokens → GitHub pulls search `q` qualifiers.
 * Activating a filter navigates the real list (not just in-palette filtering).
 */
export const PULLS_PALETTE_FILTERS = {
  am: {
    id: 'am',
    label: 'Assigned to me',
    keywords: ['assign', 'assignee', 'assigned'],
    /** @see https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests */
    githubQuery: 'is:pr is:open assignee:@me',
  },
  cm: {
    id: 'cm',
    label: 'Created by me',
    keywords: ['author', 'created', 'mine'],
    githubQuery: 'is:pr is:open author:@me',
  },
  hr: {
    id: 'hr',
    label: 'Have to review',
    keywords: ['review', 'reviewer', 'requested'],
    // Matches GH sidebar “Awaiting review from you”
    githubQuery: 'is:pr is:open user-review-requested:@me',
  },
  my: {
    id: 'my',
    label: 'My pulls',
    keywords: ['mine', 'all', 'my'],
    // Involves = author / assignee / mentions / comments (covers assign+create+review)
    githubQuery: 'is:pr is:open involves:@me',
  },
  /** Draft PRs only */
  df: {
    id: 'df',
    label: 'Draft pull requests',
    keywords: ['draft', 'wip'],
    githubQuery: 'is:pr is:open draft:true',
  },
  /** Ready for review (non-draft) */
  rd: {
    id: 'rd',
    label: 'Ready (non-draft) pull requests',
    keywords: ['ready', 'non-draft', 'nondraft'],
    githubQuery: 'is:pr is:open draft:false',
  },
  /** Clear search / reset list filters */
  rs: {
    id: 'rs',
    label: 'Reset filters',
    keywords: ['reset', 'clear', 'default'],
    /** Special: plain open pulls list (no q=) */
    reset: true,
    githubQuery: 'is:pr is:open',
  },
};

export const CREATE_PR_ACTION_ID = 'new-pull-request';

/**
 * GH “Filters ▾” preset searches (from the search Filters menu).
 * Navigate the real list via /issues?q=… (GitHub’s own targets).
 */
export const PULLS_PRESET_FILTERS = {
  oi: {
    id: 'oi',
    title: 'Open issues and pull requests',
    aliases: ['oi', 'open'],
    keywords: ['all', 'everything', 'open'],
    githubQuery: 'is:open',
    surface: 'issues',
  },
  yi: {
    id: 'yi',
    title: 'Your issues',
    aliases: ['yi'],
    keywords: ['issue', 'issues', 'mine'],
    githubQuery: 'is:open is:issue author:@me',
    surface: 'issues',
  },
  yp: {
    id: 'yp',
    title: 'Your pull requests',
    aliases: ['yp'],
    keywords: ['yours', 'authored'],
    githubQuery: 'is:open is:pr author:@me',
    surface: 'issues',
  },
  ay: {
    id: 'ay',
    title: 'Everything assigned to you',
    aliases: ['ay', 'ea'],
    keywords: ['assigned', 'todo'],
    githubQuery: 'is:open assignee:@me',
    surface: 'issues',
  },
  mn: {
    id: 'mn',
    title: 'Everything mentioning you',
    aliases: ['mn', 'mention'],
    keywords: ['mentions', 'mentioned', 'notify'],
    githubQuery: 'is:open mentions:@me',
    surface: 'issues',
  },
  as: {
    id: 'as',
    title: 'View advanced search syntax',
    aliases: ['as', 'adv', 'syntax'],
    keywords: ['docs', 'help', 'search'],
    externalHref: 'https://docs.github.com/articles/searching-issues',
  },
};

/**
 * Convenience actions shown as peer rows to PRs (hidden until query matches).
 * New pull request uses alias **np** (list hotkey ⌥⇧N).
 */
export const PULLS_PALETTE_ACTIONS = [
  {
    id: CREATE_PR_ACTION_ID,
    kind: 'action',
    action: 'createPullRequest',
    title: 'New pull request',
    aliases: ['np', 'new'],
    keywords: ['open', 'compare', 'pull', 'request', 'pr', 'create'],
  },
  {
    id: 'filter-am',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'am',
    title: 'Assigned to me',
    aliases: ['am'],
    keywords: ['assign', 'assignee', 'assigned'],
  },
  {
    id: 'filter-cm',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'cm',
    title: 'Created by me',
    aliases: ['cm'],
    keywords: ['author'],
  },
  {
    id: 'filter-hr',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'hr',
    title: 'Have to review',
    aliases: ['hr'],
    keywords: ['review', 'reviewer', 'requested'],
  },
  {
    id: 'filter-my',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'my',
    title: 'My pulls',
    aliases: ['my'],
    keywords: ['mine', 'all'],
  },
  {
    id: 'filter-df',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'df',
    title: 'Draft pull requests',
    aliases: ['df', 'draft'],
    keywords: ['wip', 'drafts'],
  },
  {
    id: 'filter-rd',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'rd',
    title: 'Ready (non-draft) pull requests',
    aliases: ['rd', 'ready', 'nd'],
    keywords: ['non-draft', 'nondraft', 'published'],
  },
  {
    id: 'filter-rs',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'rs',
    title: 'Reset filters',
    aliases: ['rs', 'reset', 'clear'],
    keywords: ['default', 'unfilter', 'all open'],
  },
  // GH Filters ▾ presets
  {
    id: 'preset-oi',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'oi',
    title: 'Open issues and pull requests',
    aliases: ['oi', 'open'],
    keywords: ['all', 'everything'],
  },
  {
    id: 'preset-yi',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'yi',
    title: 'Your issues',
    aliases: ['yi'],
    keywords: ['issue', 'issues'],
  },
  {
    id: 'preset-yp',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'yp',
    title: 'Your pull requests',
    aliases: ['yp'],
    keywords: ['yours', 'authored'],
  },
  {
    id: 'preset-ay',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'ay',
    title: 'Everything assigned to you',
    aliases: ['ay', 'ea'],
    keywords: ['assigned', 'todo'],
  },
  {
    id: 'preset-mn',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'mn',
    title: 'Everything mentioning you',
    aliases: ['mn', 'mention'],
    keywords: ['mentions', 'mentioned'],
  },
  {
    id: 'preset-as',
    kind: 'action',
    action: 'applyFilter',
    filterId: 'as',
    title: 'View advanced search syntax',
    aliases: ['as', 'adv', 'syntax'],
    keywords: ['docs', 'help', 'search'],
  },
  {
    id: 'toggle-filters-menu',
    kind: 'action',
    action: 'toggleFiltersMenu',
    title: 'Open / close Filters menu',
    aliases: ['ff', 'filters'],
    keywords: ['menu', 'dropdown', 'filter'],
  },
  {
    id: 'toggle-help',
    kind: 'action',
    action: 'toggleHelp',
    title: 'Open / close help',
    aliases: ['help', 'hh', '?'],
    keywords: ['aliases', 'actions', 'docs'],
  },
];

/**
 * Palette peer actions mapped to Option+Shift chords (list plain-Opt is full).
 * Avoid filter-bar keys: f a l p m r e t, palette K, and new-pr N.
 * Floating dock shows these while Option is held.
 */
export const PULLS_PEER_OPT_ACTIONS = [
  {
    id: 'peer-am',
    filterId: 'am',
    action: 'applyFilter',
    title: 'Assigned to me',
    key: 'g',
    code: 'KeyG',
    labelMac: '⌥⇧G',
    labelWin: 'Alt+Shift+G',
    aliases: ['am'],
  },
  {
    id: 'peer-cm',
    filterId: 'cm',
    action: 'applyFilter',
    title: 'Created by me',
    key: 'c',
    code: 'KeyC',
    labelMac: '⌥⇧C',
    labelWin: 'Alt+Shift+C',
    aliases: ['cm'],
  },
  {
    id: 'peer-hr',
    filterId: 'hr',
    action: 'applyFilter',
    title: 'Have to review',
    key: 'h',
    code: 'KeyH',
    labelMac: '⌥⇧H',
    labelWin: 'Alt+Shift+H',
    aliases: ['hr'],
  },
  {
    id: 'peer-my',
    filterId: 'my',
    action: 'applyFilter',
    title: 'My pulls',
    key: 'y',
    code: 'KeyY',
    labelMac: '⌥⇧Y',
    labelWin: 'Alt+Shift+Y',
    aliases: ['my'],
  },
  {
    id: 'peer-df',
    filterId: 'df',
    action: 'applyFilter',
    title: 'Draft pull requests',
    key: 'd',
    code: 'KeyD',
    labelMac: '⌥⇧D',
    labelWin: 'Alt+Shift+D',
    aliases: ['df'],
  },
  {
    id: 'peer-rd',
    filterId: 'rd',
    action: 'applyFilter',
    title: 'Ready (non-draft)',
    key: 'o',
    code: 'KeyO',
    labelMac: '⌥⇧O',
    labelWin: 'Alt+Shift+O',
    aliases: ['rd'],
  },
  {
    id: 'peer-rs',
    filterId: 'rs',
    action: 'applyFilter',
    title: 'Reset filters',
    key: 'x',
    code: 'KeyX',
    labelMac: '⌥⇧X',
    labelWin: 'Alt+Shift+X',
    aliases: ['rs'],
  },
  {
    id: 'peer-oi',
    filterId: 'oi',
    action: 'applyFilter',
    title: 'Open issues & PRs',
    key: 'i',
    code: 'KeyI',
    labelMac: '⌥⇧I',
    labelWin: 'Alt+Shift+I',
    aliases: ['oi'],
  },
  {
    id: 'peer-yp',
    filterId: 'yp',
    action: 'applyFilter',
    title: 'Your pull requests',
    key: 'u',
    code: 'KeyU',
    labelMac: '⌥⇧U',
    labelWin: 'Alt+Shift+U',
    aliases: ['yp'],
  },
];

/**
 * Resolve Option+Shift peer action (filters/create peers not on filter bar).
 * @returns {object|null}
 */
export function resolvePullsPeerOptAction(opts: any = {}) {
  if (!opts.alt || !opts.shift || opts.mod) return null;
  const code = String(opts.code || '');
  // Reserved: K palette, N new PR (handled elsewhere), filter bar letters
  if (code === 'KeyK' || code === 'KeyN') return null;
  for (const def of PULLS_PEER_OPT_ACTIONS) {
    if (code === def.code || code.toLowerCase() === String(def.code).toLowerCase()) {
      return { ...(def as any) };
    }
  }
  const key = String(opts.key || '')
    .toLowerCase()
    .replace(/^alt\+/i, '');
  const byKey = PULLS_PEER_OPT_ACTIONS.find((d) => d.key === key);
  return byKey ? { ...(byKey as any) } : null;
}

/**
 * Slots for Opt-hold floating dock (peer actions). Does not include `[`/`]`.
 */
export function buildPullsPeerOptHoldSlots(opts: any = {}) {
  const isMac = opts.isMac !== false;
  return PULLS_PEER_OPT_ACTIONS.map((d) => ({
    id: d.id,
    title: d.title,
    label: isMac ? d.labelMac : d.labelWin,
    key: d.key,
    filterId: d.filterId,
    action: d.action,
    aliases: d.aliases,
  }));
}

/**
 * Normalize login for case-insensitive compare.
 * @param {unknown} login
 */
export function normLogin(login: any) {
  return String(login || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} list
 * @returns {string[]}
 */
export function asLoginList(list: any) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const login =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? item.login || item.name || ''
          : '';
    const n = normLogin(login);
    if (n) out.push(n);
  }
  return out;
}

/**
 * Parse free-text query into filter tokens + remaining text.
 * Tokens am/cm/hr/my as whole words (case-insensitive) anywhere in query.
 * Note: `np` is new-PR alias only — not a PR filter token.
 * @param {string} raw
 * @returns {{ filters: string[], text: string, raw: string }}
 */
export function parsePullsPaletteQuery(raw: any) {
  const source = String(raw || '');
  const tokens = source.trim().split(/\s+/).filter(Boolean);
  const filters = [];
  const rest = [];
  const seen = new Set();
  for (const t of tokens) {
    const low = t.toLowerCase();
    if (PULLS_PALETTE_FILTERS[low] && !seen.has(low)) {
      seen.add(low);
      filters.push(low);
    } else {
      rest.push(t);
    }
  }
  return {
    filters,
    text: rest.join(' ').trim(),
    raw: source,
  };
}

/**
 * Does PR match a single filter for viewer?
 * Missing viewerLogin → no match for me-filters (empty result, not guess).
 * @param {object} pr
 * @param {string} filterId
 * @param {string} viewerLogin
 */
export function prMatchesFilter(pr: any, filterId: any, viewerLogin: any) {
  const id = String(filterId || '').toLowerCase();
  // Draft / ready / reset do not need a signed-in viewer
  if (id === 'df') return Boolean(pr?.draft);
  if (id === 'rd') return !pr?.draft;
  if (id === 'rs') return true;

  const me = normLogin(viewerLogin);
  if (!me) return false;
  const author = normLogin(pr?.author || pr?.user?.login);
  const assignees = asLoginList(pr?.assignees);
  const reviewers = asLoginList(
    pr?.requestedReviewers || pr?.requested_reviewers
  );
  switch (id) {
    case 'am':
      return assignees.includes(me);
    case 'cm':
      return author === me;
    case 'hr':
      return reviewers.includes(me);
    case 'my':
      return author === me || assignees.includes(me) || reviewers.includes(me);
    default:
      return true;
  }
}

/**
 * Text search haystack for a PR.
 * @param {object} pr
 */
export function prSearchText(pr: any) {
  const labels = Array.isArray(pr?.labels)
    ? pr.labels
        .map((l) => (typeof l === 'string' ? l : l?.name || ''))
        .filter(Boolean)
        .join(' ')
    : '';
  return [
    pr?.number != null ? String(pr.number) : '',
    pr?.number != null ? `#${pr.number}` : '',
    pr?.title || '',
    pr?.headRef || pr?.head?.ref || '',
    pr?.baseRef || pr?.base?.ref || '',
    pr?.author || '',
    labels,
    asLoginList(pr?.assignees).join(' '),
    asLoginList(pr?.requestedReviewers || pr?.requested_reviewers).join(' '),
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * @param {object} pr
 * @param {string} text
 */
export function prMatchesText(pr: any, text: any) {
  const q = String(text || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  return prSearchText(pr).includes(q);
}

/**
 * Filter PR list by query + optional explicit filters.
 * @param {object[]} prs
 * @param {{ query?: string, filters?: string[], viewerLogin?: string }} opts
 */
export function filterPullsForPalette(prs, opts: any = {}) {
  const list = Array.isArray(prs) ? prs : [];
  const parsed = parsePullsPaletteQuery(opts.query || '');
  const filters = Array.isArray(opts.filters)
    ? [...opts.filters.map((f) => String(f).toLowerCase()), ...parsed.filters]
    : parsed.filters;
  const uniqFilters = [...new Set(filters)].filter(
    (f) => PULLS_PALETTE_FILTERS[f]
  );
  const text = parsed.text;
  const viewer = opts.viewerLogin || '';

  return list.filter((pr) => {
    if (!pr || pr.number == null) return false;
    if (uniqFilters.length) {
      for (const f of uniqFilters) {
        if (!prMatchesFilter(pr, f, viewer)) return false;
      }
    }
    return prMatchesText(pr, text);
  });
}

/**
 * Whether a convenience action row should appear for the current query.
 * Hidden when query is empty (default).
 * @param {{ aliases?: string[], title?: string, keywords?: string[] }} action
 * @param {string} query
 */
export function actionMatchesQuery(action: any, query: any) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return false;
  const aliases = Array.isArray(action?.aliases) ? action.aliases : [];
  for (const raw of aliases) {
    const a = String(raw || '')
      .trim()
      .toLowerCase();
    if (!a) continue;
    // prefix either way so "n" hits "np"/"new", "np" hits new PR
    if (a === q || a.startsWith(q) || q.startsWith(a)) return true;
  }
  // Title: exact word match only (avoid "create" ⊂ "created by me")
  const title = String(action?.title || '').toLowerCase();
  const titleWords = title.split(/[^a-z0-9]+/).filter(Boolean);
  if (titleWords.some((w) => w === q)) return true;
  const kws = Array.isArray(action?.keywords) ? action.keywords : [];
  for (const kw of kws) {
    const k = String(kw || '').toLowerCase();
    if (!k) continue;
    if (k === q || k.startsWith(q) || (q.length >= 2 && q.startsWith(k))) {
      return true;
    }
  }
  return false;
}

/**
 * Detect PR-search mode from a palette query.
 * Forms: `#123`, `#name`, `#$123`, `#$title` (`$` after `#` optional).
 * @param {unknown} raw
 * @returns {{ isPrSearch: boolean, term: string, raw: string }}
 */
export function parsePalettePrSearchQuery(raw: any) {
  const rawStr = raw == null ? '' : String(raw);
  const trimmed = rawStr.trim();
  if (!trimmed.startsWith('#')) {
    return { isPrSearch: false, term: '', raw: rawStr };
  }
  let rest = trimmed.slice(1);
  if (rest.startsWith('$')) rest = rest.slice(1);
  return { isPrSearch: true, term: rest.trim(), raw: rawStr };
}

/**
 * Bare `#` / `#$` is cache-only; remote search only after a non-empty term.
 * @param {unknown} term
 * @returns {boolean}
 */
export function shouldKickPrSearchAsync(term: any) {
  return String(term ?? '').trim().length > 0;
}

/**
 * Sync filter of cached PRs by number and/or title/name.
 * @param {object[]} prs
 * @param {string} term
 */
export function matchCachedPrsForSearch(prs: any, term: any) {
  const list = Array.isArray(prs) ? prs : [];
  const t = String(term || '')
    .trim()
    .toLowerCase();
  if (!t) return list.slice();
  const exactNum = /^\d+$/.test(t) ? Number(t) : NaN;
  const out = [];
  for (const pr of list) {
    if (!pr || typeof pr !== 'object') continue;
    const num = Number(pr.number);
    if (Number.isFinite(exactNum) && num === exactNum) {
      out.push(pr);
      continue;
    }
    if (Number.isFinite(num) && String(num).includes(t)) {
      out.push(pr);
      continue;
    }
    if (prSearchText(pr).includes(t)) out.push(pr);
  }
  return out;
}

/**
 * Merge cache + async PR hits by number (cache first, no dupes).
 * @param {object[]} cacheHits
 * @param {object[]} asyncHits
 */
