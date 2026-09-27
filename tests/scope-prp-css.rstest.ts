/**
 * pr-modal.css is injected into github.com and Connected sites; Tailwind
 * utilities must only match inside pr+ UI, never the host page's own classes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import postcss from 'postcss';
// @ts-expect-error — build-time .mjs helper without types
import scopePrpCss, { PRP_SCOPE_GUARD } from '../scripts/scope-prp-css.mjs';

describe('scope-prp-css', () => {
  test('guards unscoped selectors, keeps prp-* selectors and keyframes', async () => {
    const out = await postcss([scopePrpCss()]).process(
      [
        '*, ::before, ::after { --tw-ring-inset: ; }',
        '.flex { display: flex; }',
        '.hover\\:underline:hover { text-decoration: underline; }',
        '.prp-overlay .x { color: red; }',
        'html.prp-scroll-lock { overflow: hidden; }',
        '@media (min-width: 640px) { .container { max-width: 640px; } }',
        '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }',
      ].join('\n'),
      { from: undefined }
    );
    const css = out.css;
    expect(css).toContain(`*${PRP_SCOPE_GUARD}::before`);
    expect(css).toContain(`.flex${PRP_SCOPE_GUARD} {`);
    expect(css).toContain(`.hover\\:underline:hover${PRP_SCOPE_GUARD} {`);
    expect(css).toContain(`.container${PRP_SCOPE_GUARD} {`);
    expect(css).toContain('.prp-overlay .x {');
    expect(css).toContain('html.prp-scroll-lock {');
    expect(css).toMatch(/from \{ opacity: 0; \}/);
  });

  test('built pr-modal.css has no unscoped rule', () => {
    const file = path.join(__dirname, '../src/modal/dist/pr-modal.css');
    if (!fs.existsSync(file)) return; // unit run without build:modal
    const root = postcss.parse(fs.readFileSync(file, 'utf8'));
    const leaks: string[] = [];
    root.walkRules((rule) => {
      const p: any = rule.parent;
      if (p?.type === 'atrule' && /keyframes$/i.test(p.name)) return;
      for (const s of rule.selectors) if (!s.includes('prp')) leaks.push(s);
    });
    expect(leaks).toEqual([]);
  });

  test('every createPortal root carries the prp-portal scope marker', () => {
    const dir = path.join(__dirname, '../src/modal');
    const missing: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'dist' && e.name !== 'pure') walk(f);
        } else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(f, 'utf8');
          const portals = (src.match(/createPortal\(/g) || []).length;
          const marked = (src.match(/prp-portal\b/g) || []).length;
          if (portals && marked < portals) missing.push(path.relative(dir, f));
        }
      }
    };
    walk(dir);
    expect(missing).toEqual([]);
  });
});
