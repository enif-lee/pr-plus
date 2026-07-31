#!/usr/bin/env node
/**
 * Browser QA (agent-browser): label change in pr+ shell → list row updates on close.
 *
 * Content-script globals (PRTreeDOM) are isolated from page eval, so this path
 * drives the real UI and asserts native list-row DOM.
 *
 * Run: node tests/e2e/list-row-resync.mjs
 */
import {
  DEMO_PR,
  assert,
  closeAll,
  closeOverlay,
  ensureBrowser,
  evalInPage,
  log,
  openPr,
  openPulls,
  step,
  waitMs,
} from './lib/harness.mjs';

function probeListRow(n) {
  // Keep the expression free of nested template quirks — single-quoted script.
  return evalInPage(`
    (function () {
      var n = ${Number(n)};
      var rows = Array.prototype.slice.call(
        document.querySelectorAll('.js-issue-row, [id^="issue_"]')
      );
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var id = r.id || '';
        if (id === 'issue_' + n) {
          row = r;
          break;
        }
        var links = r.querySelectorAll('a[href*="/pull/"]');
        for (var j = 0; j < links.length; j++) {
          var h = links[j].getAttribute('href') || '';
          if (h.indexOf('/pull/' + n) !== -1) {
            row = r;
            break;
          }
        }
        if (row) break;
      }
      if (!row) return { found: false };
      var labels = [];
      var nodes = row.querySelectorAll(
        'a.IssueLabel, .pr-tree-list-label, a[data-name], span.IssueLabel, a[href*="/labels/"]'
      );
      for (var k = 0; k < nodes.length; k++) {
        var el = nodes[k];
        var name = (el.getAttribute('data-name') || el.textContent || '').trim();
        if (name) labels.push(name);
      }
      var seen = {};
      var uniq = [];
      for (var u = 0; u < labels.length; u++) {
        if (!seen[labels[u]]) {
          seen[labels[u]] = 1;
          uniq.push(labels[u]);
        }
      }
      var titleEl = row.querySelector('a.js-navigation-open, a[id$="_link"], h3 a');
      var commentEl = null;
      try {
        commentEl = row.querySelector('a[aria-label*="comment" i]');
      } catch (e) {
        commentEl = row.querySelector('a[aria-label*="comment"], a[aria-label*="Comment"]');
      }
      var commentCount = null;
      if (commentEl) {
        var aria = commentEl.getAttribute('aria-label') || '';
        var m = aria.match(/(\\d+)\\s*comment/i);
        if (m) commentCount = Number(m[1]);
      }
      return {
        found: true,
        title: titleEl ? String(titleEl.textContent || '').trim() : null,
        labels: uniq,
        hasBug: uniq.some(function (l) {
          return String(l).toLowerCase() === 'bug' || /\\bbug\\b/i.test(l);
        }),
        commentCount: commentCount,
        draft: !!row.querySelector('.pr-tree-badge-draft'),
      };
    })()
  `);
}

function probeAsideLabels() {
  return evalInPage(`
    (function () {
      var aside = document.querySelector('.prp-conversation__aside');
      if (!aside) return { open: false };
      var text = aside.innerText || '';
      return {
        open: true,
        hasBug: /\\bbug\\b/i.test(text),
        hasNoLabels: /No labels/i.test(text),
        snippet: text.slice(0, 350),
      };
    })()
  `);
}

function openLabelsPicker() {
  return evalInPage(`
    (function () {
      var btns = Array.prototype.slice.call(
        document.querySelectorAll('.prp-overlay button')
      );
      var btn = btns.find(function (b) {
        return /add label/i.test(b.textContent || '');
      });
      if (!btn) {
        btn = btns.find(function (b) {
          return /label/i.test(b.textContent || '');
        });
      }
      if (btn) btn.click();
      return { clicked: !!btn, text: btn ? String(btn.textContent || '').trim().slice(0, 40) : null };
    })()
  `);
}

function pickLabelNamed(name) {
  const safe = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return evalInPage(`
    (function () {
      var want = '${safe}';
      var panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { ok: false, reason: 'no panel' };
      // Prefer the real multi-select row button
      var items = panel.querySelectorAll('button.prp-sselect-item');
      for (var i = 0; i < items.length; i++) {
        var lab = items[i].querySelector('.prp-sselect-item__label');
        var t = (lab ? lab.textContent : items[i].textContent || '').trim();
        if (t === want) {
          items[i].click();
          return {
            ok: true,
            selected: items[i].getAttribute('aria-selected'),
          };
        }
      }
      return { ok: false, reason: 'option not found', count: items.length };
    })()
  `);
}

function applyLabels() {
  return evalInPage(`
    (function () {
      var panel = document.querySelector('.prp-sselect-panel');
      var scope = panel || document;
      var btns = Array.prototype.slice.call(scope.querySelectorAll('button'));
      var b = btns.find(function (x) {
        return /apply labels/i.test(x.textContent || '');
      });
      if (!b) {
        btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        b = btns.find(function (x) {
          return /apply labels/i.test(x.textContent || '');
        });
      }
      if (b) {
        b.click();
        return { ok: true, text: (b.textContent || '').trim() };
      }
      return { ok: false };
    })()
  `);
}

function waitAsideHasBug(timeoutMs) {
  const start = Date.now();
  const limit = timeoutMs || 8000;
  while (Date.now() - start < limit) {
    const a = probeAsideLabels();
    if (a.hasBug) return a;
    waitMs(300);
  }
  return probeAsideLabels();
}

