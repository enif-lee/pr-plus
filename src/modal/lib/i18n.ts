/** @module modal/lib/i18n */
/**
 * Pure message catalogs + lookup (no browser extension i18n APIs).
 *
 * English is the default catalog SoT. Missing keys fall back to English,
 * then to the key itself. Extension _locales messages.json files mirror
 * these keys for install-time chrome strings.
 */

import {
  DEFAULT_LOCALE,
  type AppLocale,
  mapToAppLocale,
  resolveLocale,
} from './locale-resolve';
import {
  POPUP_MESSAGE_KEYS,
  popupEn,
  popupJa,
  popupKo,
  popupZh,
} from './i18n-popup';
import {
  CHROME_MESSAGE_KEYS,
  chromeEn,
  chromeJa,
  chromeKo,
  chromeZh,
} from './i18n-chrome';
import {
  RESIDUAL_MESSAGE_KEYS,
  residualEn,
  residualJa,
  residualKo,
  residualZh,
} from './i18n-residual';

export type MessageCatalog = Record<string, string>;

/** Shared keys used by pure lookup and Chrome messages.json. */
export const MESSAGE_KEYS = [
  'extName',
  'extDescription',
  'actionTitle',
  'hide_whitespace',
  'hide_whitespace_title',
  'highlight_diff_words',
  'highlight_diff_words_title',
  'strike_deleted_words',
  'strike_deleted_words_title',
  'dim_unfocused_files',
  'dim_unfocused_files_title',
  'hide_outdated_comments',
  'hide_outdated_comments_title',
  'tab_conversation',
  'tab_files',
  'resolve_conversation',
  'unresolved',
  'resolved',
  'pending',
  'outdated',
  'display_options',
  'reviewed_by',
  ...POPUP_MESSAGE_KEYS,
  ...CHROME_MESSAGE_KEYS,
  ...RESIDUAL_MESSAGE_KEYS,
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number] | string;

const en: MessageCatalog = {
  extName: 'pr+',
  extDescription:
    'GitHub PR stack tree + fast in-page review shell for conversation, diff, and merge.',
  actionTitle: 'pr+',
  hide_whitespace: 'Hide whitespace',
  hide_whitespace_title: 'Hide lines that change only whitespace',
  highlight_diff_words: 'Highlight changed words',
  highlight_diff_words_title: 'Highlight intra-line word changes',
  strike_deleted_words: 'Strikethrough deletions',
  strike_deleted_words_title: 'Draw a strikethrough on deleted words',
  dim_unfocused_files: 'Dim unfocused files',
  dim_unfocused_files_title: 'Darken other files so the focused file stands out',
  hide_outdated_comments: 'Hide outdated comments',
  hide_outdated_comments_title: 'Hide outdated review comments',
  tab_conversation: 'Conversation',
  tab_files: 'Files changed',
  resolve_conversation: 'Resolve conversation',
  unresolved: 'Unresolved',
  resolved: 'Resolved',
  pending: 'Pending',
  outdated: 'Outdated',
  display_options: 'Display options',
  reviewed_by: 'Reviewed by…',
  unresolve_conversation: 'Unresolve conversation',
  submit_review: 'Submit review',
  diff_view: 'Diff view',
  ...popupEn,
  ...chromeEn,
  ...residualEn,
};

const ko: MessageCatalog = {
  extName: 'pr+',
  extDescription:
    'GitHub PR 스택 트리와 대화·디프·머지를 위한 빠른 인페이지 리뷰 셸.',
  actionTitle: 'pr+',
  hide_whitespace: '공백 숨기기',
  hide_whitespace_title: '공백만 변경된 줄 숨기기',
  highlight_diff_words: '변경된 단어 강조',
  highlight_diff_words_title: '줄 안에서 바뀐 단어를 강조합니다',
  strike_deleted_words: '삭제 취소선',
  strike_deleted_words_title: '삭제된 단어에 취소선을 표시합니다',
  dim_unfocused_files: '포커스 없는 파일 어둡게',
  dim_unfocused_files_title: '포커스되지 않은 파일 배경을 어둡게 해서 현재 파일을 강조합니다',
  hide_outdated_comments: '오래된 코멘트 숨기기',
  hide_outdated_comments_title: 'outdated 리뷰 코멘트 숨기기',
  tab_conversation: '대화',
  tab_files: '변경된 파일',
  resolve_conversation: '대화 해결',
  unresolved: '미해결',
  resolved: '해결됨',
  pending: '대기 중',
  outdated: '오래됨',
  display_options: '표시 옵션',
  reviewed_by: '리뷰한 사람…',
  unresolve_conversation: '대화 해결 취소',
  submit_review: '리뷰 제출',
  diff_view: 'Diff 보기',
  ...popupKo,
  ...chromeKo,
  ...residualKo,
};

