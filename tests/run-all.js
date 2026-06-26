const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRATCH = '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-00241f759391/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const tests = ['tree.test.js', 'dom.test.js'];
const combined = [];

for (const file of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    encoding: 'utf8',
    env: process.env,
  });
  const out = (result.stdout || '') + (result.stderr || '');
  combined.push(`=== ${file} ===\n${out}`);
  if (result.status !== 0) {
    process.stderr.write(out);
    process.exit(result.status);
  }
}

const testOutput = combined.join('\n');
fs.writeFileSync(path.join(SCRATCH, 'test-output.txt'), testOutput);

// Extract serialized tree from dom test for tree-output.txt
const treeMatch = testOutput.match(/--- serialized tree ---\n([\s\S]+?)(?:\n===|$)/);
if (treeMatch) {
  fs.writeFileSync(path.join(SCRATCH, 'tree-output.txt'), treeMatch[1].trim() + '\n');
}

fs.writeFileSync(path.join(SCRATCH, 'browser-eval.log'), testOutput);

console.log(testOutput);
console.log(`\nWrote outputs to ${SCRATCH}`);