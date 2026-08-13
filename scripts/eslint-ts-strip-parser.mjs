/**
 * ESLint parser for TS/TSX when typescript-eslint cannot load TypeScript 7.
 * Strips types with esbuild, then parses classic JS with espree.
 */
import * as esbuild from 'esbuild';
import * as espree from 'espree';

export function parseForESLint(code, options = {}) {
  const filePath = String(options.filePath || options.loc || 'file.ts');
  const loader = filePath.endsWith('.tsx') ? 'tsx' : 'ts';
  let js = code;
  try {
    js = esbuild.transformSync(code, {
      loader,
      format: 'esm',
      target: 'es2022',
      jsx: 'preserve',
      legalComments: 'none',
    }).code;
  } catch (err) {
    const error = new Error(err?.message || String(err));
    error.lineNumber = 1;
    error.column = 0;
    throw error;
  }
  const ast = espree.parse(js, {
    ecmaVersion: options.ecmaVersion || 2022,
    sourceType: options.sourceType || 'module',
    loc: true,
    range: true,
    tokens: true,
    comment: true,
    ecmaFeatures: { jsx: true, ...(options.ecmaFeatures || {}) },
  });
  return { ast, scopeManager: null, visitorKeys: null, services: {} };
}

export function parse(code, options) {
  return parseForESLint(code, options).ast;
}

export default { parseForESLint, parse };
