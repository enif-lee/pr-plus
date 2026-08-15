/**
 * UI language preference e2e (ko/en via prp-set-prefs bridge).
 *
 * Run: rstest run -c rstest.e2e.config.ts ui-locale
 */
import {
  DEMO_PR,
  assert,
  blurEditable,
  evalInPage,
  log,
  openPr,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';
import { waitFor } from '../lib/ab.mjs';
import { setUiLanguagePref } from '../lib/ui-language-pref.mjs';

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  run('LOC.0 open demo PR (conversation)', () => {
    openPr(DEMO_PR, { viaUrl: true });
    // Pin English before assertions so sticky auto/ko does not flake later suites
    setUiLanguagePref('en', { label: 'LOC.0 pin en' });
    setLayout('conversation');
    blurEditable();
    waitDetailReady({ meta: true, files: false, label: 'LOC.0' });
    waitMs(500);
    assert(
      evalInPage(`!!document.querySelector('.prp-overlay')`),
      'modal overlay missing'
    );
  });

  run('LOC.1 set uiLanguage=ko via prp-set-prefs bridge', () => {
    setUiLanguagePref('ko', { label: 'LOC.1 set ko' });
    // Re-open so LocaleProvider remounts with prefs from host
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'LOC.1-reopen' });
    waitMs(600);
    const stamp = waitFor(
      `
      const loc = document.documentElement.getAttribute('data-prp-app-locale') || '';
      const pref = document.documentElement.getAttribute('data-prp-ui-language') || '';
      if (loc === 'ko' || pref === 'ko') return { loc, pref };
      return false;
      `,
      { timeoutMs: 12_000, intervalMs: 300, label: 'locale stamp ko' }
    );
    const after = evalInPage(`
      (() => ({
        app: document.documentElement.getAttribute('data-prp-app-locale'),
        ui: document.documentElement.getAttribute('data-prp-ui-language'),
        echo: document.documentElement.getAttribute('data-prp-prefs-echo'),
        sample: (document.querySelector('.prp-header, .prp-merge-box, .prp-aside-compact__label, [class*="meta"]')?.textContent || '').slice(0, 120),
        reviewers: [...document.querySelectorAll('h3, .prp-aside-compact__label, .prp-aside-section__title')]
          .map((el) => (el.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 12),
      }))()
    `);
    log(`  locale assert: ${JSON.stringify({ stamp, after })}`);
    assert(
      after?.app === 'ko' || after?.ui === 'ko',
      `expected data-prp-app-locale or ui-language ko, got ${JSON.stringify(after)}`
    );
    // Prefer user-visible chrome when aside is painted
    const hasKoChrome =
      Array.isArray(after?.reviewers) &&
      after.reviewers.some((t) => /리뷰|담당|라벨|체크|마일스톤/.test(t));
    if (hasKoChrome) {
      log(`  localized chrome sample: ${JSON.stringify(after.reviewers)}`);
    } else {
      log(
        `  locale stamp ok; chrome sample may still be en (aside not expanded): ${after?.sample}`
      );
    }
  });

  run('LOC.2 restore uiLanguage=en for stable English selectors', () => {
    setUiLanguagePref('en', { label: 'LOC.2 restore en' });
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'LOC.2' });
    waitMs(400);
    const live = evalInPage(`
      (() => ({
        app: document.documentElement.getAttribute('data-prp-app-locale'),
        ui: document.documentElement.getAttribute('data-prp-ui-language'),
      }))()
    `);
    log(`  locale after en restore: ${JSON.stringify(live)}`);
    assert(
      live?.ui === 'en' || live?.app === 'en',
      `expected en after restore, got ${JSON.stringify(live)}`
    );
  });

  run('LOC.3 cleanup locale en (avoid sticky ko for later suites)', () => {
    // Pin en (not auto): auto follows GitHub/page lang and can leave Korean chrome
    // for English-hardcoded selectors in other e2e suites.
    setUiLanguagePref('en', { label: 'LOC.3 cleanup en' });
    waitMs(200);
  });

  return steps;
}

export async function runUiLocale(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
