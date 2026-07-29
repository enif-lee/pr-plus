/**
 * Shared e2e harness for pr+ modal scenarios.
 */
import {
  ab,
  closeAll,
  evalInPage,
  open,
  press as abPress,
  waitFor,
  waitMs,
  waitNetwork,
  ROOT,
} from './ab.mjs';

export const REPO = 'enif-lee/pr-plus';
export const PULLS_URL = `https://github.com/${REPO}/pulls`;
/** Preferred multi-thread conversation / keyboard PR (open) */
export const DEMO_PR = 7;
/**
 * Large architecture PR for heavy diff scroll.
 * Merged — not on default open /pulls; open via closed PR URL.
 */
export const HEAVY_PR = 14;
/** Multi-hunk expand chrome (open) */
export const MULTI_HUNK_PR = 13;

export function prUrl(n) {
  return `https://github.com/${REPO}/pull/${Number(n)}`;
}

/** Wait until pr+ overlay (modal or embed) is ready for a PR. */
export function waitPrShellReady(n, label) {
  waitFor(
    `
    const ov = document.querySelector('.prp-overlay');
    if (!ov) return false;
    const loading = document.querySelector('.prp-skeleton, [class*="LoadingSkeleton"], .prp-loading');
    if (loading) return false;
    return !!(
      document.querySelector('.prp-conversation-virtual') ||
      document.querySelector('.prp-vlist') ||
      document.querySelector('.prp-header')
    );
    `,
    {
      timeoutMs: 30_000,
      label: label || `PR #${n} shell ready`,
    }
  );
  waitMs(400);
}

export function log(msg) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[e2e ${t}] ${msg}`);
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export function assertInRange(n, lo, hi, label) {
  assert(
    typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi,
    `${label}: expected ${lo}..${hi}, got ${n}`
  );
}

/**
 * @template T
 * @param {string} name
 * @param {() => T | Promise<T>} fn
 */
export async function step(name, fn) {
  log(`→ ${name}`);
  const t0 = Date.now();
  try {
    const out = await fn();
    log(`✓ ${name} (${Date.now() - t0}ms)`);
    return out;
  } catch (e) {
    log(`✗ ${name} (${Date.now() - t0}ms)`);
    throw e;
  }
}

export function ensureBrowser() {
  // Prefer fresh session for isolation; profile keeps GitHub login.
  // Do not waitMs() after close — that can spawn a bare session without extensions.
  closeAll();
}

export function openPulls() {
  open(PULLS_URL);
  waitNetwork();
  waitMs(500);
  const title = evalInPage(`document.title`);
  assert(/pull/i.test(String(title)) || locationOk(), `expected pulls page, title=${title}`);
}

function locationOk() {
  return evalInPage(`location.pathname.includes('/pulls')`);
}

/** Close pr+ overlay if present (Esc cascade). */
export function closeOverlay() {
  for (let i = 0; i < 4; i++) {
    const open = evalInPage(`!!document.querySelector('.prp-overlay')`);
    if (!open) return;
    press('Escape');
    waitMs(200);
  }
  // Force-remove only if stuck (should not happen)
  const still = evalInPage(`!!document.querySelector('.prp-overlay')`);
  if (still) {
    evalInPage(`document.querySelector('.prp-overlay')?.remove(); document.body.style.overflow=''; true`);
  }
}

/**
 * Open a closed/merged PR by direct GitHub URL (autoOpenEmbed or in-page shell).
 * Use when the PR is not on the default open /pulls list.
 * @param {number} n
 */
export function openPrByUrl(n) {
  closeOverlay();
  open(prUrl(n));
  waitNetwork();
  waitMs(600);
  waitPrShellReady(n, `PR #${n} via URL shell ready`);
}

/**
 * Open a PR by number.
 * - Default: click titled link on open /pulls (content-script intercept).
 * - `viaUrl: true` or missing list link: navigate to `/pull/{n}` (closed/merged OK).
 * @param {number} n
 * @param {{ viaUrl?: boolean }} [opts]
 */