const ja: MessageCatalog = {
  extName: 'pr+',
  extDescription:
    'GitHub PR のスタックツリーと、会話・差分・マージ用の高速インページレビューシェル。',
  actionTitle: 'pr+',
  hide_whitespace: '空白を非表示',
  hide_whitespace_title: '空白のみの変更行を非表示',
  highlight_diff_words: '変更単語をハイライト',
  highlight_diff_words_title: '行内の変更単語をハイライトします',
  strike_deleted_words: '削除に取り消し線',
  strike_deleted_words_title: '削除された単語に取り消し線を付けます',
  dim_unfocused_files: '未フォーカスのファイルを暗くする',
  dim_unfocused_files_title:
    'フォーカスしていないファイルの背景を暗くし、現在のファイルを強調します',
  hide_outdated_comments: '古いコメントを非表示',
  hide_outdated_comments_title: 'outdated のレビューコメントを非表示',
  tab_conversation: '会話',
  tab_files: '変更されたファイル',
  resolve_conversation: '会話を解決',
  unresolved: '未解決',
  resolved: '解決済み',
  pending: '保留中',
  outdated: '古い',
  display_options: '表示オプション',
  reviewed_by: 'レビューした人…',
  unresolve_conversation: '会話の解決を解除',
  submit_review: 'レビューを送信',
  diff_view: 'Diff 表示',
  ...popupJa,
  ...chromeJa,
  ...residualJa,
};

const zh_CN: MessageCatalog = {
  extName: 'pr+',
  extDescription:
    'GitHub PR 堆栈树，以及用于对话、差异与合并的快速页内审阅界面。',
  actionTitle: 'pr+',
  hide_whitespace: '隐藏空白',
  hide_whitespace_title: '隐藏仅空白变更的行',
  highlight_diff_words: '高亮变更单词',
  highlight_diff_words_title: '高亮行内变更的单词',
  strike_deleted_words: '删除线',
  strike_deleted_words_title: '在删除的单词上显示删除线',
  dim_unfocused_files: '降低未聚焦文件亮度',
  dim_unfocused_files_title: '将未聚焦文件的背景调暗，以突出当前文件',
  hide_outdated_comments: '隐藏过时评论',
  hide_outdated_comments_title: '隐藏过时的审阅评论',
  tab_conversation: '对话',
  tab_files: '已更改的文件',
  resolve_conversation: '解决对话',
  unresolved: '未解决',
  resolved: '已解决',
  pending: '待处理',
  outdated: '已过时',
  display_options: '显示选项',
  reviewed_by: '审阅者…',
  unresolve_conversation: '取消解决对话',
  submit_review: '提交审阅',
  diff_view: '差异视图',
  ...popupZh,
  ...chromeZh,
  ...residualZh,
};

/** Pure catalogs keyed by AppLocale / Chrome directory id. */
export const CATALOGS: Record<AppLocale, MessageCatalog> = {
  en,
  ko,
  ja,
  zh_CN,
};

export function getCatalog(locale: string | null | undefined): MessageCatalog {
  const id = mapToAppLocale(locale) || DEFAULT_LOCALE;
  return CATALOGS[id] || CATALOGS[DEFAULT_LOCALE];
}

/**
 * Look up a message for a locale. Missing keys fall back to English, then key.
 * Optional substitutions: dollar-N from array, or dollar-name-dollar from object.
 */
export function formatMessage(
  key: string,
  locale: string | null | undefined = DEFAULT_LOCALE,
  substitutions?: Record<string, string | number> | Array<string | number> | null
): string {
  const catalog = getCatalog(locale);
  let msg =
    catalog[key] ??
    CATALOGS[DEFAULT_LOCALE][key] ??
    (key || '');

  if (substitutions == null) return msg;

  if (Array.isArray(substitutions)) {
    substitutions.forEach((value, i) => {
      const re = new RegExp(`\\$${i + 1}`, 'g');
      msg = msg.replace(re, String(value));
    });
    return msg;
  }

  for (const [name, value] of Object.entries(substitutions)) {
    const re = new RegExp(`\\$${name}\\$`, 'g');
    msg = msg.replace(re, String(value));
  }
  return msg;
}

export type TranslateFn = (
  key: string,
  substitutions?: Record<string, string | number> | Array<string | number> | null
) => string;

/** Fixed-locale translator for React props / pure callers. */
export function createTranslator(
  locale: string | null | undefined = DEFAULT_LOCALE
): TranslateFn {
  const resolved = mapToAppLocale(locale) || DEFAULT_LOCALE;
  return (key, substitutions) => formatMessage(key, resolved, substitutions);
}

export { DEFAULT_LOCALE, resolveLocale, mapToAppLocale };
export {
  formatLoadStageLabel,
  resolveAppLocaleFromDocument,
} from './load-stage-i18n';
export type { LoadStageExtra } from './load-stage-i18n';
