/**
 * MarkdownComposer ⌘/Ctrl+Enter invokes the same onSubmitRequest as the primary button.
 */
import React from 'react';
import { describe, expect, test } from '@rstest/core';
import TestRenderer, { act } from 'react-test-renderer';
import { MarkdownComposer } from '../src/modal/components/common/MarkdownComposer';

function mockFn() {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
  };
  fn.calls = calls;
  return fn;
}

describe('MarkdownComposer Cmd+Enter submit', () => {
  test('Meta+Enter calls onSubmitRequest', () => {
    const onSubmitRequest = mockFn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MarkdownComposer
          value="hello draft"
          onChange={() => {}}
          forceOpen
          onSubmitRequest={onSubmitRequest}
        />
      );
    });
    const ta = renderer!.root.findByType('textarea');
    act(() => {
      ta.props.onKeyDown({
        key: 'Enter',
        code: 'Enter',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault() {},
        stopPropagation() {},
      });
    });
    expect(onSubmitRequest.calls.length).toBe(1);
  });

  test('Ctrl+Enter calls onSubmitRequest', () => {
    const onSubmitRequest = mockFn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MarkdownComposer
          value="x"
          onChange={() => {}}
          forceOpen
          onSubmitRequest={onSubmitRequest}
        />
      );
    });
    const ta = renderer!.root.findByType('textarea');
    act(() => {
      ta.props.onKeyDown({
        key: 'Enter',
        code: 'Enter',
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        preventDefault() {},
        stopPropagation() {},
      });
    });
    expect(onSubmitRequest.calls.length).toBe(1);
  });

  test('plain Enter does not submit (allows newline)', () => {
    const onSubmitRequest = mockFn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MarkdownComposer
          value="x"
          onChange={() => {}}
          forceOpen
          onSubmitRequest={onSubmitRequest}
        />
      );
    });
    const ta = renderer!.root.findByType('textarea');
    act(() => {
      ta.props.onKeyDown({
        key: 'Enter',
        code: 'Enter',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault() {},
        stopPropagation() {},
      });
    });
    expect(onSubmitRequest.calls.length).toBe(0);
  });

  test('ghost mousedown opens write surface (textarea mounts)', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MarkdownComposer value="" onChange={() => {}} placeholder="Leave a review summary…" />
      );
    });
    // Collapsed: ghost only
    expect(() => renderer!.root.findByType('textarea')).toThrow();
    const ghost = renderer!.root.findByProps({ className: 'prp-mdc__ghost' });
    let prevented = false;
    act(() => {
      ghost.props.onMouseDown({
        preventDefault() {
          prevented = true;
        },
      });
    });
    expect(prevented).toBe(true);
    // Open write surface
    const ta = renderer!.root.findByType('textarea');
    expect(ta.props.placeholder).toContain('Leave a review summary');
    expect(ta.props['data-prp-composer-input']).toBe('1');
  });
});