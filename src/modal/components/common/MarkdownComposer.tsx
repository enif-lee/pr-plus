import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownView } from './MarkdownView';
import {
  buildAttachmentMarkdown,
  insertMarkdownAtCursor,
  guessContentType,
} from '@lib/composer-attach';
import './MarkdownComposer.css';
import {
  detectMentionTrigger,
  detectSlashTrigger,
  detectEmojiTrigger,
  filterMentions,
  filterSlashCommands,
  filterEmojis,
  applyMentionInsertion,
  applySlashInsertion,
  applyEmojiInsertion,
  emojiMenuLabel,
  SLASH_COMMANDS,
} from '@lib/markdown-composer';

/**
 * Write / Preview markdown composer (no B/I/code toolbar).
 * Supports paste & drag-drop attachment, @mentions, /slash commands, and `:emoji`.
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
  /**
   * Primary submit (Comment / Submit). Wired to ⌘/Ctrl+Enter and
   * `data-prp-composer-submit` host click.
   */
  onSubmitRequest = null,
  /** Optional: called after focus so parents can track composer-focused chrome. */
  onComposerFocusChange = null,
}: any) {
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [dragging, setDragging] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  /** @type {null | { kind: 'mention'|'slash'|'emoji', items: any[], trigger: any }} */
  const [menu, setMenu] = useState<any>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When kind+query stays the same, keep menuIndex (arrow keys must not reset). */
  const menuKeyRef = useRef('');

  // Position portaled suggest menu under the textarea (avoids overflow:hidden clip)
  useLayoutEffect(() => {
    if (!menu?.items?.length) {
      setMenuPos(null);
      return;
    }
    const ta = taRef.current;
    if (!ta) return;
    const place = () => {
      const r = ta.getBoundingClientRect();
      setMenuPos({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, 220),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [menu, menu?.items?.length, value]);
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

  /**
   * Ghost → open mounts the textarea after state commit. Focusing in onClick
   * via setTimeout(0) often races: taRef is still null, or a prior editable
   * (thread reply) still holds focus. Layout-effect focus after open is reliable.
   */
  useLayoutEffect(() => {
    if (!open || !focused || tab !== 'write' || disabled) return;
    const ta = taRef.current;
    if (!ta) return;
    if (typeof document !== 'undefined' && document.activeElement === ta) return;
    try {
      ta.focus({ preventScroll: true });
    } catch {
      try {
        ta.focus();
      } catch {
        /* ignore */
      }
    }
  }, [open, focused, tab, disabled]);

  // App / host can dispatch these on the .prp-mdc root (composer context chords)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onEmoji = (ev: Event) => {
      ev.preventDefault?.();
      // Collapsed ghost: open write surface so ":" lands in a real textarea
      if (!taRef.current) {
        clearBlurTimer();
        setFocused(true);
        setTab('write');
      }
      // After open, ta mounts; insert on next frame if needed
      if (taRef.current) {
        insertEmojiTrigger();
      } else {
        requestAnimationFrame(() => insertEmojiTrigger());
      }
    };
    const onSubmitEv = (ev: Event) => {
      ev.preventDefault?.();
      requestSubmit();
    };
    const onFocusIn = (ev: Event) => {
      ev.preventDefault?.();
      clearBlurTimer();
      setFocused(true);
      setTab('write');
      // Focus runs in useLayoutEffect once open + ta is mounted
      queueMicrotask(() => {
        try {
          taRef.current?.focus?.({ preventScroll: true });
        } catch {
          taRef.current?.focus?.();
        }
      });
    };
    root.addEventListener('prp-composer-emoji', onEmoji);
    root.addEventListener('prp-composer-submit', onSubmitEv);
    root.addEventListener('prp-composer-focus-input', onFocusIn);
    return () => {
      root.removeEventListener('prp-composer-emoji', onEmoji);
      root.removeEventListener('prp-composer-submit', onSubmitEv);
      root.removeEventListener('prp-composer-focus-input', onFocusIn);
    };
    // insertEmojiTrigger / requestSubmit close over latest props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled, onSubmitRequest, onChange]);

  function clearBlurTimer() {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }

  function onTaFocus() {
    clearBlurTimer();
    setFocused(true);
    try {
      onComposerFocusChange?.(true);
    } catch {
      /* ignore */
    }
  }

  /**
   * Defer blur so Write/Preview tab mousedown/click runs first.
   * Otherwise empty composers collapse to the ghost before setTab('preview').
   */
  function onTaBlur() {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      try {
        onComposerFocusChange?.(false);
      } catch {
        /* ignore */
      }
      const root = rootRef.current;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (root && active && root.contains(active)) {
        // Focus moved to a control inside the composer (tabs, etc.)
        return;
      }
      setFocused(false);
      // Empty + unfocused should collapse to ghost. Preview tab alone used to
      // keep open=true, so e2e/real blur never showed the ghost again.
      if (
        !forceOpen &&
        !Boolean(String(value || '').trim()) &&
        tab === 'preview'
      ) {
        setTab('write');
      }
    }, 0);
  }

  function selectTab(next: 'write' | 'preview') {
    clearBlurTimer();
    setTab(next);
    setFocused(true);
    setMenu(null);
    menuKeyRef.current = '';
    setMenuIndex(0);
    if (next === 'write') {
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }

  function openMenu(
    kind: 'mention' | 'slash' | 'emoji',
    items: any[],
    trigger: any,
    queryKey: string
  ) {
    const key = `${kind}:${queryKey}`;
    setMenu({ kind, items, trigger });
    if (menuKeyRef.current !== key) {
      menuKeyRef.current = key;
      setMenuIndex(0);
    } else {
      // Same menu session (e.g. ArrowUp/Down keyup re-sync) — keep highlight,
      // only clamp if the filtered list shrank.
      setMenuIndex((i) => {
        if (!items.length) return 0;
        return Math.min(i, items.length - 1);
      });
    }
  }

  function syncMenus(text: string, cursor: number) {
    if (disabled) {
      setMenu(null);
      menuKeyRef.current = '';
      return;
    }
    if (typeof detectMentionTrigger === 'function') {
      const mTrig = detectMentionTrigger(text, cursor);
      if (mTrig) {
        const items = filterMentions(mTrig.query, mentionCandidates);
        openMenu('mention', items, mTrig, String(mTrig.query || ''));
        return;
      }
    }
    if (typeof detectEmojiTrigger === 'function') {
      const eTrig = detectEmojiTrigger(text, cursor);
      if (eTrig) {
        const items =
          typeof filterEmojis === 'function' ? filterEmojis(eTrig.query, 12) : [];
        openMenu('emoji', items, eTrig, String(eTrig.query || ''));
        return;
      }
    }
    if (typeof detectSlashTrigger === 'function') {
      const sTrig = detectSlashTrigger(text, cursor);
      if (sTrig) {
        const items = filterSlashCommands(sTrig.query);
        openMenu('slash', items, sTrig, String(sTrig.query || ''));
        return;
      }
    }
    setMenu(null);
    menuKeyRef.current = '';
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
    } else if (menu.kind === 'emoji') {
      next = applyEmojiInsertion(text, menu.trigger, item);
    } else {
      return;
    }
    onChange?.(next.text);
    setMenu(null);
    menuKeyRef.current = '';
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

  /** Insert `:` at caret to open emoji shortcode typeahead. */
  function insertEmojiTrigger() {
    if (disabled) return;
    const ta = taRef.current;
    const text = ta?.value ?? value ?? '';
    const start =
      ta && document.activeElement === ta
        ? ta.selectionStart ?? text.length
        : text.length;
    const end =
      ta && document.activeElement === ta
        ? ta.selectionEnd ?? start
        : start;
    const next = text.slice(0, start) + ':' + text.slice(end);
    const cursor = start + 1;
    onChange?.(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(cursor, cursor);
        syncMenus(next, cursor);
      }
    });
  }

  function requestSubmit() {
    if (disabled) return false;
    if (typeof onSubmitRequest === 'function') {
      try {
        onSubmitRequest();
        return true;
      } catch {
        return false;
      }
    }
    // Fallback: click primary host submit button
    try {
      const btn = rootRef.current
        ?.closest?.('[data-prp-composer-root]')
        ?.querySelector?.(
          '[data-prp-composer-submit]:not([disabled])'
        ) as HTMLButtonElement | null;
      if (btn) {
        btn.click();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘Enter / Ctrl+Enter → submit (same as primary button)
    if (
      (e.metaKey || e.ctrlKey) &&
      !e.altKey &&
      !e.shiftKey &&
      (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')
    ) {
      e.preventDefault();
      e.stopPropagation();
      requestSubmit();
      return;
    }
    // (⌥E is comment reaction picker globally — emoji shortcodes: type `:`)
    if (!menu?.items?.length) return;
    const n = menu.items.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setMenu(null);
      menuKeyRef.current = '';
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setMenuIndex((i) => (i + 1) % n);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setMenuIndex((i) => (i - 1 + n) % n);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      // Only intercept when a menu is open so normal newlines still work.
      e.preventDefault();
      e.stopPropagation();
      const item = menu.items[menuIndex] ?? menu.items[0];
      applyMenuItem(item);
    }
  }

  function onComposerKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Arrow keys only move the highlight — do not re-sync (would reset index).
    if (
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp' ||
      e.key === 'Enter' ||
      e.key === 'Tab' ||
      e.key === 'Escape'
    ) {
      return;
    }
    syncMenus(e.currentTarget.value, e.currentTarget.selectionStart);
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

  function openWriteSurface() {
    if (disabled) return;
    clearBlurTimer();
    setFocused(true);
    setTab('write');
    try {
      onComposerFocusChange?.(true);
    } catch {
      /* ignore */
    }
  }

  if (!open && !forceOpen) {
    return (
      <div
        className={`prp-mdc ${className}`.trim()}
        ref={rootRef}
        data-prp-composer="1"
        data-prp-composer-collapsed="1"
      >
        <button
          type="button"
          className="prp-mdc__ghost"
          disabled={disabled}
          // preventDefault: do not focus the ghost button itself. That left
          // focus on the button (or kept a prior textarea focused when the
          // click was swallowed) so the write surface never received caret.
          onMouseDown={(e) => {
            if (disabled) return;
            e.preventDefault();
            openWriteSurface();
          }}
          onClick={() => {
            // Keyboard activation (Enter/Space) when ghost is focused
            openWriteSurface();
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
      data-prp-composer="1"
      data-prp-composer-focused={focused ? '1' : undefined}
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
            data-prp-composer-input="1"
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
            onKeyUp={onComposerKeyUp}
            onClick={(e) =>
              syncMenus(e.currentTarget.value, e.currentTarget.selectionStart)
            }
            onKeyDown={onComposerKeyDown}
            onPaste={onPaste}
          />
          {menu?.items?.length && menuPos && typeof document !== 'undefined'
            ? createPortal(
                <ul
                  className={`prp-composer-menu prp-composer-menu--portal${
                    menu.kind === 'emoji' ? ' prp-composer-menu--emoji' : ''
                  }`}
                  role="listbox"
                  aria-label={
                    menu.kind === 'emoji'
                      ? 'Emoji suggestions'
                      : 'Composer suggestions'
                  }
                  style={{
                    top: menuPos.top,
                    left: menuPos.left,
                    width: menuPos.width,
                  }}
                >
                  {menu.items.map((item: any, idx: number) => {
                    const isEmoji = menu.kind === 'emoji';
                    const label = isEmoji
                      ? typeof emojiMenuLabel === 'function'
                        ? emojiMenuLabel(item)
                        : `:${item.name}:`
                      : menu.kind === 'mention'
                        ? `@${item}`
                        : item.label || item.id;
                    const desc =
                      menu.kind === 'slash' ? item.description : null;
                    const key = isEmoji
                      ? String(item.name || label)
                      : String(label);
                    return (
                      <li
                        key={key}
                        role="option"
                        aria-selected={idx === menuIndex}
                      >
                        <button
                          type="button"
                          className={`prp-composer-menu__item${
                            isEmoji ? ' prp-composer-menu__item--emoji' : ''
                          }${
                            idx === menuIndex
                              ? ' prp-composer-menu__item--active'
                              : ''
                          }`}
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            applyMenuItem(item);
                          }}
                          onMouseEnter={() => setMenuIndex(idx)}
                        >
                          {isEmoji ? (
                            <>
                              <span
                                className="prp-composer-menu__emoji"
                                aria-hidden="true"
                              >
                                {item.emoji}
                              </span>
                              <span className="prp-composer-menu__emoji-name">
                                {label}
                              </span>
                            </>
                          ) : (
                            <>
                              <strong>{label}</strong>
                              {desc ? (
                                <span className="prp-muted"> {desc}</span>
                              ) : null}
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>,
                (document.querySelector('.prp-overlay') as HTMLElement | null) ||
                  document.body
              )
            : null}
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
          markdown · @mention · :emoji · /commands (
          {(SLASH_COMMANDS || []).map((c) => c.label).join(' ')})
        </div>
      ) : null}
    </div>
  );
}

// Back-compat alias used across the codebase
export { MarkdownComposer as WysiwygComposer };
export default MarkdownComposer;
