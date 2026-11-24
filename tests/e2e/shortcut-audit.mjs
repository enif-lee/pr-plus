/** Built MV3 UI fixture: node tests/e2e/shortcut-audit.mjs */
import assert from 'node:assert/strict';
import { Session } from 'pikabo';

const session = await Session.start({ extensionPath: process.cwd(), headless: true, viewport: { width: 1440, height: 1000 } });
try {
  const url = 'https://github.com/o/r/pull/1';
  await session.context.route('https://github.com/o/r/**', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><html lang="en"><body><main>
      ${new URL(route.request().url()).pathname === '/o/r/pulls' ? `
        <header><h1 data-testid="header-title">Pull requests</h1></header>
        <input id="fixture-gh-search" type="search">
        <ul><li><div data-listview-item-title-container="true"><h3>
          <a data-testid="listitem-title-link" href="/o/r/pull/1">Fixture PR</a></h3></div>
          <div class="Description-module__container"><span>#1</span></div></li></ul>` : 'PR fixture'}
      </main></body></html>`,
  }));
  const page = session.page('page');
  page.setDefaultTimeout(5000);
  await page.goto(url);
  await page.waitForSelector('[data-prp-content="1"]', { state: 'attached' });
  const worker = await session.worker();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://github.com/o/r/*' });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const host = document.createElement('div');
      document.documentElement.append(host);
      const props = { open: true, loading: false, initialRoute: { page: 'conversation' }, prefs: { uiLanguage: 'en' },
        detail: { owner: 'o', repo: 'r', number: 1, title: 'Keyboard fixture', body: 'Keyboard fixture description',
          author: 'alice', viewerLogin: 'bob', state: 'open', baseRef: 'main', headRef: 'feature',
          commits: [{ sha: '1234567890abcdef', message: 'Update fixture' }], commitsCount: 2,
          comments: [], reviews: [], reviewComments: [], reviewThreads: [],
          files: ['a.txt', 'b.txt'].map(filename => ({ filename, status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' })),
        },
        openPulls: [
          { number: 2, title: 'Another PR', headRef: 'release-candidate', baseRef: 'feature' },
          { number: 3, title: 'Alternate PR', headRef: 'z-alternate', baseRef: 'feature' },
        ],
        onFetchCompareFiles: async () => [],
        onFetchAllPrCommits: () => new Promise(resolve => {
          window.addEventListener('fixture-load-commits', () => resolve([
            ...props.detail.commits,
            { sha: 'abcdef1234567890', message: 'Load another fixture commit' },
          ]), { once: true });
        }),
        onOpenStackPr: (number) => host.setAttribute('data-fixture-stack-pr', String(number)),
        onRestoreNative: () => host.setAttribute('data-fixture-restore', '1'),
        onPatchDetail: (patch) => {
          props.detail = { ...props.detail, ...patch };
          view.render({ ...props });
          return { status: 'applied' };
        },
      };
      globalThis.PRTreeFetch.fetchRepoLabels = async () => [];
      globalThis.PRTreeFetch.fetchRepoMilestones = async () => [];
      globalThis.PRTreeFetch.searchRepoPeople = async () => [];
      globalThis.PRTreeFetch.updatePullRequest = async (owner, repo, number, { base }) => {
        host.setAttribute('data-fixture-base-mutation', JSON.stringify([owner, repo, number, base]));
        return { base: { ref: base } };
      };
      const view = globalThis.mountPrModal(host, props);

    } });
  });
  const picker = page.locator('.prp-sselect-panel');
  const input = picker.locator('input');
  await page.getByRole('button', { name: 'Change base branch', exact: true }).waitFor();
  await page.keyboard.press('Alt+Shift+b');
  await picker.waitFor({ timeout: 3000 });
  assert.equal(await input.evaluate(el => document.activeElement === el), true, 'base shortcut must focus the newly opened input');
  await page.keyboard.type('release');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-fixture-base-mutation]', { state: 'attached' });
  assert.equal(await page.locator('[data-fixture-base-mutation]').getAttribute('data-fixture-base-mutation'), '["o","r",1,"release"]');
  await page.locator('.prp-branch-tag--base').getByText('release', { exact: true }).waitFor();
  console.log('PASS: keyboard base picker opens, focuses and commits the literal branch');

  const shell = page.locator('.prp-overlay[data-layout]');
  const palette = page.locator('.prp-pp-layer--modal');
  const press = chord => page.keyboard.press(chord);
  const focus = async selector => {
    await page.waitForFunction(selector => document.activeElement?.matches(selector), selector);
  };
  const escape = async closed => {
    await press('Escape');
    await closed.waitFor({ state: 'hidden' });
    assert.equal(await shell.isVisible(), true, 'Escape must leave the containing PR open');
  };
  const typeInPicker = async (query) => {
    await picker.waitFor();
    await focus('.prp-sselect-input');
    await page.keyboard.type(query);
    assert.equal(await input.inputValue(), query);
  };
  const lastAction = 'data-prp-last-shortcut-action';
  async function assertRouting(chord, expected) {
    await page.evaluate(attr => document.documentElement.removeAttribute(attr), lastAction);
    await press(chord);
    assert.equal(await page.locator('html').getAttribute(lastAction), expected, chord);
  }

  await press('Alt+i');
  await focus('textarea[data-prp-composer-input]');
  // Exercise the window-capture router with a focused composer capability.
  await page.evaluate(() => {
    const root = document.activeElement.closest('[data-prp-composer-root]');
    const button = document.createElement('button');
    button.hidden = true;
    button.dataset.prpComposerResolve = '1';
    button.addEventListener('click', () => button.dataset.fixtureResolved = '1');
    root.append(button);
  });
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: '®', code: 'KeyR', altKey: true, ctrlKey: true, modifierAltGraph: true, bubbles: true, cancelable: true,
  })));
  assert.equal(await page.locator('[data-fixture-resolved="1"]').count(), 0);
  await assertRouting('Control+Alt+r', 'composerResolve');
  assert.equal(await page.locator('[data-fixture-resolved="1"]').count(), 1);
  await page.evaluate(() => document.querySelector('[data-fixture-resolved]').remove());
  await assertRouting('Alt+s', null); // This footer has no Start pending control.

  // Physical KeyB with a non-ASCII Option glyph while the composer is focused.
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ı', code: 'KeyB', altKey: true, shiftKey: true, bubbles: true, cancelable: true,
  })));
  await picker.waitFor();
  await focus('.prp-sselect-input');
  await page.keyboard.type('stable');
  await press('Control+Enter');
  await picker.waitFor({ state: 'hidden' });
  await page.locator('.prp-branch-tag--base').getByText('stable', { exact: true }).waitFor();

  await press('Alt+Shift+k');
  await palette.waitFor();
  await escape(palette);
  await press('Alt+i');
  await focus('textarea[data-prp-composer-input]');
  await press('Alt+Shift+b');
  await picker.waitFor();
  await focus('.prp-sselect-input');
  await page.locator('[data-prp-composer-collapsed="1"]:visible').waitFor();
  await escape(picker);
  await focus('textarea[data-prp-composer-input]');

  await press('Alt+Shift+b');
  await picker.waitFor();
  await input.evaluate(el => el.blur());
  await assertRouting('Alt+2', null);
  await picker.waitFor({ state: 'hidden' });
  await page.locator('.prp-branch-tag--base').getByText('release-candidate', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-fixture-stack-pr]').count(), 0);
  await page.evaluate(() => document.activeElement?.blur());
  await assertRouting('Alt+2', 'navStackDigit2');
  await page.locator('[data-fixture-stack-pr="2"]').waitFor({ state: 'attached' });

  // Keyboard commands still need a usable picker when the anchor is hidden.
  const baseTrigger = page.getByRole('button', { name: 'Change base branch', exact: true });
  await baseTrigger.click();
  await typeInPicker('click-release');
  await escape(picker);
  await press('Alt+Shift+k');
  await focus('[data-prp-pp-input]');
  await page.keyboard.type('Change base branch');
  await palette.locator('.prp-pp-list').getByText('Change base branch…', { exact: true }).waitFor();
  await press('Enter');
  await typeInPicker('palette-release');
  await escape(picker);
  await baseTrigger.evaluate(el => { el.style.display = 'none'; });
  await press('Alt+Shift+b');
  await picker.waitFor();
  await focus('.prp-sselect-input');
  await escape(picker);
  await page.locator('.prp-branch-tag__edit-btn').evaluate(el => { el.style.display = ''; });

  const fork = page.locator('.prp-stack-strip__item[data-stack-fork="1"]').first();
  await fork.hover();
  await picker.waitFor();
  await focus('.prp-sselect-input');
  // A keyboard context-menu invocation on the focused chip can reactivate
  // the existing hover picker, without toggling its open state.
  await fork.evaluate(chip => {
    chip.focus();
    chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await typeInPicker('alternate');
  await escape(picker);
  await fork.click({ button: 'right' });
  await typeInPicker('alternate');
  await escape(picker);

  await press('Control+f');
  await focus('.prp-search__input');
  await escape(page.locator('.prp-search:visible'));
  await press('Alt+b');
  await page.getByRole('button', { name: 'Expand metadata panel', exact: true }).waitFor();
  await press('Alt+b');
  await page.getByRole('button', { name: 'Collapse metadata panel', exact: true }).waitFor();
  await press('Alt+Shift+t');
  await focus('.prp-header__title-input');
  await escape(page.locator('.prp-header__title-input'));
  for (const [chord, label] of [
    ['Alt+Shift+a', 'Add assignee…'], ['Alt+Shift+r', 'Add reviewer…'],
    ['Alt+Shift+l', 'Add label…'], ['Alt+Shift+p', 'Set milestone…'],
  ]) {
    await press(chord);
    await typeInPicker('fixture');
    await escape(picker);
    await page.getByRole('button', { name: label, exact: true }).click();
    await typeInPicker('fixture');
    await escape(picker);
  }
  await press('Alt+Shift+f');
  await shell.and(page.locator('[data-fullscreen="1"]')).waitFor();
  await press('Alt+Shift+f');
  await shell.and(page.locator('[data-fullscreen="0"]')).waitFor();

  await press('Alt+.');
  await page.locator('.prp-overlay[data-layout="diff"]').waitFor();
  await page.locator('.prp-diff-toolbar__commit-btn').click();
  await typeInPicker('fixture');
  await page.evaluate(() => window.dispatchEvent(new Event('fixture-load-commits')));
  await picker.getByText(/Load another fixture commit/).first().waitFor();
  await focus('.prp-sselect-input');
  assert.equal(await input.inputValue(), 'fixture', 'loading commit options must preserve the active search');
  await escape(picker);
  await press('Meta+f');
  await focus('.prp-search__input');
  const search = page.locator('.prp-search:visible');
  const matchCounter = search.locator('.prp-step-nav__meta');
  await page.keyboard.type('new');
  await matchCounter.getByText('1/2', { exact: true }).waitFor();
  await press('Alt+j');
  await matchCounter.getByText('2/2', { exact: true }).waitFor();
  await press('Alt+k');
  await matchCounter.getByText('1/2', { exact: true }).waitFor();
  await press('Enter');
  await matchCounter.getByText('2/2', { exact: true }).waitFor();
  await press('Shift+Enter');
  await matchCounter.getByText('1/2', { exact: true }).waitFor();
  await search.locator('input').fill('missing from fixture');
  await press('Alt+j'); // Commit the draft immediately rather than stepping stale hits.
  await matchCounter.getByText('0/0', { exact: true }).waitFor();
  await escape(search);
  const goto = page.locator('[data-prp-diff-goto="1"]');
  await press('Alt+g');
  await focus('[data-prp-diff-goto-input="1"]');
  await press('Shift+Tab');
  await focus('[data-prp-diff-goto-item]');
  await escape(goto);
  await press('Alt+g');
  await focus('[data-prp-diff-goto-input="1"]');
  await press('Control+f');
  await focus('.prp-search__input');
  await goto.waitFor({ state: 'hidden' });
  await escape(search);
  await assertRouting('ArrowDown', 'moveSelectionDown');
  await page.locator('.prp-vline--selected').first().waitFor();
  await assertRouting('Shift+ArrowDown', 'extendSelectionDown');
  await assertRouting('Meta+Alt+ArrowDown', null);
  await assertRouting('Control+Shift+c', null);
  await assertRouting('Alt+Shift+]', 'navFileNext');
  await assertRouting('Alt+Shift+[', 'navFilePrev');
  const firstFile = page.locator('.prp-filetree__item[data-file-path="a.txt"]');
  const firstFileRow = page.locator('.prp-filetree__row').filter({ has: firstFile });
  await firstFile.click();
  await assertRouting('Alt+Shift+r', 'toggleViewedActiveFile');
  await firstFileRow.getByRole('checkbox', { name: 'Mark as unread', exact: true }).waitFor();
  await firstFile.click(); // Marking viewed folds the file and can move the active caret.
  await assertRouting('Alt+Shift+r', 'toggleViewedActiveFile');
  await firstFileRow.getByRole('checkbox', { name: 'Mark as viewed', exact: true }).waitFor();
  await press('Alt+b');
  await page.locator('.prp-filetree--nav-collapsed').waitFor();
  await press('Alt+b');
  await page.locator('.prp-filetree--nav-collapsed').waitFor({ state: 'hidden' });

  await press('Alt+Shift+k');
  await palette.waitFor();
  await palette.locator('.prp-pp-help-btn').click();
  await palette.locator('[data-prp-pp-help-open="1"]').waitFor();
  await assertRouting('Alt+Shift+]', null);
  await press('Escape');
  await palette.locator('[data-prp-pp-help-open="0"]').waitFor();
  await escape(palette);

  const gear = page.locator('[data-prp-review-filter-gear="1"]');
  await gear.click();
  const settings = page.locator('[data-prp-review-filter-menu="1"]');
  await settings.waitFor();
  await assertRouting('ArrowDown', null);
  await escape(settings);

  await press('Alt+Shift+m');
  const confirm = page.locator('[data-prp-confirm="1"]');
  await confirm.waitFor();
  await assertRouting('Alt+ArrowDown', null);
  await assertRouting('Alt+Shift+[', null);
  await escape(confirm);

  await press('Alt+Enter');
  const finish = page.locator('[data-prp-finish-review="1"]');
  await finish.waitFor();
  await assertRouting('Alt+Shift+]', null);
  await escape(finish);

  // GitHub can close its palette before a nested pr+ window listener sees
  // Escape; keep the confirmation open on that same keystroke.
  await press('Alt+Shift+m');
  await confirm.waitFor();
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'command-palette-pjax-container';
    document.body.append(dialog);
    dialog.show();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    dialog.close();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    dialog.remove();
  });
  assert.equal(await confirm.isVisible(), true);
  // Subsequent Escape outside the shared native-palette grace dismisses pr+.
  await new Promise(resolve => setTimeout(resolve, 550));
  await escape(confirm);

  // These markers are the contracts shared with GitHub / fullscreen viewer.
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'command-palette-pjax-container';
    document.body.append(dialog);
    dialog.show();
  });
  await assertRouting('ArrowDown', null);
  await assertRouting('Alt+Shift+]', null);
  await page.evaluate(() => document.getElementById('command-palette-pjax-container').remove());
  await page.evaluate(() => document.documentElement.setAttribute('data-prp-viewer-open', '1'));
  await assertRouting('ArrowDown', null);
  await assertRouting('Meta+f', null);
  await page.evaluate(() => document.documentElement.removeAttribute('data-prp-viewer-open'));
  await assertRouting('ArrowDown', 'moveSelectionDown');
  console.log('PASS: Conversation/Diff Find, compose, panel, selection, file navigation and overlay ownership');

  // Real host lifecycle, including the native page's shortcut and embed shield.
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ githubToken: 'fixture-token', extensionPrefs: {
      pluginEnabled: true, autoOpenEmbed: false, onboardingCompleted: true, treeView: true, uiLanguage: 'en',
    } });
    globalThis.fixtureBase = 'main';
    globalThis.fetch = async (url, init = {}) => {
      const path = new URL(String(url)).pathname;
      if (path === '/repos/o/r/pulls/1' && init.method === 'PATCH') {
        globalThis.fixtureBase = JSON.parse(init.body).base;
      }
      const pr = { number: 1, node_id: 'PR_fixture', title: 'Fixture PR', body: 'Keyboard fixture body',
        state: 'open', draft: false, mergeable: true, mergeable_state: 'clean',
        user: { login: 'alice', id: 1 }, labels: [], assignees: [], requested_reviewers: [],
        changed_files: 2, comments: 0, review_comments: 0, commits: 0,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        head: { ref: 'feature', sha: 'head', repo: { name: 'r', owner: { login: 'o' } } },
        base: { ref: globalThis.fixtureBase, sha: 'base', repo: { name: 'r', owner: { login: 'o' } } },
      };
      let data = [];
      if (path === '/user') data = { login: 'alice', id: 1 };
      else if (path === '/repos/o/r/pulls/1' || path === '/repos/o/r/issues/1') data = pr;
      else if (path === '/repos/o/r/pulls/1/files') data = ['a.txt', 'b.txt'].map(filename => ({
        filename, status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new',
      }));
      else if (path === '/repos/o/r/pulls') data = [pr];
      else if (path === '/graphql') {
        const pageInfo = { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null };
        const nodes = { nodes: [], totalCount: 0, pageInfo };
        const pullRequest = { id: 'PR_fixture', viewerSubscription: 'UNSUBSCRIBED', mergeStateStatus: 'CLEAN',
          reviewThreads: nodes, timelineItems: nodes, files: nodes, closingIssuesReferences: nodes, projectItems: nodes,
        };
        data = { data: { repository: { pullRequest }, node: pullRequest, viewer: { login: 'alice' }, nodes: [] } };
      }
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    };
  });
  const enableHost = async () => {
    await page.waitForSelector('[data-prp-content="1"]', { state: 'attached' });
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://github.com/o/r/*' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.PRModalHost.setEnabled(true) });
    });
  };
  await page.goto(url);
  await enableHost();
  await press('Alt+Shift+e');
  const embed = page.locator('#prp-page-embed');
  await embed.getByText('Fixture PR', { exact: true }).first().waitFor();
  await assertRouting('Alt+Shift+f', null);
  await embed.getByRole('button', { name: 'Change base branch', exact: true }).click();
  await typeInPicker('embed-click');
  await escape(picker);
  await press('Alt+Shift+b');
  await focus('.prp-sselect-input');
  await page.keyboard.type('embed-release');
  await press('Enter');
  await embed.locator('.prp-branch-tag--base').getByText('embed-release', { exact: true }).waitFor();
  assert.equal(await worker.evaluate(() => globalThis.fixtureBase), 'embed-release');

  // A native document bubble delegate must not see pr+ input keys.
  await page.evaluate(() => document.addEventListener('keydown', e => document.body.dataset.fixtureLeakedKey = `${e.code}:${e.target?.className}`));
  await press('Alt+Shift+k');
  await focus('[data-prp-pp-input]');
  await palette.locator('input').fill('fullscreen');
  await palette.locator('.prp-pp-item__title', { hasText: 'Toggle fullscreen' }).waitFor({ state: 'hidden' });
  await palette.locator('input').fill('diff');
  const paletteOptions = palette.locator('.prp-pp-item[role="option"]');
  await paletteOptions.nth(1).waitFor();
  const activeOption = palette.locator('.prp-pp-item[aria-selected="true"]');
  const initialOption = await activeOption.getAttribute('data-prp-pp-index');
  await press('ArrowDown');
  assert.notEqual(await activeOption.getAttribute('data-prp-pp-index'), initialOption);
  await palette.locator('input').fill('toggle diff / conversation');
  await palette.locator('.prp-pp-list').getByText('Toggle Diff / Conversation', { exact: true }).waitFor();
  await press('Enter');
  await palette.waitFor({ state: 'hidden' });
  await embed.locator('.prp-overlay[data-layout="diff"]').waitFor();
  await press('Control+f');
  await focus('.prp-search__input');
  const embedSearch = embed.locator('.prp-search:visible');
  const originalSearchInput = await embedSearch.locator('input').elementHandle();
  await embedSearch.locator('input').fill('new');
  await embedSearch.getByText('1/2', { exact: true }).waitFor();
  assert.equal(await originalSearchInput.evaluate(el => el.isConnected && document.activeElement === el), true);
  await press('Enter');
  await embedSearch.getByText('2/2', { exact: true }).waitFor();
  await escape(embedSearch);
  await press('Alt+g');
  await focus('[data-prp-diff-goto-input="1"]');
  await page.keyboard.type('b.txt:1');
  await page.locator('[data-prp-diff-goto-item="b.txt"]').waitFor();
  await press('Enter');
  await page.locator('[data-prp-diff-goto="1"]').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('body').getAttribute('data-fixture-leaked-key'), null);
  // Non-pr+ targets must be stopped before the page's capture delegates.
  await page.evaluate(() => {
    document.addEventListener('keydown', () => { document.body.dataset.fixtureNativeKey = '1'; }, { capture: true, once: true });
    document.querySelector('main').dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
  });
  assert.equal(await page.locator('body').getAttribute('data-fixture-native-key'), null);
  await assertRouting('ArrowDown', 'moveSelectionDown');
  await press('Alt+.');
  await embed.locator('.prp-overlay[data-layout="conversation"]').waitFor();
  await new Promise(resolve => setTimeout(resolve, 400)); // longer than the selection route debounce
  assert.equal(new URL(page.url()).pathname, '/o/r/pull/1');
  await press('Alt+Shift+e');
  await embed.waitFor({ state: 'hidden' });
  console.log('PASS: native PR → embed → picker, palette, Find and Goto local keys → native PR');

  await page.goto('https://github.com/o/r/pulls');
  await enableHost();
  const listPalette = page.locator('#prp-pulls-palette');
  await page.locator('#fixture-gh-search').focus();
  const listUrl = page.url();
  await press('Alt+Shift+g');
  assert.equal(page.url(), listUrl, 'PR filter must not steal a chord from GitHub search');
  await press('Alt+Shift+k');
  await listPalette.waitFor();
  await listPalette.locator('.prp-pp-help-btn').click();
  const listHelp = listPalette.locator('[data-prp-pp-help]');
  await listHelp.waitFor();
  await press('Escape');
  await listHelp.waitFor({ state: 'hidden' });
  assert.equal(await listPalette.isVisible(), true);
  await press('Escape');
  await listPalette.waitFor({ state: 'hidden' });
  console.log('PASS: /pulls search input and command palette Help/Escape ownership');
} finally {
  await session.close();
}
