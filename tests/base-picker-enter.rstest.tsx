/**
 * Base branch picker: Enter must submit the typed branch name, not the first
 * partial match (typing `main` must not retarget the PR to `main-backup`).
 */
import React, { act } from 'react';
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import { SearchableSelect } from '../src/modal/components/common/SearchableSelect';
import { LocaleProvider } from '../src/modal/lib/locale-context';

async function withHost(fn: (dom: JSDOM, host: HTMLElement) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><div id="host"></div>', { pretendToBeVisual: true });
  const globals: Record<string, unknown> = {
    window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const prev = new Map(Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, v] of Object.entries(globals)) {
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  }
  try { await fn(dom, dom.window.document.getElementById('host')!); }
  finally {
    dom.window.close();
    for (const [k, d] of prev) {
      if (d) Object.defineProperty(globalThis, k, d); else Reflect.deleteProperty(globalThis, k);
    }
  }
}

const type = (input: Element, value: string) =>
  act(async () => {
    // React tracks the value setter; use the native setter then fire input.
    Object.getOwnPropertyDescriptor((input.ownerDocument.defaultView as any).HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new (input.ownerDocument.defaultView as any).Event('input', { bubbles: true }));
  });
const press = (input: Element, init: Record<string, unknown> = {}) =>
  act(async () => {
    input.dispatchEvent(new (input.ownerDocument.defaultView as any).KeyboardEvent('keydown', { bubbles: true, key: 'Enter', ...init }));
  });

const options = [
  { id: 'main-backup', label: 'main-backup' },
  { id: 'feature/a', label: 'feature/a' },
];

describe('SearchableSelect literalInput (base branch picker)', () => {
  test('Enter submits the typed branch exactly, ahead of a partial match', async () => withHost(async (_d, host) => {
    const picks: any[] = [];
    const { createRoot } = await import('react-dom/client');
    const root = (createRoot as any)(host);
    let input!: HTMLInputElement;
    let query = '';
    const render = async () => {
      await act(async () => {
        root.render(
          <LocaleProvider uiLanguage="en">
            <SearchableSelect open title="Base" options={options} query={query}
              onQuery={(q: string) => { query = q; }} onPick={(o: any) => picks.push(o)} literalInput />
          </LocaleProvider>
        );
      });
      input = document.querySelector('input.prp-sselect-input')!;
    };
    await render();
    expect(document.querySelectorAll('li button')).toHaveLength(2);
    await type(input, 'main');
    await render();
    // Both the exact typed row and the partial candidate remain clickable.
    const labels = [...document.querySelectorAll('.prp-sselect-item__label')].map((e) => e.textContent);
    expect(labels[0]).toBe('Use typed branch');
    expect(document.querySelector('.prp-sselect-item__secondary')!.textContent).toBe('main');
    await press(input);
    expect(picks).toEqual([{ id: 'main', label: 'main' }]);
  }));

  test('typed value keeps case and is not lowercased or trimmed inside the name', async () => withHost(async (_d, host) => {
    const picks: any[] = [];
    const { createRoot } = await import('react-dom/client');
    const root = (createRoot as any)(host);
    let input!: HTMLInputElement;
    await act(async () => {
      root.render(
        <LocaleProvider uiLanguage="en">
          <SearchableSelect open options={[]} query="Release/One" onQuery={() => {}}
            onPick={(o: any) => picks.push(o)} literalInput />
        </LocaleProvider>
      );
    });
    input = document.querySelector('input.prp-sselect-input')!;
    await press(input);
    expect(picks).toEqual([{ id: 'Release/One', label: 'Release/One' }]);
  }));

  test('⌥1 still picks the first filtered candidate (explicit choice)', async () => withHost(async (_d, host) => {
    const picks: any[] = [];
    const { createRoot } = await import('react-dom/client');
    const root = (createRoot as any)(host);
    await act(async () => {
      root.render(
        <LocaleProvider uiLanguage="en">
          <SearchableSelect open options={options} query="main" onQuery={() => {}}
            onPick={(o: any) => picks.push(o)} literalInput />
        </LocaleProvider>
      );
    });
    const input = document.querySelector('input.prp-sselect-input')!;
    await act(async () => {
      input.dispatchEvent(new (document.defaultView as any).KeyboardEvent('keydown', {
        bubbles: true, key: '1', code: 'Digit1', altKey: true,
      }));
    });
    expect(picks).toEqual([{ id: 'main-backup', label: 'main-backup' }]);
  }));

  test('other pickers keep first-match Enter behavior', async () => withHost(async (_d, host) => {
    const picks: any[] = [];
    const { createRoot } = await import('react-dom/client');
    const root = (createRoot as any)(host);
    await act(async () => {
      root.render(
        <LocaleProvider uiLanguage="en">
          <SearchableSelect open options={options} query="main" onQuery={() => {}}
            onPick={(o: any) => picks.push(o)} />
        </LocaleProvider>
      );
    });
    await press(document.querySelector('input.prp-sselect-input')!);
    expect(picks).toEqual([{ id: 'main-backup', label: 'main-backup' }]);
  }));
});
