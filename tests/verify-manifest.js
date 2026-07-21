const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.join(__dirname, '..', 'manifest.json');
const raw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);

if (manifest.manifest_version !== 3) {
  throw new Error('Expected manifest_version 3');
}

if (!manifest.permissions?.includes('storage')) {
  throw new Error('storage permission required for API token');
}

if (!manifest.background?.service_worker) {
  throw new Error('background service_worker required to keep PAT out of content scripts');
}

const swPath = path.join(__dirname, '..', manifest.background.service_worker);
if (!fs.existsSync(swPath)) {
  throw new Error(`Service worker missing: ${manifest.background.service_worker}`);
}
const swSrc = fs.readFileSync(swPath, 'utf8');
if (!swSrc.includes('modal/pure/collapse.js')) {
  throw new Error('service worker must importScripts collapse pure helper for gitattributes');
}

if (!manifest.action?.default_popup) {
  throw new Error('action.default_popup required for API token settings');
}

const popupPath = path.join(__dirname, '..', manifest.action.default_popup);
if (!fs.existsSync(popupPath)) {
  throw new Error(`Popup file missing: ${manifest.action.default_popup}`);
}

if (manifest.options_ui) {
  throw new Error('options_ui should be removed; use action popup instead');
}

const script = manifest.content_scripts?.[0];
if (!script) throw new Error('Missing content_scripts');
if (!script.matches.some((m) => m.includes('github.com/*') || m === 'https://github.com/*')) {
  throw new Error('Content script must match https://github.com/* for SPA navigation');
}

const forbiddenInContent = ['src/storage.js', 'src/fetch-pulls.js', 'src/background.js'];
for (const f of forbiddenInContent) {
  if (script.js.includes(f)) {
    throw new Error(`${f} must not be injected into content scripts (PAT isolation)`);
  }
}

const requiredJs = [
  'src/tree.js',
  'src/dom.js',
  'src/content-bridge.js',
  'src/content-bootstrap.js',
  'src/content.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
];
for (const f of requiredJs) {
  if (!script.js.includes(f)) throw new Error(`Missing ${f} in content_scripts`);
  const abs = path.join(__dirname, '..', f);
  if (!fs.existsSync(abs)) throw new Error(`Missing file on disk: ${f}`);
}

const war = manifest.web_accessible_resources?.[0];
if (!war?.resources?.includes('src/modal/dist/pr-modal.css')) {
  throw new Error('web_accessible_resources must expose pr-modal.css');
}

console.log('verify-manifest.js: manifest v3 OK, modal bundle wired, PAT isolated');
