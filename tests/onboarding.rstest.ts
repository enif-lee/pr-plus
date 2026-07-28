/**
 * rstest — first-run onboarding pure helpers + tour (mock DOM).
 */
import { describe, expect, test } from '@rstest/core';
import {
  ONBOARDING_STEPS,
  PR_DEPENDENT_STEPS,
  DIFF_DEMO_STEPS,
  DEMO_PR,
  shouldShowOnboarding,
  clampOnboardingStep,
  isOptHoldEvent,
  isOptShiftKEvent,
  isOptPeriodEvent,
  isOptDigit1Event,
  isEscapeEvent,
  resolveOnboardingPlan,
  countPullListItems,
  findDemoPrLink,
  resolveDemoPrHotkey,
  highlightDemoPr,
  clearDemoPrHighlight,
  isOptHotkeySlotEvent,
  ONBOARDING_TARGET_PR_CLASS,
  isModalOpen,
  isDiffLayout,
  createOnboardingTour,
} from '../src/onboarding';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const storageApi = require('../src/storage');
const { normalizePrefs, DEFAULT_PREFS } = storageApi;

describe('onboarding prefs', () => {
  test('DEFAULT_PREFS includes treeView and onboardingCompleted', () => {
    expect(DEFAULT_PREFS.treeView).toBe(true);
    expect(DEFAULT_PREFS.onboardingCompleted).toBe(false);
  });

  test('normalizePrefs preserves onboardingCompleted', () => {
    const p = normalizePrefs({ onboardingCompleted: true, treeView: false });
    expect(p.onboardingCompleted).toBe(true);
    expect(p.treeView).toBe(false);
  });
});

describe('onboarding plan', () => {
  test('full step order', () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      'pat',
      'opt',
      'openPr',
      'diffToggle',
      'diffDemo',
      'optShiftK',
      'prefs',
      'done',
    ]);
  });

  test('DEMO_PR targets enif-lee/pr-plus#1', () => {
    expect(DEMO_PR.number).toBe(1);
    expect(DEMO_PR.pathSuffix).toBe('/enif-lee/pr-plus/pull/1');
    expect(DEMO_PR.prUrl).toContain('/pull/1');
  });

  test('skips PR-dependent steps when list empty', () => {
    expect(resolveOnboardingPlan({ hasPulls: false })).toEqual([
      'pat',
      'opt',
      'optShiftK',
      'prefs',
      'done',
    ]);
    expect(resolveOnboardingPlan({ hasPulls: true })).toEqual(
      ONBOARDING_STEPS.map((s) => s.id)
    );
  });

  test('PR_DEPENDENT_STEPS covers openPr → demo', () => {
    expect(PR_DEPENDENT_STEPS).toEqual(['openPr', 'diffToggle', 'diffDemo']);
  });

  test('DIFF_DEMO_STEPS covers file nav, selection, and comment thread nav', () => {
    const ids = DIFF_DEMO_STEPS.map((s) => s.id);
    expect(ids).toContain('file-next');
    expect(ids).toContain('file-prev');
    expect(ids).toContain('page-down');
    expect(ids).toContain('jump-selection');
    expect(ids).toContain('multi-select');
    expect(ids).toContain('comment-island');
    expect(ids).toContain('thread-next');
    expect(ids).toContain('thread-prev');
    expect(ids).toContain('clear-selection');
    expect(DIFF_DEMO_STEPS.length).toBeGreaterThanOrEqual(12);
    for (const s of DIFF_DEMO_STEPS) {
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.body.length).toBeGreaterThan(10);
    }
  });
});

describe('onboarding eligibility', () => {
  test('shows on pulls list when not completed', () => {
    expect(
      shouldShowOnboarding(
        { onboardingCompleted: false },
        '/enif-lee/pr-plus/pulls'
      )
    ).toBe(true);
  });

  test('hides when completed or not pulls list', () => {
    expect(
      shouldShowOnboarding(
        { onboardingCompleted: true },
        '/enif-lee/pr-plus/pulls'
      )
    ).toBe(false);
    expect(
      shouldShowOnboarding(
        { onboardingCompleted: false },
        '/enif-lee/pr-plus/pull/12'
      )
    ).toBe(false);
  });

  test('clampOnboardingStep bounds', () => {
    expect(clampOnboardingStep(-1)).toBe(0);
    expect(clampOnboardingStep(99)).toBe(ONBOARDING_STEPS.length - 1);
  });
});

