/**
 * Embed residual hide — pure helpers (body/chrome suppress + restore).
 */
import { describe, expect, test } from '@rstest/core';
import {
  PAGE_EMBED_HOST_ID,
  PAGE_EMBED_NATIVE_HIDDEN_ATTR,
  PAGE_EMBED_NATIVE_INERT_ATTR,
  applyBodyResidualHide,
  applyGithubChromeHide,
  applyNativeResidualHide,
  markNativeHidden,
  restoreNativeHiddenNodes,
  shouldKeepEmbedBodyChild,
  unmarkNativeHidden,
} from '../src/modal/lib/page-embed';

function makeEl(
  opts: {
    id?: string;
    tagName?: string;
    attrs?: Record<string, string>;
  } = {}
) {
  const attrs: Record<string, string> = { ...(opts.attrs || {}) };
  const styleProps: Record<string, string> = {};
  const el: any = {
    id: opts.id || '',
    tagName: opts.tagName || 'DIV',
    getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
    setAttribute: (k: string, v: string) => {
      attrs[k] = v;
    },
    removeAttribute: (k: string) => {
      delete attrs[k];
    },
    style: {
      setProperty: (k: string, v: string) => {
        styleProps[k] = v;
      },
      removeProperty: (k: string) => {
        delete styleProps[k];
      },
      _props: styleProps,
    },
    inert: false,
    closest: () => null,
  };
  return el;
}

describe('shouldKeepEmbedBodyChild', () => {
  test('keeps embed host id and modal host', () => {
    expect(
      shouldKeepEmbedBodyChild(makeEl({ id: PAGE_EMBED_HOST_ID }))
    ).toBe(true);
    expect(shouldKeepEmbedBodyChild(makeEl({ id: 'prp-modal-host' }))).toBe(
      true
    );
  });

  test('keeps script/style/link tags', () => {
    expect(shouldKeepEmbedBodyChild(makeEl({ tagName: 'SCRIPT' }))).toBe(true);
    expect(shouldKeepEmbedBodyChild(makeEl({ tagName: 'STYLE' }))).toBe(true);
    expect(shouldKeepEmbedBodyChild(makeEl({ tagName: 'LINK' }))).toBe(true);
  });

  test('does not keep GH application-main stand-in', () => {
    expect(
      shouldKeepEmbedBodyChild(makeEl({ id: '', tagName: 'DIV' }))
    ).toBe(false);
  });
});

describe('markNativeHidden / unmarkNativeHidden', () => {
  test('marks display none + inert; unmarks fully', () => {
    const el = makeEl();
    expect(markNativeHidden(el)).toBe(true);
    expect(el.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe('1');
    expect(el.getAttribute(PAGE_EMBED_NATIVE_INERT_ATTR)).toBe('1');
    expect(el.style._props.display).toBe('none');
    expect(el.style._props['content-visibility']).toBe('hidden');
    expect(el.inert).toBe(true);
    // idempotent
    expect(markNativeHidden(el)).toBe(false);

    expect(unmarkNativeHidden(el)).toBe(true);
    expect(el.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe(null);
    expect(el.getAttribute(PAGE_EMBED_NATIVE_INERT_ATTR)).toBe(null);
    expect(el.inert).toBe(false);
    expect(el.style._props.display).toBe(undefined);
  });
});

describe('applyBodyResidualHide', () => {
  test('hides residual body children; keeps embed host + script', () => {
    const embed = makeEl({ id: PAGE_EMBED_HOST_ID });
    const main = makeEl({ id: 'js-repo-pjax-container', tagName: 'DIV' });
    const script = makeEl({ tagName: 'SCRIPT' });
    const doc = { body: { children: [embed, main, script] } };
    const n = applyBodyResidualHide(doc, embed);
    expect(n).toBe(1);
    expect(main.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe('1');
    expect(embed.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe(null);
    expect(script.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe(null);
  });
});

describe('applyGithubChromeHide', () => {
  test('hides matching chrome nodes', () => {
    const header = makeEl({ tagName: 'HEADER' });
    const flash = makeEl({ id: 'js-flash-container' });
    const doc = {
      querySelectorAll: (sel: string) => {
        if (sel.includes('AppHeader') || sel.includes('header.AppHeader')) {
          return [header];
        }
        if (sel.includes('js-flash-container')) return [flash];
        return [];
      },
    };
    const n = applyGithubChromeHide(doc);
    expect(n).toBe(2);
    expect(header.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe('1');
    expect(flash.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe('1');
  });
});

describe('applyNativeResidualHide + restore', () => {
  test('round-trips body residual nodes', () => {
    const embed = makeEl({ id: PAGE_EMBED_HOST_ID });
    const main = makeEl({ tagName: 'DIV' });
    const hidden: any[] = [];
    const doc: any = {
      body: { children: [embed, main] },
      querySelectorAll: (sel: string) => {
        if (sel.includes(PAGE_EMBED_NATIVE_HIDDEN_ATTR)) {
          return hidden.filter(
            (el) => el.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR) === '1'
          );
        }
        // footer / chrome none
        return [];
      },
    };
    // Track marked nodes for restore query
    const origMark = markNativeHidden;
    void origMark;
    const r = applyNativeResidualHide(doc, embed);
    expect(r.body).toBe(1);
    expect(main.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe('1');
    hidden.push(main);

    const restored = restoreNativeHiddenNodes(doc);
    expect(restored).toBe(1);
    expect(main.getAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR)).toBe(null);
  });
});
