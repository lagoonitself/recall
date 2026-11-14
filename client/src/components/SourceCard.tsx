import React, { useState, useEffect, useRef } from 'react';
import type { Source, File as LibraryFile } from '@app/shared';
import { Maximize2, X } from 'lucide-react';
import { api } from '../lib/api';
import { FilePreview } from './FilePreview';
import { PdfViewer } from './viewers/PdfViewer';
import { MediaViewer } from './viewers/MediaViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { TextViewer } from './viewers/TextViewer';
import { ModalityIcon } from './messages/ModalityIcon';

export interface SourceCardProps {
  source: Source;
  index?: number;
  isActive?: boolean;
  onOpen?: () => void;
  /** When true, renders inline viewer directly beneath this card on expand (for standalone/test usage) */
  standalone?: boolean;
}

export function formatLocation(source: Source): string {
  const { modality, location } = source;
  if (modality === 'pdf' && location.page !== undefined) {
    return `p. ${location.page}`;
  }
  if ((modality === 'video' || modality === 'audio') && location.startSec !== undefined) {
    const m = Math.floor(location.startSec / 60);
    const s = Math.floor(location.startSec % 60);
    const start = `${m}:${s.toString().padStart(2, '0')}`;
    if (location.endSec !== undefined && location.endSec > location.startSec) {
      const em = Math.floor(location.endSec / 60);
      const es = Math.floor(location.endSec % 60);
      return `${start}–${em}:${es.toString().padStart(2, '0')}`;
    }
    return start;
  }
  if (modality === 'text' && location.charStart !== undefined) {
    return `char ${location.charStart}`;
  }
  return '';
}

async function fetchFile(fileId: string): Promise<LibraryFile | null> {
  try {
    return (await api.file(fileId)).file;
  } catch {
    return null;
  }
}

interface SourceDetailPanelProps {
  source: Source;
  index?: number;
  onClose?: () => void;
}

