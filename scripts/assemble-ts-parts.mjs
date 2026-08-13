/**
 * Assemble ordered TypeScript parts into one classic JS artifact.
 * SoT = *.ts under partsDir (prefer over *.js).
 *
 * Fail closed: transform errors and `__commonJS` / `require_stdin` wraps
 * abort the build instead of emitting raw TypeScript.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {
  esbuildReleaseExtras,
  maybeStripDebugLogs,
} from './release-build-options.mjs';

/** True when classic-script emit still looks like TypeScript parameter types. */
export function hasTypeAnnotationLeak(code) {
  const sample = String(code || '');
  return (
    /:\s*any\b/.test(sample.slice(0, 4000)) &&
    /function \w+\([^)]*:\s*/.test(sample)
  );
}

export async function assembleTsParts({
  partsDir,
  outFile,
  banner,
  wrap = (body) => body,
  /** Explicit order of basenames or filenames (preferred for semantic modules). */
  partsOrder = null,
  /** Fallback: filter readdir when partsOrder is null. Default: numbered chunks. */
  fileRe = /^\d+.*\.(ts|js)$/,
}) {
  if (!fs.existsSync(partsDir)) {
    throw new Error(`parts dir missing: ${partsDir}`);
  }

  let parts;
  if (Array.isArray(partsOrder) && partsOrder.length) {
    parts = partsOrder.map((name) => {
      const asIs = path.join(partsDir, name);
      if (fs.existsSync(asIs)) return name;
      const ts = name.endsWith('.ts') || name.endsWith('.js') ? null : `${name}.ts`;
      const js = name.endsWith('.ts') || name.endsWith('.js') ? null : `${name}.js`;
      if (ts && fs.existsSync(path.join(partsDir, ts))) return ts;
      if (js && fs.existsSync(path.join(partsDir, js))) return js;
      throw new Error(`partsOrder entry missing: ${name}`);
    });
  } else {
    const names = fs
      .readdirSync(partsDir)
      .filter((f) => fileRe.test(f))
      .sort();

    const byBase = new Map();
    for (const f of names) {
      const base = f.replace(/\.(ts|js)$/, '');
      if (!byBase.has(base) || f.endsWith('.ts')) byBase.set(base, f);
    }
    parts = [...byBase.values()].sort();
  }
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
          ...esbuildReleaseExtras(),
        });
        let out = result.code
          .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
          .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
          .replace(/^export\s+class\s+/gm, 'class ')
          .replace(/^export\s+(const|let|var)\s+/gm, '$1 ');
        if (/__commonJS|require_stdin/.test(out)) {
          throw new Error(
            `assembleTsParts: ${f} wrapped as CommonJS (__commonJS/require_stdin)`
          );
        }
        if (hasTypeAnnotationLeak(out)) {
          throw new Error(`assembleTsParts: type annotations leaked in ${f}`);
        }
        chunks.push(out.trimEnd());
      } catch (err) {
        if (err && /assembleTsParts:/.test(String(err.message || err))) throw err;
        throw new Error(
          `assembleTsParts: transform failed for ${f}: ${err?.message || err}`
        );
      }
    } else {
      chunks.push(code.trimEnd());
    }
  }

  let body = wrap(chunks.join('\n\n'));
  body = await maybeStripDebugLogs(body, { loader: 'js' });
  const file = `${banner}\n${body}\n`;
  fs.writeFileSync(outFile, file);
  return {
    parts,
    lines: file.split(/\n/).length,
    bytes: Buffer.byteLength(file),
  };
}
