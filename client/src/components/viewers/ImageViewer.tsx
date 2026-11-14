import { useEffect, useRef, useState } from 'react';
import { ZoomIn, X } from 'lucide-react';
import { api } from '../../lib/api';

export interface ImageViewerProps {
  chunkId: string;
  thumbUrl?: string | null;
  fileName: string;
}

export function ImageViewer({ chunkId, thumbUrl, fileName }: ImageViewerProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(thumbUrl ?? null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const loadMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.chunkMedia(chunkId, false);
      setMediaUrl(res.url);
    } catch {
      if (!thumbUrl) {
        setError('Could not load image.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!thumbUrl) {
      void loadMedia();
    }
  }, [chunkId, thumbUrl]);

  useEffect(() => {
    if (!lightboxOpen) return;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setLightboxOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);

  const displayUrl = mediaUrl || thumbUrl;

  return (
    <div className="image-viewer">
      {displayUrl ? (
        <button
          type="button"
          className="image-preview-btn"
          onClick={() => setLightboxOpen(true)}
          aria-label={`View full image for ${fileName}`}
        >
          <img src={displayUrl} alt={fileName} className="image-preview" loading="lazy" />
          <span className="image-expand-hint" aria-hidden="true">
            <ZoomIn size={14} strokeWidth={1.75} />
            <span>Click to enlarge</span>
          </span>
        </button>
      ) : loading ? (
        <div className="viewer-loading skeleton" />
      ) : null}

      {error && (
        <div className="viewer-error" role="alert">
          <p className="viewer-error-text">{error}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadMedia()}
          >
            Retry
          </button>
        </div>
      )}

      {lightboxOpen && displayUrl && (
        <div
          className="lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={fileName}
          onClick={() => setLightboxOpen(false)}
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-bar">
              <span className="lightbox-title font-serif">{fileName}</span>
              <button
                type="button"
                ref={closeBtnRef}
                className="btn btn-ghost btn-icon btn-sm lightbox-close"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close image preview"
                title="Close"
              >
                <X strokeWidth={1.75} />
              </button>
            </div>
            <div className="lightbox-body">
              <img src={displayUrl} alt={fileName} className="lightbox-image" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
