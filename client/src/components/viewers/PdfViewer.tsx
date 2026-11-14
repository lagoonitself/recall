import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { api } from '../../lib/api';
import { setupPdfWorker } from '../preview/pdfWorker';

export interface PdfViewerProps {
  chunkId: string;
  page?: number;
  thumbUrl?: string | null;
  fileName: string;
  onOpenDocument?: () => void;
}

export function PdfViewer({ chunkId, page = 1, thumbUrl, fileName, onOpenDocument }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  // Fetch signed media URL (expires in 10 min, refetch on error)
  const loadMediaUrl = async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await api.chunkMedia(chunkId, false);
      setMediaUrl(res.url);
    } catch {
      setError('Could not load PDF document.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMediaUrl();
  }, [chunkId]);

  // Attempt to render the specific page with pdfjs-dist when mediaUrl is ready
  useEffect(() => {
    if (!mediaUrl || !canvasRef.current) return;

    const currentUrl = mediaUrl;
    let cancelled = false;

    async function renderPage() {
      try {
        const pdfjsLib = setupPdfWorker();
        const loadingTask = pdfjsLib.getDocument({ url: currentUrl, withCredentials: false });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const targetPage = Math.min(Math.max(1, page), pdf.numPages);
        const pdfPage = await pdf.getPage(targetPage);
        if (cancelled || !canvasRef.current) return;

        const containerWidth = containerRef.current?.clientWidth || 540;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(1.5, Math.max(0.6, containerWidth / baseViewport.width));
        const viewport = pdfPage.getViewport({ scale });

        const canvas = canvasRef.current;
        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        const context = canvas.getContext('2d');
        if (!context) return;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.scale(dpr, dpr);

        const renderContext = {
          canvas,
          canvasContext: context,
          viewport,
        };

        await pdfPage.render(renderContext).promise;
        if (!cancelled) {
          setRendered(true);
        }
      } catch {
        if (!cancelled) {
          setRendered(false);
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [mediaUrl, page]);

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {loading && !thumbUrl && !rendered && (
        <div className="viewer-loading skeleton" aria-label={`Loading page ${page}`}>
          <span className="visually-hidden">Loading page {page}…</span>
        </div>
      )}

      {error && (
        <div className="viewer-error" role="alert">
          <p className="viewer-error-text">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadMediaUrl()}>
            Retry
          </button>
        </div>
      )}

      <span className="visually-hidden">Page {page}</span>

      {/* Show page thumbnail first while rendering or as fallback */}
      {thumbUrl && !rendered && (
        <div className="pdf-thumb-wrapper">
          <img src={thumbUrl} alt={`${fileName} page ${page}`} className="pdf-thumb-img" loading="lazy" />
        </div>
      )}

      <div className={`canvas-wrapper ${rendered ? 'visible' : 'hidden'}`}>
        <canvas ref={canvasRef} />
      </div>

      {onOpenDocument && (
        <div className="pdf-viewer-footer">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenDocument}
            aria-label={`Open full document for ${fileName}`}
          >
            <Maximize2 strokeWidth={1.75} />
            <span>Open full document</span>
          </button>
        </div>
      )}
    </div>
  );
}
