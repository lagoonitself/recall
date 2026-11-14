import { useEffect } from 'react';
import type { Source } from '@app/shared';
import { ExternalLink } from 'lucide-react';
import { ModalityIcon } from './ModalityIcon';

export interface CitationPopoverProps {
  source: Source;
  index: number;
  anchorRect: DOMRect;
  onOpen: () => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function formatLocationText(source: Source): string {
  const { modality, location } = source;
  if (modality === 'pdf' && location.page !== undefined) {
    return `Page ${location.page}`;
  }
  if ((modality === 'video' || modality === 'audio') && location.startSec !== undefined) {
    const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };
    if (location.endSec !== undefined && location.endSec > location.startSec) {
      return `${formatTime(location.startSec)}–${formatTime(location.endSec)}`;
    }
    return formatTime(location.startSec);
  }
  if (modality === 'text' && location.charStart !== undefined) {
    return `Char ${location.charStart}`;
  }
  return '';
}

export function CitationPopover({
  source,
  index,
  anchorRect,
  onOpen,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: CitationPopoverProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const loc = formatLocationText(source);
  const cardWidth = 280;

  // Decide whether to place above or below the anchor
  const spaceAbove = anchorRect.top;
  const placeBelow = spaceAbove < 180;

  const top = placeBelow ? anchorRect.bottom + 8 : anchorRect.top - 8;
  const transform = placeBelow ? 'none' : 'translateY(-100%)';

  // Clamp horizontally within viewport
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const targetLeft = anchorRect.left + anchorRect.width / 2 - cardWidth / 2;
  const left = Math.max(12, Math.min(viewportWidth - cardWidth - 12, targetLeft));

  return (
    <div
      className="citation-popover"
      role="tooltip"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        transform,
        width: `${cardWidth}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="citation-popover-header">
        <span className="citation-popover-pill">{index}</span>
        <ModalityIcon modality={source.modality} size={14} className="citation-popover-icon" />
        <span className="citation-popover-title" title={source.fileName}>
          {source.fileName}
        </span>
        {loc && <span className="citation-popover-loc">{loc}</span>}
      </div>

      {source.thumbUrl && (
        <div className="citation-popover-thumb">
          <img src={source.thumbUrl} alt="" loading="lazy" />
        </div>
      )}

      <div className="citation-popover-actions">
        <button
          type="button"
          className="btn btn-sm btn-secondary citation-popover-open-btn"
          onClick={onOpen}
          aria-label={`Open source ${index}: ${source.fileName}`}
        >
          <span>Open</span>
          <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
