/**
 * AUTO-GENERATED from src/pulls-palette.ts
 * SOURCE OF TRUTH: src/pulls-palette.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
const PULLS_PALETTE_FILTERS = {
  am: {
    id: "am",
    label: "Assigned to me",
    keywords: ["assign", "assignee", "assigned"],
    /** @see https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests */
    githubQuery: "is:pr is:open assignee:@me"
  },
  cm: {
    id: "cm",
    label: "Created by me",
    keywords: ["author", "created", "mine"],
    githubQuery: "is:pr is:open author:@me"
  },
  hr: {
    id: "hr",
    label: "Have to review",
    keywords: ["review", "reviewer", "requested"],
    // Matches GH sidebar “Awaiting review from you”
    githubQuery: "is:pr is:open user-review-requested:@me"
  },
  my: {
    id: "my",
    label: "My pulls",
    keywords: ["mine", "all", "my"],
    // Involves = author / assignee / mentions / comments (covers assign+create+review)
    githubQuery: "is:pr is:open involves:@me"
  },
  /** Draft PRs only */
  df: {
    id: "df",
    label: "Draft pull requests",
    keywords: ["draft", "wip"],
    githubQuery: "is:pr is:open draft:true"
  },
  /** Ready for review (non-draft) */
  rd: {
    id: "rd",
    label: "Ready (non-draft) pull requests",
    keywords: ["ready", "non-draft", "nondraft"],
    githubQuery: "is:pr is:open draft:false"
  },
  /** Clear search / reset list filters */
  rs: {
    id: "rs",
    label: "Reset filters",
    keywords: ["reset", "clear", "default"],
    /** Special: plain open pulls list (no q=) */
    reset: true,
    githubQuery: "is:pr is:open"
  }
};
const CREATE_PR_ACTION_ID = "new-pull-request";
const PULLS_PRESET_FILTERS = {
  oi: {
    id: "oi",
    title: "Open issues and pull requests",
    aliases: ["oi", "open"],
    keywords: ["all", "everything", "open"],
    githubQuery: "is:open",
    surface: "issues"
  },
  yi: {
    id: "yi",
    title: "Your issues",
    aliases: ["yi"],
    keywords: ["issue", "issues", "mine"],
    githubQuery: "is:open is:issue author:@me",
    surface: "issues"
  },
  yp: {
    id: "yp",
    title: "Your pull requests",
    aliases: ["yp"],
    keywords: ["yours", "authored"],
    githubQuery: "is:open is:pr author:@me",
    surface: "issues"
  },
  ay: {
    id: "ay",
    title: "Everything assigned to you",
    aliases: ["ay", "ea"],
    keywords: ["assigned", "todo"],
    githubQuery: "is:open assignee:@me",
    surface: "issues"
  },
  mn: {
    id: "mn",
    title: "Everything mentioning you",
    aliases: ["mn", "mention"],
    keywords: ["mentions", "mentioned", "notify"],
    githubQuery: "is:open mentions:@me",
    surface: "issues"
  },
  as: {
    id: "as",
    title: "View advanced search syntax",
    aliases: ["as", "adv", "syntax"],
    keywords: ["docs", "help", "search"],
    externalHref: "https://docs.github.com/articles/searching-issues"
  }
};
const PULLS_PALETTE_ACTIONS = [
  {
    id: CREATE_PR_ACTION_ID,
    kind: "action",
    action: "createPullRequest",
    title: "New pull request",
    aliases: ["np", "new"],
    keywords: ["open", "compare", "pull", "request", "pr", "create"]
  },
  {
    id: "filter-am",
    kind: "action",
    action: "applyFilter",
    filterId: "am",
    title: "Assigned to me",
    aliases: ["am"],
    keywords: ["assign", "assignee", "assigned"]
  },
  {
    id: "filter-cm",
    kind: "action",
    action: "applyFilter",
    filterId: "cm",
    title: "Created by me",
    aliases: ["cm"],
    keywords: ["author"]
  },
  {
    id: "filter-hr",
    kind: "action",
    action: "applyFilter",
    filterId: "hr",
    title: "Have to review",
    aliases: ["hr"],
    keywords: ["review", "reviewer", "requested"]
  },
  {
    id: "filter-my",
    kind: "action",
    action: "applyFilter",
    filterId: "my",
    title: "My pulls",
    aliases: ["my"],
    keywords: ["mine", "all"]
  },
  {
    id: "filter-df",
    kind: "action",
    action: "applyFilter",
    filterId: "df",
    title: "Draft pull requests",
    aliases: ["df", "draft"],
    keywords: ["wip", "drafts"]
  },
  {
    id: "filter-rd",
    kind: "action",
    action: "applyFilter",
    filterId: "rd",
    title: "Ready (non-draft) pull requests",
    aliases: ["rd", "ready", "nd"],
    keywords: ["non-draft", "nondraft", "published"]
  },
  {
    id: "filter-rs",
    kind: "action",
    action: "applyFilter",
    filterId: "rs",
    title: "Reset filters",
    aliases: ["rs", "reset", "clear"],
    keywords: ["default", "unfilter", "all open"]
  },
  // GH Filters ▾ presets
  {
    id: "preset-oi",
    kind: "action",
    action: "applyFilter",
    filterId: "oi",
    title: "Open issues and pull requests",
    aliases: ["oi", "open"],
    keywords: ["all", "everything"]
  },
  {
    id: "preset-yi",
    kind: "action",
    action: "applyFilter",
    filterId: "yi",
    title: "Your issues",
    aliases: ["yi"],
    keywords: ["issue", "issues"]
  },
  {
    id: "preset-yp",
    kind: "action",
    action: "applyFilter",
    filterId: "yp",
    title: "Your pull requests",
    aliases: ["yp"],
    keywords: ["yours", "authored"]
  },
  {
    id: "preset-ay",
    kind: "action",
    action: "applyFilter",
    filterId: "ay",
    title: "Everything assigned to you",
    aliases: ["ay", "ea"],
    keywords: ["assigned", "todo"]
  },
  {
    id: "preset-mn",
    kind: "action",
    action: "applyFilter",
    filterId: "mn",
    title: "Everything mentioning you",
    aliases: ["mn", "mention"],
    keywords: ["mentions", "mentioned"]
  },
  {
    id: "preset-as",
    kind: "action",
    action: "applyFilter",
    filterId: "as",
    title: "View advanced search syntax",
    aliases: ["as", "adv", "syntax"],
    keywords: ["docs", "help", "search"]
  },
  {
    id: "toggle-filters-menu",
    kind: "action",
    action: "toggleFiltersMenu",
    title: "Open / close Filters menu",
    aliases: ["ff", "filters"],
    keywords: ["menu", "dropdown", "filter"]
  },
  {
    id: "toggle-help",
    kind: "action",
    action: "toggleHelp",
    title: "Open / close help",
    aliases: ["help", "hh", "?"],
    keywords: ["aliases", "actions", "docs"]
  }
];
const PULLS_PEER_OPT_ACTIONS = [
  {
    id: "peer-am",
    filterId: "am",
    action: "applyFilter",
    title: "Assigned to me",
    key: "g",
    code: "KeyG",
    labelMac: "\u2325\u21E7G",
    labelWin: "Alt+Shift+G",
    aliases: ["am"]
  },
  {
    id: "peer-cm",
    filterId: "cm",
    action: "applyFilter",
    title: "Created by me",
    key: "c",
    code: "KeyC",
    labelMac: "\u2325\u21E7C",
    labelWin: "Alt+Shift+C",
    aliases: ["cm"]
  },
  {
    id: "peer-hr",
    filterId: "hr",
    action: "applyFilter",
    title: "Have to review",
    key: "h",
    code: "KeyH",
    labelMac: "\u2325\u21E7H",
    labelWin: "Alt+Shift+H",
    aliases: ["hr"]
  },
  {
    id: "peer-my",
    filterId: "my",
    action: "applyFilter",
    title: "My pulls",
    key: "y",
    code: "KeyY",
    labelMac: "\u2325\u21E7Y",
    labelWin: "Alt+Shift+Y",
    aliases: ["my"]
  },
  {
    id: "peer-df",
    filterId: "df",
    action: "applyFilter",
    title: "Draft pull requests",
    key: "d",
    code: "KeyD",
    labelMac: "\u2325\u21E7D",
    labelWin: "Alt+Shift+D",
    aliases: ["df"]
  },
  {
    id: "peer-rd",
    filterId: "rd",
    action: "applyFilter",
    title: "Ready (non-draft)",
    key: "o",
    code: "KeyO",
    labelMac: "\u2325\u21E7O",
    labelWin: "Alt+Shift+O",
    aliases: ["rd"]
  },
  {
    id: "peer-rs",
    filterId: "rs",
    action: "applyFilter",
    title: "Reset filters",
    key: "x",
    code: "KeyX",
    labelMac: "\u2325\u21E7X",
    labelWin: "Alt+Shift+X",
    aliases: ["rs"]
  },
  {
    id: "peer-oi",
    filterId: "oi",
    action: "applyFilter",
    title: "Open issues & PRs",
    key: "i",
    code: "KeyI",
    labelMac: "\u2325\u21E7I",
    labelWin: "Alt+Shift+I",
    aliases: ["oi"]
  },
  {
    id: "peer-yp",
    filterId: "yp",
    action: "applyFilter",
    title: "Your pull requests",
    key: "u",
    code: "KeyU",
    labelMac: "\u2325\u21E7U",
    labelWin: "Alt+Shift+U",
    aliases: ["yp"]
  }
];
function resolvePullsPeerOptAction(opts = {}) {
  if (!opts.alt || !opts.shift || opts.mod) return null;
  const code = String(opts.code || "");
  if (code === "KeyK" || code === "KeyN") return null;
  for (const def of PULLS_PEER_OPT_ACTIONS) {
    if (code === def.code || code.toLowerCase() === String(def.code).toLowerCase()) {
      return { ...def };
    }
  }
  const key = String(opts.key || "").toLowerCase().replace(/^alt\+/i, "");
  const byKey = PULLS_PEER_OPT_ACTIONS.find((d) => d.key === key);
  return byKey ? { ...byKey } : null;
}
function buildPullsPeerOptHoldSlots(opts = {}) {
  const isMac = opts.isMac !== false;
  return PULLS_PEER_OPT_ACTIONS.map((d) => ({
    id: d.id,
    title: d.title,
    label: isMac ? d.labelMac : d.labelWin,
    key: d.key,
    filterId: d.filterId,
    action: d.action,
    aliases: d.aliases
  }));
}
function normLogin(login) {
  return String(login || "").trim().toLowerCase();
}
function asLoginList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const login = typeof item === "string" ? item : item && typeof item === "object" ? item.login || item.name || "" : "";
    const n = normLogin(login);
    if (n) out.push(n);
  }
  return out;
}
function parsePullsPaletteQuery(raw) {
  const source = String(raw || "");
  const tokens = source.trim().split(/\s+/).filter(Boolean);
  const filters = [];
  const rest = [];
  const seen = /* @__PURE__ */ new Set();
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
    text: rest.join(" ").trim(),
    raw: source
  };
}
function prMatchesFilter(pr, filterId, viewerLogin) {
  const id = String(filterId || "").toLowerCase();
  if (id === "df") return Boolean(pr?.draft);
  if (id === "rd") return !pr?.draft;
  if (id === "rs") return true;
  const me = normLogin(viewerLogin);
  if (!me) return false;
  const author = normLogin(pr?.author || pr?.user?.login);
  const assignees = asLoginList(pr?.assignees);
  const reviewers = asLoginList(
    pr?.requestedReviewers || pr?.requested_reviewers
  );
  switch (id) {
    case "am":
      return assignees.includes(me);
    case "cm":
      return author === me;
    case "hr":
      return reviewers.includes(me);
    case "my":
      return author === me || assignees.includes(me) || reviewers.includes(me);
    default:
      return true;
  }
}
function prSearchText(pr) {
  const labels = Array.isArray(pr?.labels) ? pr.labels.map((l) => typeof l === "string" ? l : l?.name || "").filter(Boolean).join(" ") : "";
  return [
    pr?.number != null ? String(pr.number) : "",
    pr?.number != null ? `#${pr.number}` : "",
    pr?.title || "",
    pr?.headRef || pr?.head?.ref || "",
    pr?.baseRef || pr?.base?.ref || "",
    pr?.author || "",
    labels,
    asLoginList(pr?.assignees).join(" "),
    asLoginList(pr?.requestedReviewers || pr?.requested_reviewers).join(" ")
  ].join(" ").toLowerCase();
}
function prMatchesText(pr, text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return true;
  return prSearchText(pr).includes(q);
}
function filterPullsForPalette(prs, opts = {}) {
  const list = Array.isArray(prs) ? prs : [];
  const parsed = parsePullsPaletteQuery(opts.query || "");
  const filters = Array.isArray(opts.filters) ? [...opts.filters.map((f) => String(f).toLowerCase()), ...parsed.filters] : parsed.filters;
  const uniqFilters = [...new Set(filters)].filter(
    (f) => PULLS_PALETTE_FILTERS[f]
  );
  const text = parsed.text;
  const viewer = opts.viewerLogin || "";
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
function actionMatchesQuery(action, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;
  const aliases = Array.isArray(action?.aliases) ? action.aliases : [];
  for (const raw of aliases) {
    const a = String(raw || "").trim().toLowerCase();
    if (!a) continue;
    if (a === q || a.startsWith(q) || q.startsWith(a)) return true;
  }
  const title = String(action?.title || "").toLowerCase();
  const titleWords = title.split(/[^a-z0-9]+/).filter(Boolean);
  if (titleWords.some((w) => w === q)) return true;
  const kws = Array.isArray(action?.keywords) ? action.keywords : [];
  for (const kw of kws) {
    const k = String(kw || "").toLowerCase();
    if (!k) continue;
    if (k === q || k.startsWith(q) || q.length >= 2 && q.startsWith(k)) {
      return true;
    }
  }
  return false;
}
function buildPullsPaletteItems(prs, opts = {}) {
  const owner = String(opts.owner || "").trim();
  const repo = String(opts.repo || "").trim();
  const origin = String(opts.webOrigin || "https://github.com").replace(
    /\/+$/,
    ""
  );
  const query = String(opts.query || "");
  const filtered = filterPullsForPalette(prs, {
    query,
    filters: opts.filters,
    viewerLogin: opts.viewerLogin || ""
  });
  const createHref = owner && repo ? `${origin}/${owner}/${repo}/compare` : `${origin}/`;
  const items = [];
  for (const def of PULLS_PALETTE_ACTIONS) {
    if (!actionMatchesQuery(def, query)) continue;
    const aliasHint = (def.aliases || []).join(" \xB7 ");
    if (def.action === "createPullRequest") {
      const repoLabel = owner && repo ? `${owner}/${repo}` : "Open compare page";
      items.push({
        id: def.id,
        kind: "action",
        action: "createPullRequest",
        title: def.title,
        description: repoLabel,
        subtitle: [aliasHint, repoLabel].filter(Boolean).join(" \xB7 "),
        section: null,
        href: createHref,
        owner: owner || void 0,
        repo: repo || void 0,
        aliases: def.aliases,
        digit: null
      });
      continue;
    }
    if (def.action === "applyFilter" && def.filterId) {
      const filterDef = PULLS_PALETTE_FILTERS[def.filterId] || PULLS_PRESET_FILTERS[def.filterId] || null;
      const desc = filterDef && filterDef.githubQuery || filterDef && filterDef.externalHref || (Array.isArray(def.keywords) ? def.keywords.slice(0, 4).join(", ") : "") || def.filterId;
      const peerOpt = PULLS_PEER_OPT_ACTIONS.find(
        (p) => p.filterId === def.filterId
      );
      items.push({
        id: def.id,
        kind: "action",
        action: "applyFilter",
        filterId: def.filterId,
        title: def.title,
        description: desc,
        subtitle: [aliasHint, peerOpt?.labelMac, desc].filter(Boolean).join(" \xB7 "),
        section: null,
        aliases: def.aliases,
        shortcut: peerOpt ? `opt+shift+${peerOpt.key}` : null,
        digit: null
      });
      continue;
    }
    if (def.action === "toggleFiltersMenu") {
      const desc = "Open GitHub Filters menu \xB7 \u2325\u21E7F";
      items.push({
        id: def.id,
        kind: "action",
        action: "toggleFiltersMenu",
        title: def.title,
        description: desc,
        subtitle: [aliasHint, desc].filter(Boolean).join(" \xB7 "),
        section: null,
        aliases: def.aliases,
        digit: null
      });
      continue;
    }
    if (def.action === "toggleHelp") {
      const desc = "Show action aliases and shortcuts";
      items.push({
        id: def.id,
        kind: "action",
        action: "toggleHelp",
        title: def.title,
        description: desc,
        subtitle: [aliasHint, desc].filter(Boolean).join(" \xB7 "),
        section: null,
        aliases: def.aliases,
        digit: null
      });
    }
  }
  for (const pr of filtered) {
    const num = Number(pr.number);
    const head = String(pr.headRef || pr.head?.ref || "").trim();
    const base = String(pr.baseRef || pr.base?.ref || "").trim();
    const author = String(pr.author || pr.user?.login || "").trim();
    const authorKey = author.toLowerCase();
    const avatarFromMap = pr.avatarUrls && typeof pr.avatarUrls === "object" ? pr.avatarUrls[authorKey] || pr.avatarUrls[author] : "";
    const authorAvatarUrl = String(
      pr.authorAvatarUrl || pr.avatarUrl || avatarFromMap || ""
    ).trim();
    const refs = head || base ? `${head || "?"} \u2192 ${base || "?"}` : "";
    items.push({
      id: `pr-${num}`,
      kind: "pr",
      action: "openPullRequest",
      title: pr.title || `Pull request #${num}`,
      // Plain-text fallback for tests / a11y
      subtitle: [`#${num}`, author ? `@${author}` : "", refs].filter(Boolean).join(" \xB7 "),
      section: null,
      number: num,
      author: author || void 0,
      authorAvatarUrl: authorAvatarUrl || void 0,
      headRef: head || void 0,
      baseRef: base || void 0,
      draft: Boolean(pr.draft),
      owner: owner || void 0,
      repo: repo || void 0,
      href: pr.htmlUrl || (owner && repo ? `${origin}/${owner}/${repo}/pull/${num}` : ""),
      digit: null
    });
  }
  for (let i = 0; i < items.length && i < 9; i++) {
    items[i] = { ...items[i], digit: i + 1 };
  }
  return items;
}
function nextPaletteFocusIndex(current, delta, count) {
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
function resolveOptDigitIndex(opts = {}) {
  if (!opts.alt || opts.mod || opts.shift) return -1;
  const code = String(opts.code || "");
  const m = code.match(/^Digit([1-9])$/i) || code.match(/^Numpad([1-9])$/i);
  if (m) return Number(m[1]) - 1;
  const key = String(opts.key || "");
  if (/^[1-9]$/.test(key)) return Number(key) - 1;
  return -1;
}
function normalizePullsPaletteKey(opts = {}) {
  const alt = Boolean(opts.alt);
  const shift = Boolean(opts.shift);
  const code = String(opts.code || "");
  if (alt || shift) {
    if (code === "KeyJ" || code === "keyj") return "j";
    if (code === "KeyK" || code === "keyk") return "k";
    const dm = code.match(/^Digit([1-9])$/i);
    if (dm) return dm[1];
  }
  if (code === "ArrowDown") return "arrowdown";
  if (code === "ArrowUp") return "arrowup";
  if (code === "Enter" || code === "NumpadEnter") return "enter";
  if (code === "Escape") return "escape";
  return String(opts.key || "").toLowerCase();
}
function resolvePullsPaletteShortcutAction(opts = {}) {
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
    shift
  });
  const code = String(opts.code || "");
  if (!paletteOpen) {
    if (alt && shift && !mod && key === "k") return "openPalette";
    return null;
  }
  if (key === "escape" || code === "Escape") return "closePalette";
  const digitIdx = resolveOptDigitIndex({
    alt,
    mod,
    shift,
    code: opts.code,
    key: opts.key
  });
  if (digitIdx >= 0) {
    return { action: "selectDigit", digitIndex: digitIdx };
  }
  if (!mod && !shift) {
    if (alt && key === "j") return "focusNext";
    if (alt && key === "k") return "focusPrev";
    if (key === "arrowdown" || code === "ArrowDown") return "focusNext";
    if (key === "arrowup" || code === "ArrowUp") return "focusPrev";
  }
  if (!mod && !shift && !alt && (key === "enter" || code === "Enter" || code === "NumpadEnter")) {
    return "activate";
  }
  return null;
}
function resolveActivateIndex(items, focusIndex, query) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return -1;
  const q = String(query || "").trim().toLowerCase();
  if (q) {
    if (PULLS_PALETTE_FILTERS[q] || PULLS_PRESET_FILTERS[q]) {
      const fi = list.findIndex(
        (it) => it?.action === "applyFilter" && it?.filterId === q
      );
      if (fi >= 0) return fi;
    }
    const byAlias = list.findIndex(
      (it) => (it?.aliases || []).some((a) => String(a).toLowerCase() === q)
    );
    if (byAlias >= 0) return byAlias;
    const createIdx = list.findIndex((it) => it?.action === "createPullRequest");
    if (createIdx >= 0) {
      const aliases = list[createIdx].aliases || ["np", "new"];
      if (aliases.some((a) => String(a).toLowerCase() === q)) return createIdx;
    }
  }
  const cur = Number(focusIndex);
  if (Number.isFinite(cur) && cur >= 0 && cur < list.length) return cur;
  return 0;
}
function unwrapPullsPaletteAction(resolved) {
  if (!resolved) return { action: null, digitIndex: -1 };
  if (typeof resolved === "string") return { action: resolved, digitIndex: -1 };
  return {
    action: resolved.action || null,
    digitIndex: Number.isFinite(resolved.digitIndex) ? resolved.digitIndex : -1
  };
}
function buildPullsPaletteHelpEntries() {
  return PULLS_PALETTE_ACTIONS.map((a) => {
    const aliases = Array.isArray(a.aliases) ? a.aliases.map((x) => String(x).toLowerCase()).filter(Boolean) : [];
    return {
      id: a.id,
      title: String(a.title || a.id),
      aliases,
      primary: aliases[0] || "",
      action: a.action,
      filterId: a.filterId || null
    };
  }).filter((e) => e.primary);
}
function buildCreatePullRequestUrl(owner, repo, webOrigin = "https://github.com") {
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const origin = String(webOrigin || "https://github.com").replace(/\/+$/, "");
  if (!o || !r) return `${origin}/`;
  return `${origin}/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare`;
}
function githubQueryForFilter(filterId) {
  const id = String(filterId || "").toLowerCase();
  if (PULLS_PALETTE_FILTERS[id]?.githubQuery) {
    return String(PULLS_PALETTE_FILTERS[id].githubQuery);
  }
  if (PULLS_PRESET_FILTERS[id]?.githubQuery) {
    return String(PULLS_PRESET_FILTERS[id].githubQuery);
  }
  return "";
}
function buildPullsListFilterUrl(owner, repo, filterId, webOrigin = "https://github.com") {
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const origin = String(webOrigin || "https://github.com").replace(/\/+$/, "");
  const id = String(filterId || "").toLowerCase();
  const preset = PULLS_PRESET_FILTERS[id];
  if (preset?.externalHref) return String(preset.externalHref);
  if (!o || !r) return `${origin}/`;
  const pullsBase = `${origin}/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls`;
  const issuesBase = `${origin}/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues`;
  if (id === "rs" || PULLS_PALETTE_FILTERS[id]?.reset) {
    return pullsBase;
  }
  const pathByFilter = {
    am: `${pullsBase}/assigned/@me`,
    cm: `${pullsBase}/created_by/@me`,
    hr: `${pullsBase}/review-requested/@me`
  };
  if (pathByFilter[id]) return pathByFilter[id];
  const q = githubQueryForFilter(id);
  if (!q) return pullsBase;
  const params = new URLSearchParams();
  params.set("q", q);
  const surface = preset?.surface === "issues" || PULLS_PRESET_FILTERS[id] ? issuesBase : pullsBase;
  if (id === "my" || PULLS_PALETTE_FILTERS[id]) {
    return `${pullsBase}?${params.toString()}`;
  }
  return `${surface}?${params.toString()}`;
}
function readViewerLoginFromDocument(doc) {
  if (!doc) return "";
  try {
    const meta = doc.querySelector?.('meta[name="user-login"]') || doc.querySelector?.('meta[name="octolytics-actor-login"]');
    const content = meta?.getAttribute?.("content") || "";
    if (content) return String(content).trim();
  } catch {
  }
  try {
    const el = doc.querySelector?.("[data-login]") || doc.querySelector?.('img.avatar[alt^="@"]');
    const data = el?.getAttribute?.("data-login");
    if (data) return String(data).trim();
    const alt = el?.getAttribute?.("alt") || "";
    if (alt.startsWith("@")) return alt.slice(1).trim();
  } catch {
  }
  return "";
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
  buildCreatePullRequestUrl,
  githubQueryForFilter,
  resolvePullsPeerOptAction,
  buildPullsPeerOptHoldSlots,
  buildPullsListFilterUrl,
  readViewerLoginFromDocument,
  normLogin
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = pullsPaletteApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PRPullsPalette = pullsPaletteApi;
}