describe('key detectors', () => {
  test('opt hold / period / digit1 / esc / optShiftK', () => {
    expect(isOptHoldEvent({ alt: true, type: 'keydown' })).toBe(true);
    expect(isOptHoldEvent({ alt: false, type: 'keydown' })).toBe(false);
    expect(
      isOptPeriodEvent({ alt: true, shift: false, mod: false, code: 'Period' })
    ).toBe(true);
    expect(
      isOptPeriodEvent({ alt: true, shift: true, mod: false, code: 'Period' })
    ).toBe(false);
    expect(
      isOptDigit1Event({ alt: true, shift: false, mod: false, code: 'Digit1' })
    ).toBe(true);
    expect(isEscapeEvent({ key: 'Escape', code: 'Escape' })).toBe(true);
    expect(
      isOptShiftKEvent({ alt: true, shift: true, mod: false, code: 'KeyK' })
    ).toBe(true);
  });
});

describe('dom helpers', () => {
  test('countPullListItems / isModalOpen / isDiffLayout', () => {
    const doc = {
      querySelectorAll: (sel: string) => {
        if (sel.includes('js-issue-row')) return { length: 3 };
        return { length: 0 };
      },
      querySelector: (sel: string) => {
        if (sel.includes('prp-overlay')) return {};
        if (sel.includes('prp-modal--diff')) return { className: 'prp-modal--diff' };
        return null;
      },
    } as any;
    expect(countPullListItems(doc)).toBe(3);
    expect(isModalOpen(doc)).toBe(true);
    expect(isDiffLayout(doc)).toBe(true);
    expect(countPullListItems(null)).toBe(0);
    // Conversation-only: no --diff root → not Diff layout
    const conv = {
      querySelector: (sel: string) =>
        sel.includes('prp-modal--diff') ? null : { className: 'prp-diff-layout' },
    } as any;
    // leftover .prp-diff-layout must NOT count as Diff
    expect(isDiffLayout(conv)).toBe(false);
  });

  test('findDemoPrLink matches /pull/1 but not /pull/10', () => {
    const links = [
      {
        getAttribute: (k: string) =>
          k === 'href' ? '/enif-lee/pr-plus/pull/10' : null,
        textContent: 'ten',
      },
      {
        getAttribute: (k: string) =>
          k === 'href' ? '/enif-lee/pr-plus/pull/1' : null,
        textContent: 'demo root',
      },
      {
        getAttribute: (k: string) =>
          k === 'href' ? '/enif-lee/pr-plus/pull/12' : null,
        textContent: 'twelve',
      },
    ];
    const doc = {
      querySelectorAll: (sel: string) =>
        sel.includes('/pull/') ? links : [],
    } as any;
    const hit = findDemoPrLink(doc);
    expect(hit?.getAttribute('href')).toBe('/enif-lee/pr-plus/pull/1');
  });

  test('resolveDemoPrHotkey maps list index to ⌥ slot', () => {
    const link1 = {
      getAttribute: (k: string) =>
        k === 'href' ? '/enif-lee/pr-plus/pull/1' : null,
      textContent: 'demo root',
    };
    const link2 = {
      getAttribute: (k: string) =>
        k === 'href' ? '/enif-lee/pr-plus/pull/2' : null,
      textContent: 'other',
    };
    const row0 = { contains: (n: any) => n === link2 };
    const row1 = {
      contains: (n: any) => n === link1,
      classList: { add() {}, remove() {}, contains: () => false },
      setAttribute() {},
      scrollIntoView() {},
    };
    // link1 lives in second row → slot "2"
    const doc = {
      body: {},
      querySelectorAll: (sel: string) => {
        if (sel.includes('js-issue-row') || sel.includes('issue-row')) {
          return [row0, row1];
        }
        if (sel.includes('/pull/')) return [link2, link1];
        return [];
      },
    } as any;
    // Wire contains: findDemoPrLink returns link1; rows contain checks
    (link1 as any).closest = () => row1;
    const hot = resolveDemoPrHotkey(doc);
    expect(hot.index).toBe(1);
    expect(hot.slot).toBe('2');
    expect(isOptHotkeySlotEvent({ alt: true, code: 'Digit2' }, '2')).toBe(true);
    expect(isOptHotkeySlotEvent({ alt: true, code: 'Digit1' }, '2')).toBe(false);
  });

  test('highlightDemoPr adds target class', () => {
    const classes = new Set<string>();
    const row = {
      contains: () => true,
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
        contains: (c: string) => classes.has(c),
      },
      setAttribute() {},
      removeAttribute() {},
      scrollIntoView() {},
      closest: () => row,
    };
    const link = {
      getAttribute: (k: string) =>
        k === 'href' ? '/enif-lee/pr-plus/pull/1' : null,
      textContent: 'demo',
      closest: () => row,
    };
    const highlighted: any[] = [];
    const doc = {
      body: {},
      querySelectorAll: (sel: string) => {
        if (sel.includes(ONBOARDING_TARGET_PR_CLASS) || sel.includes('onboarding-target')) {
          return highlighted;
        }
        if (sel.includes('js-issue-row')) return [row];
        if (sel.includes('/pull/')) return [link];
        return [];
      },
    } as any;
    highlightDemoPr(doc);
    expect(classes.has(ONBOARDING_TARGET_PR_CLASS)).toBe(true);
    highlighted.push(row);
    clearDemoPrHighlight(doc);
    expect(classes.has(ONBOARDING_TARGET_PR_CLASS)).toBe(false);
  });
});

