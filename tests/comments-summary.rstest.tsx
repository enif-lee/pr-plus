import React from 'react';
import { describe, expect, test } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { summarizeCommentThreads } from '../src/modal/lib/comment-summary';
import { CommentsSummary } from '../src/modal/views/conversation/CommentsSummary';
import { AsideCompactRail } from '../src/modal/views/conversation/AsideCompactRail';
import { LocaleProvider } from '../src/modal/lib/locale-context';

const detail = {
  reviewThreads: [
    { threadNodeId: 'PRRT_1', resolved: true, commentsLoaded: false, commentCount: 50 },
    { threadNodeId: 'PRRT_2', resolved: false, outdated: true },
    { threadNodeId: 'PRRT_3', resolved: false },
  ],
  reviewThreadsMeta: { source: 'graphql', totalCount: 3, hasMore: false },
};

describe('comment conversation summary', () => {
  test('counts conversations, not replies; deferred resolved threads still count', () => {
    expect(summarizeCommentThreads({ ...detail,
      reviewThreads: [...detail.reviewThreads, detail.reviewThreads[0]],
      reviewComments: [1, 2, 3].map(id => ({ id, threadNodeId: 'PRRT_2' })),
    })).toMatchObject({ resolved: 1, unresolved: 2, total: 3, unknown: 0, partial: false });
  });

  test('leaves unloaded conversations unknown instead of counting them as unresolved', () => {
    expect(summarizeCommentThreads({ ...detail, reviewThreadsMeta: {
      source: 'graphql', totalCount: 150, hasMore: true,
    } })).toMatchObject({ resolved: 1, unresolved: 2, total: 150, unknown: 147, partial: true });
  });

  test('pending review conversations are excluded from published totals', () => {
    expect(summarizeCommentThreads({ ...detail, reviewComments: [
      { id: 1, threadNodeId: 'PRRT_3', pending: true },
    ] })).toMatchObject({ resolved: 1, unresolved: 1, total: 2 });
    expect(summarizeCommentThreads({ ...detail, reviewComments: [
      { id: 1, threadNodeId: 'PRRT_3', pending: false },
      { id: 2, threadNodeId: 'PRRT_3', pending: true },
    ] }).total).toBe(3);
  });

  test('REST fallback and cold core do not invent resolution status or an empty success', () => {
    expect(summarizeCommentThreads({ reviewThreads: [{ threadNodeId: 'rest-thread-1', resolved: false }],
      reviewThreadsMeta: { source: 'rest', totalCount: 1 } }).available).toBe(false);
    expect(summarizeCommentThreads({ reviewThreads: [], reviewThreadsMeta: { totalCount: null } }).available).toBe(false);
    expect(summarizeCommentThreads({ reviewThreads: [], reviewThreadsMeta: { source: 'graphql', totalCount: 0 } }))
      .toMatchObject({ available: true, total: 0 });
  });

  test('unknown total remains partial without inventing a percentage for missing threads', () => {
    expect(summarizeCommentThreads({ ...detail, reviewThreadsMeta: { hasMore: true } }))
      .toMatchObject({ total: null, partial: true, unknown: 0 });
    expect(summarizeCommentThreads({ reviewThreads: detail.reviewThreads }))
      .toMatchObject({ total: null, partial: true, loaded: 3 });
  });

  test('resolve and unresolve acknowledgements change the chart counts', () => {
    const resolved = { ...detail, reviewThreads: detail.reviewThreads.map(t => ({ ...t, resolved: true })) };
    expect(summarizeCommentThreads(resolved)).toMatchObject({ resolved: 3, unresolved: 0 });
    expect(summarizeCommentThreads(detail)).toMatchObject({ resolved: 1, unresolved: 2 });
  });

  test('renders a labelled chart with proportional known and unloaded segments', () => {
    const html = renderToStaticMarkup(<CommentsSummary detail={{ ...detail,
      reviewThreadsMeta: { source: 'graphql', totalCount: 4, hasMore: true } }} />);
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('1 not loaded');
    expect(doc.querySelector('.prp-comment-summary__segment--resolved')?.getAttribute('style')).toBe('width:25%');
    expect(doc.querySelector('.prp-comment-summary__segment--unresolved')?.getAttribute('style')).toBe('width:50%');
    expect(doc.querySelector('.prp-comment-summary__segment--unknown')?.getAttribute('style')).toBe('width:25%');
  });

  for (const [locale, expected] of [['en', '2 unresolved'], ['ko', '미해결 2개'], ['ja', '未解決 2 件'], ['zh_CN', '未解决 2 条']]) {
    test(`localizes the summary in ${locale}`, () => {
      const html = renderToStaticMarkup(<LocaleProvider uiLanguage={locale}><CommentsSummary detail={detail} /></LocaleProvider>);
      expect(html).toContain(expected);
    });
  }

  test('compact rail places comments immediately above Checks', () => {
    const html = renderToStaticMarkup(<AsideCompactRail detail={{ ...detail,
      checks: { checkRuns: [{ id: 1, name: 'CI', status: 'completed', conclusion: 'success' }] } }} />);
    const doc = new JSDOM(html).window.document;
    const groups = [...doc.querySelectorAll('section')].map(section => section.getAttribute('aria-label'));
    expect(groups.indexOf('Checks')).toBe(groups.indexOf('Comments') + 1);
    expect(doc.querySelector('.prp-comment-summary--compact')).not.toBeNull();
  });
});
