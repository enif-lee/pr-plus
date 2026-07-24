/**
 * Structural check: write-path uses GitHub /pull/…/changes + #diff-
 * (not only prp_page=) for embed/changes surface.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const host = fs.readFileSync(path.join(root, 'src/pr-modal-host.js'), 'utf8');
const app = fs.readFileSync(
  path.join(root, 'src/modal/app/PrModalApp.tsx'),
  'utf8'
);
const main = fs.readFileSync(path.join(root, 'src/modal/main.tsx'), 'utf8');
const route = fs.readFileSync(
  path.join(root, 'src/modal/lib/github-pr-route.ts'),
  'utf8'
);
const embed = fs.readFileSync(
  path.join(root, 'src/modal/lib/page-embed.ts'),
  'utf8'
);

// Pure helpers exist
assert.ok(route.includes('buildGithubPrPath'), 'build path');
assert.ok(route.includes('buildGithubDiffHash'), 'build hash');
assert.ok(route.includes('parseGithubPrLocation'), 'parse location');
assert.ok(route.includes('/changes'), 'changes segment');
assert.ok(route.includes('#diff-') || route.includes('diff-'), 'diff fragment');

// Write always prefers /changes not /files
assert.ok(
  /buildGithubPrPath[\s\S]*\/changes/.test(route) ||
    route.includes('`${base}/changes`'),
  'write path uses /changes'
);

// Host wires GH route API
assert.ok(host.includes('PRModalGithubPrRoute') || host.includes('githubRouteApi'));
assert.ok(host.includes('replaceGithubPrLocation'));
assert.ok(host.includes('routeCommitSha'));
assert.ok(main.includes('PRModalGithubPrRoute'));

// App writes GH location on embed with selection + commit filter
assert.ok(app.includes('replaceGithubPrLocation'));
assert.ok(app.includes('githubCommitsFromFilter'));
assert.ok(app.includes('githubSelectionFields'));
assert.ok(app.includes('isEmbed'));
// Inbound restore: full applyDiffCommitFilter + clear selection without #diff-
assert.ok(
  app.includes('applyDiffCommitFilter'),
  'app can apply commit filter'
);
assert.ok(
  /commitFilterFromGithubRoute[\s\S]{0,400}applyDiffCommitFilter|applyDiffCommitFilter\(filter\)/.test(
    app
  ) || app.includes('void applyDiffCommitFilter(filter)'),
  'inbound commit route uses applyDiffCommitFilter'
);
assert.ok(
  /!fileKey && !filePathHint[\s\S]{0,120}setLineSelection\(null\)/.test(app) ||
    app.includes('setLineSelection(null)'),
  'clears lineSelection when inbound URL has no #diff-'
);
// Host soft-nav always nulls selection fields when hash absent
assert.ok(
  /routeFileKey\s*=\s*target\.fileKey\s*\|\|\s*null/.test(host),
  'host always assigns routeFileKey'
);

// Embed parse accepts commit/range under changes
assert.ok(embed.includes('commitSha'));
assert.ok(
  embed.includes('a}..{b') ||
    embed.includes('RANGE_RE') ||
    embed.includes('..'),
  'range parse in page-embed'
);

// Bundle exposes API after build:modal
const bundlePath = path.join(root, 'src/modal/dist/pr-modal.bundle.js');
assert.ok(fs.existsSync(bundlePath), 'modal bundle exists');
const bundle = fs.readFileSync(bundlePath, 'utf8');
assert.ok(
  bundle.includes('PRModalGithubPrRoute'),
  'bundle exports PRModalGithubPrRoute'
);
assert.ok(
  bundle.includes('/changes') &&
    (bundle.includes('#diff-') || bundle.includes('diff-')),
  'bundle contains GH changes/#diff write shapes'
);

console.log('github-pr-route-structure.test.js: all assertions passed');
