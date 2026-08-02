/**
 * Release packaging strips debug/observability console noise; default builds keep it.
 * Asserts valid JS (parseable) after strip, including nested-template console.log.
 *
 *   npx rstest run tests/release-log-strip.rstest.ts
 */
import { describe, expect, test } from '@rstest/core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH =
  process.env.GROK_SCRATCH ||
  process.env.PRP_SCRATCH ||
  path.join(root, '.tmp-release-strip');

function assertParseableJs(code: string, label: string) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(code);
  } catch (e: any) {
    throw new Error(`${label} is not parseable JS: ${e?.message || e}`);
  }
}

/** Nested-template console.log like real logParallelRestSummary / openModal. */
const NESTED_FIXTURE = `
function logParallelRestSummary(timings, names, wallMs) {
  const slowest = { name: 'core', ms: 12 };
  const lines = ['row'];
  console.log(
    \`[pr-plus] fetchPrDetail parallel REST summary
  wall=\${Math.round(wallMs)}ms  sum=1ms  slowest=\${slowest ? \`\${slowest.name}@\${slowest.ms}ms\` : "n/a"}
\` + (lines.length ? lines.join(\`
\`) : "  (no rows)")
  );
  timings.coreParallel = { wallMs: Math.round(wallMs) };
  return timings;
}
function openModalPhase(ms) {
  console.log(\`[pr-plus] openModal phase=threads.start owner/repo#7: \${Math.round(ms)}ms\`);
  console.log(\`[pr-plus] onRefresh unresolved-remaining \${ms}ms\`);
  console.log('[pr-plus] gql cost=' + String(1) + ' remaining=99 op=reviewThreads.last.shell');
  globalThis.__prpLastByIdsQueryMeta = { qName: 'x' };
  console.error('[pr-plus] real failure', ms);
  console.warn('[pr-plus] soft warn', ms);
  return ms;
}
`;

