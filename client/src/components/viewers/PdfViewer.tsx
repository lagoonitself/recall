import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

export interface PdfViewerProps {
  chunkId: string;
  page?: number;
  thumbUrl?: string | null;
  fileName: string;
}

export function PdfViewer({ chunkId, page = 1, thumbUrl, fileName }: PdfViewerProps) {
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
        const pdfjsLib = await import('pdfjs-dist');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        const loadingTask = pdfjsLib.getDocument({ url: currentUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const targetPage = Math.min(Math.max(1, page), pdf.numPages);
        const pdfPage = await pdf.getPage(targetPage);
        if (cancelled || !canvasRef.current) return;

        const viewport = pdfPage.getViewport({ scale: 1.2 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport,
          canvas,
        };

        await pdfPage.render(renderContext).promise;
        if (!cancelled) {
          setRendered(true);
        }
      } catch {
        // Fallback to thumbnail or embed if canvas rendering is not supported in environment
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
    <div className="pdf-viewer">
      <div className="viewer-header">
        <span className="badge">Page {page}</span>
        {mediaUrl && (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="external-link"
            aria-label={`Open ${fileName} in new tab`}
          >
            Open PDF ↗
          </a>
        )}
      </div>

      {loading && !thumbUrl && <div className="viewer-loading">Loading page {page}…</div>}

      {error && (
        <div className="viewer-error" role="alert">
          <p>{error}</p>
          <button className="button secondary compact-btn" onClick={() => void loadMediaUrl()}>
            Retry
          </button>
        </div>
      )}

      {/* Show page thumbnail first while rendering or as fallback */}
      {thumbUrl && !rendered && (
        <div className="pdf-thumb-wrapper">
          <img src={thumbUrl} alt={`${fileName} page ${page}`} className="pdf-thumb-img" loading="lazy" />
        </div>
      )}

      <div className={`canvas-wrapper ${rendered ? 'visible' : 'hidden'}`}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
