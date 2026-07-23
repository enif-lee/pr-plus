/**
 * Lazy highlight.js language loading — pure helpers + structural build checks.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const {
  HLJS_LANGUAGE_IDS,
  isHljsLanguageId,
  hljsLanguageUrl,
  ensureHljsLanguage,
  prefetchHljsLanguages,
  onHljsLanguagesChanged,
  __resetHljsLazyForTests,
} = require('../src/modal/lib/hljs-lazy.ts');
const {
  highlightCode,
  clearHighlightCodeCache,
  escapeHtml,
} = require('../src/modal/components/common/utils.tsx');

async function main() {
  __resetHljsLazyForTests();
  clearHighlightCodeCache();

  // Catalog includes requested systems langs
  for (const id of ['kotlin', 'java', 'go', 'rust', 'c', 'cpp', 'sql', 'typescript']) {
    assert.ok(isHljsLanguageId(id), `catalog has ${id}`);
    assert.ok(HLJS_LANGUAGE_IDS.includes(id));
  }
  assert.equal(isHljsLanguageId('plaintext'), false);
  assert.equal(isHljsLanguageId('nope'), false);

  // Without chrome.runtime, URL is null and ensure cannot fetch
  assert.equal(hljsLanguageUrl('rust'), null);
  assert.equal(await ensureHljsLanguage('rust'), false);

  // highlightCode escapes until grammar is registered; kicks load (no-op without chrome)
  globalThis.hljs = {
    langs: {},
    getLanguage(name) {
      return this.langs[name] || null;
    },
    registerLanguage(name, def) {
      this.langs[name] = def;
    },
    highlight(text) {
      return { value: `<span class="hljs-mock">${text}</span>` };
    },
    highlightAuto(text) {
      return { value: `<span class="auto">${text}</span>` };
    },
  };

  clearHighlightCodeCache();
  const plain = highlightCode('fn main() {}', 'src/main.rs');
  assert.equal(plain, escapeHtml('fn main() {}'));
  assert.ok(!plain.includes('hljs-mock'));

  // After manual register, highlight uses grammar
  globalThis.hljs.registerLanguage('rust', () => ({}));
  clearHighlightCodeCache();
  const rich = highlightCode('fn main() {}', 'src/main.rs');
  assert.equal(rich, '<span class="hljs-mock">fn main() {}</span>');

  // listener notify path
  let ticks = 0;
  const unsub = onHljsLanguagesChanged(() => {
    ticks += 1;
  });
  unsub();
  assert.equal(ticks, 0);

  // prefetch is fire-and-forget and does not throw
  prefetchHljsLanguages(['a.go', 'b.kt', 'c.rs'], { fromPath: true });

  // main.tsx must not eagerly import highlight.js language modules
  const mainSrc = fs.readFileSync(path.join(root, 'src/modal/main.tsx'), 'utf8');
  assert.ok(mainSrc.includes("from 'highlight.js/lib/core'"));
  assert.ok(!mainSrc.includes('highlight.js/lib/languages/'));
  assert.ok(mainSrc.includes('hljs-lazy') || mainSrc.includes('PRPHljsLazy'));

  // Built chunks
  const langsDir = path.join(root, 'src/modal/dist/hljs-langs');
  assert.ok(fs.existsSync(langsDir), 'hljs-langs dir after build');
  const chunks = fs.readdirSync(langsDir).filter((f) => f.endsWith('.js'));
  assert.ok(chunks.includes('rust.js'), 'rust.js chunk');
  assert.ok(chunks.includes('kotlin.js'), 'kotlin.js chunk');
  assert.ok(chunks.includes('go.js'), 'go.js chunk');
  const rust = fs.readFileSync(path.join(langsDir, 'rust.js'), 'utf8');
  assert.ok(rust.length > 200, 'rust grammar bundled into chunk');
  console.log(`hljs-chunks=${chunks.length}`);

  // Load a real chunk via dynamic import + mock chrome.runtime.getURL
  {
    __resetHljsLazyForTests();
    const chunkPath = path.join(langsDir, 'json.js');
    const pathToFileURL = require('node:url').pathToFileURL;
    const fileUrl = pathToFileURL(chunkPath).href;
    globalThis.chrome = {
      runtime: {
        getURL(rel) {
          if (String(rel).endsWith('json.js')) return fileUrl;
          return pathToFileURL(path.join(langsDir, 'missing.js')).href;
        },
      },
    };
    globalThis.hljs = {
      langs: {},
      getLanguage(name) {
        return this.langs[name] || null;
      },
      registerLanguage(name, def) {
        this.langs[name] = { def };
      },
    };
    const ok = await ensureHljsLanguage('json');
    assert.equal(ok, true, 'ensureHljsLanguage loads json chunk via import()');
    assert.ok(globalThis.hljs.getLanguage('json'), 'json registered after load');
    delete globalThis.chrome;
    console.log('ensure-json-via-file-url=true');
  }

  console.log('hljs-lazy.test.js: all assertions passed');
  console.log('hljs-lazy-catalog=' + HLJS_LANGUAGE_IDS.length);
  console.log('hljs-eager-main=false');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
