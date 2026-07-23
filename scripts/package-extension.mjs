/**
 * Package a Load-unpacked Chrome extension tree + zip under dist/.
 *
 * Output:
 *   dist/pr-plus-<version>/
 *   dist/pr-plus-<version>.zip
 *
 * Run via: npm run package  (builds first)
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

// Required runtime artifacts (must exist after npm run build)
const required = [
  'manifest.json',
  'src/background.bundle.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/modal/dist/pr-modal.css',
  'src/pr-modal-host.js',
];
for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`Missing ${rel} — run \`npm run build\` first.`);
    process.exit(1);
  }
}

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(outDir, { recursive: true });

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === '.DS_Store') continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  copyFile(src, dest);
}

// Same layout as prior dist/pr-plus-1.2.0 packages
copyFile(path.join(root, 'manifest.json'), path.join(outDir, 'manifest.json'));
if (fs.existsSync(path.join(root, 'PRIVACY.md'))) {
  copyFile(path.join(root, 'PRIVACY.md'), path.join(outDir, 'PRIVACY.md'));
}
if (fs.existsSync(path.join(root, 'assets'))) {
  copyRecursive(path.join(root, 'assets'), path.join(outDir, 'assets'));
}
copyRecursive(path.join(root, 'src'), path.join(outDir, 'src'));

// Prefer system zip for broad compatibility (macOS / Linux CI)
const zip = spawnSync(
  'zip',
  ['-r', zipPath, outName, '-x', '*.DS_Store'],
  { cwd: distDir, encoding: 'utf8' }
);
if (zip.status !== 0) {
  console.error(zip.stderr || zip.stdout || 'zip failed');
  process.exit(zip.status || 1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
const zipStat = fs.statSync(zipPath);
console.log(`Packaged ${outName}`);
console.log(`  dir:  ${path.relative(root, outDir)}`);
console.log(`  zip:  ${path.relative(root, zipPath)} (${zipStat.size} bytes)`);
console.log(`  manifest.version: ${manifest.version}`);