export function openPr(n, opts = {}) {
  if (opts.viaUrl) {
    openPrByUrl(n);
    return;
  }
  closeOverlay();
  // Ensure on pulls
  if (!evalInPage(`location.pathname.includes('/pulls')`)) {
    openPulls();
  }
  const clicked = evalInPage(`
    (() => {
      const href = '/enif-lee/pr-plus/pull/${n}';
      const a = [...document.querySelectorAll('a[href]')].find((el) => {
        const h = el.getAttribute('href') || '';
        if (!(h === href || h.startsWith(href + '#') || h.startsWith(href + '?'))) return false;
        const t = (el.textContent || '').trim();
        return t.length > 2; // prefer titled link over empty icon
      });
      if (!a) return { ok: false };
      a.click();
      return { ok: true, text: (a.textContent || '').trim().slice(0, 80) };
    })()
  `);
  if (!clicked?.ok) {
    // Closed/merged (or pagination): fall back to PR URL
    log(`  PR #${n} not on open pulls list — opening ${prUrl(n)}`);
    openPrByUrl(n);
    return;
  }
  waitPrShellReady(n, `PR #${n} modal ready`);
}

export function layout() {
  return evalInPage(`document.querySelector('.prp-overlay')?.getAttribute('data-layout') || null`);
}

export function setLayout(target) {
  // target: 'conversation' | 'diff'
  for (let i = 0; i < 3; i++) {
    const cur = layout();
    if (cur === target) return;
    press('Alt+.');
    waitMs(500);
  }
  // Fallback: header layout toggle button (when chord delivery is flaky)
  if (layout() !== target) {
    evalInPage(`document.querySelector('.prp-header__icon-btn--layout')?.click()`);
    waitMs(500);
  }
  assert(layout() === target, `expected layout=${target}, got ${layout()}`);
}

export function modalProbe() {
  return evalInPage(`
    (() => {
      const ov = document.querySelector('.prp-overlay');
      if (!ov) return { overlay: false };
      let cssRules = 0;
      let cssHref = null;
      for (const s of document.styleSheets) {
        try {
          if (s.href && s.href.includes('pr-modal.css')) {
            cssRules = s.cssRules?.length || 0;
            cssHref = s.href;
          }
        } catch {}
      }
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          display: s.display,
          visibility: s.visibility,
          bg: s.backgroundColor,
        };
      };
      return {
        overlay: true,
        layout: ov.getAttribute('data-layout'),
        theme: ov.className.includes('prp-theme-dark') ? 'dark' : 'light',
        cssRules,
        cssHref: cssHref ? 'pr-modal.css' : null,
        header: pick('.prp-header'),
        merge: pick('.prp-merge-box'),
        conv: pick('.prp-conversation-virtual'),
        aside: pick('.prp-conversation__aside'),
        filetree: pick('.prp-filetree'),
        vlist: pick('.prp-vlist'),
        toolbar: pick('.prp-diff-toolbar'),
        cards: document.querySelectorAll('.prp-card').length,
        title: document.querySelector('.prp-header h2')?.textContent?.trim()?.slice(0, 100) || null,
      };
    })()
  `);
}

export function convFocusPin() {
  return evalInPage(`
    (() => {
      const focused = document.querySelector('.prp-card--kb-focus');
      const scrollEl = document.querySelector('.prp-conversation-virtual');
      if (!focused || !scrollEl) {
        return { hasFocus: !!focused, pin: null, scrollTop: scrollEl?.scrollTop ?? null, cardH: null };
      }
      const fr = focused.getBoundingClientRect();
      const sr = scrollEl.getBoundingClientRect();
      // Prefer inner focus anchor when the card itself is a tall review group.
      const anchor =
        focused.querySelector('[data-thread-focus-anchor], [data-search-anchor]') || focused;
      const ar = anchor.getBoundingClientRect();
      return {
        hasFocus: true,
        pin: Math.round(ar.top - sr.top),
        cardPin: Math.round(fr.top - sr.top),
        cardH: Math.round(fr.height),
        scrollTop: scrollEl.scrollTop,
        cls: focused.className.slice(0, 120),
      };
    })()
  `);
}

export function diffScroll() {
  return evalInPage(`
    (() => {
      const v = document.querySelector('.prp-vlist');
      if (!v) return null;
      return { scrollTop: v.scrollTop, clientHeight: v.clientHeight, scrollHeight: v.scrollHeight };
    })()
  `);
}

export function convScrollTop() {
  return evalInPage(`document.querySelector('.prp-conversation-virtual')?.scrollTop ?? null`);
}