export function SourceDetailPanel({ source, index, onClose }: SourceDetailPanelProps) {
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);
  const [openingDoc, setOpeningDoc] = useState(false);

  const handleOpenFullDocument = async () => {
    try {
      setOpeningDoc(true);
      const docRes = await api.chunkDocument(source.chunkId);
      let file: LibraryFile | null = null;
      if (docRes.fileId) {
        file = await fetchFile(docRes.fileId);
      }
      if (!file) {
        // Fallback LibraryFile constructed from Source metadata
        file = {
          id: docRes.fileId || source.chunkId,
          userId: '',
          collectionId: '',
          name: source.fileName,
          mimeType: source.modality === 'pdf' ? 'application/pdf' : `${source.modality}/*`,
          modality: source.modality,
          sizeBytes: 0,
          status: 'ready',
          piecesTotal: 1,
          piecesDone: 1,
          error: null,
          createdAt: new Date().toISOString(),
          previewChunkId: source.chunkId,
        };
      }
      setPreviewFile(file);
    } catch {
      // Fallback: open signed media url in new tab
      try {
        const media = await api.chunkMedia(source.chunkId, false);
        if (media?.url) {
          window.open(media.url, '_blank', 'noopener,noreferrer');
        }
      } catch {
        // ignore
      }
    } finally {
      setOpeningDoc(false);
    }
  };

  const displayNum = index ?? (parseInt(source.sid.replace(/\D/g, ''), 10) || 1);
  const loc = formatLocation(source);

  return (
    <div className="source-detail-panel" id={`source-viewer-${source.sid}`}>
      <div className="source-detail-header">
        <div className="source-detail-title">
          <span className="source-chip-num">{displayNum}</span>
          <ModalityIcon modality={source.modality} size={14} className="source-detail-icon" />
          <span className="source-detail-name" title={source.fileName}>
            {source.fileName}
          </span>
          {loc && <span className="source-detail-loc">· {loc}</span>}
        </div>
        <div className="source-detail-actions">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleOpenFullDocument}
            disabled={openingDoc}
            aria-label={`Open full document for ${source.fileName}`}
            title="Open full document"
          >
            <Maximize2 size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>Open full document</span>
          </button>
          {onClose && (
            <button
              type="button"
              className="btn btn-sm btn-ghost btn-icon"
              onClick={onClose}
              aria-label="Close source preview"
              title="Close"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="source-detail-body">
        {source.modality === 'pdf' && (
          <PdfViewer
            chunkId={source.chunkId}
            page={source.location.page}
            thumbUrl={source.thumbUrl}
            fileName={source.fileName}
          />
        )}

        {(source.modality === 'video' || source.modality === 'audio') && (
          <MediaViewer
            modality={source.modality}
            chunkId={source.chunkId}
            location={source.location}
            fileName={source.fileName}
            thumbUrl={source.thumbUrl}
          />
        )}

        {source.modality === 'image' && (
          <ImageViewer chunkId={source.chunkId} thumbUrl={source.thumbUrl} fileName={source.fileName} />
        )}

        {source.modality === 'text' && (
          <TextViewer chunkId={source.chunkId} location={source.location} fileName={source.fileName} />
        )}
      </div>

      {previewFile && (
        <FilePreview
          file={previewFile}
          initialPage={source.location.page}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

export function SourceCard({ source, index, isActive = false, onOpen, standalone = true }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);

  // Auto-expand and scroll into view when activated via citation pill click
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
      cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && onOpen) {
      onOpen();
    }
  };

  const displayNum = index ?? (parseInt(source.sid.replace(/\D/g, ''), 10) || 1);
  const loc = formatLocation(source);
  const isCurrentlyActive = isActive || expanded;

  return (
    <article
      ref={cardRef}
      className={`source-card ${isCurrentlyActive ? 'active-highlight' : ''}`}
      id={`source-${source.sid}`}
      role="article"
    >
      <button
        type="button"
        className={`source-chip ${isCurrentlyActive ? 'active' : ''}`}
        onClick={toggleExpand}
        aria-expanded={expanded}
        aria-controls={`source-viewer-${source.sid}`}
        aria-label={`Source ${displayNum}: ${source.fileName}${loc ? `, ${loc}` : ''}`}
      >
        <span className="source-chip-num">{displayNum}</span>
        <ModalityIcon modality={source.modality} size={14} className="source-chip-icon" />
        <span className="source-chip-name" title={source.fileName}>
          {source.fileName}
        </span>
        {loc && <span className="source-chip-loc">· {loc}</span>}
      </button>

      {/* When standalone (or testing single card), expand detail panel right here */}
      {standalone && (expanded || isActive) && (
        <SourceDetailPanel source={source} index={displayNum} onClose={() => setExpanded(false)} />
      )}
    </article>
  );
}

export interface SourcesSectionProps {
  sources: Source[];
  activeSourceSid: string | null;
  onSelectSource: (sid: string) => void;
}

export function SourcesSection({ sources, activeSourceSid, onSelectSource }: SourcesSectionProps) {
  if (!sources || sources.length === 0) return null;

  const activeSource = sources.find((s) => s.sid === activeSourceSid);
  const activeIndex = activeSource ? sources.indexOf(activeSource) + 1 : undefined;

  return (
    <section className="sources-section" aria-label="Cited sources">
      <div className="sources-heading">Sources · {sources.length}</div>
      <div className="sources-chips-row" role="tablist" aria-label="Sources">
        {sources.map((src, idx) => (
          <SourceCard
            key={src.sid}
            source={src}
            index={idx + 1}
            isActive={activeSourceSid === src.sid}
            onOpen={() => onSelectSource(src.sid)}
            standalone={false}
          />
        ))}
      </div>

      {activeSource && (
        <SourceDetailPanel
          source={activeSource}
          index={activeIndex}
          onClose={() => onSelectSource(activeSource.sid)}
        />
      )}
    </section>
  );
}
