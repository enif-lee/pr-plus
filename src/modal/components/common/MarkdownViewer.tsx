import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { MarkdownView } from './MarkdownView';
import { resolveMermaidColorMode } from '../../lib/mermaid-lazy';
import { useModalStore } from '../../store/modal-store';
import { useT } from '../../lib/locale-context';
import { claimNestedEscape } from '../../lib/escape-layer';
import { useDomainDetail } from '../../app/domain-detail-context';
import { buildGithubRawUrl } from '../../lib/diff-rows';
import {
  MD_PREVIEW_MAX_CHARS,
  buildMarkdownPreviewSource,
  markdownPreviewLoadPlan,
  resolveMarkdownSides,
} from '../../lib/markdown-preview';
import './MarkdownViewer.css';

type Props = {
  path: string;
  status?: string;
  onClose: () => void;
};

const textCache = new Map<string, string>();

function resolvePortalHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const overlay = document.querySelector('.prp-overlay') as HTMLElement | null;
  return overlay || document.body;
}

function cacheKey(owner: string, repo: string, ref: string, path: string) {
  return `${owner}/${repo}@${ref}:${path}`;
}

function lookupFile(detail: any, path: string) {
  const files = Array.isArray(detail?.files) ? detail.files : [];
  return (
    files.find(
      (f: any) => String(f?.filename || f?.path || '') === String(path)
    ) || null
  );
}

async function fetchFileText(opts: {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}): Promise<string> {
  const { owner, repo, path, ref } = opts;
  if (!owner || !repo || !path || !ref) return '';
  const key = cacheKey(owner, repo, ref, path);
  if (textCache.has(key)) return textCache.get(key) || '';

  const api = (globalThis as any).PRTreeFetch;
  if (typeof api?.getRepoFileText === 'function') {
    try {
      const res = await api.getRepoFileText(owner, repo, { path, ref });
      const text = String(res?.text ?? '');
      textCache.set(key, text);
      return text;
    } catch {
      /* public raw fallback */
    }
  }

  const origin =
    typeof location !== 'undefined' && location.origin
      ? location.origin
      : 'https://github.com';
  const url = buildGithubRawUrl({
    webOrigin: origin,
    owner,
    repo,
    ref,
    path,
  });
  if (!url) throw new Error('no url');
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`GitHub raw ${res.status}`);
  const text = await res.text();
  textCache.set(key, text);
  return text;
}

/**
 * Fullscreen overlay for a Diff markdown file (ImageViewer / MermaidViewer class).
 * Show-diff off renders the new file; on paints word-level ins/del.
 */
export function MarkdownViewer({ path, status = 'modified', onClose }: Props) {
  const t = useT();
  const detail = useDomainDetail();
  const portalHost = useMemo(() => resolvePortalHost(), []);
  const colorMode = resolveMermaidColorMode();
  const [showDiff, setShowDiff] = useState(true);
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.code !== 'Escape') return;
      claimNestedEscape(e);
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try {
      useModalStore.getState().setOptHintsActive(false);
    } catch {
      /* ignore */
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const file = lookupFile(detail, path) || {
      filename: path,
      status,
    };
    const plan = markdownPreviewLoadPlan(file, {
      baseSha: detail?.baseSha,
      baseRef: detail?.baseRef,
      headSha: detail?.headSha,
      headRef: detail?.headRef,
    });
    const owner = String(detail?.owner || '');
    const repo = String(detail?.repo || '');

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [oldRes, newRes] = await Promise.all([
          plan.old
            ? fetchFileText({
                owner,
                repo,
                path: plan.old.path,
                ref: plan.old.ref,
              })
            : Promise.resolve(''),
          plan.new
            ? fetchFileText({
                owner,
                repo,
                path: plan.new.path,
                ref: plan.new.ref,
              })
            : Promise.resolve(''),
        ]);
        if (cancelled) return;
        const sides = resolveMarkdownSides({
          status,
          oldText: oldRes,
          newText: newRes,
        });
        setOldText(sides.oldText);
        setNewText(sides.newText);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    path,
    status,
    detail?.owner,
    detail?.repo,
    detail?.baseSha,
    detail?.baseRef,
    detail?.headSha,
    detail?.headRef,
    detail?.files,
  ]);

  const tooLarge =
    oldText.length + newText.length > MD_PREVIEW_MAX_CHARS ||
    newText.length > MD_PREVIEW_MAX_CHARS;

  const source = useMemo(() => {
    if (tooLarge && showDiff) {
      return newText.slice(0, MD_PREVIEW_MAX_CHARS);
    }
    return buildMarkdownPreviewSource({
      oldText,
      newText,
      showDiff,
      status,
    });
  }, [oldText, newText, showDiff, status, tooLarge]);

  const allAdded = showDiff && !oldText && Boolean(newText);

  const onToggleDiff = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setShowDiff(e.target.checked);
  }, []);

  if (!portalHost) return null;

  const title = path || t('md_preview_aria');

  const node = (
    <div
      className="prp-md-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={t('md_preview_aria')}
      data-color-mode={colorMode}
      data-prp-md-viewer="1"
      data-prp-md-show-diff={showDiff ? '1' : '0'}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="prp-md-viewer__backdrop"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div className="prp-md-viewer__chrome">
        <div className="prp-md-viewer__bar">
          <span className="prp-md-viewer__title" title={title}>
            {title}
          </span>
          <div className="prp-md-viewer__actions">
            <label className="prp-md-viewer__toggle">
              <input
                type="checkbox"
                checked={showDiff}
                onChange={onToggleDiff}
                data-prp-md-show-diff-toggle="1"
              />
              {t('md_preview_show_diff')}
            </label>
            <button
              type="button"
              className="prp-icon-btn prp-md-viewer__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label={t('md_preview_close')}
              title={t('md_preview_close')}
            >
              <IconX size={16} />
            </button>
          </div>
        </div>
        {loading ? (
          <p className="prp-md-viewer__status">{t('md_preview_loading')}</p>
        ) : error ? (
          <p className="prp-md-viewer__status prp-md-viewer__status--error">
            {t('md_preview_error')}
          </p>
        ) : tooLarge && !newText ? (
          <p className="prp-md-viewer__status">{t('md_preview_too_large')}</p>
        ) : (
          <div className="prp-md-viewer__stage">
            <div className="prp-md-viewer__doc">
              {tooLarge ? (
                <p className="prp-md-viewer__status">
                  {t('md_preview_too_large')}
                </p>
              ) : null}
              <MarkdownView
                source={source}
                className={allAdded ? 'prp-md--diff-all-ins' : ''}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, portalHost);
}

export default MarkdownViewer;