export function activeFileLabel() {
  return evalInPage(`
    (() => {
      const t = [...document.querySelectorAll('.prp-filetree [class*="active"], .prp-filetree [aria-current]')]
        .map((e) => (e.textContent || '').trim())
        .find(Boolean);
      return t ? t.slice(0, 80) : null;
    })()
  `);
}

/** Snapshot of Diff line selection + island dock. */
export function selectionProbe() {
  return evalInPage(`
    (() => {
      const selected = [...document.querySelectorAll('.prp-vline--selected')];
      const roles = {
        start: document.querySelectorAll('.prp-vline--sel-start').length,
        middle: document.querySelectorAll('.prp-vline--sel-middle').length,
        end: document.querySelectorAll('.prp-vline--sel-end').length,
        only: document.querySelectorAll('.prp-vline--sel-only').length,
      };
      const dock = document.querySelector('.prp-selection-dock, .prp-selection-group, .prp-selection-island');
      const commentPhase = !!document.querySelector('.prp-selection-island--comment, .prp-selection-island[data-phase="comment"]');
      return {
        count: selected.length,
        roles,
        dock: !!dock,
        dockCls: dock?.className?.slice(0, 100) || null,
        commentPhase,
      };
    })()
  `);
}

/** Header status badges (Draft / Merged / Closed). */
export function statusBadgeProbe() {
  return evalInPage(`
    (() => {
      const badges = [...document.querySelectorAll('.prp-badge')].map((b) => ({
        text: (b.textContent || '').trim(),
        cls: String(b.className || ''),
      }));
      return {
        badges,
        hasMerged: badges.some(
          (b) => /merged/i.test(b.text) || b.cls.includes('prp-badge--merged')
        ),
        hasClosed: badges.some(
          (b) =>
            /closed/i.test(b.text) &&
            !/merged/i.test(b.text) &&
            (b.cls.includes('prp-badge--closed') || b.cls.includes('closed'))
        ),
        hasDraft: badges.some(
          (b) => /draft/i.test(b.text) || b.cls.includes('prp-badge--draft')
        ),
      };
    })()
  `);
}

/** Merge box terminal-state chrome (tone class + kind). */
export function mergeBoxProbe() {
  return evalInPage(`
    (() => {
      const box = document.querySelector('.prp-merge-box');
      if (!box) return { ok: false };
      const tone =
        [...box.classList].find((c) => c.startsWith('prp-merge-box--')) || null;
      return {
        ok: true,
        tone,
        kind: box.getAttribute('data-merge-kind'),
        headline: (
          document.querySelector('.prp-merge-box__headline')?.textContent || ''
        )
          .trim()
          .slice(0, 100),
      };
    })()
  `);
}

/** Diff code-line expand affordance snapshot. */
export function lineExpandProbe() {
  return evalInPage(`
    (() => {
      const expandable = [
        ...document.querySelectorAll('.prp-vline--line-expandable'),
      ];
      const expanded = document.querySelector('.prp-vline--line-expanded');
      let maxTextLen = 0;
      for (const r of document.querySelectorAll(
        '.prp-vline--selectable:not(.prp-vline--header) .prp-code, .prp-vline--selectable:not(.prp-vline--header) code'
      )) {
        maxTextLen = Math.max(maxTextLen, (r.textContent || '').length);
      }
      return {
        expandableCount: expandable.length,
        expanded: !!expanded,
        expandedH: expanded
          ? Math.round(expanded.getBoundingClientRect().height)
          : 0,
        maxTextLen,
        hasExpandBtn: !!document.querySelector('.prp-line-expand-btn'),
      };
    })()
  `);
}

/**
 * Click first long-line expand (or collapse) button.
 * Caller should waitMs then read {@link lineExpandProbe} — height updates after React paint.
 * @returns {{ ok: boolean, beforeH?: number, reason?: string }}
 */
export function clickFirstLineExpandBtn() {
  return evalInPage(`
    (() => {
      const row =
        document.querySelector('.prp-vline--line-expanded') ||
        document.querySelector('.prp-vline--line-expandable');
      const btn = row?.querySelector('.prp-line-expand-btn');
      if (!row || !btn) return { ok: false, reason: 'no expandable row' };
      row.scrollIntoView({ block: 'center' });
      const beforeH = Math.round(row.getBoundingClientRect().height);
      btn.click();
      return { ok: true, beforeH };
    })()
  `);
}

/**
 * Click file-header collapse chevron (focused header preferred).
 * More reliable than keyboard when Diff still holds thread-nav context (⌥F = thread fold).
 */
