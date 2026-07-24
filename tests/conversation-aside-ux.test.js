/**
 * Conversation aside UX: milestone like labels, create option, tags section,
 * commits/files search + more… load-all wiring.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const conv = read('src/modal/views/conversation/ConversationView.tsx');
const commitsAside = read('src/modal/views/conversation/AsideCommitsTimeline.tsx');
const filesAside = read('src/modal/views/conversation/AsideFilesTree.tsx');
const tagsAside = read('src/modal/views/conversation/AsideTagsList.tsx');
const sselect = read('src/modal/components/common/SearchableSelect.tsx');
const app = read('src/modal/app/PrModalApp.tsx');
const bridge = read('src/content-bridge.js');
const bg = read('src/background.js');
const fetch = read('src/fetch-pulls.js');

// Milestone chip UX like labels
assert.ok(conv.includes('prp-milestone-chip'), 'milestone chip class');
assert.ok(conv.includes('prp-label-chip__remove'), 'milestone clear uses chip remove');
assert.ok(conv.includes('Set milestone') || conv.includes('Change milestone'), 'milestone action');

// Create option in SearchableSelect
assert.ok(sselect.includes('allowCreate'), 'allowCreate prop');
assert.ok(sselect.includes('prp-sselect-item--create'), 'create row class');
assert.ok(sselect.includes('onCreate'), 'onCreate callback');

// Label + milestone create wiring
assert.ok(app.includes('createRepoLabel'), 'label create API');
assert.ok(app.includes('createRepoMilestone'), 'milestone create API');
assert.ok(app.includes('allowCreate: true'), 'pickers enable create');
assert.ok(app.includes('fetchRepoMilestones'), 'real milestone catalog');

// Tags section
assert.ok(conv.includes('AsideTagsList') || conv.includes('Tags'), 'Tags section in conversation');
assert.ok(tagsAside.includes('filterTagsByQuery') || tagsAside.includes('Search tags'), 'tags list searchable');
assert.ok(app.includes('fetchTagsForCommits') || app.includes('prTags'), 'tags loaded in app');

// Commits / files search + more
assert.ok(commitsAside.includes('prp-aside-search'), 'commits search input');
assert.ok(filesAside.includes('prp-aside-search'), 'files search input');
assert.ok(commitsAside.includes('onEnsureAll'), 'commits ensure all callback');
assert.ok(filesAside.includes('onEnsureAll'), 'files ensure all callback');
assert.ok(commitsAside.includes('prp-aside-overflow--btn') || commitsAside.includes('more'), 'commits more control');
assert.ok(filesAside.includes('prp-aside-overflow--btn') || filesAside.includes('more'), 'files more control');
assert.ok(conv.includes('onEnsureAllCommits') && conv.includes('onEnsureAllFiles'), 'conversation wires ensure');

// API bridge for create + full lists + tags
assert.ok(bridge.includes('createRepoLabel'));
assert.ok(bridge.includes('createRepoMilestone'));
assert.ok(bridge.includes('fetchAllPrCommits'));
assert.ok(bridge.includes('fetchAllPrFiles'));
assert.ok(bridge.includes('fetchTagsForCommits'));
assert.ok(bg.includes('CREATE_REPO_LABEL') || bg.includes('PR_TREE_CREATE_REPO_LABEL'));
assert.ok(bg.includes('FETCH_ALL_PR_COMMITS') || bg.includes('PR_TREE_FETCH_ALL_PR_COMMITS'));
assert.ok(fetch.includes('createRepoLabel') && fetch.includes('createRepoMilestone'));
assert.ok(fetch.includes('fetchTagsForCommits'));
assert.ok(fetch.includes('commitsCount'), 'PR commits count mapped for mayHaveMore');

console.log('conversation-aside-ux.test.js: all assertions passed');
