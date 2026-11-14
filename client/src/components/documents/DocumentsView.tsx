import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScanText, Sparkles, RefreshCw } from 'lucide-react';
import type { DocInsight } from '@app/shared';
import { api } from '../../lib/api';
import { DocumentDetail } from './DocumentDetail';
import { ReviewBadge, TypeBadge, pct } from './badges';

type Filter = 'all' | 'needs_review' | 'cleared';

const busy = (d: DocInsight) => d.status === 'pending' || d.status === 'running';
const cleared = (d: DocInsight) => d.reviewStatus === 'approved' || d.reviewStatus === 'auto_approved';

export function DocumentsView({
  collectionId,
  refreshKey,
  onOpenFile,
  onSummary,
}: {
  collectionId: string;
  /** Changes when the collection's files change state; a finished upload may have queued an analysis. */
  refreshKey?: string;
  /** Open a file of this collection in the previewer, optionally at a page. */
  onOpenFile: (fileId: string, page?: number, onClosed?: () => void) => boolean;
  onSummary?: (needsReview: number) => void;
}) {
  const [documents, setDocuments] = useState<DocInsight[]>([]);
  const [unanalyzed, setUnanalyzed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.documents(collectionId);
      setDocuments(res.documents);
      setUnanalyzed(res.unanalyzed);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Poll while anything is being analysed.
  useEffect(() => {
    if (!documents.some(busy)) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [documents, load]);

  const ready = documents.filter((d) => d.status === 'ready');
  const needsReview = ready.filter((d) => d.reviewStatus === 'needs_review');
  const conflicts = ready.filter((d) => d.checks.some((c) => c.group === 'cross' && c.status === 'fail'));
  useEffect(() => onSummary?.(needsReview.length), [needsReview.length, onSummary]);

  const visible = useMemo(() => {
    const list = documents.filter((d) => d.status !== 'not_document');
    if (filter === 'needs_review') return list.filter((d) => d.reviewStatus === 'needs_review');
    if (filter === 'cleared') return list.filter(cleared);
    return list;
  }, [documents, filter]);
  const notDocuments = documents.filter((d) => d.status === 'not_document').length;
  const selected = documents.find((d) => d.fileId === selectedId) ?? null;

  async function analyzeAll() {
    setStarting(true);
    try {
      await api.analyzeCollection(collectionId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the analysis.');
    } finally {
      setStarting(false);
    }
  }

  function replace(doc: DocInsight) {
    setDocuments((list) => list.map((d) => (d.fileId === doc.fileId ? doc : d)));
  }

  if (loading)
    return (
      <div className="file-list" aria-label="Loading documents">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="file-row" style={{ height: 64 }}>
            <div className="file-thumbnail-box skeleton" />
            <div className="file-info">
              <div className="skeleton" style={{ width: 160, height: 16, marginBottom: 4 }} />
              <div className="skeleton" style={{ width: 240, height: 12 }} />
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <section className="docs-view" aria-label="Document intelligence">
      <div className="docs-stats" role="list">
        <Stat label="Documents" value={ready.length} />
        <Stat
          label="Need review"
          value={needsReview.length}
          tone={needsReview.length ? 'danger' : undefined}
        />
        <Stat label="Cleared" value={ready.filter(cleared).length} tone="success" />
        <Stat
          label="Conflict with other media"
          value={conflicts.length}
          tone={conflicts.length ? 'warning' : undefined}
        />
      </div>

      {error && (
        <div role="alert" className="badge badge-danger docs-alert">
          {error}
        </div>
      )}

      {unanalyzed > 0 && (
        <div className="docs-callout">
          <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>
            {unanalyzed} {unanalyzed === 1 ? 'file has' : 'files have'} not been analysed yet.
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void analyzeAll()}
            disabled={starting}
          >
            {starting ? (
              <span className="spinner" style={{ width: 12, height: 12 }} />
            ) : (
              <ScanText size={14} />
            )}
            <span>Analyse</span>
          </button>
        </div>
      )}

      {documents.length === 0 && unanalyzed === 0 ? (
        <div className="docs-empty">
          <ScanText size={28} strokeWidth={1.5} aria-hidden="true" />
          <h2>No documents yet</h2>
          <p>
            Upload PDFs, scans, photos of paperwork or text files. Recall classifies each one, extracts its
            key fields, checks them, and compares them with the photos, recordings and videos in this
            collection.
          </p>
        </div>
      ) : (
        <>
          <div className="docs-toolbar">
            <div className="docs-filters" role="tablist" aria-label="Filter documents">
              {(
                [
                  ['all', 'All'],
                  ['needs_review', `Needs review${needsReview.length ? ` · ${needsReview.length}` : ''}`],
                  ['cleared', 'Cleared'],
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`docs-filter ${filter === key ? 'active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void load()}
              aria-label="Refresh"
            >
              <RefreshCw size={14} strokeWidth={1.75} />
            </button>
          </div>

          <div className="file-list" role="list">
            {visible.length === 0 && <div className="docs-none">Nothing here.</div>}
            {visible.map((doc) => (
              <DocRow key={doc.fileId} doc={doc} onOpen={() => setSelectedId(doc.fileId)} />
            ))}
          </div>
          {notDocuments > 0 && (
            <p className="docs-footnote">
              {notDocuments} {notDocuments === 1 ? 'image is' : 'images are'} photos rather than documents.
              They are used as evidence when checking documents.
            </p>
          )}
        </>
      )}

      {selected && (
        <DocumentDetail
          doc={selected}
          onClose={() => setSelectedId(null)}
          onChange={replace}
          onOpenFile={(fileId, page) => {
            // The previewer opens in the page; hide the drawer meanwhile and bring it back when it closes.
            const id = selected.fileId;
            if (onOpenFile(fileId, page, () => setSelectedId(id))) setSelectedId(null);
          }}
          onReanalyze={async () => {
            replace(await api.analyzeDocument(selected.fileId).then((r) => r.document));
          }}
        />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'success' | 'warning';
}) {
  return (
    <div role="listitem" className={`docs-stat ${tone ? `docs-stat-${tone}` : ''}`}>
      <span className="docs-stat-value tabular">{value}</span>
      <span className="docs-stat-label">{label}</span>
    </div>
  );
}

function DocRow({ doc, onOpen }: { doc: DocInsight; onOpen: () => void }) {
  const fields = doc.fields.filter((f) => f.value).slice(0, 3);
  const fails = doc.checks.filter((c) => c.status === 'fail').length;
  const warns = doc.checks.filter((c) => c.status === 'warn').length;
  const interactive = doc.status === 'ready' || doc.status === 'failed';
  return (
    <div role="listitem" className={`file-row docs-row ${interactive ? 'file-row-interactive' : ''}`}>
      <button
        type="button"
        className="docs-row-main"
        onClick={onOpen}
        disabled={!interactive}
        aria-label={`Open analysis of ${doc.fileName}`}
      >
        <span className="docs-row-title">
          <span className="file-name-static">{doc.fileName}</span>
          {doc.docTypeLabel && <TypeBadge label={doc.docTypeLabel} confidence={doc.typeConfidence} />}
        </span>
        {doc.status === 'ready' ? (
          <span className="docs-row-fields">
            {fields.map((f) => (
              <span key={f.key}>
                <span className="docs-field-label">{f.label}</span> {f.value}
              </span>
            ))}
          </span>
        ) : (
          <span className="file-meta">
            {busy(doc) ? 'Analysing with Gemini Decision 1…' : doc.status === 'failed' ? doc.error : ''}
          </span>
        )}
      </button>
      <div className="docs-row-side">
        {doc.status === 'ready' && (fails > 0 || warns > 0) && (
          <span className="docs-issue-count file-meta">
            {fails > 0 && <span className="docs-dot docs-dot-fail" aria-hidden="true" />}
            {fails > 0 && `${fails} failed`}
            {fails > 0 && warns > 0 && ' · '}
            {warns > 0 && `${warns} warning${warns === 1 ? '' : 's'}`}
          </span>
        )}
        {doc.status === 'ready' && doc.riskScore !== null && (
          <span className="file-meta tabular" title="Risk score">
            Risk {pct(doc.riskScore)}
          </span>
        )}
        {busy(doc) ? (
          <span className="badge badge-warning docs-inline">
            <span className="spinner" style={{ width: 12, height: 12 }} />
            Analysing
          </span>
        ) : doc.status === 'failed' ? (
          <span className="badge badge-danger">Failed</span>
        ) : (
          <ReviewBadge status={doc.reviewStatus} />
        )}
      </div>
    </div>
  );
}
