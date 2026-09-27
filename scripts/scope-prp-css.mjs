/**
 * PostCSS plugin: keep pr-modal.css from styling the host page.
 *
 * pr-modal.css is injected into github.com and every Connected site. Tailwind
 * output (`.flex`, `.hidden`, `.contents`, `.collapse`, `*` var defaults, …) is
 * unscoped, so it would restyle the host's own elements with the same class
 * names. Every selector that does not already name a prp-* hook gets a
 * zero-specificity guard: it only matches inside (or on) a pr+ root — the
 * modal/embed hosts, or a `.prp-portal` layer portaled to <body>.
 *
 * Roots are fixed ids/classes on purpose: an attribute guard such as
 * `[class*="prp-"] *` makes Blink restyle the whole document on every
 * <html>/<body> class change.
 */

const ROOTS = ['#prp-modal-host', '#prp-page-embed', '.prp-portal'];
export const PRP_SCOPE_GUARD = `:where(${ROOTS.map((r) => `${r},${r} *`).join(',')})`;

/** Index of the first unescaped `::` (pseudo-element), or -1. */
function pseudoElementIndex(sel) {
  for (let i = 0; i < sel.length - 1; i++) {
    if (sel[i] === '\\') {
      i++;
      continue;
    }
    if (sel[i] === ':' && sel[i + 1] === ':') return i;
  }
  return -1;
}

export function scopePrpSelector(sel) {
  const s = sel.trim();
  if (!s || s.includes('prp')) return s;
  const at = pseudoElementIndex(s);
  if (at < 0) return `${s}${PRP_SCOPE_GUARD}`;
  const head = s.slice(0, at);
  // `::before` alone (Tailwind base) → guard the originating element.
  const lead = !head || /[\s>+~]$/.test(head) ? `${head}*` : head;
  return `${lead}${PRP_SCOPE_GUARD}${s.slice(at)}`;
}

function insideKeyframes(rule) {
  for (let p = rule.parent; p; p = p.parent) {
    if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
  }
  return false;
}

export default function scopePrpCss() {
  return {
    postcssPlugin: 'scope-prp-css',
    Rule(rule) {
      if (rule.__prpScoped || insideKeyframes(rule)) return;
      rule.__prpScoped = true;
      rule.selectors = rule.selectors.map(scopePrpSelector);
    },
  };
}
scopePrpCss.postcss = true;
