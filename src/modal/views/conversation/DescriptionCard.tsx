/**
 * PR description card (view / edit) for conversation timeline.
 */
import React from 'react';
import { Card } from '@common/Card';
import { IconPencil } from '@common/icons';
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
        renderBody(detail.body || '_No description provided._', 'body', false)
      )}
    </Card>
  );
}
