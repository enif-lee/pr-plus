/**
 * Pure helpers for markdown composers: attachment insert + optimistic detail merge.
 */

/**
 * Insert an attachment markdown snippet at a cursor offset (or append).
 * Images → ![name](url); other files → [name](url)
 */
export function buildAttachmentMarkdown(
  fileName: string,
  url: string,
  opts: { isImage?: boolean } = {}
): string {
  const name = String(fileName || 'file').replace(/[[\]]/g, '');
  const href = String(url || '').trim();
  if (!href) return '';
  const image =
    opts.isImage != null
      ? Boolean(opts.isImage)
      : /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name) ||
        /^data:image\//i.test(href);
  return image ? `![${name}](${href})` : `[${name}](${href})`;
}

/**
 * @returns {{ text: string, cursor: number }}
 */
export function insertMarkdownAtCursor(
  text: string,
  cursor: number,
  snippet: string
): { text: string; cursor: number } {
  const src = text == null ? '' : String(text);
  const snip = String(snippet || '');
  if (!snip) return { text: src, cursor: Math.max(0, Math.min(cursor || 0, src.length)) };
  let c = Number(cursor);
  if (!Number.isFinite(c) || c < 0) c = src.length;
  if (c > src.length) c = src.length;
  // Prefer blank-line separation when inserting mid/end of non-empty draft
  let prefix = src.slice(0, c);
  let suffix = src.slice(c);
  let insert = snip;
  if (prefix && !/\n$/.test(prefix)) insert = `\n${insert}`;
  if (suffix && !/^\n/.test(suffix)) insert = `${insert}\n`;
  const next = prefix + insert + suffix;
  return { text: next, cursor: prefix.length + insert.length };
}

/**
 * Guess content-type from file name for uploads.
 */
export function guessContentType(fileName: string, fileType?: string): string {
  if (fileType && String(fileType).includes('/')) return String(fileType);
  const n = String(fileName || '').toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.md')) return 'text/markdown';
  if (n.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

/**
 * Merge host detail onto optimistic local detail without dropping newer local
 * review comments / replies (fixes flash-then-revert after reply).
 */
export function mergeDetailPreserveOptimistic(prev: any, next: any): any {
  if (!next) return prev || next;
  if (!prev) return next;
  const prevRc = Array.isArray(prev.reviewComments) ? prev.reviewComments : [];
  const nextRc = Array.isArray(next.reviewComments) ? next.reviewComments : [];
  const byId = new Map<string, any>();
  for (const c of nextRc) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of prevRc) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (!byId.has(key)) {
      // Keep optimistic-only rows (temp ids or not yet in host snapshot)
      byId.set(key, c);
    } else {
      // Prefer host row but keep optimistic threadNodeId if host lacks it
      const host = byId.get(key);
      byId.set(key, {
        ...c,
        ...host,
        threadNodeId: host.threadNodeId || c.threadNodeId || null,
      });
    }
  }
  const prevComments = Array.isArray(prev.comments) ? prev.comments : [];
  const nextComments = Array.isArray(next.comments) ? next.comments : [];
  const cById = new Map<string, any>();
  for (const c of nextComments) {
    if (c && c.id != null) cById.set(String(c.id), c);
  }
  for (const c of prevComments) {
    if (c && c.id != null && !cById.has(String(c.id))) cById.set(String(c.id), c);
  }
  return {
    ...prev,
    ...next,
    reviewComments: [...byId.values()],
    comments: [...cById.values()],
  };
}

/**
 * Build a safe asset path under the repo for Contents API uploads.
 */
export function buildAssetRepoPath(fileName: string, opts: { prefix?: string } = {}): string {
  const base = String(fileName || 'file.bin')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  const prefix = (opts.prefix || '.pr-plus-assets').replace(/\/$/, '');
  const stamp = Date.now().toString(36);
  return `${prefix}/${stamp}-${base || 'file.bin'}`;
}
