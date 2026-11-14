import { useEffect, useState } from 'react';
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxOpen) {
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
            🔍 Click to enlarge
          </span>
        </button>
      ) : loading ? (
        <div className="viewer-loading">Loading image…</div>
      ) : null}

      {error && (
        <div className="viewer-error" role="alert">
          <p>{error}</p>
          <button className="button secondary compact-btn" onClick={() => void loadMedia()}>
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
              <span className="lightbox-title">{fileName}</span>
              <button
                type="button"
                className="icon-button lightbox-close"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close image lightbox"
              >
                ✕
              </button>
            </div>
            <img src={displayUrl} alt={fileName} className="lightbox-image" />
          </div>
        </div>
      )}
    </div>
  );
}
