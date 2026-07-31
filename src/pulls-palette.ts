/**
 * Pulls-page command palette — pure helpers.
 * Search/filter current-page PRs; peer action rows (create/filters) match query.
 */

/**
 * Filter tokens → GitHub pulls search `q` qualifiers.
 * Activating a filter navigates the real list (not just in-palette filtering).
 */
const PULLS_PALETTE_FILTERS = {
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

const CREATE_PR_ACTION_ID = 'new-pull-request';

/**
 * GH “Filters ▾” preset searches (from the search Filters menu).
 * Navigate the real list via /issues?q=… (GitHub’s own targets).
 */
const PULLS_PRESET_FILTERS = {
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
const PULLS_PALETTE_ACTIONS = [
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
const PULLS_PEER_OPT_ACTIONS = [
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
function resolvePullsPeerOptAction(opts: any = {}) {
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
function buildPullsPeerOptHoldSlots(opts: any = {}) {
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
function normLogin(login: any) {
  return String(login || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} list
 * @returns {string[]}
 */
function asLoginList(list: any) {
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
function parsePullsPaletteQuery(raw: any) {
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
function prMatchesFilter(pr: any, filterId: any, viewerLogin: any) {
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
function prSearchText(pr: any) {
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
function prMatchesText(pr: any, text: any) {
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
function filterPullsForPalette(prs, opts: any = {}) {
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
function actionMatchesQuery(action: any, query: any) {
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
function parsePalettePrSearchQuery(raw: any) {
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
function shouldKickPrSearchAsync(term: any) {
  return String(term ?? '').trim().length > 0;
}

/**
 * Sync filter of cached PRs by number and/or title/name.
 * @param {object[]} prs
 * @param {string} term
 */
function matchCachedPrsForSearch(prs: any, term: any) {
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
function mergePrSearchResults(cacheHits: any, asyncHits: any) {
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
function buildPullsPaletteItems(prs, opts: any = {}) {
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
function nextPaletteFocusIndex(current: any, delta: any, count: any) {
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
function resolveOptDigitIndex(opts: any = {}) {
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
function normalizePullsPaletteKey(opts: any = {}) {
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
function resolvePullsPaletteShortcutAction(opts: any = {}) {
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
function resolveActivateIndex(items: any, focusIndex: any, query: any) {
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
function unwrapPullsPaletteAction(resolved: any) {
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
function buildPullsPaletteHelpEntries() {
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
function listRequiredPullsPaletteShortcutCoverage() {
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
function buildCreatePullRequestUrl(owner, repo, webOrigin = 'https://github.com') {
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
function githubQueryForFilter(filterId: any) {
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
function buildPullsListFilterUrl(
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
function readViewerLoginFromDocument(doc: any) {
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

const pullsPaletteApi = {
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
