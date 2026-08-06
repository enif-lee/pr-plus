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
  IconDotFill,
  IconSkip,
  IconXCircleFill,
} from '@common/icons';

type OutcomeKey =
  | 'failure'
  | 'in_progress'
  | 'pending'
  | 'success'
  | 'skipped';

/** Display order: failures → working → expected → success → skipped. */
const OUTCOME_ORDER: OutcomeKey[] = [
  'failure',
  'in_progress',
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
export function buildCheckStackGroups(
  checks: any,
  locale?: string | null
): CheckStackGroup[] {
  const byOutcome =
    typeof listCheckNamesByOutcome === 'function'
      ? listCheckNamesByOutcome(checks)
      : {
          failure: [],
          in_progress: [],
          pending: [],
          success: [],
          skipped: [],
          state: 'unknown',
        };

  let loc = locale || '';
  if (!loc) {
    try {
      loc =
        document.documentElement.getAttribute('data-prp-app-locale') || 'en';
    } catch {
      loc = 'en';
    }
  }

  const out: CheckStackGroup[] = [];
  for (const key of OUTCOME_ORDER) {
    const names = Array.isArray(byOutcome[key]) ? byOutcome[key] : [];
    if (!names.length) continue;
    const tip =
      typeof formatCheckGroupTip === 'function'
        ? formatCheckGroupTip(key, names, loc)
        : `${names.length} ${key}\n${names.map((n: string) => `· ${n}`).join('\n')}`;
    out.push({ key, names, tip });
  }
  // Do not invent a phantom stack from combined-status state alone
  // (GitHub reports state:"pending" with zero contexts on repos without checks).
  return out;
}

/**
 * Shared check status glyph — same in Checks panel, header stack, merge box.
 * - pending (expected): static yellow circle
 * - in_progress (working): spinning amber ring
 */
export function CheckOutcomeIcon({
  outcome,
  size = 14,
  className = '',
}: {
  outcome: OutcomeKey | string;
  size?: number;
  className?: string;
}) {
  const dim = Math.max(10, Number(size) || 14);
  if (outcome === 'failure') {
    return (
      <IconXCircleFill
        size={dim}
        className={`prp-checks-summary-icon prp-checks-summary-icon--failure ${className}`.trim()}
      />
    );
  }
  // Working: spinning ring (GitHub in-progress)
  if (outcome === 'in_progress' || outcome === 'working') {
    return (
      <span
        className={`prp-checks-summary-icon prp-checks-summary-icon--working ${className}`.trim()}
        style={{ width: dim, height: dim }}
        aria-hidden="true"
      />
    );
  }
  // Expected / pending: static yellow circle
  if (outcome === 'pending' || outcome === 'expected') {
    return (
      <IconDotFill
        size={dim}
        className={`prp-checks-summary-icon prp-checks-summary-icon--pending ${className}`.trim()}
      />
    );
  }
  if (outcome === 'skipped') {
    return (
      <IconSkip
        size={dim}
        className={`prp-checks-summary-icon prp-checks-summary-icon--skipped ${className}`.trim()}
      />
    );
  }
  return (
    <IconCheckCircleFill
      size={dim}
      className={`prp-checks-summary-icon prp-checks-summary-icon--success ${className}`.trim()}
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
