import React from 'react';
import { expect, test } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ConversationView } from '../src/modal/views/conversation/ConversationView';

const copy = '[data-prp-copy-comment="1"]';
const quote = '[data-prp-quote-reply="1"]';
const timestamp = '2026-01-01T00:00:00Z';

function renderConversation(items: Record<string, unknown>, anchor: string) {
  const html = renderToStaticMarkup(
    <ConversationView detail={{ owner: 'test', repo: 'test', number: 1, state: 'open', ...items }} />
  );
  const card = new JSDOM(html).window.document.querySelector(`[data-search-anchor="${anchor}"]`);
  expect(card).not.toBeNull();
  return card!;
}

function renderReview(body: string | null) {
  return renderConversation({
    reviews: [{ id: 1, state: 'APPROVED', author: 'reviewer', submittedAt: timestamp, body }],
  }, 'review:1');
}

test.each([['null', null], ['empty', ''], ['whitespace-only', ' \n\t ']] as const)(
  '%s review body: keep the review event and link, but omit the body and text actions',
  (_label, body) => {
    const card = renderReview(body);
    expect(card.textContent).toContain('reviewer');
    expect(card.textContent).toContain('APPROVED');
    expect(card.querySelector(`.prp-md, ${copy}, ${quote}`)).toBeNull();
    expect(card.querySelector('[data-prp-copy-comment-link="1"]')).not.toBeNull();
  }
);

test('literal "No content" is still a review body with Copy and Quote reply', () => {
  const card = renderReview('No content');
  expect(card.querySelector('.prp-md')?.textContent).toContain('No content');
  expect(card.querySelector(copy)).not.toBeNull();
  expect(card.querySelector(quote)).not.toBeNull();
});

test('empty issue comment keeps its existing body and actions', () => {
  const card = renderConversation({
    comments: [{ id: 10, author: 'commenter', createdAt: timestamp, body: '' }],
  }, 'issue-comment:10');
  expect(card.querySelector('.prp-md')).not.toBeNull();
  expect(card.querySelector(copy)).not.toBeNull();
  expect(card.querySelector(quote)).not.toBeNull();
});
