import React, { useMemo } from 'react';
import {
  formatChecksCountLabel,
  summarizeCheckCounts,
} from '@lib/checks';
import { TipPopover } from '@common/TipPopover';
import {
  IconCheckCircleFill,
  IconSync,
  IconXCircleFill,
} from '@common/icons';

/**
 * Compact Checks label + outcome icons (success / fail / animated loading)
 * with hover/focus popover of total + pass/fail/pending counts.
 */
export function ChecksSummary({
  checks,
  label = 'Checks',
  className = '',
  showLabel = true,
  size = 14,
}: {
  checks: any;
  label?: string;
  className?: string;
  showLabel?: boolean;
  size?: number;
}) {
  const summary = useMemo(
    () =>
      typeof summarizeCheckCounts === 'function'
        ? summarizeCheckCounts(checks)
        : {
            total: 0,
            success: 0,
            failure: 0,
            pending: 0,
            skipped: 0,
            state: 'unknown',
          },
    [checks]
  );

  const tip =
    typeof formatChecksCountLabel === 'function'
      ? formatChecksCountLabel(summary)
      : `Checks: ${summary.state || 'unknown'}`;

  const showSuccess =
    summary.success > 0 ||
    (summary.skipped > 0 && !summary.failure && !summary.pending);
  const showFailure = summary.failure > 0;
  const showPending = summary.pending > 0;
  // Overall-only fallback when counts are empty but state is known
  const overallOnly =
    !showSuccess && !showFailure && !showPending && summary.state;
  const overallSuccess =
    overallOnly &&
    (summary.state === 'success' || summary.state === 'SUCCESS');
  const overallFailure =
    overallOnly &&
    (summary.state === 'failure' ||
      summary.state === 'FAILURE' ||
      summary.state === 'error');
  const overallPending =
    overallOnly && !overallSuccess && !overallFailure;

  return (
    <span
      className={`prp-checks-summary-ctrl prp-has-tip ${className}`.trim()}
      tabIndex={0}
      role="img"
      aria-label={tip}
    >
      {showLabel ? (
        <span className="prp-checks-summary-ctrl__label">{label}</span>
      ) : null}
      <span className="prp-checks-summary-icons" aria-hidden="true">
        {showSuccess || overallSuccess ? (
          <IconCheckCircleFill
            size={size}
            className="prp-checks-summary-icon prp-checks-summary-icon--success"
          />
        ) : null}
        {showFailure || overallFailure ? (
          <IconXCircleFill
            size={size}
            className="prp-checks-summary-icon prp-checks-summary-icon--failure"
          />
        ) : null}
        {showPending || overallPending ? (
          <IconSync
            size={size}
            className="prp-checks-summary-icon prp-checks-summary-icon--pending prp-checks-summary-icon--spin"
          />
        ) : null}
      </span>
      <TipPopover title={tip} />
    </span>
  );
}

export default ChecksSummary;
