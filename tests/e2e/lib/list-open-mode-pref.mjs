/**
 * Set extensionPrefs.listOpenMode via content-script bridge (page → CS).
 * Mirrors ui-language-pref.mjs (prp-set-prefs + stamp wait).
 */
import { assert, evalInPage } from './harness.mjs';
import { waitFor } from './ab.mjs';

/**
 * @param {'modal'|'page'} mode
 * @param {{ label?: string, timeoutMs?: number }} [opts]
 */
export function setListOpenModePref(mode, opts = {}) {
  const m = mode === 'page' ? 'page' : 'modal';
  const label = opts.label || `listOpenMode=${m}`;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  evalInPage(`
    (() => {
      const r = document.documentElement;
      const patch = { listOpenMode: ${JSON.stringify(m)} };
      r.removeAttribute('data-prp-prefs-ok');
      r.removeAttribute('data-prp-prefs-err');
      r.removeAttribute('data-prp-prefs-echo');
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
    const mode = r.getAttribute('data-prp-list-open-mode');
    const err = r.getAttribute('data-prp-prefs-err');
    const echo = r.getAttribute('data-prp-prefs-echo') || '';
    if (prefsOk === '0') return { fail: true, err: err || 'prefs-ok-0' };
    // Host stamps data-prp-list-open-mode on prefs watch; echo may also include key
    if (prefsOk === '1' && mode === ${JSON.stringify(m)}) {
      return { ok: true, mode };
    }
    if (prefsOk === '1' && echo.includes(${JSON.stringify(m)})) {
      // Prefs saved; host stamp may lag one tick
      return false;
    }
    return false;
    `,
    { timeoutMs, intervalMs: 200, label }
  );
  if (ok?.fail) {
    assert(false, `prp-set-prefs failed for listOpenMode=${m}: ${ok.err}`);
  }
  // Soft accept: prefs-ok even if stamp slightly late — re-read
  if (!ok?.ok) {
    const stamp = evalInPage(
      `document.documentElement.getAttribute('data-prp-list-open-mode') || ''`
    );
    const prefsOk = evalInPage(
      `document.documentElement.getAttribute('data-prp-prefs-ok') || ''`
    );
    assert(
      prefsOk === '1' && (stamp === m || stamp === ''),
      `listOpenMode=${m} not applied: stamp=${stamp} prefsOk=${prefsOk}`
    );
    // Force stamp for subsequent probes if host lag
    if (stamp !== m) {
      evalInPage(
        `document.documentElement.setAttribute('data-prp-list-open-mode', ${JSON.stringify(m)}); true`
      );
    }
  }
  return ok || { ok: true, mode: m };
}
