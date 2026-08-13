/** @module modal/lib/theme */
/**
 * Resolve modal theme from host GitHub document color mode.
 */

/**
 * @param {Document|null|undefined} doc
 * @param {{ matchMedia?: Function }|null} [win]
 * @returns {{ mode: 'light'|'dark', className: string, colorMode: string }}
 */
export function resolveGithubTheme(doc: any, win: any) {
  const html = doc?.documentElement;
  const body = doc?.body;
  const attr =
    html?.getAttribute?.('data-color-mode') ||
    body?.getAttribute?.('data-color-mode') ||
    html?.getAttribute?.('data-color-mode') ||
    '';

  const darkTheme =
    html?.getAttribute?.('data-dark-theme') ||
    body?.getAttribute?.('data-dark-theme') ||
    '';
  const lightTheme =
    html?.getAttribute?.('data-light-theme') ||
    body?.getAttribute?.('data-light-theme') ||
    '';

  let mode = 'light';
  const normalized = String(attr || '').toLowerCase();
  if (normalized === 'dark') mode = 'dark';
  else if (normalized === 'light') mode = 'light';
  else if (normalized === 'auto') {
    try {
      const mql =
        win?.matchMedia?.('(prefers-color-scheme: dark)') ||
        (typeof globalThis !== 'undefined' &&
          globalThis.matchMedia?.('(prefers-color-scheme: dark)'));
      mode = mql?.matches ? 'dark' : 'light';
    } catch {
      mode = 'light';
    }
  } else {
    // Fallback: class or color-scheme
    const cls = `${html?.className || ''} ${body?.className || ''}`;
    if (/\bdark\b|color-bg-default-dark/i.test(cls)) mode = 'dark';
    else if (html?.style?.colorScheme === 'dark') mode = 'dark';
    else {
      try {
        const mql = win?.matchMedia?.('(prefers-color-scheme: dark)');
        if (mql?.matches) mode = 'dark';
      } catch {
        /* keep light */
      }
    }
  }

  return {
    mode,
    className: mode === 'dark' ? 'prp-theme-dark' : 'prp-theme-light',
    colorMode: normalized || mode,
    darkTheme,
    lightTheme,
  };
}
