import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from 'marked';
import { describe, expect, test } from '@rstest/core';
import {
  buildAttachmentMarkdown,
  guessContentType,
  isGithubVideoAttachment,
  uploadGithubCommentAttachment,
} from '../src/modal/lib/composer-attach';
import {
  embedGithubVideoAttachments,
  isGithubVideoAttachmentUrl,
} from '../src/modal/lib/ui-polish';
import { MarkdownView } from '../src/modal/components/common/MarkdownView';

const asset =
  'https://github.com/user-attachments/assets/e86edbec-4305-42e1-9a9e-10dbf6b505c4';

describe('GitHub comment video attachments', () => {
  test('MP4/MOV uploads use GitHub native bare-URL markdown', () => {
    expect(isGithubVideoAttachment('clip.mov', 'video/quicktime')).toBe(true);
    expect(isGithubVideoAttachment('clip.mp4', 'video/mp4')).toBe(true);
    expect(isGithubVideoAttachment('clip.webm', 'video/webm')).toBe(false);
    expect(buildAttachmentMarkdown('clip.mov', asset)).toBe(`\n${asset}\n`);
    expect(
      buildAttachmentMarkdown('recording', asset, { isVideo: true })
    ).toBe(`\n${asset}\n`);
    expect(guessContentType('clip.mov')).toBe('video/quicktime');
    expect(guessContentType('clip.mp4')).toBe('video/mp4');
  });

  test('standalone GitHub asset autolink renders as a video player', () => {
    const html = `<p><a href="${asset}">${asset}</a></p>`;
    const rendered = embedGithubVideoAttachments(html);
    expect(isGithubVideoAttachmentUrl(asset)).toBe(true);
    expect(rendered).toContain('<video class="prp-md-video"');
    expect(rendered).toContain(`src="${asset}"`);
    expect(rendered).toContain('controls muted playsinline preload="metadata"');
  });

  test('linked prose and non-GitHub attachments remain links', () => {
    expect(
      embedGithubVideoAttachments(
        `<p>Video: <a href="${asset}">${asset}</a></p>`
      )
    ).not.toContain('<video');
    expect(
      embedGithubVideoAttachments(
        '<p><a href="https://example.com/a.mp4">https://example.com/a.mp4</a></p>'
      )
    ).not.toContain('<video');
  });

  test('keeps the same video element across rerenders and virtual unmounts', async () => {
    const dom = new JSDOM(
      '<div id="prp-modal-host"><div class="prp-overlay"><div id="root"></div></div></div>'
    );
    const originalGlobals = {
      window: (globalThis as any).window,
      document: globalThis.document,
      Element: (globalThis as any).Element,
      HTMLElement: (globalThis as any).HTMLElement,
      MutationObserver: (globalThis as any).MutationObserver,
      marked: (globalThis as any).marked,
      DOMPurify: (globalThis as any).DOMPurify,
      actEnvironment: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
    };
    const host = dom.window.document.querySelector('#root')!;
    let root: ReturnType<typeof createRoot> | null = null;
    try {
      (globalThis as any).window = dom.window;
      (globalThis as any).document = dom.window.document;
      (globalThis as any).Element = dom.window.Element;
      (globalThis as any).HTMLElement = dom.window.HTMLElement;
      (globalThis as any).MutationObserver = dom.window.MutationObserver;
      (globalThis as any).marked = marked;
      (globalThis as any).DOMPurify = { sanitize: (html: string) => html };
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      root = createRoot(host);

      await act(async () => {
        root!.render(
          React.createElement(MarkdownView, {
            source: `test\n\n${asset}`,
            actionBusy: false,
          })
        );
      });
      const first = host.querySelector('video.prp-md-video');
      expect(first).not.toBeNull();

      await act(async () => {
        root!.render(
          React.createElement(MarkdownView, {
            source: `test\n\n${asset}`,
            actionBusy: true,
          })
        );
      });
      expect(host.querySelector('video.prp-md-video')).toBe(first);

      await act(async () => root!.unmount());
      root = null;
      expect(first!.isConnected).toBe(true);
      expect(first!.parentElement?.matches('.prp-video-element-cache')).toBe(
        true
      );

      root = createRoot(host);
      await act(async () => {
        root!.render(
          React.createElement(MarkdownView, {
            source: `test\n\n${asset}`,
          })
        );
      });
      expect(host.querySelector('video.prp-md-video')).toBe(first);
    } finally {
      if (root) await act(async () => root!.unmount());
      dom.window.document.querySelector('#prp-modal-host')?.replaceChildren();
      await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
      Object.assign(globalThis as any, {
        window: originalGlobals.window,
        document: originalGlobals.document,
        Element: originalGlobals.Element,
        HTMLElement: originalGlobals.HTMLElement,
        MutationObserver: originalGlobals.MutationObserver,
        marked: originalGlobals.marked,
        DOMPurify: originalGlobals.DOMPurify,
        IS_REACT_ACT_ENVIRONMENT: originalGlobals.actEnvironment,
      });
      dom.window.close();
    }
  });

  test('uploads through GitHub policy, storage, and completion endpoints', async () => {
    const dom = new JSDOM();
    const originalDocument = globalThis.document;
    const originalDomParser = globalThis.DOMParser;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      new Response(`
        <file-attachment data-upload-policy-url="/upload/policies/assets" data-upload-repository-id="42">
          <input class="js-data-upload-policy-url-csrf" value="policy-token">
        </file-attachment>`),
      Response.json({
        upload_url: 'https://uploads.github.test/storage',
        form: { key: 'asset-key' },
        header: {},
        asset_upload_url: '/upload/assets/1',
        asset_upload_authenticity_token: 'completion-token',
      }),
      new Response(null, {
        status: 204,
        headers: { 'X-Digest-Sha256': 'digest' },
      }),
      Response.json({ href: asset }),
    ];
    try {
      (globalThis as any).document = dom.window.document;
      (globalThis as any).DOMParser = dom.window.DOMParser;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return responses.shift()!;
      }) as typeof fetch;

      const href = await uploadGithubCommentAttachment(
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
        { owner: 'enif-lee', repo: 'pr-plus', number: 1 }
      );

      expect(href).toBe(asset);
      expect(calls.map(({ url }) => url)).toEqual([
        '/enif-lee/pr-plus/pull/1',
        '/upload/policies/assets',
        'https://uploads.github.test/storage',
        '/upload/assets/1',
      ]);
      expect(calls.map(({ init }) => init?.method || 'GET')).toEqual([
        'GET',
        'POST',
        'POST',
        'PUT',
      ]);
      expect((calls[1].init?.body as FormData).get('content_type')).toBe(
        'video/mp4'
      );
    } finally {
      (globalThis as any).document = originalDocument;
      (globalThis as any).DOMParser = originalDomParser;
      globalThis.fetch = originalFetch;
      dom.window.close();
    }
  });
});
