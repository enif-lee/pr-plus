import React, {
  useMemo,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
// memo for render isolation
import { parseSuggestionFences } from '@lib/pr-edit-api';
import {
  splitMarkdownSegments,
  expandEmojiShortcodes,
} from '@lib/markdown-composer';
import { markSearchInHtml } from '@lib/search-index';
import { onHljsLanguagesChanged } from '@lib/hljs-lazy';
import { MermaidBlock } from './MermaidBlock';
import { SuggestionBlock } from './SuggestionBlock';
import { ImageViewer } from './ImageViewer';
import { clearHighlightCodeCache, renderMdHtml } from './utils';
import './MarkdownView.css';

type CachedVideo = {
  node: HTMLVideoElement;
  src: string;
  owner: HTMLElement | null;
  lastUsed: number;
};

type VideoCacheScope = {
  host: HTMLElement;
  root: HTMLElement;
  entries: CachedVideo[];
};

const videoCacheScopes = new WeakMap<HTMLElement, VideoCacheScope>();
const MAX_CACHED_VIDEOS = 12;

function clearVideoCacheScope(scope: VideoCacheScope) {
  for (const entry of scope.entries) {
    try {
      entry.node.pause();
      entry.node.removeAttribute('src');
      entry.node.load();
      entry.node.remove();
    } catch {
      /* ignore detached media cleanup */
    }
  }
  scope.entries.length = 0;
  scope.root.remove();
  videoCacheScopes.delete(scope.host);
}

function videoCacheScopeFor(segment: HTMLElement): VideoCacheScope | null {
  const host = segment.closest<HTMLElement>('#prp-modal-host, #prp-page-embed');
  if (!host) return null;
  const current = videoCacheScopes.get(host);
  if (current?.root.isConnected) return current;
  if (current) clearVideoCacheScope(current);

  const root = document.createElement('div');
  root.className = 'prp-video-element-cache';
  root.setAttribute('data-prp-video-cache', '1');
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
  root.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.documentElement.appendChild(root);
  const scope = { host, root, entries: [] as any[] };
  videoCacheScopes.set(host, scope);
  return scope;
}

function mountCachedVideos(segment: HTMLElement) {
  const scope = videoCacheScopeFor(segment);
  if (!scope) return undefined;
  const mounted: CachedVideo[] = [];
  for (const candidate of segment.querySelectorAll<HTMLVideoElement>(
    'video.prp-md-video[src]'
  )) {
    const src = String(candidate.getAttribute('src') || '').trim();
    if (!src) continue;
    let entry = scope.entries.find(
      (item) =>
        item.src === src &&
        item.owner == null &&
        item.node.parentElement === scope.root
    );
    if (entry) {
      candidate.replaceWith(entry.node);
    } else {
      entry = { node: candidate, src, owner: null, lastUsed: 0 };
      scope.entries.push(entry);
    }
    entry.owner = segment;
    entry.lastUsed = Date.now();
    mounted.push(entry);
  }

  return () => {
    for (const entry of mounted) {
      if (entry.owner !== segment) continue;
      if (scope.root.isConnected) scope.root.appendChild(entry.node);
      entry.owner = null;
      entry.lastUsed = Date.now();
    }
    const idle = scope.entries
      .filter((entry) => entry.owner == null)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    while (scope.entries.length > MAX_CACHED_VIDEOS && idle.length) {
      const entry = idle.shift()!;
      try {
        entry.node.pause();
        entry.node.removeAttribute('src');
        entry.node.load();
        entry.node.remove();
      } catch {
        /* ignore detached media cleanup */
      }
      scope.entries.splice(scope.entries.indexOf(entry), 1);
    }
    window.setTimeout(() => {
      const shell = scope.host.querySelector('.prp-overlay, .prp-embed-main');
      if (!scope.host.isConnected || !shell) clearVideoCacheScope(scope);
    }, 0);
  };
}

// React 19 writes a fresh dangerouslySetInnerHTML object back to the DOM on
// every render. Keep identical HTML mounted so video playback/fullscreen state
// survives virtual-row height updates; changed HTML still renders normally.
const MdHtmlSegment = memo(function MdHtmlSegment({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const segment = ref.current;
    return segment ? mountCachedVideos(segment) : undefined;
  }, [html]);
  return (
    <div
      ref={ref}
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    />
  );
});

