/**
 * PR description card (view / edit) for conversation timeline.
 */
import React from 'react';
import { Card } from '@common/Card';
import { IconPencil } from '@common/icons';
import { CommentReactions } from '@common/CommentReactions';
import { BodyEditor } from '../composers/BodyEditor';

export function DescriptionCard({
  detail,
  sectionLoading,
  editingBody,
  actionBusy,
  searchClassName,
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
  return (
    <Card
      title="Description"
      className={searchClassName}
      data-search-anchor="body"
      actions={
        !sectionLoading && !editingBody ? (
          <button
            type="button"
            className="prp-icon-btn inline-flex items-center justify-center"
            disabled={actionBusy}
            title="Edit description"
            aria-label="Edit description"
            onClick={onStartEditBody}
          >
            <IconPencil size={13} />
          </button>
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