function extensionDomProbe() {
  return evalInPage(`
    (function () {
      return {
        decorated: document.querySelectorAll('.pr-tree-decorated, .pr-tree-row-meta').length,
        treeToggle: !!document.getElementById('pr-tree-toggle'),
        overlay: !!document.querySelector('.prp-overlay'),
      };
    })()
  `);
}

async function main() {
  const failures = [];
  const run = async (name, fn) => {
    try {
      await step(name, fn);
    } catch (e) {
      failures.push({ name, err: e });
      log(`FAIL: ${name}: ${e.message || e}`);
    }
  };

  log('=== list-row-resync (UI) start ===');
  ensureBrowser();

  let baseline;

  await run('open pulls + extension decorations', () => {
    openPulls();
    const ext = extensionDomProbe();
    log(`  ext=${JSON.stringify(ext)}`);
    assert(ext.decorated > 0 || ext.treeToggle, 'extension decorations missing');
    baseline = probeListRow(DEMO_PR);
    log(`  baseline=#${DEMO_PR} ${JSON.stringify(baseline)}`);
    assert(baseline.found, `PR #${DEMO_PR} not on open pulls`);
  });

  await run(`open PR #${DEMO_PR} shell`, () => {
    openPr(DEMO_PR);
    const ov = evalInPage(`!!document.querySelector('.prp-overlay')`);
    assert(ov, 'overlay missing');
    waitMs(600);
    log(`  aside=${JSON.stringify(probeAsideLabels())}`);
  });

  await run('ensure bug label applied (write-through target)', () => {
    const aside0 = probeAsideLabels();
    log(`  aside before=${JSON.stringify(aside0)}`);
    if (!aside0.hasBug) {
      const open = openLabelsPicker();
      log(`  open picker=${JSON.stringify(open)}`);
      assert(open.clicked, 'could not open labels picker');
      waitMs(700);
      assert(
        evalInPage(`!!document.querySelector('.prp-sselect-panel')`),
        'labels panel missing'
      );
      const pick = pickLabelNamed('bug');
      log(`  pick=${JSON.stringify(pick)}`);
      assert(pick.ok, 'could not pick bug');
      waitMs(400);
      const applyPreview = evalInPage(`
        (function () {
          var b = Array.prototype.slice
            .call(document.querySelectorAll('button'))
            .find(function (x) {
              return /apply labels/i.test(x.textContent || '');
            });
          return b ? (b.textContent || '').trim() : null;
        })()
      `);
      log(`  applyPreview=${applyPreview}`);
      const applied = applyLabels();
      log(`  apply=${JSON.stringify(applied)}`);
      assert(applied.ok, 'Apply labels failed');
      const aside = waitAsideHasBug(10000);
      log(`  aside after=${JSON.stringify(aside)}`);
      assert(aside.hasBug, 'aside still missing bug after apply');
    } else {
      log('  bug already on PR — skip re-apply');
    }
  });

  await run('list row under shell has bug (write-through)', () => {
    waitMs(500);
    let under = probeListRow(DEMO_PR);
    const t0 = Date.now();
    while (!under.hasBug && Date.now() - t0 < 3000) {
      waitMs(300);
      under = probeListRow(DEMO_PR);
    }
    log(`  under=${JSON.stringify(under)}`);
    // Soft signal: write-through may lag; close path is the hard assert
    if (!under.hasBug) {
      log('  note: list under shell not yet patched — will recheck after close');
    }
  });

  await run('close shell → list shows bug label', () => {
    closeOverlay();
    waitMs(1000);
    const ov = evalInPage(`!!document.querySelector('.prp-overlay')`);
    assert(!ov, 'overlay still open');
    let after = probeListRow(DEMO_PR);
    const t0 = Date.now();
    while (!after.hasBug && Date.now() - t0 < 5000) {
      waitMs(300);
      after = probeListRow(DEMO_PR);
    }
    log(`  afterClose=${JSON.stringify(after)}`);
    assert(after.found, 'row missing after close');
    assert(
      after.hasBug,
      `list row missing bug label after PR→list; labels=${JSON.stringify(after.labels)}`
    );
  });

  await run('cleanup: clear bug label', () => {
    openPr(DEMO_PR, { viaUrl: true });
    waitMs(800);
    openLabelsPicker();
    waitMs(700);
    const state = evalInPage(`
      (function () {
        var panel = document.querySelector('.prp-sselect-panel');
        if (!panel) return { panel: false };
        var items = panel.querySelectorAll('button.prp-sselect-item');
        for (var i = 0; i < items.length; i++) {
          var lab = items[i].querySelector('.prp-sselect-item__label');
          var t = (lab ? lab.textContent : items[i].textContent || '').trim();
          if (t === 'bug') {
            var sel = items[i].getAttribute('aria-selected') === 'true';
            if (sel) items[i].click();
            return { panel: true, found: true, wasSelected: sel };
          }
        }
        return { panel: true, found: false };
      })()
    `);
    log(`  cleanup pick state=${JSON.stringify(state)}`);
    waitMs(300);
    applyLabels();
    waitMs(2500);
    closeOverlay();
    waitMs(800);
    // If still on /pull/{n} embed close may not land on list — reopen pulls
    if (!evalInPage(`location.pathname.indexOf('/pulls') !== -1`)) {
      openPulls();
    }
    const cleaned = probeListRow(DEMO_PR);
    log(`  cleaned=${JSON.stringify(cleaned)}`);
  });

  closeAll();

  if (failures.length) {
    console.error(`\nlist-row-resync: ${failures.length} failed`);
    for (const f of failures) {
      console.error(`  - ${f.name}: ${f.err?.message || f.err}`);
    }
    process.exit(1);
  }
  log('=== list-row-resync ALL PASSED ===');
}

main().catch((e) => {
  console.error(e);
  try {
    closeAll();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