/** Minimal DOM for createOnboardingTour (node test env). */
function makeMockDom(opts: { pullRows?: number } = {}) {
  const pullRows = opts.pullRows ?? 2;

  function matches(el: any, sel: string): boolean {
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('.')) {
      return String(el.className || '')
        .split(/\s+/)
        .includes(sel.slice(1));
    }
    if (sel.includes('[')) {
      const m = sel.match(/^(\w+)?\[([^=\]]+)=["']?([^"'\]]+)["']?\]$/);
      if (m) {
        const tag = m[1];
        const attr = m[2];
        const val = m[3];
        if (
          tag &&
          String(el.tagName || '').toLowerCase() !== tag.toLowerCase()
        ) {
          return false;
        }
        if (attr.startsWith('data-')) {
          const key = attr
            .slice(5)
            .replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
          return el.dataset?.[key] === val;
        }
        return el.attrs?.[attr] === val;
      }
    }
    return String(el.tagName || '').toLowerCase() === sel.toLowerCase();
  }

  function walk(el: any, fn: (n: any) => void) {
    fn(el);
    for (const c of el.children || []) walk(c, fn);
  }

  function createElement(tag: string): any {
    const el: any = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      value: '',
      checked: false,
      hidden: false,
      disabled: false,
      dataset: {},
      isContentEditable: false,
      children: [],
      parent: null,
      attrs: {},
      listeners: {},
      classList: {
        toggle(name: string, force?: boolean) {
          const parts = String(el.className || '')
            .split(/\s+/)
            .filter(Boolean);
          const has = parts.includes(name);
          const on = force === undefined ? !has : Boolean(force);
          if (on && !has) parts.push(name);
          if (!on && has) {
            const i = parts.indexOf(name);
            if (i >= 0) parts.splice(i, 1);
          }
          el.className = parts.join(' ');
        },
      },
      setAttribute(k: string, v: string) {
        this.attrs[k] = String(v);
        if (k === 'id') this.id = String(v);
        if (k === 'class' || k === 'className') this.className = String(v);
        if (k.startsWith('data-')) {
          const key = k
            .slice(5)
            .replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
          this.dataset[key] = String(v);
        }
      },
      getAttribute(k: string) {
        if (k === 'id') return this.id || null;
        if (k === 'class') return this.className || null;
        return this.attrs[k] ?? null;
      },
      appendChild(c: any) {
        c.parent = this;
        this.children.push(c);
        return c;
      },
      remove() {
        if (!this.parent) return;
        this.parent.children = this.parent.children.filter(
          (x: any) => x !== this
        );
        this.parent = null;
      },
      addEventListener(type: string, fn: (e: any) => void) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
      },
      querySelector(sel: string) {
        let found: any = null;
        walk(this, (n) => {
          if (!found && matches(n, sel)) found = n;
        });
        return found;
      },
      querySelectorAll(sel: string) {
        if (sel.includes('js-issue-row') || sel.includes('/pull/')) {
          return { length: pullRows };
        }
        const out: any[] = [];
        walk(this, (n) => {
          if (matches(n, sel)) out.push(n);
        });
        return out;
      },
      click() {
        for (const fn of this.listeners.click || []) fn({ type: 'click' });
      },
      dispatchEvent(e: any) {
        const type = e?.type || 'change';
        for (const fn of this.listeners[type] || []) fn(e);
      },
    };
    return el;
  }

  const body = createElement('body');
  // Fake PR rows for countPullListItems via querySelectorAll override on doc
  const doc: any = {
    body,
    documentElement: body,
    createElement,
    getElementById(id: string) {
      let found: any = null;
      walk(body, (n) => {
        if (!found && n.id === id) found = n;
      });
      return found;
    },
    querySelectorAll(sel: string) {
      if (
        sel.includes('js-issue-row') ||
        sel.includes('issue-row') ||
        sel.includes('/pull/')
      ) {
        return { length: pullRows };
      }
      return body.querySelectorAll(sel);
    },
    querySelector(sel: string) {
      return body.querySelector(sel);
    },
  };

  const keyListeners: Array<(e: any) => void> = [];
  const intervals: Array<() => void> = [];
  const win: any = {
    location: { pathname: '/o/r/pulls' },
    addEventListener(type: string, fn: (e: any) => void) {
      if (type === 'keydown') keyListeners.push(fn);
    },
    removeEventListener(type: string, fn: (e: any) => void) {
      if (type === 'keydown') {
        const i = keyListeners.indexOf(fn);
        if (i >= 0) keyListeners.splice(i, 1);
      }
    },
    setInterval(fn: () => void) {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval() {},
    dispatchKey(e: any) {
      for (const fn of keyListeners.slice()) fn(e);
    },
    tickPoll() {
      for (const fn of intervals) fn();
    },
  };

  return { doc, win };
}

