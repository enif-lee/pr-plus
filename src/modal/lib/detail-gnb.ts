/**
 * Thin top GNB for PR detail page-embed (covers native GH AppHeader).
 * Pure: labels + hrefs from owner/repo/viewer — no React/DOM.
 */

import { isEmbedPresentation, type PresentationMode } from './page-embed';
import { formatMessage } from './i18n';

export type DetailGnbLeftItemId =
  | 'code'
  | 'issues'
  | 'pulls'
  | 'actions'
  | 'agent'
  | 'security'
  | 'insights'
  | 'settings';

export type DetailGnbLeftItem = {
  id: DetailGnbLeftItemId;
  /** Short compact label for the bar */
  label: string;
  href: string;
};

export type DetailGnbRightSlotId = 'notifications' | 'account';

export type DetailGnbRightSlot = {
  id: DetailGnbRightSlotId;
  label: string;
  href: string;
  /** Login for avatar/title when known */
  login?: string | null;
};

export type DetailGnbModel = {
  owner: string;
  repo: string;
  left: DetailGnbLeftItem[];
  right: DetailGnbRightSlot[];
  /** Repo home for logo / owner-repo crumb */
  repoHref: string;
  ownerHref: string;
  repoLabel: string;
};

const GH_ORIGIN = 'https://github.com';

/**
 * Normalize owner/repo path segments (no leading/trailing slashes).
 */
export function normalizeRepoSlug(
  owner: unknown,
  repo: unknown
): { owner: string; repo: string } | null {
  const o = String(owner || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const r = String(repo || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!o || !r || o.includes('/') || r.includes('/')) return null;
  return { owner: o, repo: r };
}

/** Absolute github.com path (origin + path). */
export function githubAbsPath(path: string): string {
  const p = String(path || '').trim();
  if (!p) return GH_ORIGIN;
  if (/^https?:\/\//i.test(p)) return p;
  return `${GH_ORIGIN}${p.startsWith('/') ? p : `/${p}`}`;
}

/**
 * Left compact tabs: Code / Issues / Pull requests / Actions / Agent / …
 * Agent uses the stable global Copilot/Agents entry (not a repo sub-route that may 404).
 */
export function buildDetailGnbLeftItems(
  owner: unknown,
  repo: unknown,
  locale: string | null | undefined = 'en'
): DetailGnbLeftItem[] {
  const slug = normalizeRepoSlug(owner, repo);
  if (!slug) return [];
  const base = `/${slug.owner}/${slug.repo}`;
  const t = (key: string) => formatMessage(key, locale);
  return [
    { id: 'code', label: t('gnb_code'), href: githubAbsPath(base) },
    { id: 'issues', label: t('gnb_issues'), href: githubAbsPath(`${base}/issues`) },
    {
      id: 'pulls',
      label: t('gnb_pulls'),
      href: githubAbsPath(`${base}/pulls`),
    },
    {
      id: 'actions',
      label: t('gnb_actions'),
      href: githubAbsPath(`${base}/actions`),
    },
    {
      id: 'agent',
      label: t('gnb_agent'),
      // Global product entry — repo-relative /agents is not universally available.
      href: githubAbsPath('/copilot'),
    },
    {
      id: 'security',
      label: t('gnb_security'),
      href: githubAbsPath(`${base}/security`),
    },
    {
      id: 'insights',
      label: t('gnb_insights'),
      href: githubAbsPath(`${base}/pulse`),
    },
    {
      id: 'settings',
      label: t('gnb_settings'),
      href: githubAbsPath(`${base}/settings`),
    },
  ];
}

/**
 * Right slots: notifications + account (profile when logged in, login otherwise).
 */
export function buildDetailGnbRightSlots(opts: {
  viewerLogin?: string | null;
  viewerAvatarUrl?: string | null;
  locale?: string | null;
} = {}): DetailGnbRightSlot[] {
  const locale = opts.locale || 'en';
  const t = (key: string) => formatMessage(key, locale);
  const login = String(opts.viewerLogin || '')
    .trim()
    .replace(/^@/, '');
  const accountHref = login
    ? githubAbsPath(`/${login}`)
    : githubAbsPath('/login');
  const accountLabel = login || t('gnb_sign_in');
  return [
    {
      id: 'notifications',
      label: t('gnb_notifications'),
      href: githubAbsPath('/notifications'),
    },
    {
      id: 'account',
      label: accountLabel,
      href: accountHref,
      login: login || null,
    },
  ];
}

/**
 * Full thin-GNB model for detail embed. Null when owner/repo missing.
 */
export function buildDetailGnbModel(opts: {
  owner?: unknown;
  repo?: unknown;
  viewerLogin?: unknown;
  locale?: string | null;
  detail?: {
    owner?: unknown;
    repo?: unknown;
    viewerLogin?: unknown;
  } | null;
} = {}): DetailGnbModel | null {
  const d = opts.detail || {};
  const owner = opts.owner ?? d.owner;
  const repo = opts.repo ?? d.repo;
  const locale = opts.locale || 'en';
  const slug = normalizeRepoSlug(owner, repo);
  if (!slug) return null;
  const viewerLogin =
    opts.viewerLogin != null && String(opts.viewerLogin).trim()
      ? opts.viewerLogin
      : d.viewerLogin;
  return {
    owner: slug.owner,
    repo: slug.repo,
    left: buildDetailGnbLeftItems(slug.owner, slug.repo, locale),
    right: buildDetailGnbRightSlots({
      viewerLogin: viewerLogin as string | null | undefined,
      locale,
    }),
    repoHref: githubAbsPath(`/${slug.owner}/${slug.repo}`),
    ownerHref: githubAbsPath(`/${slug.owner}`),
    repoLabel: `${slug.owner}/${slug.repo}`,
  };
}

/**
 * GNB is only for page-embed presentation (covers native GH top chrome).
 * Modal / sheet shells keep native page or do not need this bar.
 */
export function shouldShowDetailGnb(
  presentation: PresentationMode | string | null | undefined
): boolean {
  return isEmbedPresentation(presentation);
}
