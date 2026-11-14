import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  Ban,
  RotateCcw,
  ExternalLink,
  AudioLines,
  Image as ImageIcon,
  Video,
  FileText,
  File,
} from 'lucide-react';
import type { DocCheck, DocInsight, Modality } from '@app/shared';
import { api } from '../../lib/api';
import { CheckIcon, ConfidenceBar, ReviewBadge, TypeBadge, pct } from './badges';

const GROUPS: { key: DocCheck['group']; title: string; hint: string }[] = [
  {
    key: 'cross',
    title: 'Cross-media evidence',
    hint: 'Gemini Decision 1 compared this document with photos, recordings, videos and other files in the collection.',
  },
  {
    key: 'ai',
    title: 'AI checks',
    hint: 'Yes/no checks answered by Gemini Decision 1 with calibrated probabilities.',
  },
  {
    key: 'rule',
    title: 'Rules',
    hint: 'Deterministic checks on the extracted values: dates, totals, required fields.',
  },
];

function clock(sec: number) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function where(evidence: NonNullable<DocCheck['evidence']>) {
  const l = evidence.location;
  if (l.page) return `page ${l.page}`;
  if (l.startSec !== undefined)
    return `${clock(l.startSec)}${l.endSec !== undefined ? `–${clock(l.endSec)}` : ''}`;
  return '';
}

function ModalityGlyph({ modality }: { modality: Modality }) {
  const props = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
  if (modality === 'audio') return <AudioLines {...props} />;
  if (modality === 'image') return <ImageIcon {...props} />;
  if (modality === 'video') return <Video {...props} />;
  if (modality === 'pdf') return <FileText {...props} />;
  return <File {...props} />;
}

export function DocumentDetail({
  doc,
  onClose,
  onChange,
  onOpenFile,
  onReanalyze,
}: {
  doc: DocInsight;
  onClose: () => void;
  onChange: (doc: DocInsight) => void;
  onOpenFile: (fileId: string, page?: number) => void;
  onReanalyze: () => Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function review(status: 'approved' | 'rejected' | 'needs_review') {
    setSaving(status);
    setError('');
    try {
      onChange((await api.reviewDocument(doc.fileId, status)).document);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision.');
    } finally {
      setSaving(null);
    }
  }

  async function rerun() {
    setSaving('rerun');
    setError('');
    try {
      await onReanalyze();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the analysis.');
    } finally {
      setSaving(null);
    }
  }

  const topTypes = Object.entries(doc.typeProbabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const decided = doc.reviewStatus === 'approved' || doc.reviewStatus === 'rejected';

  // Portal: page sections create their own stacking contexts, which would trap the drawer under them.
  return createPortal(
    <div className="docs-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className="docs-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docs-drawer-title"
        tabIndex={-1}
      >
        <header className="docs-drawer-header">
          <div className="docs-drawer-heading">
            <h2 id="docs-drawer-title">{doc.fileName}</h2>
            <div className="docs-drawer-meta">
              {doc.docTypeLabel && <TypeBadge label={doc.docTypeLabel} confidence={doc.typeConfidence} />}
              <ReviewBadge status={doc.reviewStatus} />
              {doc.quality !== null && <span className="file-meta">Legibility {pct(doc.quality)}</span>}
              {doc.riskScore !== null && <span className="file-meta">Risk {pct(doc.riskScore)}</span>}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="docs-drawer-body">
          {doc.status === 'failed' && (
            <div role="alert" className="docs-reasons">
              <strong>Analysis failed.</strong> {doc.error}
            </div>
          )}
          {doc.summary && <p className="docs-summary">{doc.summary}</p>}

          {doc.reviewStatus === 'needs_review' && doc.reviewReasons.length > 0 && (
            <div className="docs-reasons" role="note">
              <strong>Why it needs a person</strong>
              <ul>
                {doc.reviewReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {doc.fields.length > 0 && (
            <section className="docs-section">
              <h3>Extracted fields</h3>
              <p className="docs-hint">
                Extracted by Gemini, then confirmed on a second read by Gemini Decision 1. The bar is its
                calibrated probability that the document really says this.
              </p>
              <table className="docs-fields">
                <tbody>
                  {doc.fields.map((f) => (
                    <tr key={f.key} className={f.value ? '' : 'docs-field-empty'}>
                      <th scope="row">{f.label}</th>
                      <td>
                        {f.value ?? <span className="file-meta">Not found</span>}
                        {f.page && (
                          <button
                            type="button"
                            className="docs-page-link"
                            onClick={() => onOpenFile(doc.fileId, f.page ?? undefined)}
                          >
                            p. {f.page}
                          </button>
                        )}
                      </td>
                      <td className="docs-fields-conf">
                        {f.value && <ConfidenceBar value={f.confidence} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {GROUPS.map((group) => {
            const checks = doc.checks.filter((c) => c.group === group.key);
            if (!checks.length) return null;
            const order = { fail: 0, warn: 1, pass: 2 };
            return (
              <section key={group.key} className="docs-section">
                <h3>{group.title}</h3>
                <p className="docs-hint">{group.hint}</p>
                <ul className="docs-checks">
                  {[...checks]
                    .sort((a, b) => order[a.status] - order[b.status])
                    .map((check) => (
                      <li key={check.id} className={`docs-check docs-check-${check.status}`}>
                        <CheckIcon status={check.status} />
                        <div className="docs-check-body">
                          <div className="docs-check-title">
                            <span>{check.label}</span>
                            {check.probability !== null && (
                              <span className="file-meta tabular" title="Calibrated probability">
                                p = {check.probability.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <p>{check.detail}</p>
                          {check.evidence && (
                            <button
                              type="button"
                              className="docs-evidence"
                              onClick={() =>
                                onOpenFile(check.evidence!.fileId, check.evidence!.location.page)
                              }
                            >
                              <ModalityGlyph modality={check.evidence.modality} />
                              <span>{check.evidence.fileName}</span>
                              {where(check.evidence) && (
                                <span className="file-meta">{where(check.evidence)}</span>
                              )}
                              <ExternalLink size={12} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            );
          })}

          {topTypes.length > 1 && (
            <section className="docs-section">
              <h3>Type probabilities</h3>
              <ul className="docs-types">
                {topTypes.map(([key, p]) => (
                  <li key={key}>
                    <span>{key.replace(/_/g, ' ')}</span>
                    <ConfidenceBar value={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {error && (
            <div role="alert" className="badge badge-danger docs-alert">
              {error}
            </div>
          )}
        </div>

        <footer className="docs-drawer-footer">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenFile(doc.fileId)}>
            <ExternalLink size={14} />
            <span>Open file</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void rerun()}
            disabled={!!saving}
          >
            <RotateCcw size={14} />
            <span>Re-analyse</span>
          </button>
          <span className="docs-footer-spacer" />
          {doc.status === 'ready' &&
            (decided ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void review('needs_review')}
                disabled={!!saving}
              >
                <span>Undo decision</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void review('rejected')}
                  disabled={!!saving}
                >
                  <Ban size={14} />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void review('approved')}
                  disabled={!!saving}
                >
                  <Check size={14} />
                  <span>Approve</span>
                </button>
              </>
            ))}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
