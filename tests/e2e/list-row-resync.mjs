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


/**
 * Ordered e2e steps for rstest.
 * @returns {{ name: string, fn: () => unknown | Promise<unknown> }[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  /** @type {{ found?: boolean, hasBug?: boolean, labels?: string[] } | null} */
  let baseline = null;
  /** @type {{ found?: boolean, hasBug?: boolean, labels?: string[] } | null} */
  let afterApply = null;
  /** @type {{ found?: boolean, hasBug?: boolean, labels?: string[] } | null} */
  let afterClose = null;

  /** True when label name is exactly/contains bug (case-insensitive). */
  function hasBugLabel(probe) {
    return Boolean(
      probe?.hasBug ||
        (probe?.labels || []).some(
          (l) => String(l).toLowerCase() === 'bug' || /\bbug\b/i.test(String(l))
        )
    );
  }

  /** Remove bug via aside chip ✕ (more reliable than picker when already applied). */
  function removeBugViaChip() {
    return evalInPage(`
      (() => {
        const aside =
          document.querySelector('.prp-conversation__aside') ||
          document.querySelector('.prp-aside') ||
          document.querySelector('.prp-overlay');
        if (!aside) return { ok: false, reason: 'no aside' };
        const chips = [...aside.querySelectorAll('.prp-label-chip, [class*="label-chip"]')];
        for (const chip of chips) {
          const name = (
            chip.querySelector('.prp-label, a, span')?.textContent ||
            chip.textContent ||
            ''
          )
            .replace(/[✕×x]/gi, '')
            .replace(/\\s+/g, ' ')
            .trim();
          if (!/^bug$/i.test(name) && !/\\bbug\\b/i.test(name)) continue;
          const x = chip.querySelector(
            'button.prp-label-chip__remove, button[aria-label*="emove"], button'
          );
          if (x) {
            x.click();
            return { ok: true, via: 'chip-x', name };
          }
        }
        return { ok: false, reason: 'no-bug-chip', chips: chips.length };
      })()
    `);
  }

  /** Force-toggle bug label via aside picker. wantSelected=true → ensure applied. */
  function forceBugLabel(wantSelected) {
    // Fast path: remove via chip ✕ when deselecting an applied bug.
    if (!wantSelected) {
      const chip = removeBugViaChip();
      if (chip?.ok) {
        waitMs(500);
        return chip;
      }
    }
    // Bring Labels control into view (aside scroll / virtualization).
    evalInPage(`
      (() => {
        const lab = Array.prototype.slice
          .call(document.querySelectorAll('.prp-overlay button, .prp-overlay [role="button"]'))
          .find((b) => /add label/i.test(b.textContent || ''));
        lab?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        return !!lab;
      })()
    `);
    waitMs(150);
    let open = { clicked: false };
    let panel = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 8_000) {
      open = openLabelsPicker();
      waitMs(280);
      panel = evalInPage(`!!document.querySelector('.prp-sselect-panel')`);
      if (panel) break;
      waitMs(200);
    }
    assert(open.clicked, `open labels picker: ${JSON.stringify(open)}`);
    assert(panel, 'labels panel missing after Add label…');
    const state = evalInPage(`
      (function () {
        var want = ${wantSelected ? 'true' : 'false'};
        var panel = document.querySelector('.prp-sselect-panel');
        if (!panel) return { panel: false };
        var items = panel.querySelectorAll('button.prp-sselect-item');
        for (var i = 0; i < items.length; i++) {
          var lab = items[i].querySelector('.prp-sselect-item__label');
          var t = (lab ? lab.textContent : items[i].textContent || '').trim();
          if (t === 'bug' || /^bug$/i.test(t)) {
            var sel = items[i].getAttribute('aria-selected') === 'true';
            if (sel !== want) items[i].click();
            return {
              panel: true,
              found: true,
              wasSelected: sel,
              nowSelected: items[i].getAttribute('aria-selected') === 'true',
            };
          }
        }
        return { panel: true, found: false };
      })()
    `);
    assert(state.found, `bug label option missing in picker: ${JSON.stringify(state)}`);
    waitMs(300);
    const preview = evalInPage(`
      (function () {
        var b = Array.prototype.slice
          .call(document.querySelectorAll('button'))
          .find(function (x) {
            return /apply labels/i.test(x.textContent || '');
          });
        return b ? (b.textContent || '').trim() : null;
      })()
    `);
    if (preview) {
      const applied = applyLabels();
      assert(applied.ok, `Apply labels failed: ${JSON.stringify(applied)}`);
      waitMs(600);
    } else {
      abPressEscape();
      waitMs(200);
    }
    return state;
  }

  function abPressEscape() {
    evalInPage(`
      (() => {
        document.documentElement.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        );
        return true;
      })()
    `);
  }

  run('open pulls + extension decorations', () => {
    openPulls();
    const ext = extensionDomProbe();
    log(`  ext=${JSON.stringify(ext)}`);
    assert(ext.decorated > 0 || ext.treeToggle, 'extension decorations missing');
    baseline = probeListRow(DEMO_PR);
    log(`  baseline=#${DEMO_PR} ${JSON.stringify(baseline)}`);
    assert(baseline.found, `PR #${DEMO_PR} not on open pulls`);
    assert(
      typeof baseline.title === 'string' && baseline.title.length > 2,
      `list row title missing: ${JSON.stringify(baseline)}`
    );
  });

  run(`open PR #${DEMO_PR} shell`, () => {
    openPr(DEMO_PR);
    const ov = evalInPage(`!!document.querySelector('.prp-overlay')`);
    assert(ov, 'overlay missing');
    waitMs(600);
    const aside = probeAsideLabels();
    log(`  aside=${JSON.stringify(aside)}`);
    assert(aside.open, 'conversation aside missing');
  });

  run('mutation: reset bug label off (known pre-state)', () => {
    // True mutation tests require a known start: bug must be OFF before we apply it.
    // List may still show stale chips while aside already paints authoritative
    // "No labels" (prior suite write-through). Clear via product picker so both
    // surfaces settle — never leave list chips without a modal write-through.
    let aside = probeAsideLabels();
    let under = probeListRow(DEMO_PR);
    if (aside.hasBug || hasBugLabel(under)) {
      log(
        `  pre-state has bug — removing first aside=${aside.hasBug} list=${hasBugLabel(under)}`
      );
      // If aside is already empty but list is dirty, force a set→clear cycle so
      // the product applies labels=[] write-through to the native row.
      if (!aside.hasBug && hasBugLabel(under)) {
        forceBugLabel(true);
        const tSet = Date.now();
        aside = probeAsideLabels();
        while (!aside.hasBug && Date.now() - tSet < 10_000) {
          waitMs(300);
          aside = probeAsideLabels();
        }
        assert(aside.hasBug, `pre-state force-on failed: ${JSON.stringify(aside)}`);
      }
      forceBugLabel(false);
      const t0 = Date.now();
      aside = probeAsideLabels();
      under = probeListRow(DEMO_PR);
      while (
        (aside.hasBug || hasBugLabel(under)) &&
        Date.now() - t0 < 12_000
      ) {
        waitMs(350);
        aside = probeAsideLabels();
        under = probeListRow(DEMO_PR);
      }
    }
    assert(!aside.hasBug, `pre-state: bug still on after reset: ${JSON.stringify(aside)}`);
    under = probeListRow(DEMO_PR);
    log(`  pre-state list=${JSON.stringify(under)} aside=${JSON.stringify(aside)}`);
    assert(!hasBugLabel(under), `pre-state list still has bug: ${JSON.stringify(under)}`);
  });

  run('mutation: apply bug label (aside + write-through)', () => {
    const aside0 = probeAsideLabels();
    assert(!aside0.hasBug, `expected no bug before apply: ${JSON.stringify(aside0)}`);
    const pick = forceBugLabel(true);
    log(`  forceBug on=${JSON.stringify(pick)}`);
    const aside = waitAsideHasBug(12_000);
    log(`  aside after=${JSON.stringify(aside)}`);
    assert(aside.hasBug, `aside missing bug after apply: ${JSON.stringify(aside)}`);
    assert(!aside.hasNoLabels, 'aside still shows No labels after apply');
  });

  run('mutation: list row under shell reflects bug (write-through hard)', () => {
    let under = probeListRow(DEMO_PR);
    const t0 = Date.now();
    while (!hasBugLabel(under) && Date.now() - t0 < 8000) {
      waitMs(300);
      under = probeListRow(DEMO_PR);
    }
    log(`  under=${JSON.stringify(under)}`);
    assert(under.found, 'list row missing under shell');
    assert(
      hasBugLabel(under),
      `write-through: list row missing bug under shell; labels=${JSON.stringify(under.labels)}`
    );
    assert(
      (under.labels || []).some((l) => String(l).toLowerCase() === 'bug'),
      `expected exact "bug" label token: ${JSON.stringify(under.labels)}`
    );
    afterApply = under;
  });

  run('mutation: close shell → list still shows bug', () => {
    closeOverlay();
    waitMs(800);
    const ov = evalInPage(`!!document.querySelector('.prp-overlay')`);
    assert(!ov, 'overlay still open after Esc/close');
    // Ensure we're on /pulls list surface
    if (!evalInPage(`location.pathname.indexOf('/pulls') !== -1`)) {
      openPulls();
    }
    let after = probeListRow(DEMO_PR);
    const t0 = Date.now();
    while (!hasBugLabel(after) && Date.now() - t0 < 8000) {
      waitMs(300);
      after = probeListRow(DEMO_PR);
    }
    log(`  afterClose=${JSON.stringify(after)}`);
    assert(after.found, 'row missing after close');
    assert(
      hasBugLabel(after),
      `list row missing bug after close; labels=${JSON.stringify(after.labels)}`
    );
    assert(
      afterApply && afterApply.title === after.title,
      `title changed across mutation: before=${afterApply?.title} after=${after.title}`
    );
    afterClose = after;
  });

  run('mutation: cleanup remove bug + assert gone', () => {
    openPr(DEMO_PR, { viaUrl: true });
    waitMs(500);
    // Retry remove: chip ✕ can race reopen paint; picker is fallback.
    let aside = probeAsideLabels();
    const tAside = Date.now();
    while (aside.hasBug && Date.now() - tAside < 16_000) {
      const chip = removeBugViaChip();
      log(`  cleanup chip=${JSON.stringify(chip)}`);
      if (!chip?.ok) {
        try {
          forceBugLabel(false);
        } catch (e) {
          log(`  cleanup picker soft-fail ${String(e?.message || e).slice(0, 80)}`);
        }
      }
      waitMs(450);
      aside = probeAsideLabels();
    }
    assert(!aside.hasBug, `cleanup: aside still has bug: ${JSON.stringify(aside)}`);
    closeOverlay();
    waitMs(600);
    if (!evalInPage(`location.pathname.indexOf('/pulls') !== -1`)) {
      openPulls();
    }
    let cleaned = probeListRow(DEMO_PR);
    const t0 = Date.now();
    while (hasBugLabel(cleaned) && Date.now() - t0 < 10000) {
      waitMs(300);
      cleaned = probeListRow(DEMO_PR);
    }
    log(`  cleaned=${JSON.stringify(cleaned)}`);
    assert(cleaned.found, 'row missing after cleanup');
    assert(
      !hasBugLabel(cleaned),
      `cleanup failed: list still has bug; labels=${JSON.stringify(cleaned.labels)}`
    );
    // Round-trip: labels should not retain bug from afterClose
    assert(
      afterClose && hasBugLabel(afterClose) && !hasBugLabel(cleaned),
      'mutation round-trip: expected afterClose has bug and cleaned has none'
    );
  });

  return steps;
}

/** CLI entry (legacy). Prefer npm run test:e2e via rstest. */
async function main() {
  const { createRunner } = await import('./lib/runner.mjs');
  const { ensureBrowser, closeAll, log } = await import('./lib/harness.mjs');
  const { run, report } = createRunner();
  log('=== scenario start ===');
  ensureBrowser();
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
  closeAll();
  const r = report('scenario');
  process.exit(r.ok ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
// Always allow: node path/to/file.mjs
if (process.argv[1] && /list-row-resync\.mjs$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    try { /* close in main */ } catch {}
    process.exit(1);
  });
}


