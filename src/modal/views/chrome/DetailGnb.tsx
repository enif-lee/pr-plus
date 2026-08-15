/**
 * Thin top GNB for PR detail page-embed — left repo tabs, right notifications/account.
 */
import React, { useMemo } from 'react';
import { Avatar } from '@common/Avatar';
import { IconBell, IconMarkGithub } from '@common/icons';
import { useLocale } from '@lib/locale-context';
import {
  buildDetailGnbModel,
  shouldShowDetailGnb,
  type DetailGnbModel,
} from '@lib/detail-gnb';
import './DetailGnb.css';

export type DetailGnbProps = {
  detail?: {
    owner?: string | null;
    repo?: string | null;
    viewerLogin?: string | null;
    authorAvatarUrl?: string | null;
    avatarUrls?: Record<string, string> | null;
  } | null;
  owner?: string | null;
  repo?: string | null;
  presentation?: string | null;
  /** Prebuilt model (tests / overrides); otherwise derived from detail. */
  model?: DetailGnbModel | null;
};

function viewerAvatarUrl(detail: DetailGnbProps['detail']): string | null {
  const login = String(detail?.viewerLogin || '')
    .trim()
    .toLowerCase();
  if (!login) return null;
  const map = detail?.avatarUrls;
  if (map && typeof map === 'object') {
    const hit = map[login];
    if (hit) return String(hit);
  }
  return null;
}

/**
 * Thin GNB. Renders null when not embed or owner/repo unknown.
 */
export function DetailGnb({
  detail,
  owner,
  repo,
  presentation = 'embed',
  model: modelProp,
}: DetailGnbProps) {
  const { locale } = useLocale();
  const model = useMemo(() => {
    if (modelProp) return modelProp;
    if (!shouldShowDetailGnb(presentation)) return null;
    return buildDetailGnbModel({
      owner: owner ?? detail?.owner,
      repo: repo ?? detail?.repo,
      viewerLogin: detail?.viewerLogin,
      detail,
      locale,
    });
  }, [modelProp, presentation, owner, repo, detail, locale]);

  if (!model || !shouldShowDetailGnb(presentation)) return null;

  const account = model.right.find((s) => s.id === 'account');
  const notifications = model.right.find((s) => s.id === 'notifications');
  const avatarUrl = viewerAvatarUrl(detail);

  return (
    <nav
      className="prp-detail-gnb"
      data-prp-detail-gnb="1"
      aria-label="Repository and account"
    >
      <div className="prp-detail-gnb__left">
        <a
          className="prp-detail-gnb__mark"
          href={model.repoHref}
          title={model.repoLabel}
          data-prp-gnb-repo="1"
        >
          <IconMarkGithub size={14} aria-hidden="true" />
          <span className="prp-detail-gnb__repo-label">
            <span className="prp-detail-gnb__owner">{model.owner}</span>
            <span className="prp-detail-gnb__slash" aria-hidden="true">
              /
            </span>
            <span className="prp-detail-gnb__name">{model.repo}</span>
          </span>
        </a>
        <ul className="prp-detail-gnb__tabs" role="list">
          {model.left.map((item) => (
            <li key={item.id} className="prp-detail-gnb__tab-item">
              <a
                className="prp-detail-gnb__tab"
                href={item.href}
                data-prp-gnb-tab={item.id}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="prp-detail-gnb__right">
        {notifications ? (
          <a
            className="prp-detail-gnb__icon-link"
            href={notifications.href}
            title={notifications.label}
            aria-label={notifications.label}
            data-prp-gnb-slot="notifications"
          >
            <IconBell size={14} aria-hidden="true" />
          </a>
        ) : null}
        {account ? (
          <a
            className="prp-detail-gnb__account"
            href={account.href}
            title={account.label}
            aria-label={
              account.login ? `Account: ${account.login}` : account.label
            }
            data-prp-gnb-slot="account"
          >
            {account.login ? (
              <Avatar
                login={account.login}
                avatarUrl={avatarUrl}
                size="sm"
                className="prp-detail-gnb__avatar"
                title={undefined}
              />
            ) : (
              <span className="prp-detail-gnb__sign-in">{account.label}</span>
            )}
          </a>
        ) : null}
      </div>
    </nav>
  );
}

export default DetailGnb;
