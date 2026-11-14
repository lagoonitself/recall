import type { DocCheck, ReviewStatus } from '@app/shared';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '–' : `${Math.round(value * 100)}%`;

const REVIEW: Record<ReviewStatus, { label: string; className: string }> = {
  needs_review: { label: 'Needs review', className: 'badge-danger' },
  auto_approved: { label: 'Auto-approved', className: 'badge-success' },
  approved: { label: 'Approved', className: 'badge-success' },
  rejected: { label: 'Rejected', className: 'badge-neutral' },
};

export function ReviewBadge({ status }: { status: ReviewStatus | null }) {
  if (!status) return null;
  const r = REVIEW[status];
  return <span className={`badge ${r.className}`}>{r.label}</span>;
}

export function TypeBadge({ label, confidence }: { label: string; confidence: number | null }) {
  return (
    <span
      className="docs-type"
      title="Document type chosen by Gemini Decision 1, with its calibrated probability"
    >
      {label}
      {confidence !== null && <span className="docs-type-conf tabular">{pct(confidence)}</span>}
    </span>
  );
}

export function CheckIcon({ status }: { status: DocCheck['status'] }) {
  if (status === 'pass')
    return <CheckCircle2 size={16} strokeWidth={1.75} className="docs-icon-pass" aria-label="Passed" />;
  if (status === 'warn')
    return <AlertTriangle size={16} strokeWidth={1.75} className="docs-icon-warn" aria-label="Warning" />;
  return <XCircle size={16} strokeWidth={1.75} className="docs-icon-fail" aria-label="Failed" />;
}

/** Thin bar for a 0..1 confidence. */
export function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null) return <span className="file-meta">–</span>;
  const tone = value >= 0.75 ? 'pass' : value >= 0.5 ? 'warn' : 'fail';
  return (
    <span className="docs-conf" title={`Confirmed by Gemini Decision 1 with p = ${value.toFixed(2)}`}>
      <span className="docs-conf-track">
        <span
          className={`docs-conf-fill docs-conf-${tone}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span className="tabular">{pct(value)}</span>
    </span>
  );
}
