import { useState, useEffect, useRef } from 'react';
import type { Source } from '@app/shared';
import { PdfViewer } from './viewers/PdfViewer';
import { MediaViewer } from './viewers/MediaViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { TextViewer } from './viewers/TextViewer';

export interface SourceCardProps {
  source: Source;
  isActive?: boolean;
  onOpen?: () => void;
}

const MODALITY_ICONS: Record<string, string> = {
  pdf: '📄',
  image: '🖼️',
  audio: '🎧',
  video: '🎬',
  text: '📝',
};

function formatLocation(source: Source): string {
  const { modality, location } = source;
  if (modality === 'pdf' && location.page !== undefined) {
    return `page ${location.page}`;
  }
  if ((modality === 'video' || modality === 'audio') && location.startSec !== undefined) {
    const m = Math.floor(location.startSec / 60);
    const s = Math.floor(location.startSec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (modality === 'text' && location.charStart !== undefined) {
    return `char ${location.charStart}`;
  }
  return '';
}

export function SourceCard({ source, isActive = false, onOpen }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Auto-expand and scroll into view when activated via citation chip click
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

  const loc = formatLocation(source);
  const icon = MODALITY_ICONS[source.modality] || '📁';

  return (
    <article
      ref={cardRef}
      className={`source-card ${expanded ? 'expanded' : ''} ${isActive ? 'active-highlight' : ''}`}
      id={`source-${source.sid}`}
    >
      <header className="source-card-header">
        <button
          type="button"
          className="source-toggle-btn"
          onClick={toggleExpand}
          aria-expanded={expanded}
          aria-controls={`source-viewer-${source.sid}`}
        >
          <span className="source-sid">{source.sid}</span>
          <span className="source-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="source-name" title={source.fileName}>
            {source.fileName}
          </span>
          {loc && <span className="source-loc">· {loc}</span>}
          <span className="source-chevron" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </span>
        </button>
      </header>

      {expanded && (
        <div id={`source-viewer-${source.sid}`} className="source-viewer-container">
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
      )}
    </article>
  );
}
