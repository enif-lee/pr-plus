import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from '@rstest/core';
import { DiffToolbar } from '../src/modal/views/chrome/DiffToolbar';

describe('Diff All commits count', () => {
  test('uses PR metadata before the commit list loads', () => {
    const html = renderToStaticMarkup(
      <DiffToolbar
        detail={{ commitsCount: 7 }}
        commits={[]}
        commitFilter={{ mode: 'all' }}
        onCommitFilter={() => {}}
        onToggleFileNav={() => {}}
        onDiffMode={() => {}}
        onPrevComment={() => {}}
        onNextComment={() => {}}
      />
    );
    expect(html).toContain('All commits (7)');
    expect(html).not.toContain('All commits (0)');
  });

  test('does not present an unknown pre-core count as zero', () => {
    const html = renderToStaticMarkup(
      <DiffToolbar
        detail={{ commitsCount: null }}
        commits={[]}
        commitFilter={{ mode: 'all' }}
        onCommitFilter={() => {}}
        onToggleFileNav={() => {}}
        onDiffMode={() => {}}
        onPrevComment={() => {}}
        onNextComment={() => {}}
      />
    );
    expect(html).toContain('All commits');
    expect(html).not.toContain('All commits (0)');
  });
});
