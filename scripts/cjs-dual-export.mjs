/**
 * Temporary rewrite of `module.exports` dual-export so esbuild (format: esm)
 * does not warn commonjs-variable-in-esm or wrap the file in __commonJS.
 * Restore after transform/bundle so classic-script consumers still get CJS attach.
 */
import fs from 'node:fs';
import path from 'node:path';

export const MODULE_SENTINEL = '__PRP_MODULE_EXPORTS__';
export const MODULE_OBJ_SENTINEL = '__PRP_MODULE_OBJ__';

export function protectCjsDualExport(code) {
  return (
    code
      .replace(/\bmodule\.exports\b/g, MODULE_SENTINEL)
      .replace(/\btypeof\s+module\b/g, `typeof ${MODULE_OBJ_SENTINEL}`)
      .replace(/\bmodule\b/g, MODULE_OBJ_SENTINEL)
      // esbuild rewrites bare top-level `this` to `exports` → __commonJS wrap
      .replace(
        /\)\(\s*typeof\s+globalThis\s*!==\s*['"]undefined['"]\s*\?\s*globalThis\s*:\s*this\s*\)/g,
        ')(typeof globalThis !== "undefined" ? globalThis : globalThis)'
      )
      .replace(/:\s*this\s*\)\s*;\s*$/gm, ': globalThis);')
  );
}

export function restoreCjsDualExport(code) {
  return code
    .replace(new RegExp(MODULE_SENTINEL, 'g'), 'module.exports')
    .replace(new RegExp(MODULE_OBJ_SENTINEL, 'g'), 'module');
}

/**
 * esbuild plugin: protect dual-export in project sources before parse.
 * @param {string} rootAbs absolute project (or src) root to limit rewrites
 */
export function protectCjsDualExportPlugin(rootAbs) {
  const root = path.resolve(rootAbs);
  return {
    name: 'protect-cjs-dual-export',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        const file = path.resolve(args.path);
        if (!file.startsWith(root + path.sep) && file !== root) {
          return null;
        }
        const code = await fs.promises.readFile(file, 'utf8');
        if (!/\bmodule\.exports\b|\btypeof\s+module\b/.test(code)) {
          return null;
        }
        let loader = 'js';
        if (file.endsWith('.tsx')) loader = 'tsx';
        else if (file.endsWith('.ts')) loader = 'ts';
        else if (file.endsWith('.jsx')) loader = 'jsx';
        else if (file.endsWith('.mts') || file.endsWith('.cts')) loader = 'ts';
        return { contents: protectCjsDualExport(code), loader };
      });
    },
  };
}
