const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.join(__dirname, '..', 'manifest.json');
const raw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);

if (manifest.manifest_version !== 3) {
  throw new Error('Expected manifest_version 3');
}

const script = manifest.content_scripts?.[0];
if (!script) throw new Error('Missing content_scripts');
if (!script.matches.some((m) => m.includes('github.com') && m.includes('pulls'))) {
  throw new Error('Content script must match github PR list URLs');
}

const requiredJs = ['src/tree.js', 'src/dom.js', 'src/content-bootstrap.js', 'src/content.js'];
for (const f of requiredJs) {
  if (!script.js.includes(f)) throw new Error(`Missing ${f} in content_scripts`);
}

console.log('verify-manifest.js: manifest v3 OK, content_scripts match pulls pages');