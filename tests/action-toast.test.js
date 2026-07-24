const assert = require('node:assert/strict');
const { actionToastTone } = require('../src/modal/components/common/ActionToast.tsx');

assert.equal(actionToastTone('Code copied'), 'ok');
assert.equal(actionToastTone('URL copied'), 'ok');
assert.equal(actionToastTone('Comment posted.'), 'ok');
assert.equal(actionToastTone('Copy failed'), 'error');
assert.equal(actionToastTone('Could not build URL'), 'error');
assert.equal(actionToastTone('Line comment API unavailable'), 'error');
assert.equal(actionToastTone('Write a comment first.'), 'neutral');
assert.equal(actionToastTone(''), 'neutral');

console.log('action-toast.test.js: all assertions passed');
