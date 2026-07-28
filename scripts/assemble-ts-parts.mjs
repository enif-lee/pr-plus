/**
 * Assemble ordered TypeScript parts into one classic JS artifact.
 * SoT = *.ts under partsDir (prefer over *.js).
 *
 * Mid-IIFE fragments may not parse alone — on transform failure we emit the
 * source body as-is (JS-compatible TypeScript without annotations).
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

export async function assembleTsParts({
  partsDir,
  outFile,
  banner,
  wrap = (body) => body,
  fileRe = /^\d+.*\.(ts|js)$/,
}) {
  if (!fs.existsSync(partsDir)) {
    throw new Error(`parts dir missing: ${partsDir}`);
  }
  const names = fs
    .readdirSync(partsDir)
    .filter((f) => fileRe.test(f))
    .sort();

  const byBase = new Map();
  for (const f of names) {
    const base = f.replace(/\.(ts|js)$/, '');
    if (!byBase.has(base) || f.endsWith('.ts')) byBase.set(base, f);
  }
  const parts = [...byBase.values()].sort();
  if (!parts.length) throw new Error(`no parts in ${partsDir}`);

  const chunks = [];
  for (const f of parts) {
    const full = path.join(partsDir, f);
    let code = fs.readFileSync(full, 'utf8');
    // Drop file-level directives only
    code = code
      .replace(/^\/\/ @ts-nocheck.*$/gm, '')
      .replace(/^\/\/ TypeScript SoT[^\n]*$/gm, '')
      .replace(/^\/\/ @ts-check[^\n]*$/gm, '');

    if (f.endsWith('.ts')) {
      // Only transform when file looks like a complete unit (has balanced braces
      // enough for esbuild). Fragments fall back to raw JS-compatible body.
      try {
        const result = await esbuild.transform(code, {
          loader: 'ts',
          format: 'esm',
          target: 'es2020',
          platform: 'neutral',
        });
        let out = result.code
          .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
          .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
          .replace(/^export\s+class\s+/gm, 'class ')
          .replace(/^export\s+(const|let|var)\s+/gm, '$1 ');
        // If esbuild introduced cjs wrappers (module.exports dual export),
        // prefer original body — classic multi-script load order needs bare code.
        if (/__commonJS|require_stdin/.test(out)) {
          chunks.push(code.trimEnd());
        } else {
          chunks.push(out.trimEnd());
        }
      } catch {
        // Mid-IIFE / incomplete fragment: emit as classic script text
        chunks.push(code.trimEnd());
      }
    } else {
      chunks.push(code.trimEnd());
    }
  }

  const body = wrap(chunks.join('\n\n'));
  const file = `${banner}\n${body}\n`;
  fs.writeFileSync(outFile, file);
  return {
    parts,
    lines: file.split(/\n/).length,
    bytes: Buffer.byteLength(file),
  };
}
