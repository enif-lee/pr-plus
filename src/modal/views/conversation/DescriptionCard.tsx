/**
 * PR description card (view / edit) for conversation timeline.
 */
import React from 'react';
import { Card } from '@common/Card';
import { IconPencil } from '@common/icons';
import { CommentReactions } from '@common/CommentReactions';
import { CommentActionIconBtn } from '@common/CommentActionIconBtn';
import { BodyEditor } from '../composers/BodyEditor';
import { CONTEXT_COMMENT_ACTION_SHORTCUT } from '@lib/shortcut-policy';

import { useT } from '@lib/locale-context';

export function DescriptionCard({
  detail,
  sectionLoading,
  editingBody,
  actionBusy,
  searchClassName,
  focused = false,
  onStartEditBody,
  onCancelEditBody,
  onSaveBody,
  onRegisterEditorSave,
  onUploadFile,
  linkCtx,
  mentionCandidates,
  renderBody,
  onToggleReaction = null,
  onLoadReactors = null,
}: {
  detail: any;
  sectionLoading?: boolean;
  editingBody?: boolean;
  actionBusy?: boolean;
  searchClassName: string;
  /** Conversation keyboard focus on this description card. */
  focused?: boolean;
  onStartEditBody?: () => void;
  onCancelEditBody?: () => void;
  onSaveBody?: (body: string) => void | Promise<void>;
  onRegisterEditorSave?: (fn: any) => void;
  onUploadFile?: any;
  linkCtx?: any;
  mentionCandidates?: any[];
  /** Renders markdown body (search-aware) when not editing */
  renderBody: (body: string, anchor: string, mark: boolean) => React.ReactNode;
  onToggleReaction?: any;
  onLoadReactors?: any;
}) {
  const t = useT();
  const editKbd = CONTEXT_COMMENT_ACTION_SHORTCUT.edit.labelMac;
  return (
    <Card
      title={t('meta_description')}
      className={searchClassName}
      data-search-anchor="body"
      actions={
        !sectionLoading && !editingBody ? (
          <CommentActionIconBtn
            tipTitle={t('cta_edit_description')}
            shortcut={editKbd}
            showShortcutHint={focused}
            disabled={actionBusy}
            aria-label={t('cta_edit_description')}
            data-prp-edit-body="1"
            data-prp-edit-comment="1"
            onClick={onStartEditBody}
          >
            <IconPencil size={13} />
          </CommentActionIconBtn>
        ) : null
      }
    >
      {editingBody ? (
        <BodyEditor
          value={detail.body || ''}
          actionBusy={actionBusy}
          onSave={onSaveBody}
          onCancel={onCancelEditBody}
          onRegisterSave={onRegisterEditorSave}
          onUploadFile={onUploadFile}
          linkCtx={linkCtx}
          mentionCandidates={mentionCandidates}
        />
      ) : (
        <>
          {renderBody(
            detail.body || '_No description provided._',
            'body',
            false
          )}
          {typeof onToggleReaction === 'function' ? (
            <CommentReactions
              reactions={detail.bodyReactions || []}
              target={{
                kind: 'pr',
                commentId: detail.number,
                number: detail.number,
                nodeId: detail.nodeId || null,
              }}
              viewerLogin={detail.viewerLogin}
              // Do not lock body reactions on unrelated meta actionBusy —
              // that made picker Heart clicks no-op (disabled) while e2e still
              // saw the button in the DOM (MB6).
              busy={false}
              onToggle={onToggleReaction}
              onLoadReactors={onLoadReactors}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
