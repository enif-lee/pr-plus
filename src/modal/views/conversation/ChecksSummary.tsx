import React, { useMemo } from 'react';
import {
  formatCheckGroupTip,
  formatChecksCountLabel,
  listCheckNamesByOutcome,
  summarizeCheckCounts,
} from '@lib/checks';
import { TipPopover } from '@common/TipPopover';
import {
  IconCheckCircleFill,
  IconSkip,
  IconSync,
  IconXCircleFill,
} from '@common/icons';

type OutcomeKey = 'failure' | 'pending' | 'success' | 'skipped';

/** Display order: failures first (like merge box), then pending, success, skipped. */
const OUTCOME_ORDER: OutcomeKey[] = [
  'failure',
  'pending',
  'success',
  'skipped',
];

export type CheckStackGroup = {
  key: OutcomeKey;
  names: string[];
  tip: string;
};

/** Pure: outcome groups for avatar-stack checks (shared with header meta stack). */
export function buildCheckStackGroups(checks: any): CheckStackGroup[] {
  const summary =
    typeof summarizeCheckCounts === 'function'
      ? summarizeCheckCounts(checks)
      : {
          total: 0,
          success: 0,
          failure: 0,
          pending: 0,
          skipped: 0,
          state: 'unknown',
        };
  const byOutcome =
    typeof listCheckNamesByOutcome === 'function'
      ? listCheckNamesByOutcome(checks)
      : {
          failure: [],
          pending: [],
          success: [],
          skipped: [],
          state: summary.state || 'unknown',
        };
  const overallTip =
    typeof formatChecksCountLabel === 'function'
      ? formatChecksCountLabel(summary)
      : `Checks: ${summary.state || 'unknown'}`;

  const out: CheckStackGroup[] = [];
  for (const key of OUTCOME_ORDER) {
    const names = Array.isArray(byOutcome[key]) ? byOutcome[key] : [];
    if (!names.length) continue;
    const tip =
      typeof formatCheckGroupTip === 'function'
        ? formatCheckGroupTip(key, names)
        : `${names.length} ${key}\n${names.map((n: string) => `· ${n}`).join('\n')}`;
    out.push({ key, names, tip });
  }
  if (!out.length && summary.state && summary.state !== 'unknown') {
    const st = String(summary.state).toLowerCase();
    const key: OutcomeKey =
      st === 'failure' || st === 'error'
        ? 'failure'
        : st === 'pending'
          ? 'pending'
          : 'success';
    out.push({ key, names: [], tip: overallTip });
  }
  return out;
}

export function CheckOutcomeIcon({
  outcome,
  size = 14,
}: {
  outcome: OutcomeKey | string;
  size?: number;
}) {
  if (outcome === 'failure') {
    return (
      <IconXCircleFill
        size={size}
        className="prp-checks-summary-icon prp-checks-summary-icon--failure"
      />
    );
  }
  if (outcome === 'pending') {
    return (
      <IconSync
        size={size}
        className="prp-checks-summary-icon prp-checks-summary-icon--pending prp-checks-summary-icon--spin"
      />
    );
  }
  if (outcome === 'skipped') {
    return (
      <IconSkip
        size={size}
        className="prp-checks-summary-icon prp-checks-summary-icon--skipped"
      />
    );
  }
  return (
    <IconCheckCircleFill
      size={size}
      className="prp-checks-summary-icon prp-checks-summary-icon--success"
    />
  );
}

/**
 * Compact Checks: one stacked icon per status group (avatar-stack style).
 * Hover each icon → popover listing checks in that group.
 *
 * @param leftOnTop leftmost icon paints above neighbors (z-index descending)
 */
export function ChecksSummary({
  checks,
  label = 'Checks',
  className = '',
  showLabel = true,
  size = 14,
  leftOnTop = false,
}: {
  checks: any;
  label?: string;
  className?: string;
  showLabel?: boolean;
  size?: number;
  leftOnTop?: boolean;
}) {
  const groups = useMemo(() => buildCheckStackGroups(checks), [checks]);
  const overallTip =
    groups.length === 1 && !groups[0].names.length
      ? groups[0].tip
      : typeof formatChecksCountLabel === 'function'
        ? formatChecksCountLabel(
            typeof summarizeCheckCounts === 'function'
              ? summarizeCheckCounts(checks)
              : { state: 'unknown' }
          )
        : 'Checks';

  if (!groups.length) return null;

  const n = groups.length;
  return (
    <span
      className={`prp-checks-summary-ctrl ${className}`.trim()}
      role="group"
      aria-label={overallTip}
    >
      {showLabel ? (
        <span className="prp-checks-summary-ctrl__label">{label}</span>
      ) : null}
      <span className="prp-checks-summary-stack" role="list">
        {groups.map((g, i) => (
          <span
            key={g.key}
            className={`prp-checks-summary-stack__item prp-checks-summary-stack__item--${g.key} prp-has-tip`}
            style={{ zIndex: leftOnTop ? n - i : i + 1 }}
            role="listitem"
            tabIndex={0}
            aria-label={g.tip.replace(/\n/g, ', ')}
          >
            <CheckOutcomeIcon outcome={g.key} size={size} />
            <TipPopover title={g.tip} />
          </span>
        ))}
      </span>
    </span>
  );
}

export default ChecksSummary;