function MarkdownViewImpl({
  source,
  className = '',
  onApplySuggestion,
  canApplySuggestion,
  actionBusy,
  onRegisterApply,
  linkCtx,
  /** When set, inject search marks into rendered markdown HTML */
  searchQuery = '',
  /** Plain-text start offset for current match (decoded textContent space) */
  searchCurrentStart = null,
  /** 0-based occurrence among matches in this block for current mark */
  searchOccurrenceIndex = null,
}: any) {
  const raw = source == null || source === '' ? '_No content_' : String(source);
  /** Re-render fenced blocks when a lazy grammar finishes loading */
  const [hljsEpoch, setHljsEpoch] = useState(0);
  const [imageViewer, setImageViewer] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  useEffect(() => {
    return onHljsLanguagesChanged(() => {
      clearHighlightCodeCache();
      setHljsEpoch((n) => n + 1);
    });
  }, []);

  const openImageFromEvent = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t || t.tagName !== 'IMG') return;
    const img = t as HTMLImageElement;
    // Skip avatars / chrome that might nest under .prp-md accidentally
    if (img.closest?.('.prp-avatar, .prp-icon-btn, a.prp-user-link')) return;
    const src = String(img.currentSrc || img.src || '').trim();
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    setImageViewer({
      src,
      alt: String(img.alt || img.getAttribute('title') || 'Image'),
    });
  }, []);

  const suggestions =
    typeof parseSuggestionFences === 'function' ? parseSuggestionFences(raw) : [];
  const segments = useMemo(() => {
    // Split mermaid first, then peel suggestion fences from md segments for rich render
    const base =
      typeof splitMarkdownSegments === 'function'
        ? splitMarkdownSegments(raw)
        : [{ type: 'md', content: raw }];
    const out = [];
    for (const seg of base) {
      if (seg.type !== 'md') {
        out.push(seg);
        continue;
      }
      const text = seg.content || '';
      const re = /```suggestion[^\n]*\r?\n([\s\S]*?)```/gi;
      let last = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push({ type: 'md', content: text.slice(last, m.index) });
        out.push({ type: 'suggestion', content: m[1].replace(/\n$/, '') });
        last = m.index + m[0].length;
      }
      if (last < text.length) out.push({ type: 'md', content: text.slice(last) });
      if (!last && !out.length) out.push(seg);
    }
    return out.length ? out : [{ type: 'md', content: raw }];
  }, [raw]);

  const q = String(searchQuery || '').trim();

  return (
    <div
      className={`prp-md ${className}`.trim()}
      onClick={openImageFromEvent}
      onDoubleClick={openImageFromEvent}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'mermaid') {
          return <MermaidBlock key={`m-${i}`} code={seg.content} />;
        }
        if (seg.type === 'suggestion') {
          return (
            <SuggestionBlock
              key={`s-${i}`}
              content={seg.content}
              canApply={Boolean(canApplySuggestion)}
              actionBusy={actionBusy}
              onApply={() => onApplySuggestion?.(seg.content, suggestions)}
              onRegisterApply={onRegisterApply}
            />
          );
        }
        // hljsEpoch invalidates after lazy language load so fences re-highlight
        void hljsEpoch;
        // Expand :shortcode: for preview + feed (GitHub-style)
        const mdSource =
          typeof expandEmojiShortcodes === 'function'
            ? expandEmojiShortcodes(seg.content || '')
            : seg.content || '';
        let html = renderMdHtml(mdSource, linkCtx);
        if (q && typeof markSearchInHtml === 'function') {
          html = markSearchInHtml(html, q, {
            currentStart: searchCurrentStart,
            occurrenceIndex: searchOccurrenceIndex,
          });
        }
        return (
          <MdHtmlSegment
            key={`h-${i}`}
            html={html}
          />
        );
      })}
      {imageViewer ? (
        <ImageViewer
          src={imageViewer.src}
          alt={imageViewer.alt}
          title={imageViewer.alt || 'Image'}
          onClose={() => setImageViewer(null)}
        />
      ) : null}
    </div>
  );
}

export const MarkdownView = memo(MarkdownViewImpl);
export default MarkdownView;