export function clickFileHeaderCollapse() {
  return evalInPage(`
    (() => {
      const header =
        document.querySelector('.prp-vline--header-focus') ||
        document.querySelector(
          '.prp-vline--header[data-file-path="' +
            (document
              .querySelector('.prp-vline--selected')
              ?.getAttribute('data-file-path') || '')
              .replace(/"/g, '') +
            '"]'
        ) ||
        document.querySelector('.prp-vline--header');
      const btn = header?.querySelector('.prp-file-header__collapse');
      if (!btn) return { ok: false, reason: 'no collapse button' };
      header.scrollIntoView({ block: 'center' });
      const before = btn.getAttribute('aria-expanded');
      btn.click();
      return {
        ok: true,
        before,
        after: btn.getAttribute('aria-expanded'),
        path: header.getAttribute('data-file-path'),
      };
    })()
  `);
}

/** Diff file collapse chrome for the focused / first header. */
export function fileCollapseProbe() {
  return evalInPage(`
    (() => {
      const header =
        document.querySelector('.prp-vline--header-focus') ||
        document.querySelector('.prp-vline--header');
      const btn =
        header?.querySelector('.prp-file-header__collapse') ||
        document.querySelector('.prp-file-header__collapse');
      const codeRows = document.querySelectorAll(
        '.prp-vline--selectable:not(.prp-vline--header)'
      ).length;
      return {
        hasHeader: !!header,
        hasBtn: !!btn,
        ariaExpanded: btn?.getAttribute('aria-expanded') ?? null,
        codeRows,
        activePath:
          document
            .querySelector('.prp-vline--selected')
            ?.getAttribute('data-file-path') ||
          document
            .querySelector('.prp-vline--header-focus')
            ?.getAttribute('data-file-path') ||
          document
            .querySelector('.prp-filetree__item--active')
            ?.getAttribute('data-file-path') ||
          null,
      };
    })()
  `);
}

/** Fire product Alt+F (file fold on Diff / thread fold when context active). */
export function pressOptF() {
  return evalInPage(`
    (() => {
      const t = document.documentElement;
      const opts = {
        key: 'f',
        code: 'KeyF',
        altKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      t.dispatchEvent(new KeyboardEvent('keydown', opts));
      t.dispatchEvent(new KeyboardEvent('keyup', opts));
      return true;
    })()
  `);
}

/**
 * Click a selectable code line (not file header) to seed Diff selection.
 * @param {number} [index]
 */
export function clickSelectableLine(index = 3) {
  const r = evalInPage(`
    (() => {
      const rows = [...document.querySelectorAll('.prp-vline--selectable')].filter(
        (e) => !e.classList.contains('prp-vline--header')
      );
      const row = rows[${Number(index)}] || rows[0];
      if (!row) return { ok: false, n: rows.length };
      row.scrollIntoView({ block: 'center' });
      const rect = row.getBoundingClientRect();
      const x = rect.left + 24;
      const y = rect.top + rect.height / 2;
      const el = document.elementFromPoint(x, y) || row;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
      return { ok: true, n: rows.length, cls: row.className.slice(0, 80) };
    })()
  `);
  waitMs(350);
  return r;
}

/** Diff thread / inline-comment focus snapshot. */
export function diffThreadProbe() {
  return evalInPage(`
    (() => {
      const threads = [...document.querySelectorAll('.prp-inline-thread')];
      const active =
        document.querySelector('.prp-inline-thread--active, .prp-inline-thread.prp-kb-focus') ||
        document.querySelector('.prp-vline--comment-active, .prp-card--kb-focus');
      const v = document.querySelector('.prp-vlist');
      const sr = v?.getBoundingClientRect();
      let ratio = null;
      if (active && sr) {
        ratio = (active.getBoundingClientRect().top - sr.top) / (sr.height || 1);
      }
      // Prefer the thread nearest viewport third as "focused" proxy when no active class
      let nearest = null;
      if (v && threads.length) {
        let best = Infinity;
        for (const t of threads) {
          const r = t.getBoundingClientRect();
          const mid = (r.top + r.bottom) / 2;
          const target = sr.top + sr.height / 3;
          const d = Math.abs(mid - target);
          if (d < best) {
            best = d;
            nearest = {
              cls: t.className.slice(0, 80),
              ratio: (r.top - sr.top) / (sr.height || 1),
              top: Math.round(r.top - sr.top),
            };
          }
        }
      }
      return {
        threadCount: threads.length,
        hasActive: !!active,
        activeRatio: ratio,
        nearest,
        scrollTop: v?.scrollTop ?? null,
      };
    })()
  `);
}

