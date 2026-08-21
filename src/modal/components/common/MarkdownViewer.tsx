import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownView } from './MarkdownView';
import { FullscreenViewer } from './FullscreenViewer';
import { useT } from '../../lib/locale-context';
import { useDomainDetail } from '../../app/domain-detail-context';
import { buildGithubRawUrl } from '../../lib/diff-rows';
import {
  MD_PREVIEW_MAX_CHARS,
  buildMarkdownPreviewSource,
  markdownPreviewLoadPlan,
  resolveMarkdownSides,
} from '../../lib/markdown-preview';

type Props = {
  path: string;
  status?: string;
  onClose: () => void;
};

const textCache = new Map<string, string>();

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
 * Diff markdown overlay — shared FullscreenViewer chrome, document body.
 */
export function MarkdownViewer({ path, status = 'modified', onClose }: Props) {
  const t = useT();
  const detail = useDomainDetail();
  const [showDiff, setShowDiff] = useState(true);
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const statusLower = String(status || '').toLowerCase();
  const deleted =
    statusLower === 'removed' ||
    statusLower === 'deleted' ||
    statusLower === 'del';
  const mediaRef = deleted
    ? String(detail?.baseSha || detail?.baseRef || '')
    : String(detail?.headSha || detail?.headRef || '');
  const linkCtx = {
    owner: detail?.owner,
    repo: detail?.repo,
    number: detail?.number,
    htmlUrl: detail?.htmlUrl || detail?.html_url || null,
    filePath: path,
    ref: mediaRef,
    webOrigin:
      typeof location !== 'undefined' && location.origin
        ? location.origin
        : 'https://github.com',
  };

  const onToggleDiff = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setShowDiff(e.target.checked);
  }, []);

  const title = path || t('md_preview_aria');
  let body: React.ReactNode;
  if (loading) {
    body = <p className="prp-overlay-viewer__status">{t('md_preview_loading')}</p>;
  } else if (error) {
    body = (
      <p className="prp-overlay-viewer__status prp-overlay-viewer__status--error">
        {t('md_preview_error')}
      </p>
    );
  } else if (tooLarge && !newText) {
    body = <p className="prp-overlay-viewer__status">{t('md_preview_too_large')}</p>;
  } else {
    body = (
      <div className="prp-overlay-viewer__doc">
        {tooLarge ? (
          <p className="prp-overlay-viewer__status">{t('md_preview_too_large')}</p>
        ) : null}
        <MarkdownView
          source={source}
          className={allAdded ? 'prp-md--diff-all-ins' : ''}
          linkCtx={linkCtx}
        />
      </div>
    );
  }

  return (
    <FullscreenViewer
      layer="markdown"
      title={title}
      ariaLabel={t('md_preview_aria')}
      onClose={onClose}
      closeLabel={t('md_preview_close')}
      rootProps={{ 'data-prp-md-show-diff': showDiff ? '1' : '0' } as any}
      actions={
        <label className="prp-overlay-viewer__toggle">
          <input
            type="checkbox"
            checked={showDiff}
            onChange={onToggleDiff}
            data-prp-md-show-diff-toggle="1"
          />
          {t('md_preview_show_diff')}
        </label>
      }
    >
      {body}
    </FullscreenViewer>
  );
}

export default MarkdownViewer;
