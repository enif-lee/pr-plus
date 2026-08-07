/**
 * Set extensionPrefs.uiLanguage via content-script bridge (page → CS).
 * Page world has no PRTreeStorage; bridge listens for CustomEvent `prp-set-prefs`.
 */
import { assert, evalInPage } from './harness.mjs';
import { waitFor } from './ab.mjs';

/**
 * @param {'auto'|'en'|'ko'|'ja'|'zh_CN'} lang
 * @param {{ label?: string, timeoutMs?: number }} [opts]
 */
export function setUiLanguagePref(lang, opts = {}) {
  const label = opts.label || `uiLanguage=${lang}`;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  evalInPage(`
    (() => {
      const r = document.documentElement;
      const patch = { uiLanguage: ${JSON.stringify(lang)} };
      r.removeAttribute('data-prp-prefs-ok');
      r.removeAttribute('data-prp-prefs-err');
      r.removeAttribute('data-prp-prefs-echo');
      // Attribute fallback if CustomEvent.detail is stripped across worlds
      r.setAttribute('data-prp-prefs-request', JSON.stringify(patch));
      document.dispatchEvent(
        new CustomEvent('prp-set-prefs', {
          detail: patch,
          bubbles: true,
        })
      );
      return true;
    })()
  `);
  const ok = waitFor(
    `
    const r = document.documentElement;
    const prefsOk = r.getAttribute('data-prp-prefs-ok');
    const ui = r.getAttribute('data-prp-ui-language');
    const err = r.getAttribute('data-prp-prefs-err');
    if (prefsOk === '0') return { fail: true, err: err || 'prefs-ok-0' };
    if (prefsOk === '1' && ui === ${JSON.stringify(lang)}) return { ok: true, ui };
    return false;
    `,
    { timeoutMs, intervalMs: 200, label }
  );
  if (ok?.fail) {
    assert(false, `prp-set-prefs failed for ${lang}: ${ok.err}`);
  }
  assert(
    ok?.ok && ok?.ui === lang,
    `prp-set-prefs did not stamp uiLanguage=${lang}: ${JSON.stringify(ok)}`
  );
  return ok;
}
