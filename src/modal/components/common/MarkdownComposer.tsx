import React, { useEffect, useRef, useState } from 'react';
import { MarkdownView } from './MarkdownView';
import {
  buildAttachmentMarkdown,
  insertMarkdownAtCursor,
  guessContentType,
} from '@lib/composer-attach';
import {
  detectMentionTrigger,
  detectSlashTrigger,
  filterMentions,
  filterSlashCommands,
  applyMentionInsertion,
  applySlashInsertion,
  SLASH_COMMANDS,
} from '@lib/markdown-composer';

/**
 * Write / Preview markdown composer (no B/I/code toolbar).
 * Supports paste & drag-drop attachment, @mentions, and /slash commands.
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
  /** Logins for @mention typeahead (author, reviewers, assignees, …). */
  mentionCandidates = [],
}: any) {
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [dragging, setDragging] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  /** @type {null | { kind: 'mention'|'slash', items: any[], trigger: any }} */
  const [menu, setMenu] = useState<any>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep open on Preview even when empty — do not collapse while tab is preview.
  const open =
    forceOpen || focused || Boolean(String(value || '').trim()) || tab === 'preview';

  useEffect(() => {
    if (!focused && taRef.current && taRef.current.value !== (value || '')) {
      taRef.current.value = value || '';
    }
  }, [value, focused]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  function clearBlurTimer() {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }

  function onTaFocus() {
    clearBlurTimer();
    setFocused(true);
  }

  /**
   * Defer blur so Write/Preview tab mousedown/click runs first.
   * Otherwise empty composers collapse to the ghost before setTab('preview').
   */
  function onTaBlur() {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      const root = rootRef.current;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (root && active && root.contains(active)) {
        // Focus moved to a control inside the composer (tabs, etc.)
        return;
      }
      setFocused(false);
    }, 0);
  }

  function selectTab(next: 'write' | 'preview') {
    clearBlurTimer();
    setTab(next);
    setFocused(true);
    setMenu(null);
    if (next === 'write') {
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }

  function syncMenus(text: string, cursor: number) {
    if (disabled) {
      setMenu(null);
      return;
    }
    if (typeof detectMentionTrigger === 'function') {
      const mTrig = detectMentionTrigger(text, cursor);
      if (mTrig) {
        const items = filterMentions(mTrig.query, mentionCandidates);
        setMenu({ kind: 'mention', items, trigger: mTrig });
        setMenuIndex(0);
        return;
      }
    }
    if (typeof detectSlashTrigger === 'function') {
      const sTrig = detectSlashTrigger(text, cursor);
      if (sTrig) {
        const items = filterSlashCommands(sTrig.query);
        setMenu({ kind: 'slash', items, trigger: sTrig });
        setMenuIndex(0);
        return;
      }
    }
    setMenu(null);
  }

  function applyMenuItem(item: any) {
    if (!menu || !item) return;
    // Prefer live textarea value (controlled parent may lag one frame).
    const text = taRef.current?.value ?? value ?? '';
    let next;
    if (menu.kind === 'mention') {
      next = applyMentionInsertion(text, menu.trigger, item);
    } else if (menu.kind === 'slash') {
      next = applySlashInsertion(text, menu.trigger, item);
    } else {
      return;
    }
    onChange?.(next.text);
    setMenu(null);
    setMenuIndex(0);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(next.cursor, next.cursor);
        // Keep suggestion state in sync after caret move.
        syncMenus(next.text, next.cursor);
      }
    });
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menu?.items?.length) return;
    const n = menu.items.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      setMenu(null);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMenuIndex((i) => (i + 1) % n);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMenuIndex((i) => (i - 1 + n) % n);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      // Only intercept when a menu is open so normal newlines still work.
      e.preventDefault();
      const item = menu.items[menuIndex] ?? menu.items[0];
      applyMenuItem(item);
    }
  }

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
      <div className={`prp-mdc ${className}`.trim()} ref={rootRef}>
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
      ref={rootRef}
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
            // preventDefault keeps textarea focus until setTab runs (avoids ghost collapse)
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectTab('write')}
            disabled={disabled}
          >
            Write
          </button>
          <button
            type="button"
            className={tab === 'preview' ? 'prp-tab prp-tab--active' : 'prp-tab'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectTab('preview')}
            disabled={disabled}
          >
            Preview
          </button>
        </div>
      ) : null}
      {tab === 'write' ? (
        <div className="prp-mdc__write">
          <textarea
            ref={taRef}
            className="prp-mdc__ta prp-textarea"
            rows={compact ? Math.max(2, rows - 1) : rows}
            placeholder={placeholder}
            value={value || ''}
            disabled={disabled}
            onFocus={onTaFocus}
            onBlur={onTaBlur}
            onChange={(e) => {
              onChange?.(e.target.value);
              syncMenus(e.target.value, e.target.selectionStart);
            }}
            onKeyUp={(e) =>
              syncMenus(e.currentTarget.value, e.currentTarget.selectionStart)
            }
            onClick={(e) =>
              syncMenus(e.currentTarget.value, e.currentTarget.selectionStart)
            }
            onKeyDown={onComposerKeyDown}
            onPaste={onPaste}
          />
          {menu?.items?.length ? (
            <ul className="prp-composer-menu" role="listbox" aria-label="Composer suggestions">
              {menu.items.map((item: any, idx: number) => {
                const label =
                  menu.kind === 'mention'
                    ? `@${item}`
                    : item.label || item.id;
                const desc = menu.kind === 'slash' ? item.description : null;
                return (
                  <li key={String(label)} role="option" aria-selected={idx === menuIndex}>
                    <button
                      type="button"
                      className={`prp-composer-menu__item${
                        idx === menuIndex ? ' prp-composer-menu__item--active' : ''
                      }`}
                      onMouseDown={(ev) => {
                        // Keep focus in textarea; apply before blur collapses menu.
                        ev.preventDefault();
                        applyMenuItem(item);
                      }}
                      onMouseEnter={() => setMenuIndex(idx)}
                    >
                      <strong>{label}</strong>
                      {desc ? <span className="prp-muted"> {desc}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : (
        <div
          className="prp-mdc__preview"
          tabIndex={-1}
          onMouseDown={() => {
            clearBlurTimer();
            setFocused(true);
          }}
        >
          <MarkdownView source={value || '_Nothing to preview_'} linkCtx={linkCtx} />
        </div>
      )}
      {dragging ? (
        <div className="prp-mdc__drop-hint">Drop files to attach</div>
      ) : null}
      {uploadMsg ? <div className="prp-mdc__upload-msg prp-muted">{uploadMsg}</div> : null}
      {tab === 'write' ? (
        <div className="prp-mdc__hint prp-muted">
          {onUploadFile ? 'Paste or drop images/files · ' : ''}
          markdown · @mention · /commands (
          {(SLASH_COMMANDS || []).map((c) => c.label).join(' ')})
        </div>
      ) : null}
    </div>
  );
}

// Back-compat alias used across the codebase
export { MarkdownComposer as WysiwygComposer };
export default MarkdownComposer;
