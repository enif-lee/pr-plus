import React, { useEffect, useRef, useState } from 'react';
import { MarkdownView } from './MarkdownView';
import {
  buildAttachmentMarkdown,
  insertMarkdownAtCursor,
  guessContentType,
} from '@lib/composer-attach';

/**
 * Write / Preview markdown composer (no B/I/code toolbar).
 * Supports paste & drag-drop attachment via onUploadFile.
 */
export function MarkdownComposer({
  value,
  onChange,
  placeholder = 'Write a comment…',
  compact = true,
  disabled,
  rows = 4,
  className = '',
  forceOpen = false,
  showTabs = true,
  onUploadFile,
  linkCtx,
}: any) {
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [dragging, setDragging] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const open = forceOpen || focused || Boolean(String(value || '').trim()) || tab === 'preview';

  useEffect(() => {
    if (!focused && taRef.current && taRef.current.value !== (value || '')) {
      taRef.current.value = value || '';
    }
  }, [value, focused]);

  async function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList || !onUploadFile || disabled) return;
    const files = Array.from(fileList as FileList);
    if (!files.length) return;
    setUploadMsg('Uploading…');
    let text = String(value || '');
    let cursor =
      taRef.current && document.activeElement === taRef.current
        ? taRef.current.selectionStart
        : text.length;
    try {
      for (const file of files) {
        const url = await onUploadFile({
          file,
          name: file.name,
          type: guessContentType(file.name, file.type),
          size: file.size,
        });
        if (!url) continue;
        const snip = buildAttachmentMarkdown(file.name, url, {
          isImage: /^image\//i.test(file.type || ''),
        });
        const next = insertMarkdownAtCursor(text, cursor, snip);
        text = next.text;
        cursor = next.cursor;
      }
      onChange?.(text);
      setUploadMsg('');
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(cursor, cursor);
        }
      });
    } catch (err: any) {
      setUploadMsg(err?.message || String(err));
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items || !onUploadFile) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (!files.length) return;
    e.preventDefault();
    void handleFiles(files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    void handleFiles(e.dataTransfer?.files || null);
  }

  if (!open && !forceOpen) {
    return (
      <div className={`prp-mdc ${className}`.trim()}>
        <button
          type="button"
          className="prp-mdc__ghost"
          disabled={disabled}
          onClick={() => {
            setFocused(true);
            setTab('write');
            setTimeout(() => taRef.current?.focus(), 0);
          }}
        >
          {placeholder}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`prp-mdc prp-mdc--open ${dragging ? 'prp-mdc--drag' : ''} ${className}`.trim()}
      onDragEnter={(e) => {
        e.preventDefault();
        if (onUploadFile) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (onUploadFile) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {showTabs ? (
        <div className="prp-mdc__tabs" role="tablist">
          <button
            type="button"
            className={tab === 'write' ? 'prp-tab prp-tab--active' : 'prp-tab'}
            onClick={() => setTab('write')}
            disabled={disabled}
          >
            Write
          </button>
          <button
            type="button"
            className={tab === 'preview' ? 'prp-tab prp-tab--active' : 'prp-tab'}
            onClick={() => setTab('preview')}
            disabled={disabled}
          >
            Preview
          </button>
        </div>
      ) : null}
      {tab === 'write' ? (
        <textarea
          ref={taRef}
          className="prp-mdc__ta prp-textarea"
          rows={compact ? Math.max(2, rows - 1) : rows}
          placeholder={placeholder}
          value={value || ''}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange?.(e.target.value)}
          onPaste={onPaste}
        />
      ) : (
        <div className="prp-mdc__preview">
          <MarkdownView source={value || '_Nothing to preview_'} linkCtx={linkCtx} />
        </div>
      )}
      {dragging ? (
        <div className="prp-mdc__drop-hint">Drop files to attach</div>
      ) : null}
      {uploadMsg ? <div className="prp-mdc__upload-msg prp-muted">{uploadMsg}</div> : null}
      {onUploadFile && tab === 'write' ? (
        <div className="prp-mdc__hint prp-muted">
          Paste or drop images/files · markdown · ``` fences
        </div>
      ) : null}
    </div>
  );
}

// Back-compat alias used across the codebase
export { MarkdownComposer as WysiwygComposer };
export default MarkdownComposer;
