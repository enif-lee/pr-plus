/**
 * Package a Load-unpacked Chrome extension tree + zip under dist/.
 *
 * Output:
 *   dist/pr-plus-<version>/
 *   dist/pr-plus-<version>.zip
 *
 * Run via: npm run package  (runs build:release first — strips debug logs).
 * Day-to-day load-unpacked: npm run build (keeps [pr-plus] observability logs).
 *
 * Copies only runtime artifacts (allowlist). TypeScript SoT, host/parts, and
 * README screenshots stay out of the zip.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid package.json version: ${JSON.stringify(pkg.version)}`);
  process.exit(1);
}

const distDir = path.join(root, 'dist');
const outName = `pr-plus-${version}`;
const outDir = path.join(distDir, outName);
const zipPath = path.join(distDir, `${outName}.zip`);

/** Must exist after npm run build:release — matches manifest service_worker. */
export const REQUIRED_ARTIFACTS = [
  'manifest.json',
  'src/background.sw.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/modal/dist/pr-modal.css',
  'src/pr-modal-host.js',
];

/**
 * Relative path (posix) → whether it belongs in the packaged tree.
 * Deny TypeScript, unused host IIFE fragments, and non-runtime docs/assets.
 */
export function shouldCopyPackagedPath(rel) {
  const n = String(rel || '').replaceAll('\\', '/');
  if (!n || n.split('/').includes('.DS_Store')) return false;
  if (/\.(ts|tsx)$/.test(n)) return false;
  if (n === 'src/host/parts' || n.startsWith('src/host/parts/')) return false;
  if (n === 'src/host/modules' || n.startsWith('src/host/modules/')) return false;
  if (n.startsWith('src/host/')) return false;
  if (n.startsWith('src/fetch/')) return false;
  if (n.startsWith('src/background/')) return false;
  if (n.startsWith('src/content-bridge/')) return false;
  if (n.startsWith('src/modal/lib/')) return false;
  if (n.startsWith('src/modal/views/')) return false;
  if (n.startsWith('src/modal/app/')) return false;
  if (n.startsWith('src/modal/hooks/')) return false;
  if (n.startsWith('src/modal/store/')) return false;
  if (n.startsWith('src/modal/components/')) return false;
  if (n.startsWith('src/modal/styles/')) return false;
  if (n === 'src/background.ts' || n === 'src/background.bundle.js') return false;
  if (n === 'src/background.js' || n === 'src/content-bridge.ts') return false;
  if (n.startsWith('assets/') && /\.jpe?g$/i.test(n)) return false;
  if (n === 'src/host/modules/README.md' || n === 'src/host/modules/MANIFEST.json') {
    return false;
  }
  if (
    n === 'manifest.json' ||
    n === 'PRIVACY.md' ||
    n === 'LICENSE' ||
    n.startsWith('_locales/') ||
    n.startsWith('assets/icons/')
  ) {
    return true;
  }
  if (n === 'src/popup.html' || n === 'src/styles.css') return true;
  if (n === 'src/background.sw.js' || n === 'src/pr-modal-host.js') return true;
  if (n.startsWith('src/modal/pure/') && n.endsWith('.js')) return true;
  if (n.startsWith('src/modal/dist/')) return true;
  if (/^src\/[^/]+\.js$/.test(n)) return true;
  return false;
}

function walkFiles(dir, base = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const full = path.join(dir, name);
    const rel = path.relative(base, full).replaceAll('\\', '/');
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, base, acc);
    else acc.push(rel);
  }
  return acc;
}

export function collectPackagedRelativePaths(repoRoot = root) {
  const out = [];
  for (const top of ['manifest.json', 'PRIVACY.md', 'LICENSE']) {
    if (fs.existsSync(path.join(repoRoot, top)) && shouldCopyPackagedPath(top)) {
      out.push(top);
    }
  }
  const locales = path.join(repoRoot, '_locales');
  if (fs.existsSync(locales)) {
    for (const rel of walkFiles(locales, repoRoot)) {
      if (shouldCopyPackagedPath(rel)) out.push(rel);
    }
  }
  const assets = path.join(repoRoot, 'assets');
  if (fs.existsSync(assets)) {
    for (const rel of walkFiles(assets, repoRoot)) {
      if (shouldCopyPackagedPath(rel)) out.push(rel);
    }
  }
  const src = path.join(repoRoot, 'src');
  if (fs.existsSync(src)) {
    for (const rel of walkFiles(src, repoRoot)) {
      if (shouldCopyPackagedPath(rel)) out.push(rel);
    }
  }
  return out.sort();
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!isMain) {
  // Imported by unit tests — skip side effects.
} else {
  for (const rel of REQUIRED_ARTIFACTS) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) {
      console.error(
        `Missing ${rel} — run \`npm run build:release\` (or package) first.`
      );
      process.exit(1);
    }
  }
  if (process.env.PRP_RELEASE !== '1' && process.env.PRP_RELEASE !== 'true') {
    console.warn(
      'WARN: packaging without PRP_RELEASE=1 — debug console.log may still be in bundles. Prefer `npm run package`.'
    );
  }

  fs.mkdirSync(distDir, { recursive: true });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.mkdirSync(outDir, { recursive: true });

  function copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  const packaged = collectPackagedRelativePaths(root);
  for (const rel of packaged) {
    copyFile(path.join(root, rel), path.join(outDir, rel));
  }

  const zip = spawnSync(
    'zip',
    ['-r', zipPath, outName, '-x', '*.DS_Store'],
    { cwd: distDir, encoding: 'utf8' }
  );
  if (zip.status !== 0) {
    console.error(zip.stderr || zip.stdout || 'zip failed');
    process.exit(zip.status || 1);
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')
  );
  const zipStat = fs.statSync(zipPath);
  console.log(`Packaged ${outName}`);
  console.log(`  dir:  ${path.relative(root, outDir)}`);
  console.log(`  zip:  ${path.relative(root, zipPath)} (${zipStat.size} bytes)`);
  console.log(`  manifest.version: ${manifest.version}`);
  console.log(`  files: ${packaged.length}`);
}