describe('release-build-options (shipped helper)', () => {
  test('isReleaseBuild respects PRP_RELEASE', async () => {
    const prev = process.env.PRP_RELEASE;
    try {
      process.env.PRP_RELEASE = '1';
      const rel = await import(
        pathToFileURL(path.join(root, 'scripts/release-build-options.mjs')).href +
          `?t=${Date.now()}`
      );
      expect(rel.isReleaseBuild()).toBe(true);
      process.env.PRP_RELEASE = '0';
      const dev = await import(
        pathToFileURL(path.join(root, 'scripts/release-build-options.mjs')).href +
          `?t=${Date.now() + 1}`
      );
      expect(dev.isReleaseBuild()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PRP_RELEASE;
      else process.env.PRP_RELEASE = prev;
    }
  });

  test('maybeStripDebugLogs: nested templates → valid JS, markers gone, error kept', async () => {
    const prev = process.env.PRP_RELEASE;
    try {
      process.env.PRP_RELEASE = '1';
      const rel = await import(
        pathToFileURL(path.join(root, 'scripts/release-build-options.mjs')).href +
          `?nested=${Date.now()}`
      );
      const stripped = await rel.maybeStripDebugLogs(NESTED_FIXTURE, {
        loader: 'js',
      });
      assertParseableJs(stripped, 'nested strip output');
      expect(stripped).not.toMatch(/\[pr-plus\] fetchPrDetail/);
      expect(stripped).not.toMatch(/\[pr-plus\] openModal/);
      expect(stripped).not.toMatch(/\[pr-plus\] onRefresh/);
      expect(stripped).not.toMatch(/\[pr-plus\] gql cost=/);
      expect(stripped).not.toMatch(/__prpLastByIdsQueryMeta/);
      expect(stripped).not.toMatch(/console\.log/);
      expect(stripped).toMatch(/console\.error/);
      expect(stripped).toMatch(/console\.warn/);
      // Side effects after log still present
      expect(stripped).toMatch(/coreParallel/);

      process.env.PRP_RELEASE = '';
      const dev = await import(
        pathToFileURL(path.join(root, 'scripts/release-build-options.mjs')).href +
          `?keepNested=${Date.now()}`
      );
      const kept = await dev.maybeStripDebugLogs(NESTED_FIXTURE, { loader: 'js' });
      expect(kept).toMatch(/\[pr-plus\] openModal/);
      assertParseableJs(kept, 'dev passthrough');
    } finally {
      if (prev === undefined) delete process.env.PRP_RELEASE;
      else process.env.PRP_RELEASE = prev;
    }
  });
});

describe('release vs dev build artifacts (real scripts)', () => {
  test('fetch-pulls + host release builds: parseable, markers gone; dev keeps logs', () => {
    fs.mkdirSync(SCRATCH, { recursive: true });

    const runFetch = (release: boolean) =>
      spawnSync(process.execPath, [path.join(root, 'scripts/build-fetch.mjs')], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PRP_RELEASE: release ? '1' : '' },
      });

    const runHost = (release: boolean) =>
      spawnSync(process.execPath, [path.join(root, 'scripts/build-host.mjs')], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PRP_RELEASE: release ? '1' : '' },
      });

    // Dev first
    expect(runFetch(false).status).toBe(0);
    const devFetch = fs.readFileSync(path.join(root, 'src/fetch-pulls.js'), 'utf8');
    assertParseableJs(devFetch, 'dev fetch-pulls.js');
    fs.writeFileSync(
      path.join(SCRATCH, 'dev-log-presence-check.log'),
      [
        'dev fetch-pulls.js',
        `has gql cost=: ${devFetch.includes('[pr-plus] gql cost=')}`,
        `has fetchPrDetail: ${devFetch.includes('[pr-plus] fetchPrDetail')}`,
        `parseable: true`,
      ].join('\n') + '\n'
    );
    expect(devFetch).toMatch(/\[pr-plus\] (fetchPrDetail|gql cost=|fetchReviewThreadsPage)/);

    // Release fetch
    expect(runFetch(true).status).toBe(0);
    const relFetch = fs.readFileSync(path.join(root, 'src/fetch-pulls.js'), 'utf8');
    assertParseableJs(relFetch, 'release fetch-pulls.js');
    expect(relFetch).not.toMatch(/\[pr-plus\] gql cost=/);
    expect(relFetch).not.toMatch(/\[pr-plus\] fetchPrDetail/);
    expect(relFetch).not.toMatch(/__prpLastByIdsQueryMeta/);
    expect(relFetch).not.toMatch(/console\.log\([\s\S]{0,120}\[pr-plus\]/);

    // Release host (openModal / onRefresh timing logs)
    expect(runHost(true).status).toBe(0);
    const relHost = fs.readFileSync(path.join(root, 'src/pr-modal-host.js'), 'utf8');
    assertParseableJs(relHost, 'release pr-modal-host.js');
    expect(relHost).not.toMatch(/\[pr-plus\] openModal/);
    expect(relHost).not.toMatch(/\[pr-plus\] onRefresh/);
    expect(relHost).not.toMatch(/console\.log\([\s\S]{0,120}\[pr-plus\]/);

    fs.writeFileSync(
      path.join(SCRATCH, 'release-log-strip-check.log'),
      [
        'release fetch-pulls.js parseable: true',
        `fetch has [pr-plus] gql cost=: ${relFetch.includes('[pr-plus] gql cost=')}`,
        `fetch has console.log+[pr-plus]: ${/console\.log\([\s\S]{0,80}\[pr-plus\]/.test(relFetch)}`,
        'release pr-modal-host.js parseable: true',
        `host has openModal marker: ${relHost.includes('[pr-plus] openModal')}`,
        `host has onRefresh marker: ${relHost.includes('[pr-plus] onRefresh')}`,
      ].join('\n') + '\n'
    );

    // Restore dev artifacts for local load-unpacked
    expect(runFetch(false).status).toBe(0);
    expect(runHost(false).status).toBe(0);
  }, 180_000);

  test('packaged dist SW + fetch-pulls (if present) parse with node --check', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    );
    const ver = String(pkg.version || '').trim();
    const distDir = path.join(root, 'dist', `pr-plus-${ver}`);
    if (!fs.existsSync(distDir)) {
      // Optional when package not run; still pass if skip
      expect(true).toBe(true);
      return;
    }
    const files = [
      path.join(distDir, 'src/fetch-pulls.js'),
      path.join(distDir, 'src/background.sw.js'),
      path.join(distDir, 'src/pr-modal-host.js'),
      path.join(distDir, 'src/content-bridge.js'),
    ];
    const lines = [];
    for (const f of files) {
      if (!fs.existsSync(f)) {
        lines.push(`missing ${f}`);
        continue;
      }
      const code = fs.readFileSync(f, 'utf8');
      assertParseableJs(code, f);
      const chk = spawnSync(process.execPath, ['--check', f], {
        encoding: 'utf8',
      });
      expect(chk.status).toBe(0);
      const hasMarker =
        /\[pr-plus\] (gql cost=|fetchPrDetail|openModal|onRefresh)/.test(code) ||
        code.includes('__prpLastByIdsQueryMeta');
      lines.push(
        `${path.relative(root, f)}: parse ok, node --check ${chk.status}, markers=${hasMarker}`
      );
      expect(hasMarker).toBe(false);
    }
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(
      path.join(SCRATCH, 'dist-syntax-check.log'),
      lines.join('\n') + '\n'
    );
  });
});