/** Blur any focused editable so product chords are not swallowed. */
export function blurEditable() {
  evalInPage(`
    (() => {
      const a = document.activeElement;
      if (a && a !== document.body && typeof a.blur === 'function') a.blur();
      document.querySelector('.prp-overlay')?.focus?.();
      return true;
    })()
  `);
  waitMs(40);
}

/** Physical key → KeyboardEvent.code (+ normalized key). */
const KEY_CODE_MAP = {
  j: 'KeyJ',
  k: 'KeyK',
  f: 'KeyF',
  b: 'KeyB',
  c: 'KeyC',
  u: 'KeyU',
  r: 'KeyR',
  p: 'KeyP',
  e: 'KeyE',
  ArrowDown: 'ArrowDown',
  ArrowUp: 'ArrowUp',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ']': 'BracketRight',
  '[': 'BracketLeft',
  '.': 'Period',
  ',': 'Comma',
  '/': 'Slash',
  '-': 'Minus',
  '=': 'Equal',
  '1': 'Digit1',
  '2': 'Digit2',
  '3': 'Digit3',
  '4': 'Digit4',
  '5': 'Digit5',
  '6': 'Digit6',
  '7': 'Digit7',
  '8': 'Digit8',
  '9': 'Digit9',
  '0': 'Digit0',
};

/**
 * Parse agent-browser-style chord into KeyboardEvent fields.
 * @param {string} chord e.g. 'Alt+j' | 'Meta+f' | 'Escape' | 'Shift+ArrowDown'
 */
export function parseChord(chord) {
  const parts = String(chord)
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const keyTok = parts[parts.length - 1] || '';
  const altKey = parts.some((p) => /^alt$/i.test(p));
  const shiftKey = parts.some((p) => /^shift$/i.test(p));
  const metaKey = parts.some((p) => /^meta|cmd|command$/i.test(p));
  const ctrlKey = parts.some((p) => /^control|ctrl$/i.test(p));
  const keyNorm =
    {
      down: 'ArrowDown',
      up: 'ArrowUp',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      esc: 'Escape',
      escape: 'Escape',
      enter: 'Enter',
      return: 'Enter',
      space: ' ',
      period: '.',
    }[keyTok.toLowerCase()] || keyTok;
  const code =
    KEY_CODE_MAP[keyNorm] ||
    KEY_CODE_MAP[keyNorm.toLowerCase()] ||
    (keyNorm.length === 1 && /[a-zA-Z]/.test(keyNorm)
      ? `Key${keyNorm.toUpperCase()}`
      : keyNorm.length === 1 && /[0-9]/.test(keyNorm)
        ? `Digit${keyNorm}`
        : keyNorm);
  const key =
    keyNorm === ' '
      ? ' '
      : keyNorm.length === 1
        ? keyNorm.toLowerCase()
        : keyNorm === 'Escape'
          ? 'Escape'
          : keyNorm === 'Enter'
            ? 'Enter'
            : keyNorm;
  return { key, code, altKey, shiftKey, metaKey, ctrlKey };
}

/**
 * Dispatch a single keydown/keyup on documentElement (capture-phase product handlers).
 * Prefer this over agent-browser `press` for Alt/Meta product chords — CDP press often
 * drops altKey / mis-maps Option glyphs in headless Chromium.
 * @param {string} chord
 */
export function press(chord) {
  const spec = parseChord(chord);
  // Plain Escape/Enter still via CDP is fine; product chords always synthetic.
  const needsSynthetic =
    spec.altKey ||
    spec.metaKey ||
    spec.ctrlKey ||
    (spec.shiftKey && /^arrow/i.test(spec.key)) ||
    spec.key === '.' ||
    spec.code === 'Period';
  if (!needsSynthetic) {
    return abPress(chord);
  }
  evalInPage(`
    (() => {
      const spec = ${JSON.stringify(spec)};
      const target = document.documentElement;
      const base = {
        key: spec.key,
        code: spec.code,
        altKey: spec.altKey,
        shiftKey: spec.shiftKey,
        metaKey: spec.metaKey,
        ctrlKey: spec.ctrlKey,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      target.dispatchEvent(new KeyboardEvent('keydown', base));
      target.dispatchEvent(new KeyboardEvent('keyup', { ...base, bubbles: true }));
      return true;
    })()
  `);
  // Product handlers re-render / scroll on next frames — give React a beat.
  waitMs(80);
  return { status: 0, stdout: '', stderr: '' };
}