describe('createOnboardingTour', () => {
  test('mounts, advances opt → skips empty PR path → prefs → done', async () => {
    const store = {
      prefs: {
        onboardingCompleted: false,
        treeView: true,
        fastReview: true,
        reverseComments: true,
        autoOpenEmbed: true,
        singleFileMode: false,
      },
      token: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' as string | null,
    };
    let onboardingDone = false;
    const { doc, win } = makeMockDom({ pullRows: 0 });

    const tour = createOnboardingTour({
      document: doc,
      window: win,
      getPathname: () => '/o/r/pulls',
      getPrefs: async () => ({ ...store.prefs }),
      setPrefs: async (patch: any) => {
        store.prefs = { ...store.prefs, ...patch };
        return { ...store.prefs };
      },
      isOnboardingDone: async () => onboardingDone,
      markOnboardingDone: async () => {
        onboardingDone = true;
        store.prefs.onboardingCompleted = true;
        return true;
      },
      getTokenStatus: async () => ({ configured: true, mask: '••••1234' }),
      setToken: async (token: string) => {
        store.token = token;
        return { ok: true, configured: true, mask: '••••9999' };
      },
    });

    const start = await tour.start();
    expect(start.ok).toBe(true);
    expect(tour.getPlan()).toEqual([
      'pat',
      'opt',
      'optShiftK',
      'prefs',
      'done',
    ]);
    expect(tour.getStepId()).toBe('pat');

    const primary = doc
      .getElementById('prp-onboarding')!
      .querySelector('.prp-onboarding__btn--primary') as any;
    primary.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(tour.getStepId()).toBe('opt');

    win.dispatchKey({
      type: 'keydown',
      altKey: true,
      key: 'Alt',
      code: 'AltLeft',
      preventDefault() {},
      target: null,
    });
    expect(tour.getStepId()).toBe('optShiftK');

    win.dispatchKey({
      type: 'keydown',
      altKey: true,
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
      code: 'KeyK',
      key: 'k',
      preventDefault() {},
      target: null,
    });
    expect(tour.getStepId()).toBe('prefs');

    primary.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(tour.getStepId()).toBe('done');

    primary.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onboardingDone).toBe(true);
    expect(doc.getElementById('prp-onboarding')).toBeNull();
  });

  test('full plan when pulls exist', async () => {
    const { doc, win } = makeMockDom({ pullRows: 5 });
    const tour = createOnboardingTour({
      document: doc,
      window: win,
      getPathname: () => '/o/r/pulls',
      getPrefs: async () => ({ onboardingCompleted: false }),
      setPrefs: async (p: any) => p,
      isOnboardingDone: async () => false,
      markOnboardingDone: async () => true,
      getTokenStatus: async () => ({ configured: true, mask: 'x' }),
      setToken: async () => ({ ok: true }),
    });
    const res = await tour.start();
    expect(res.ok).toBe(true);
    expect(tour.getPlan()).toContain('openPr');
    expect(tour.getPlan()).toContain('diffDemo');
  });

  test('does not mount when already completed', async () => {
    const { doc, win } = makeMockDom();
    const tour = createOnboardingTour({
      document: doc,
      window: win,
      getPathname: () => '/o/r/pulls',
      getPrefs: async () => ({ onboardingCompleted: true }),
      setPrefs: async (p: any) => p,
      isOnboardingDone: async () => true,
      markOnboardingDone: async () => true,
      getTokenStatus: async () => ({ configured: true, mask: 'x' }),
      setToken: async () => ({ ok: true }),
    });
    const res = await tour.start();
    expect(res.ok).toBe(false);
    expect(doc.getElementById('prp-onboarding')).toBeNull();
  });
});
