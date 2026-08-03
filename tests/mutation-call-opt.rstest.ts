/**
 * Mutation call optimization: resolve/title/body write-through without full soft-refresh.
 * Drives shipped stamp helper + App source contracts for post-success handlers.
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  stampThreadResolved,
  applyResolveStamps,
  appendOptimisticReviewComment,
} from '../src/modal/lib/pr-edit-api';
import { mergeDetailPreserveOptimistic } from '../src/modal/lib/composer-attach';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('stampThreadResolved (shipped pure)', () => {
  const detail = {
    title: 'PR',
    body: 'desc',
    reviewComments: [
      { id: 1, threadNodeId: 'PRRT_A', resolved: false, body: 'a' },
      { id: 2, threadNodeId: 'PRRT_B', resolved: false, body: 'b' },
      { id: 3, threadNodeId: 'PRRT_A', resolved: false, body: 'a2' },
    ],
    reviewThreads: [
      { threadNodeId: 'PRRT_A', resolved: false, path: 'f.ts' },
      { threadNodeId: 'PRRT_B', resolved: true, path: 'g.ts' },
    ],
    files: [{ path: 'f.ts' }],
  };

  test('stamps only matching thread comments + thread shell', () => {
    const next = stampThreadResolved(detail, 'PRRT_A', true);
    expect(next).not.toBe(detail);
    expect(next.reviewComments[0].resolved).toBe(true);
    expect(next.reviewComments[1].resolved).toBe(false);
    expect(next.reviewComments[2].resolved).toBe(true);
    expect(next.reviewThreads[0].resolved).toBe(true);
    expect(next.reviewThreads[1].resolved).toBe(true);
    // Unrelated slices untouched
    expect(next.files).toBe(detail.files);
    expect(next.title).toBe('PR');
    expect(next.body).toBe('desc');
  });

  test('unresolve flips back without clobbering other threads', () => {
    const resolved = stampThreadResolved(detail, 'PRRT_B', false);
    expect(resolved.reviewComments[1].resolved).toBe(false);
    expect(resolved.reviewThreads[1].resolved).toBe(false);
    expect(resolved.reviewThreads[0].resolved).toBe(false);
  });

  test('empty / missing tid is a no-op identity', () => {
    expect(stampThreadResolved(detail, '', true)).toBe(detail);
    expect(stampThreadResolved(detail, '   ', true)).toBe(detail);
    expect(stampThreadResolved(null as any, 'PRRT_A', true)).toBe(null);
  });

  test('reply append still works alongside resolve stamp', () => {
    const withReply = appendOptimisticReviewComment(detail, {
      id: 99,
      threadNodeId: 'PRRT_A',
      body: 'reply',
      resolved: false,
    });
    const stamped = stampThreadResolved(withReply, 'PRRT_A', true);
    expect(stamped.reviewComments.some((c: any) => c.id === 99)).toBe(true);
    expect(
      stamped.reviewComments.filter((c: any) => c.threadNodeId === 'PRRT_A').every(
        (c: any) => c.resolved === true
      )
    ).toBe(true);
  });

  test('records _resolveStamps and applyResolveStamps holds lagging host', () => {
    const stamped = stampThreadResolved(detail, 'PRRT_A', true);
    expect(stamped._resolveStamps?.PRRT_A).toBe(true);
    const laggingHost = {
      ...detail,
      reviewComments: detail.reviewComments.map((c: any) => ({
        ...c,
        resolved: false,
      })),
      reviewThreads: detail.reviewThreads.map((t: any) => ({
        ...t,
        resolved: false,
      })),
    };
    const held = applyResolveStamps(laggingHost, stamped._resolveStamps);
    expect(
      held.reviewComments
        .filter((c: any) => c.threadNodeId === 'PRRT_A')
        .every((c: any) => c.resolved === true)
    ).toBe(true);
    // Host still lagging → stamp retained
    expect(held._resolveStamps?.PRRT_A).toBe(true);
    const caughtUp = applyResolveStamps(
      {
        ...held,
        reviewComments: held.reviewComments.map((c: any) =>
          c.threadNodeId === 'PRRT_A' ? { ...c, resolved: true } : c
        ),
        reviewThreads: held.reviewThreads.map((t: any) =>
          t.threadNodeId === 'PRRT_A' ? { ...t, resolved: true } : t
        ),
      },
      held._resolveStamps
    );
    expect(caughtUp._resolveStamps?.PRRT_A).toBeUndefined();
  });

  test('mergeDetailPreserveOptimistic holds resolve stamp against lagging host', () => {
    const local = stampThreadResolved(
      {
        owner: 'o',
        repo: 'r',
        number: 1,
        ...detail,
      },
      'PRRT_A',
      true
    );
    const host = {
      owner: 'o',
      repo: 'r',
      number: 1,
      title: 'PR',
      body: 'desc',
      reviewComments: detail.reviewComments.map((c: any) => ({
        ...c,
        resolved: false,
      })),
      reviewThreads: detail.reviewThreads.map((t: any) => ({
        ...t,
        resolved: false,
      })),
    };
    const m = mergeDetailPreserveOptimistic(local, host);
    expect(
      m.reviewComments
        .filter((c: any) => c.threadNodeId === 'PRRT_A')
        .every((c: any) => c.resolved === true)
    ).toBe(true);
    expect(m._resolveStamps?.PRRT_A).toBe(true);
    // Host catches up → stamp drops
    const hostOk = {
      ...host,
      reviewComments: host.reviewComments.map((c: any) =>
        c.threadNodeId === 'PRRT_A' ? { ...c, resolved: true } : c
      ),
    };
    const m2 = mergeDetailPreserveOptimistic(m, hostOk);
    expect(m2._resolveStamps?.PRRT_A).toBeUndefined();
    expect(
      m2.reviewComments
        .filter((c: any) => c.threadNodeId === 'PRRT_A')
        .every((c: any) => c.resolved === true)
    ).toBe(true);
  });
});

describe('post-mutation success paths: no full soft-refresh (source contract)', () => {
  // Mutations live in pr-modal-mutations.ts (wired from PrModalApp.impl).
  const mutations = read('src/modal/app/pr-modal-mutations.ts');
  const palette = read('src/modal/app/pr-modal-run-palette.ts');
  const appShell = read('src/modal/app/PrModalApp.impl.tsx');

  /**
   * Extract a function body by name. Skips default-param object literals
   * (`opts: any = {}`) by walking the parameter list first.
   */
  function extractFn(src: string, name: string): string {
    const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\b`);
    const m = re.exec(src);
    if (!m) throw new Error(`function ${name} not found`);
    let i = m.index + m[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '(') throw new Error(`no params for ${name}`);
    // Walk parameter list with depth so `= {}` does not look like the body.
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        if (depth === 0 && ch === ')') {
          i++;
          break;
        }
      }
    }
    while (i < src.length && /\s/.test(src[i])) i++;
    // Optional return type annotation `): Foo {`
    if (src[i] === ':') {
      while (i < src.length && src[i] !== '{') i++;
    }
    if (src[i] !== '{') throw new Error(`no body for ${name}`);
    depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    throw new Error(`unclosed ${name}`);
  }

  test('App shell still wires mutation handlers from pr-modal-mutations', () => {
    expect(appShell).toMatch(/applySetLabels/);
    expect(appShell).toMatch(/onResolveThread/);
    expect(appShell).toMatch(/onEditTitle/);
  });

  test('onResolveThread stamps via stampThreadResolved + patchHostDetail after API; no onRefresh', () => {
    const body = extractFn(mutations, 'onResolveThread');
    expect(body).toMatch(/stampThreadResolved/);
    expect(body).toMatch(/patchHostDetail/);
    expect(body).toMatch(/reviewComments/);
    expect(body).not.toMatch(/onRefresh/);
    // Pessimistic: await resolve before applyStamp paint
    expect(body.indexOf('await api.resolveReviewThread')).toBeLessThan(
      body.indexOf('applyStamp(Boolean(resolved))')
    );
  });

  test('onEditTitle patches host + timeline only after API; no onRefresh revalidate', () => {
    const body = extractFn(mutations, 'onEditTitle');
    expect(body).toMatch(/patchHostDetail/);
    expect(body).toMatch(/refreshTimelineEvents/);
    expect(body).not.toMatch(/onRefresh/);
    expect(body.indexOf('await api.updatePullRequest')).toBeLessThan(
      body.indexOf('setLocalDetail')
    );
  });

  test('onSaveBody patches body local+host after API; no onRefresh', () => {
    const body = extractFn(mutations, 'onSaveBody');
    expect(body).toMatch(/patchHostDetail\(\{\s*body/);
    expect(body).not.toMatch(/onRefresh/);
    expect(body.indexOf('await api.updatePullRequest')).toBeLessThan(
      body.indexOf('setLocalDetail')
    );
  });

  test('applySetLabels still uses commitMetaPatch without onRefresh', () => {
    const body = extractFn(mutations, 'applySetLabels');
    expect(body).toMatch(/commitMetaPatch/);
    expect(body).not.toMatch(/onRefresh/);
  });

  test('palette toggleLabel routes through applySetLabels (no inline onRefresh)', () => {
    // Command-palette label toggle must not reintroduce full soft-refresh.
    const m = palette.match(
      /case\s+['"]toggleLabel['"]\s*:\s*\{([\s\S]*?)\n\s*break;\s*\n\s*\}/
    );
    expect(m?.[1]).toBeTruthy();
    const body = m![1];
    expect(body).toMatch(/applySetLabels\s*\(/);
    expect(body).not.toMatch(/onRefresh/);
    expect(body).not.toMatch(/setIssueLabels/);
  });

  test('onReplyToThread stays write-through only (no onRefresh)', () => {
    const body = extractFn(mutations, 'onReplyToThread');
    expect(body).toMatch(/commitCommentListPatch/);
    expect(body).not.toMatch(/onRefresh/);
  });
});
