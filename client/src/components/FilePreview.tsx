import { useCallback, useEffect, useRef, useState } from 'react';
import type { File as LibraryFile } from '@app/shared';
import { api } from '../lib/api';

/**
 * Full-screen preview of one library file. Owned by the preview agent.
 * Contract (keep stable — Collection page and SourceCard depend on it):
 *   <FilePreview file={LibraryFile} initialPage?={number} onClose={() => void} />
 */
export interface FilePreviewProps {
  file: LibraryFile;
  /** 1-based page to open a PDF at (from a citation). */
  initialPage?: number;
  onClose: () => void;
}

export function FilePreview({ file, onClose }: FilePreviewProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const retriedRef = useRef(false);

  const fetchMedia = useCallback(async () => {
    if (!file.previewChunkId) return;
    setLoading(true);
    setError(null);
    try {
      if (file.modality === 'pdf') {
        try {
          const thumb = await api.chunkMedia(file.previewChunkId, true);
          setMediaUrl(thumb.url);
        } catch {
          const full = await api.chunkMedia(file.previewChunkId, false);
          setMediaUrl(full.url);
        }
      } else if (file.modality === 'text') {
        const res = await api.chunkMedia(file.previewChunkId, false);
        setMediaUrl(res.url);
        const textRes = await fetch(res.url);
        if (!textRes.ok) throw new Error('Could not load text snippet.');
        const text = await textRes.text();
        setTextContent(text);
      } else {
        const res = await api.chunkMedia(file.previewChunkId, false);
        setMediaUrl(res.url);
        if (file.modality === 'video') {
          api
            .chunkMedia(file.previewChunkId, true)
            .then((thumb) => setVideoPosterUrl(thumb.url))
            .catch(() => {});
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load preview.');
    } finally {
      setLoading(false);
    }
  }, [file]);

  useEffect(() => {
    retriedRef.current = false;
    void fetchMedia();
  }, [fetchMedia]);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleMediaError = () => {
    if (!retriedRef.current) {
      retriedRef.current = true;
      void fetchMedia();
    } else {
      setError('Media failed to load.');
    }
  };

  return (
    <div className="preview-backdrop" onClick={onClose} role="presentation">
      <div
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="preview-header">
          <div>
            <h3 id="preview-title">{file.name}</h3>
            <p>
              {file.modality.toUpperCase()} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            ref={closeBtnRef}
            className="icon-button"
            onClick={onClose}
            aria-label="Close preview"
          >
            ×
          </button>
        </div>
        <div className="preview-body">
          {loading ? (
            <p className="muted">Loading preview…</p>
          ) : error ? (
            <div>
              <p className="error" role="alert">
                {error}
              </p>
              <button
                type="button"
                className="button secondary preview-action"
                onClick={() => void fetchMedia()}
              >
                Retry
              </button>
            </div>
          ) : file.modality === 'image' && mediaUrl ? (
            <img src={mediaUrl} alt={file.name} className="preview-media-image" onError={handleMediaError} />
          ) : file.modality === 'pdf' && mediaUrl ? (
            <img
              src={mediaUrl}
              alt={`Page of ${file.name}`}
              className="preview-media-image preview-pdf-image"
              onError={handleMediaError}
            />
          ) : file.modality === 'audio' && mediaUrl ? (
            <div className="preview-audio-container">
              <span className="preview-audio-icon" aria-hidden="true">
                ♫
              </span>
              <audio
                controls
                src={mediaUrl}
                className="preview-media-audio"
                autoPlay={false}
                onError={handleMediaError}
              />
            </div>
          ) : file.modality === 'video' && mediaUrl ? (
            <video
              controls
              src={mediaUrl}
              poster={videoPosterUrl || undefined}
              className="preview-media-video"
              autoPlay={false}
              onError={handleMediaError}
            />
          ) : file.modality === 'text' && textContent !== null ? (
            <div className="preview-text-container">
              <pre className="preview-text-content">
                <code>{textContent}</code>
              </pre>
            </div>
          ) : (
            <p className="muted">No preview available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
