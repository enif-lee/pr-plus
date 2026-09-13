/**
 * Error action toasts expose a copy control that writes the message.
 * Drives shipped ActionToast + actionToastTone.
 */
import React from 'react';
import { describe, expect, test } from '@rstest/core';
import TestRenderer, { act } from 'react-test-renderer';
import {
  ActionToast,
  actionToastTone,
} from '../src/modal/components/common/ActionToast';

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    documentElement: { setAttribute() {} },
  };
}
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {};
}

describe('actionToastTone', () => {
  test('classifies failures as error', () => {
    expect(actionToastTone('GitHub PAT required to add assignees')).toBe('error');
    expect(actionToastTone('Copy failed')).toBe('error');
    expect(actionToastTone('Comment copied')).toBe('ok');
  });

  test('GitHub 422 reviewer errors are error even when they contain requested', () => {
    expect(
      actionToastTone(
        'GitHub API 422: Review cannot be requested from pull request author.'
      )
    ).toBe('error');
    expect(
      actionToastTone(
        'GitHub API 422: Reviews may not be requested from pull request authors.'
      )
    ).toBe('error');
    expect(
      actionToastTone(
        'GitHub API 422: Reviews can not be requested from cursor[bot].'
      )
    ).toBe('error');
    expect(
      actionToastTone(
        'GitHub API 422: Reviews may only be requested from collaborators. One or more of the users or teams you specified is not a collaborator of the enif-lee/pr-plus repository.'
      )
    ).toBe('error');
    expect(actionToastTone('Requested review from octocat.')).toBe('ok');
  });
});

describe('ActionToast copy on error', () => {
  test('error toast mounts copy button; success does not', async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ActionToast message="Failed to request reviewers" durationMs={8000} />
      );
    });
    const errJson = renderer!.toJSON() as any;
    expect(errJson?.props?.['data-tone']).toBe('error');
    const errBtn = renderer!.root.findByProps({
      'data-prp-action-toast-copy': '1',
    });
    expect(errBtn).toBeTruthy();
    expect(errBtn.props['aria-label']).toMatch(/copy/i);

    await act(async () => {
      renderer!.update(<ActionToast message="Comment copied" durationMs={8000} />);
    });
    const okJson = renderer!.toJSON() as any;
    expect(okJson?.props?.['data-tone']).toBe('ok');
    expect(() =>
      renderer!.root.findByProps({ 'data-prp-action-toast-copy': '1' })
    ).toThrow();
    renderer!.unmount();
  });

  test('copy button writes the error text to clipboard', async () => {
    const writes: string[] = [];
    const nav = globalThis.navigator as Navigator & { clipboard?: { writeText: (s: string) => Promise<void> } };
    const prev = nav.clipboard;
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (s: string) => {
          writes.push(s);
        },
      },
    });
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ActionToast message="GraphQL error: rate limit" durationMs={8000} />
      );
    });
    const btn = renderer!.root.findByProps({
      'data-prp-action-toast-copy': '1',
    });
    await act(async () => {
      await btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
    });
    expect(writes).toEqual(['GraphQL error: rate limit']);
    renderer!.unmount();
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      value: prev,
    });
  });
});
