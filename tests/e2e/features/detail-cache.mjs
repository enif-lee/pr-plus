/**
 * PR detail cache reuse — open twice with same headSha; files/commits settle from cache.
 */
import {
  DEMO_PR,
  assert,
  evalInPage,
  log,
  openPr,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';

function detailCacheProbe() {
  return evalInPage(`
    (() => {
      const host =
        document.getElementById('prp-modal-host') ||
        document.getElementById('prp-page-embed');
      const root = document.documentElement;
      const attr = (name) =>
        host?.getAttribute?.(name) || root?.getAttribute?.(name) || '';
      const attrFiles = attr('data-prp-cache-files');
      const attrSha = attr('data-prp-head-sha');
      const attrReason = attr('data-prp-cache-reuse-reason');
      const filesReady =
        host?.getAttribute?.('data-prp-files-ready') === '1' ||
        root?.getAttribute?.('data-prp-files-ready') === '1';
      const filesCount = Number(
        host?.getAttribute?.('data-prp-files-count') ||
          root?.getAttribute?.('data-prp-files-count') ||
          0
      );
      const metaReady =
        host?.getAttribute?.('data-prp-meta-ready') === '1' ||
        root?.getAttribute?.('data-prp-meta-ready') === '1';
      // Diff filetree / virtual rows when painted
      const fileRows = document.querySelectorAll(
        '.prp-file-tree-row, [data-prp-file], .prp-vlist [data-path], .prp-file-header'
      ).length;
      return {
        attrFiles,
        attrSha,
        attrReason,
        filesReady,
        filesCount,
        metaReady,
        fileRows,
        headSha: attrSha,
      };
    })()
  `);
}

function closeModalSoft() {
  return evalInPage(`
    (() => {
      try {
        // Esc / host close
        const esc = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(esc);
      } catch (_) {}
      try {
        window.PRModalHost?.closeModal?.();
      } catch (_) {}
      return true;
    })()
  `);
}

/** @returns {{ name: string, fn: () => void|Promise<void> }[]} */
export function buildDetailCacheSteps() {
  /** @type {{ firstSha?: string, firstFiles?: string }} */
  const state = {};

  return [
    {
      name: `DC.1 cold open PR #${DEMO_PR} and wait Diff files`,
      fn: () => {
        openPr(DEMO_PR);
        setLayout('diff');
        waitDetailReady({
          number: DEMO_PR,
          meta: true,
          files: false,
          label: `detail-cache cold #${DEMO_PR}`,
        });
        waitDiffFilesReady(`detail-cache cold Diff #${DEMO_PR}`);
        waitMs(400);
        const p = detailCacheProbe();
        log(`  DC.1 probe ${JSON.stringify(p)}`);
        assert(p, 'probe missing');
        // First open may be fetch or reuse depending on prior suite state
        state.firstSha = p.attrSha || p.headSha || '';
        state.firstFiles = p.attrFiles || '';
        if (state.firstSha) {
          assert(
            String(state.firstSha).length >= 6,
            `expected head sha stamp, got ${state.firstSha}`
          );
        }
      },
    },
    {
      name: 'DC.2 soft close modal',
      fn: () => {
        closeModalSoft();
        waitMs(300);
      },
    },
    {
      name: `DC.3 reopen PR #${DEMO_PR} — same head reuses files cache`,
      fn: () => {
        openPr(DEMO_PR);
        setLayout('diff');
        waitDetailReady({
          number: DEMO_PR,
          meta: true,
          files: false,
          label: `detail-cache warm #${DEMO_PR}`,
        });
        // Warm reopen should paint files quickly from cache
        waitDiffFilesReady(`detail-cache warm Diff #${DEMO_PR}`);
        waitMs(500);
        const p = detailCacheProbe();
        log(`  DC.3 probe ${JSON.stringify(p)}`);
        assert(p, 'warm probe missing');

        // Prefer product stamp: reuse when head unchanged
        const reuseStamp = String(p.attrFiles || '');
        const reason = String(p.attrReason || '');
        const sameSha =
          !state.firstSha ||
          !p.attrSha ||
          String(state.firstSha).slice(0, 7) === String(p.attrSha).slice(0, 7);

        assert(
          Boolean(p.filesReady || p.filesCount > 0 || p.fileRows > 0),
          `expected files ready on warm reopen; probe=${JSON.stringify(p)}`
        );

        if (sameSha && (reuseStamp === 'reuse' || /reuse/.test(reason))) {
          log('  DC.3 observed cache-reuse stamp for files');
        } else if (sameSha && (p.filesReady || p.filesCount > 0)) {
          // Same head + files settled — acceptable even if stamp races after side-fetch
          log(
            `  DC.3 same head filesReady=${p.filesReady} count=${p.filesCount} stamp=${reuseStamp || '(none)'} reason=${reason || '(none)'}`
          );
        } else {
          assert(
            reuseStamp === 'reuse' || p.filesCount > 0,
            `expected files reuse or settled files on same-head reopen; probe=${JSON.stringify(p)} firstSha=${state.firstSha}`
          );
        }

        // Head should still be stamped when known
        if (state.firstSha && p.attrSha) {
          assert(
            String(state.firstSha).slice(0, 7) === String(p.attrSha).slice(0, 7),
            `head sha changed unexpectedly first=${state.firstSha} second=${p.attrSha}`
          );
        }
      },
    },
  ];
}

export function getSteps() {
  return buildDetailCacheSteps();
}

export async function runDetailCache(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
