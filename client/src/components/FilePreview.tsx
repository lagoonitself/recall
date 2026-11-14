import { useCallback, useEffect, useRef, useState } from 'react';
import type { File as LibraryFile } from '@app/shared';
import {
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  AudioLines,
  FileCode,
  PanelLeft,
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Download,
  ExternalLink,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { PdfFullViewer } from './preview/PdfFullViewer';
import { ImageFullViewer } from './preview/ImageFullViewer';
import { MediaFullViewer } from './preview/MediaFullViewer';
import { TextFullViewer } from './preview/TextFullViewer';

/**
 * Full-screen document viewer for Recall.
 * Contract:
 *   <FilePreview file={LibraryFile} initialPage?={number} onClose={() => void} />
 */
export interface FilePreviewProps {
  file: LibraryFile;
  /** 1-based page to open a PDF at (from a citation). */
  initialPage?: number;
  onClose: () => void;
}

export function FilePreview({ file, initialPage, onClose }: FilePreviewProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF-specific state
  const [currentPage, setCurrentPage] = useState(initialPage && initialPage >= 1 ? initialPage : 1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pdfScale, setPdfScale] = useState<number>(1.0);
  const [isPdfFitWidth, setIsPdfFitWidth] = useState<boolean>(true);
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState<boolean>(true);
  const [pageInputVal, setPageInputVal] = useState<string>(String(initialPage || 1));
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);

  // Image-specific state
  const [imageScale, setImageScale] = useState<number>(1.0);
  const [isImageFit, setIsImageFit] = useState<boolean>(true);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const retriedRef = useRef(false);

  const handleTotalPages = useCallback((total: number) => {
    setTotalPages(total);
    setCurrentPage((page) => (total > 0 && page > total ? 1 : page));
  }, []);

  // Keep input value in sync with currentPage
  useEffect(() => {
    setPageInputVal(String(currentPage));
  }, [currentPage]);

  // Fetch signed media URL (tries original fileMedia, falls back to chunkMedia)
  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    let resolvedUrl: string | null = null;

    try {
      // 1. Try fileMedia for the full original document
      try {
        const fullMedia = await api.fileMedia(file.id);
        if (fullMedia?.url) {
          resolvedUrl = fullMedia.url;
        }
      } catch {
        // Fall back to chunk-based media if fileMedia fails or isn't available
      }

      // 2. If fileMedia failed, fall back to chunk media
      if (!resolvedUrl && file.previewChunkId) {
        if (file.modality === 'pdf') {
          try {
            const chunkDoc = await api.chunkDocument(file.previewChunkId);
            if (chunkDoc?.url) resolvedUrl = chunkDoc.url;
          } catch {
            const chunkRes = await api.chunkMedia(file.previewChunkId, false);
            resolvedUrl = chunkRes.url;
          }
        } else {
          const chunkRes = await api.chunkMedia(file.previewChunkId, false);
          resolvedUrl = chunkRes.url;
        }
      }

      if (!resolvedUrl) {
        throw new Error('No preview available for this file.');
      }

      setMediaUrl(resolvedUrl);

      // If video, try to get poster thumbnail
      if (file.modality === 'video' && file.previewChunkId) {
        api
          .chunkMedia(file.previewChunkId, true)
          .then((thumb) => setVideoPosterUrl(thumb.url))
          .catch(() => {});
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

  const handleMediaError = useCallback(() => {
    if (!retriedRef.current) {
      retriedRef.current = true;
      void fetchMedia();
    } else {
      setError('Media failed to load.');
    }
  }, [fetchMedia]);

  // Download original file using signed URL
  const handleDownload = async () => {
    if (!mediaUrl) return;
    try {
      const res = await fetch(mediaUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(mediaUrl, '_blank');
    }
  };

  // Focus trap, lock body scroll, Escape key, and restore focus on close
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      openerRef.current?.focus();
    };
  }, [onClose]);

  // Page input handlers
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputVal(e.target.value);
  };

  const handlePageInputSubmit = () => {
    const val = parseInt(pageInputVal, 10);
    if (!isNaN(val) && val >= 1 && (!totalPages || val <= totalPages)) {
      setJumpTarget(val);
      setCurrentPage(val);
    } else {
      setPageInputVal(String(currentPage));
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePageInputSubmit();
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const prev = currentPage - 1;
      setJumpTarget(prev);
      setCurrentPage(prev);
    }
  };

  const handleNextPage = () => {
    if (!totalPages || currentPage < totalPages) {
      const next = currentPage + 1;
      setJumpTarget(next);
      setCurrentPage(next);
    }
  };

  // PDF zoom handlers
  const handlePdfZoomIn = () => {
    setIsPdfFitWidth(false);
    setPdfScale((s) => Math.min(3.0, Math.round((s + 0.15) * 100) / 100));
  };

  const handlePdfZoomOut = () => {
    setIsPdfFitWidth(false);
    setPdfScale((s) => Math.max(0.5, Math.round((s - 0.15) * 100) / 100));
  };

  const handlePdfFitWidth = () => {
    setIsPdfFitWidth(true);
  };

  // Image zoom handlers
  const handleImageZoomIn = () => {
    setIsImageFit(false);
    setImageScale((s) => Math.min(3.0, Math.round((s + 0.2) * 100) / 100));
  };

  const handleImageZoomOut = () => {
    setIsImageFit(false);
    setImageScale((s) => Math.max(0.5, Math.round((s - 0.2) * 100) / 100));
  };

  const handleImageFit = () => {
    setIsImageFit(true);
    setImageScale(1.0);
  };

  // Modality Icon selection
  const renderModalityIcon = () => {
    switch (file.modality) {
      case 'pdf':
        return <FileText size={18} strokeWidth={1.75} className="preview-modality-icon" aria-hidden="true" />;
      case 'image':
        return (
          <ImageIcon size={18} strokeWidth={1.75} className="preview-modality-icon" aria-hidden="true" />
        );
      case 'video':
        return (
          <VideoIcon size={18} strokeWidth={1.75} className="preview-modality-icon" aria-hidden="true" />
        );
      case 'audio':
        return (
          <AudioLines size={18} strokeWidth={1.75} className="preview-modality-icon" aria-hidden="true" />
        );
      case 'text':
      default:
        return <FileCode size={18} strokeWidth={1.75} className="preview-modality-icon" aria-hidden="true" />;
    }
  };

  const sizeLabel = !file.sizeBytes
    ? ''
    : file.sizeBytes < 1024
      ? `${file.sizeBytes} B`
      : file.sizeBytes < 1024 * 1024
        ? `${Math.round(file.sizeBytes / 1024)} KB`
        : `${(file.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  const metadataLabel =
    file.modality === 'pdf' && totalPages > 0
      ? [`PDF`, `${totalPages} ${totalPages === 1 ? 'page' : 'pages'}`, sizeLabel].filter(Boolean).join(' · ')
      : [file.modality.toUpperCase(), sizeLabel].filter(Boolean).join(' · ');

  return (
    <div className="preview-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="preview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar (56px) */}
        <header className="preview-header">
          <div className="preview-header-meta-group">
            {renderModalityIcon()}
            <div className="preview-header-titles">
              <h2 id="preview-title" className="preview-title font-serif" title={file.name}>
                {file.name}
              </h2>
              <span className="preview-meta">{metadataLabel}</span>
            </div>
          </div>

          <div className="preview-header-controls">
            {/* PDF Toolbar Controls */}
            {file.modality === 'pdf' && (
              <>
                <button
                  type="button"
                  className={`btn btn-ghost btn-icon btn-sm ${isThumbnailsOpen ? 'active' : ''}`}
                  onClick={() => setIsThumbnailsOpen(!isThumbnailsOpen)}
                  aria-label="Toggle page thumbnails"
                  title="Toggle thumbnails"
                  aria-pressed={isThumbnailsOpen}
                >
                  <PanelLeft strokeWidth={1.75} />
                </button>

                <div className="preview-controls-divider" aria-hidden="true" />

                <div className="preview-page-controls">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                    title="Previous page"
                  >
                    <ChevronUp strokeWidth={1.75} />
                  </button>

                  <div className="preview-page-indicator">
                    <span>Page</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pageInputVal}
                      onChange={handlePageInputChange}
                      onKeyDown={handlePageInputKeyDown}
                      onBlur={handlePageInputSubmit}
                      className="input preview-page-input tabular"
                      aria-label="Current page number"
                    />
                    <span>of {totalPages || '…'}</span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={handleNextPage}
                    disabled={Boolean(totalPages && currentPage >= totalPages)}
                    aria-label="Next page"
                    title="Next page"
                  >
                    <ChevronDown strokeWidth={1.75} />
                  </button>
                </div>

                <div className="preview-controls-divider" aria-hidden="true" />

                <div className="preview-zoom-controls">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={handlePdfZoomOut}
                    disabled={pdfScale <= 0.5}
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <ZoomOut strokeWidth={1.75} />
                  </button>
                  <span className="preview-zoom-label tabular">{Math.round(pdfScale * 100)}%</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={handlePdfZoomIn}
                    disabled={pdfScale >= 3.0}
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <ZoomIn strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost btn-icon btn-sm ${isPdfFitWidth ? 'active' : ''}`}
                    onClick={handlePdfFitWidth}
                    aria-label="Fit to width"
                    title="Fit to width"
                  >
                    <Maximize strokeWidth={1.75} />
                  </button>
                </div>

                <div className="preview-controls-divider" aria-hidden="true" />
              </>
            )}

            {/* Image Toolbar Controls */}
            {file.modality === 'image' && (
              <>
                <div className="preview-zoom-controls">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={handleImageZoomOut}
                    disabled={imageScale <= 0.5}
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <ZoomOut strokeWidth={1.75} />
                  </button>
                  <span className="preview-zoom-label tabular">
                    {isImageFit ? 'Fit' : `${Math.round(imageScale * 100)}%`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={handleImageZoomIn}
                    disabled={imageScale >= 3.0}
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <ZoomIn strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost btn-icon btn-sm ${isImageFit ? 'active' : ''}`}
                    onClick={handleImageFit}
                    aria-label="Fit to screen"
                    title="Fit to screen"
                  >
                    <Maximize strokeWidth={1.75} />
                  </button>
                </div>

                <div className="preview-controls-divider" aria-hidden="true" />
              </>
            )}

            {/* Common Document Actions */}
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={handleDownload}
              aria-label={`Download ${file.name}`}
              title="Download file"
              disabled={!mediaUrl}
            >
              <Download strokeWidth={1.75} />
            </button>

            {mediaUrl && (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Open ${file.name} in new tab`}
                title="Open in new tab"
              >
                <ExternalLink strokeWidth={1.75} />
              </a>
            )}

            <button
              type="button"
              ref={closeBtnRef}
              className="btn btn-ghost btn-icon btn-sm preview-close-button"
              onClick={onClose}
              aria-label="Close preview"
              title="Close preview"
            >
              <X strokeWidth={1.75} />
            </button>
          </div>
        </header>

        {/* Content body */}
        <div className="preview-content-area">
          {loading && !mediaUrl ? (
            <div className="preview-loading-state" role="status">
              <div className="skeleton preview-skeleton-card" />
            </div>
          ) : error ? (
            <div className="preview-error-state" role="alert">
              <p className="preview-error-message">{error}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchMedia()}>
                Retry
              </button>
            </div>
          ) : file.modality === 'pdf' && mediaUrl ? (
            <PdfFullViewer
              url={mediaUrl}
              initialPage={initialPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              totalPages={totalPages}
              onTotalPages={handleTotalPages}
              scale={pdfScale}
              onScaleChange={setPdfScale}
              isFitWidth={isPdfFitWidth}
              onFitWidthToggle={setIsPdfFitWidth}
              isThumbnailsOpen={isThumbnailsOpen}
              onToggleThumbnails={() => setIsThumbnailsOpen(!isThumbnailsOpen)}
              jumpTarget={jumpTarget}
              onJumpTargetHandled={() => setJumpTarget(null)}
              onError={handleMediaError}
            />
          ) : file.modality === 'image' && mediaUrl ? (
            <ImageFullViewer
              url={mediaUrl}
              fileName={file.name}
              scale={imageScale}
              onScaleChange={setImageScale}
              isFit={isImageFit}
              onFitChange={setIsImageFit}
              onError={handleMediaError}
            />
          ) : (file.modality === 'video' || file.modality === 'audio') && mediaUrl ? (
            <MediaFullViewer
              url={mediaUrl}
              modality={file.modality}
              fileName={file.name}
              posterUrl={videoPosterUrl}
              onError={handleMediaError}
            />
          ) : file.modality === 'text' && mediaUrl ? (
            <TextFullViewer url={mediaUrl} fileName={file.name} onError={handleMediaError} />
          ) : (
            <div className="preview-empty-state">
              <p className="preview-empty-message">No preview available for this file.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
