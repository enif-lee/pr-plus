/**
 * Release vs day-to-day build options for shipping extension JS.
 *
 * - Default (unset PRP_RELEASE): keep console.log / timing / cost observability.
 * - PRP_RELEASE=1 (used by `npm run package`): strip debug/observability
 *   console.log/debug/info/trace and known debug-only markers.
 *
 * Keeps console.error / console.warn (product failure signals).
 *
 * Strip strategy: rewrite `console.log(` → `0&&(` then esbuild minifySyntax
 * drops the dead branch (including nested template args). Avoids broken
 * regex on nested templates that previously shipped SyntaxError in release.
 */
import * as esbuild from 'esbuild';

/**
 * True when packaging / release build is requested.
 * @returns {boolean}
 */
export function isReleaseBuild() {
  const v = String(process.env.PRP_RELEASE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Extra esbuild transform/build options for release mode (merge into callers).
 * Prefer maybeStripDebugLogs on emitted code; extras help when used alone.
 * @returns {Record<string, unknown>}
 */
export function esbuildReleaseExtras() {
  if (!isReleaseBuild()) return {};
  // Do NOT use pure:['console.log'] here — pure leaves free-floating template
  // args as comma expressions. Full strip is maybeStripDebugLogs (0&& + minify).
  return {
    legalComments: 'none',
  };
}

/**
 * Rewrite debug console.* calls to dead `0&&(...)` then minifySyntax-eliminate.
 * Preserves console.error / console.warn.
 * @param {string} code
 * @returns {string}
 */
export function rewriteDebugConsoleToDeadCode(code) {
  return String(code || '').replace(
    /\bconsole\.(log|debug|info|trace)\s*\(/g,
    '0&&('
  );
}

/**
 * Post-process emitted JS for release: drop debug console.* and debug markers.
 * Result is always parseable JS when input was parseable.
 *
 * @param {string} code
 * @param {{ loader?: 'js' | 'ts' }} [opts]
 * @returns {Promise<string>}
 */
export async function maybeStripDebugLogs(code, opts = {}) {
  if (!isReleaseBuild()) return String(code || '');
  const src = String(code || '');
  if (!src.trim()) return src;

  let prepared = rewriteDebugConsoleToDeadCode(src);
  // Debug-only global markers (not product API)
  prepared = prepared.replace(
    /(?:globalThis|window)\s*\.\s*__prpLastByIdsQueryMeta\s*=\s*[^;]+;?/g,
    '0'
  );

  try {
    const result = await esbuild.transform(prepared, {
      loader: opts.loader || 'js',
      target: 'es2020',
      minifySyntax: true,
      legalComments: 'none',
    });
    return result.code;
  } catch {
    // Concatenated classic scripts may not re-parse; fall back to regex strip
    // that only rewrites console.* call heads (never mangles nested templates).
    return stripDebugMarkersRegexOnly(src);
  }
}

/**
 * Regex-only cleanup for concatenated SW parts that esbuild cannot re-parse.
 * Only rewrites console.log/debug/info/trace call heads to 0&&( — does NOT
 * attempt to rewrite nested template string interiors.
 * @param {string} code
 * @returns {string}
 */
export function stripDebugMarkersRegexOnly(code) {
  let out = rewriteDebugConsoleToDeadCode(code);
  out = out.replace(
    /(?:globalThis|window)\s*\.\s*__prpLastByIdsQueryMeta\s*=\s*[^;]+;?/g,
    '0'
  );
  // Drop trivial dead 0&&(...) single-line calls when arg has no nested parens
  out = out.replace(
    /0&&\((?:[^()]|\([^()]*\))*\)\s*;?/g,
    ''
  );
  return out;
}

/**
 * Markers used by tests to prove release strip vs dev presence.
 * Representative of real product debug noise (fetch + host + bridge).
 */
export const RELEASE_STRIP_MARKERS = [
  '[pr-plus] gql cost=',
  '[pr-plus] fetchPrDetail',
  '[pr-plus] fetchReviewThreadsPage',
  '[pr-plus] openModal',
  '[pr-plus] onRefresh',
  '__prpLastByIdsQueryMeta',
];
