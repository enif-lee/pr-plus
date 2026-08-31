/** @module modal/lib/searchable-select */
/**
 * Pure helpers for searchable select / combobox filtering.
 */

/**
 * @typedef {{ id: string, label: string, keywords?: string[], disabled?: boolean, meta?: object }} SelectOption
 */

/**
 * Filter options by free-text query (label + keywords + id).
 * @param {SelectOption[]} options
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {SelectOption[]}
 */
export function filterSelectOptions(options: any, query: any, opts: any = {}) {
  const list = Array.isArray(options) ? options : [];
  const limit =
    Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 50;
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.filter((o) => o && !o.disabled).slice(0, limit);
  const words = q.split(/\s+/).filter(Boolean);
  return list
    .filter((o) => {
      if (!o || o.disabled) return false;
      const hay = [o.id, o.label, ...(o.keywords || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

/**
 * Viewport-fixed popover box for SearchableSelect.
 * Horizontal: start-align to the anchor, flip to the anchor's right edge if
 * that would overflow, then clamp. Never returns a left of 0 just because
 * the panel has not been measured — callers must not paint until this runs.
 */
export function layoutSselectPopover(input: {
  anchor: {
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
    width?: number;
    height?: number;
  };
  viewport: { width?: number; height?: number };
  panelHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  placement?: 'bottom' | 'top' | string;
  gap?: number;
  edge?: number;
}): { top: number; left: number; width: number } {
  const edge = Math.max(0, Number(input.edge) || 8);
  const gap = Number.isFinite(Number(input.gap)) ? Number(input.gap) : 6;
  const minW = Math.max(160, Number(input.minWidth) || 220);
  const maxW = Math.max(minW, Number(input.maxWidth) || 320);
  const a = input.anchor || {};
  const vw = Math.max(0, Number(input.viewport?.width) || 0);
  const vh = Math.max(0, Number(input.viewport?.height) || 0);
  const anchorW = Math.max(0, Number(a.width) || 0);
  const width = Math.min(maxW, Math.max(minW, anchorW || minW));
  const aLeft = Number(a.left) || 0;
  const aRight = Number.isFinite(Number(a.right))
    ? Number(a.right)
    : aLeft + anchorW;
  let left = aLeft;
  if (vw > 0 && left + width > vw - edge) {
    left = aRight - width;
  }
  const maxLeft = vw > 0 ? Math.max(edge, vw - width - edge) : edge;
  left = Math.min(Math.max(edge, left), maxLeft);

  const belowTop = (Number(a.bottom) || 0) + gap;
  const panelH = Math.max(0, Number(input.panelHeight) || 0);
  const aboveTop = (Number(a.top) || 0) - panelH - gap;
  const preferBottom = input.placement !== 'top';
  let top = preferBottom ? belowTop : Math.max(edge, aboveTop);
  if (panelH > 0 && vh > 0) {
    const fitsBelow = belowTop + panelH <= vh - edge;
    const fitsAbove = aboveTop >= edge;
    const spaceBelow = vh - (Number(a.bottom) || 0) - edge;
    const spaceAbove = (Number(a.top) || 0) - edge;
    if (preferBottom) {
      if (fitsBelow) top = belowTop;
      else if (fitsAbove) top = aboveTop;
      else top = spaceAbove > spaceBelow ? Math.max(edge, aboveTop) : belowTop;
    } else if (fitsAbove) {
      top = aboveTop;
    } else if (fitsBelow) {
      top = belowTop;
    } else {
      top = spaceBelow > spaceAbove ? belowTop : Math.max(edge, aboveTop);
    }
  }
  return { top: Math.max(edge, top), left, width };
}

/**
 * ⌥1 / ⌥2 / ⌥3 → filtered option index 0..2 (single-select quick pick).
 * Ignores meta/ctrl/shift so it does not steal ⌘1 / etc.
 */
export function resolveOptDigitPickIndex(e: {
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  code?: string;
  key?: string;
} | null | undefined): number | null {
  if (!e || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return null;
  const code = String(e.code || '');
  if (code === 'Digit1' || code === 'Numpad1') return 0;
  if (code === 'Digit2' || code === 'Numpad2') return 1;
  if (code === 'Digit3' || code === 'Numpad3') return 2;
  const k = String(e.key || '');
  if (k === '1') return 0;
  if (k === '2') return 1;
  if (k === '3') return 2;
  return null;
}

/** Pick filtered[i] only for the first three hits (⌥1–3 contract). */
export function pickFilteredOptionByIndex(
  filtered: any[] | null | undefined,
  index: number
): any | null {
  if (!Array.isArray(filtered)) return null;
  if (!Number.isFinite(index) || index < 0 || index > 2) return null;
  return filtered[index] != null ? filtered[index] : null;
}

/**
 * Build people options from logins + optional status / avatar maps.
 * @param {string[]} logins
 * @param {Record<string, string>} [statusByLogin]
 * @param {Record<string, string>} [avatarByLogin] login → avatar URL
 * @returns {SelectOption[]}
 */
export function buildPeopleOptions(logins: any, statusByLogin: any = {}, avatarByLogin: any = {}) {
  const seen = new Set();
  const out = [];
  const avatars = avatarByLogin && typeof avatarByLogin === 'object' ? avatarByLogin : {};
  for (const login of logins || []) {
    const raw = String(login || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const status = statusByLogin[key] || statusByLogin[raw] || '';
    const avatarUrl = avatars[key] || avatars[raw] || '';
    out.push({
      id: raw,
      label: raw,
      keywords: [raw, status].filter(Boolean),
      meta: { status, login: raw, avatarUrl, kind: 'user' },
    });
  }
  return out;
}

/**
 * Map a GitHub directory user (assignable / mentionable) onto picker option
 * shape. Keywords include login + display name so typed query matches both.
 */
export function mapDirectoryUserToSelectOption(user: any) {
  const login = String(user?.login || '').trim();
  if (!login) return null;
  const name = String(user?.name || '').trim();
  const avatarUrl = String(
    user?.avatarUrl || user?.avatar_url || ''
  ).trim();
  const secondary =
    name && name.toLowerCase() !== login.toLowerCase() ? name : '';
  return {
    id: login,
    label: login,
    keywords: [login, name].filter(Boolean),
    secondary,
    meta: { login, name, avatarUrl, kind: 'user' },
  };
}

function excludeLoginSet(exclude: any): Set<string> {
  const set = new Set<string>();
  for (const x of Array.isArray(exclude) ? exclude : []) {
    const k = String(x || '')
      .trim()
      .toLowerCase();
    if (k) set.add(k);
  }
  return set;
}

/**
 * Permission-directory users → select options. Already-assigned / already-
 * requested logins are dropped. Does not consult local PR-actor unions.
 */
export function buildPeopleOptionsFromDirectory(
  users: any,
  opts: { exclude?: any[] } = {}
) {
  const exclude = excludeLoginSet(opts.exclude);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const u of Array.isArray(users) ? users : []) {
    const opt = mapDirectoryUserToSelectOption(u);
    if (!opt) continue;
    const key = String(opt.id).toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(opt);
  }
  return out;
}

/** Directory-first, then extras (local seed). First-seen login wins. */
export function mergePeopleSelectOptions(primary: any, extra: any) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const list of [primary, extra]) {
    for (const o of Array.isArray(list) ? list : []) {
      if (!o) continue;
      const key = String(o.id || o.label || '')
        .trim()
        .toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
  }
  return out;
}

/**
 * Assignee/reviewer picker option list from a GitHub directory payload.
 * Local `collectPeopleLogins` is not the source — pass it only as extraOptions.
 */
export function peoplePickerOptionsFromDirectory(
  users: any,
  query: any,
  opts: {
    exclude?: any[];
    extraOptions?: any[];
    limit?: number;
  } = {}
) {
  const dir = buildPeopleOptionsFromDirectory(users, { exclude: opts.exclude });
  const merged = mergePeopleSelectOptions(dir, opts.extraOptions || []);
  return filterSelectOptions(merged, query, { limit: opts.limit });
}

/** Assignee → assignableUsers; reviewer → repo collaborators (request-review 422). */
export function peopleDirectoryKindForPicker(
  type: any
): 'assignable' | 'mentionable' | 'collaborator' {
  return String(type || '') === 'reviewer' ? 'collaborator' : 'assignable';
}

/**
 * Logins GitHub will 422 on request-review: already requested + PR author.
 */
export function reviewerPickerExcludeLogins(detail: any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: any) => {
    const s = String(raw || '').trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  add(detail?.author);
  for (const x of detail?.requestedReviewers || []) add(x);
  return out;
}

export function isPullRequestAuthor(login: any, detail: any): boolean {
  const a = String(detail?.author || '')
    .trim()
    .toLowerCase();
  const b = String(login || '')
    .trim()
    .toLowerCase();
  return Boolean(a && b && a === b);
}

/**
 * Directory search is only for *adding* an assignee/reviewer (or re-request).
 * Palette Unassign / Remove reviewer reuse type assignee|reviewer but must
 * keep their current-assignee / requested-reviewer option lists.
 */
export function peoplePickerShouldSearchDirectory(picker: any): boolean {
  if (!picker || typeof picker !== 'object') return false;
  if (picker.peopleDirectory === true) return true;
  if (picker.peopleDirectory === false) return false;
  const type = String(picker.type || '');
  if (type !== 'assignee' && type !== 'reviewer') return false;
  const title = String(picker.title || '')
    .trim()
    .toLowerCase();
  return title === 'add assignee' || title === 'add reviewer';
}

/**
 * GitHub default label colors (hex without #) used when API color is missing.
 * https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels
 */
export const GITHUB_DEFAULT_LABEL_COLORS: Record<string, string> = {
  bug: 'd73a4a',
  documentation: '0075ca',
  duplicate: 'cfd3d7',
  enhancement: 'a2eeef',
  'good first issue': '7057ff',
  'help wanted': '008672',
  invalid: 'e4e669',
  question: 'd876e3',
  wontfix: 'ffffff',
};

/**
 * Resolve a label color to a CSS hex, falling back to GitHub defaults by name.
 */
export function labelColorCss(color: unknown, name?: unknown): string {
  const raw = String(color || '')
    .trim()
    .replace(/^#/, '');
  if (/^[0-9a-fA-F]{3,8}$/.test(raw)) return `#${raw}`;
  const key = String(name || '')
    .trim()
    .toLowerCase();
  const fallback = key ? GITHUB_DEFAULT_LABEL_COLORS[key] : '';
  return fallback ? `#${fallback}` : '';
}

/**
 * Normalize raw color + name → hex-without-# for storage on meta.color.
 */
export function resolveLabelColor(color: unknown, name?: unknown): string {
  const css = labelColorCss(color, name);
  return css ? css.replace(/^#/, '') : '';
}

/**
 * Build label options from label objects or strings.
 * Later entries with a color upgrade earlier colorless ones (same name).
 * @param {Array<string|{name:string,color?:string}>} labels
 */
export function buildLabelOptions(labels: any) {
  const byKey = new Map<string, any>();
  for (const l of labels || []) {
    const name = typeof l === 'string' ? l : (l as any)?.name;
    const raw = String(name || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const fromObj =
      typeof l === 'object' && l
        ? String((l as any).color || '').trim().replace(/^#/, '')
        : '';
    const color = resolveLabelColor(fromObj, raw);
    const next = {
      id: raw,
      label: raw,
      keywords: [raw, (l as any)?.description].filter(Boolean),
      meta:
        typeof l === 'object' && l
          ? { ...(l as any), name: raw, color, kind: 'label' }
          : { name: raw, color, kind: 'label' },
    };
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, next);
      continue;
    }
    // Prefer entry that carries a real color / description
    if (!prev.meta?.color && next.meta?.color) {
      byKey.set(key, next);
    } else if (
      prev.meta?.color &&
      next.meta?.color &&
      !prev.meta?.description &&
      next.meta?.description
    ) {
      byKey.set(key, { ...prev, meta: { ...prev.meta, description: next.meta.description } });
    }
  }
  return [...byKey.values()];
}

/**
 * Whether free-text query already matches an option id/label (exact, case-insensitive).
 * Used to decide when to show a Create… row for labels / milestones.
 */
export function queryMatchesOption(options: any, query: any) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return false;
  for (const o of options || []) {
    if (!o) continue;
    const id = String(o.id || '')
      .trim()
      .toLowerCase();
    const label = String(o.label || '')
      .trim()
      .toLowerCase();
    if (id === q || label === q) return true;
    // Milestone labels look like "Title (#12)" — also match bare title
    const title = String(o.meta?.title || '')
      .trim()
      .toLowerCase();
    if (title && title === q) return true;
  }
  return false;
}

/**
 * Build milestone options from API milestones (number + title).
 * @param {Array<{ number?: number, title?: string, state?: string, description?: string }>} milestones
 */
export function buildMilestoneOptions(milestones: any) {
  const byNum = new Map();
  for (const m of milestones || []) {
    const number = Number(m?.number);
    if (!Number.isFinite(number) || number <= 0) continue;
    const title = String(m?.title || `Milestone ${number}`).trim();
    const id = String(number);
    byNum.set(id, {
      id,
      label: `${title} (#${number})`,
      keywords: [title, id, m?.description, m?.state].filter(Boolean),
      meta: {
        kind: 'milestone',
        number,
        title,
        state: m?.state || '',
        description: m?.description || '',
      },
    });
  }
  return [...byNum.values()].sort(
    (a, b) => Number(b.meta.number) - Number(a.meta.number)
  );
}

/**
 * Build branch options from open PR list + current base/head.
 * @param {Array<{ headRef?: string, baseRef?: string }>} prs
 * @param {{ baseRef?: string, headRef?: string, extra?: string[] }} [ctx]
 */
export function buildBranchOptions(prs: any, ctx: any = {}) {
  const names = new Set();
  for (const p of prs || []) {
    if (p?.headRef) names.add(String(p.headRef));
    if (p?.baseRef) names.add(String(p.baseRef));
  }
  if (ctx.baseRef) names.add(String(ctx.baseRef));
  if (ctx.headRef) names.add(String(ctx.headRef));
  for (const e of ctx.extra || []) if (e) names.add(String(e));
  // Common defaults
  for (const d of ['main', 'master', 'develop', 'dev', 'trunk']) names.add(d);
  return [...names]
    .filter(Boolean)
    .sort((a: any, b: any) => String(a).localeCompare(String(b)))
    .map((name) => ({
      id: name,
      label: name,
      keywords: [name],
      meta: { branch: name },
    }));
}

/**
 * Whether a login / user object is a GitHub App / bot (not re-requestable / removable).
 * Prefers API `type: "Bot"` / `isBot` when present; falls back to `[bot]` login suffix.
 *
 * @param {string|{ login?: string, type?: string, isBot?: boolean, bot?: boolean }|null|undefined} userOrLogin
 * @param {{ actorIsBot?: Record<string, boolean>|Map<string, boolean>|null }|null} [detail]
 */
export function isBotAccount(userOrLogin: any, detail: any = null) {
  if (userOrLogin == null) return false;
  if (typeof userOrLogin === 'object') {
    if (userOrLogin.isBot === true || userOrLogin.bot === true) return true;
    const type = String(userOrLogin.type || userOrLogin.userType || '').toLowerCase();
    if (type === 'bot') return true;
    const login = userOrLogin.login || userOrLogin.author || '';
    if (login && isBotAccount(login, detail)) return true;
    return false;
  }
  const login = String(userOrLogin || '').trim();
  if (!login) return false;
  const key = login.toLowerCase();
  const map = detail?.actorIsBot;
  if (map instanceof Map && map.has(key)) return Boolean(map.get(key));
  if (map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, key)) {
    return Boolean((map as any)[key]);
  }
  // GitHub Apps appear as app-name[bot]
  if (/\[bot\]$/i.test(login)) return true;
  return false;
}

/**
 * Merge reviewer logins + latest review state into display rows.
 * PR author is never listed as a reviewer (even if present in reviews /
 * requested_reviewers). Bots are flagged via isBot.
 * @returns {Array<{ login: string, status: string, isBot: boolean }>}
 */
export function buildUnifiedReviewerRows(detail: any) {
  const d = detail || {};
  const authorKey = String(d.author || '')
    .trim()
    .toLowerCase();
  const statusBy = new Map();
  const botBy = new Map();
  for (const r of d.reviews || []) {
    if (!r?.author) continue;
    const key = String(r.author).toLowerCase();
    if (authorKey && key === authorKey) continue; // author cannot be a reviewer
    statusBy.set(key, String(r.state || 'COMMENTED'));
    if (isBotAccount(r, d) || isBotAccount(r.author, d)) botBy.set(key, true);
  }
  const rows = new Map();
  for (const login of d.requestedReviewers || []) {
    const raw = String(login || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (authorKey && key === authorKey) continue;
    const bot = botBy.get(key) || isBotAccount(raw, d);
    rows.set(key, {
      login: raw,
      status: statusBy.get(key) || 'PENDING',
      isBot: bot,
    });
  }
  for (const [key, state] of statusBy) {
    if (authorKey && key === authorKey) continue;
    if (rows.has(key)) {
      const row = rows.get(key);
      row.status = state;
      if (botBy.get(key)) row.isBot = true;
    } else {
      // use original casing from reviews
      const rev = (d.reviews || []).find(
        (r: any) => String(r.author || '').toLowerCase() === key
      );
      rows.set(key, {
        login: rev?.author || key,
        status: state,
        isBot: botBy.get(key) || isBotAccount(rev, d) || isBotAccount(rev?.author || key, d),
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.login.localeCompare(b.login));
}