/**
 * Simulate OS key-hold / key-repeat for a chord (⌥J, ⌥⇧↓, …).
 * Dispatches real KeyboardEvents on document so capture-phase handlers run.
 * Much closer to “꾹 누르기” than discrete agent-browser press loops.
 *
 * @param {string} chord e.g. 'Alt+j' | 'Alt+k' | 'Alt+Shift+ArrowDown' | 'Alt+Shift+]'
 * @param {{ holdMs?: number, repeatMs?: number, sample?: 'conv' | 'diff' | null }} [opts]
 * @returns {{ events: number, holdMs: number, samples: number[], scrollStart: number|null, scrollEnd: number|null }}
 */
export function holdChord(chord, opts = {}) {
  const holdMs = opts.holdMs ?? 450;
  const repeatMs = opts.repeatMs ?? 40;
  const sample = opts.sample || null;

  const { key, code, altKey, shiftKey, metaKey, ctrlKey } = parseChord(chord);

  // Kick async hold in page, then wait for completion (no CLI roundtrip per repeat).
  evalInPage(`
    (() => {
      const holdMs = ${holdMs};
      const repeatMs = ${repeatMs};
      const sampleMode = ${JSON.stringify(sample)};
      const spec = ${JSON.stringify({ key, code, altKey, shiftKey, metaKey, ctrlKey })};
      const target = document.documentElement;
      const fire = (type, repeat) => {
        const ev = new KeyboardEvent(type, {
          key: spec.key,
          code: spec.code,
          altKey: spec.altKey,
          shiftKey: spec.shiftKey,
          metaKey: spec.metaKey,
          ctrlKey: spec.ctrlKey,
          bubbles: true,
          cancelable: true,
          composed: true,
          repeat: Boolean(repeat),
        });
        target.dispatchEvent(ev);
      };
      const sampleScroll = () => {
        if (sampleMode === 'conv') {
          return document.querySelector('.prp-conversation-virtual')?.scrollTop ?? null;
        }
        if (sampleMode === 'diff') {
          return document.querySelector('.prp-vlist')?.scrollTop ?? null;
        }
        return null;
      };
      window.__prpE2eHold = {
        done: false,
        events: 0,
        samples: [],
        scrollStart: sampleScroll(),
        scrollEnd: null,
        holdMs,
      };
      // Modifier keydown first so altKey-synced UI (opt-hold tips) arms.
      if (spec.altKey) {
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Alt',
            code: 'AltLeft',
            altKey: true,
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      }
      fire('keydown', false);
      window.__prpE2eHold.events += 1;
      const t0 = performance.now();
      const tick = () => {
        const st = window.__prpE2eHold;
        if (!st || st.done) return;
        const elapsed = performance.now() - t0;
        if (elapsed >= holdMs) {
          fire('keyup', false);
          if (spec.altKey) {
            target.dispatchEvent(
              new KeyboardEvent('keyup', {
                key: 'Alt',
                code: 'AltLeft',
                altKey: false,
                bubbles: true,
                cancelable: true,
                composed: true,
              })
            );
          }
          st.scrollEnd = sampleScroll();
          st.done = true;
          return;
        }
        fire('keydown', true);
        st.events += 1;
        const s = sampleScroll();
        if (s != null) st.samples.push(s);
        setTimeout(tick, repeatMs);
      };
      setTimeout(tick, repeatMs);
      return true;
    })()
  `);

  // Poll until page reports done (hold + small slack for last keyup).
  const deadline = Date.now() + holdMs + 800;
  let result = null;
  while (Date.now() < deadline) {
    waitMs(30);
    result = evalInPage(`window.__prpE2eHold || null`);
    if (result?.done) break;
  }
  assert(result?.done, `holdChord(${chord}) did not finish in time`);
  return {
    events: result.events,
    holdMs: result.holdMs,
    samples: result.samples || [],
    scrollStart: result.scrollStart,
    scrollEnd: result.scrollEnd,
  };
}

export { ab, evalInPage, waitMs, waitFor, open, closeAll, ROOT };
