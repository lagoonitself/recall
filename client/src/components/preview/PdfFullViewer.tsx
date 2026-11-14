import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { setupPdfWorker } from './pdfWorker';

export interface PdfFullViewerProps {
  url: string;
  initialPage?: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  onTotalPages: (total: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  isFitWidth: boolean;
  onFitWidthToggle: (isFit: boolean) => void;
  isThumbnailsOpen: boolean;
  onToggleThumbnails: () => void;
  jumpTarget: number | null;
  onJumpTargetHandled: () => void;
  onError: () => void;
}

interface PageDimensions {
  width: number;
  height: number;
}

export function PdfFullViewer({
  url,
  initialPage,
  currentPage,
  onPageChange,
  totalPages,
  onTotalPages,
  scale,
  onScaleChange,
  isFitWidth,
  onFitWidthToggle,
  isThumbnailsOpen,
  jumpTarget,
  onJumpTargetHandled,
  onError,
}: PdfFullViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pageDimensions, setPageDimensions] = useState<PageDimensions>({ width: 612, height: 792 });
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [flashPage, setFlashPage] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const initialScrollDoneRef = useRef(false);

  // Initialize PDF worker & load document
  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import('pdfjs-dist')['getDocument']> | null = null;

    async function loadDocument() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const pdfjsLib = setupPdfWorker();
        loadingTask = pdfjsLib.getDocument({
          url,
          withCredentials: false,
        });

        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPdfDoc(doc);
        onTotalPages(doc.numPages);

        // Read page 1 dimensions for layout
        try {
          const firstPage = await doc.getPage(1);
          const viewport = firstPage.getViewport({ scale: 1 });
          setPageDimensions({ width: viewport.width, height: viewport.height });
        } catch {
          // Keep fallback dimensions
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Could not load PDF document.';
        setErrorMsg(msg);
        onError();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      try {
        const task = loadingTask as { destroy?: () => void } | null;
        task?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [url, onError, onTotalPages]);

  // Compute fit-width scale on container resize
  const updateFitWidth = useCallback(() => {
    if (!scrollViewportRef.current || !pageDimensions.width) return;
    const viewportWidth = scrollViewportRef.current.clientWidth;
    // Leave 32px padding on desktop / 16px on mobile
    const horizontalPadding = viewportWidth < 640 ? 16 : 48;
    const availableWidth = Math.max(160, viewportWidth - horizontalPadding);
    const newScale = Math.round((availableWidth / pageDimensions.width) * 100) / 100;
    const clamped = Math.max(0.5, Math.min(3.0, newScale));
    onScaleChange(clamped);
  }, [pageDimensions.width, onScaleChange]);

  useEffect(() => {
    if (isFitWidth && pdfDoc) {
      updateFitWidth();
    }
  }, [isFitWidth, pdfDoc, updateFitWidth]);

  // Listen to window resize for fit-width
  useEffect(() => {
    if (!isFitWidth) return;
    const handleResize = () => {
      updateFitWidth();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFitWidth, updateFitWidth]);

  // Jump to specific page
  const scrollToPage = useCallback(
    (pageNumber: number, smooth = true, flash = false) => {
      const el = pageRefs.current[pageNumber];
      if (!el || !scrollViewportRef.current) return;
      el.scrollIntoView?.({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'start',
      });
      if (flash) {
        setFlashPage(pageNumber);
        setTimeout(() => setFlashPage(null), 1500);
      }
    },
    [],
  );

  // Initial page scroll & flash
  useEffect(() => {
    if (!pdfDoc || initialScrollDoneRef.current) return;
    const target = initialPage && initialPage >= 1 && initialPage <= pdfDoc.numPages ? initialPage : 1;
    initialScrollDoneRef.current = true;
    if (target > 1) {
      setTimeout(() => {
        scrollToPage(target, false, true);
        onPageChange(target);
      }, 50);
    } else if (initialPage === 1) {
      setFlashPage(1);
      setTimeout(() => setFlashPage(null), 1500);
    }
  }, [pdfDoc, initialPage, scrollToPage, onPageChange]);

  // Handle external jump target (from header input / buttons)
  useEffect(() => {
    if (jumpTarget !== null) {
      scrollToPage(jumpTarget, true, true);
      onJumpTargetHandled();
    }
  }, [jumpTarget, scrollToPage, onJumpTargetHandled]);

  // Track visible pages & current page on scroll
  useEffect(() => {
    const scrollEl = scrollViewportRef.current;
    if (!scrollEl || !pdfDoc) return;

    // Intersection observer for lazy rendering
    if (typeof IntersectionObserver === 'undefined') {
      setVisiblePages(new Set(Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1)));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageNum = Number(entry.target.getAttribute('data-page-number'));
            if (!pageNum) continue;
            if (entry.isIntersecting) {
              next.add(pageNum);
              // Pre-buffer next & previous page
              if (pageNum > 1) next.add(pageNum - 1);
              if (pageNum < pdfDoc.numPages) next.add(pageNum + 1);
            }
          }
          return next;
        });
      },
      {
        root: scrollEl,
        rootMargin: '300px 0px',
        threshold: 0.01,
      },
    );

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const el = pageRefs.current[p];
      if (el) observer.observe(el);
    }

    // Scroll listener for calculating current page indicator
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!scrollEl) return;
        const containerRect = scrollEl.getBoundingClientRect();
        const triggerY = containerRect.top + containerRect.height / 3;

        let bestPage = 1;
        let minDistance = Infinity;

        for (let p = 1; p <= pdfDoc.numPages; p++) {
          const el = pageRefs.current[p];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.top <= triggerY && rect.bottom >= triggerY) {
            bestPage = p;
            break;
          }
          const dist = Math.abs(rect.top - triggerY);
          if (dist < minDistance) {
            minDistance = dist;
            bestPage = p;
          }
        }

        if (bestPage !== currentPage) {
          onPageChange(bestPage);
        }
      });
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      scrollEl.removeEventListener('scroll', handleScroll);
    };
  }, [pdfDoc, currentPage, onPageChange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const prev = Math.max(1, currentPage - 1);
        scrollToPage(prev, true);
        onPageChange(prev);
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        const next = Math.min(totalPages, currentPage + 1);
        scrollToPage(next, true);
        onPageChange(next);
      } else if (e.key === 'Home') {
        e.preventDefault();
        scrollToPage(1, true);
        onPageChange(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        scrollToPage(totalPages, true);
        onPageChange(totalPages);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onFitWidthToggle(false);
        onScaleChange(Math.min(3.0, Math.round((scale + 0.15) * 100) / 100));
      } else if (e.key === '-') {
        e.preventDefault();
        onFitWidthToggle(false);
        onScaleChange(Math.max(0.5, Math.round((scale - 0.15) * 100) / 100));
      } else if (e.key === '0') {
        e.preventDefault();
        onFitWidthToggle(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, scale, onScaleChange, onFitWidthToggle, scrollToPage, onPageChange]);

  const pageWidth = Math.round(pageDimensions.width * scale);
  const pageHeight = Math.round(pageDimensions.height * scale);

  return (
    <div className="pdf-full-viewer" ref={containerRef}>
      {/* Left thumbnail rail (collapsible) */}
      <aside
        className={`pdf-thumbnail-rail ${isThumbnailsOpen ? 'open' : 'closed'}`}
        aria-label="Page thumbnails"
        aria-hidden={!isThumbnailsOpen}
      >
        <div className="pdf-thumbnail-list">
          {pdfDoc &&
            Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((pageNum) => (
              <ThumbnailItem
                key={pageNum}
                pageNum={pageNum}
                pdfDoc={pdfDoc}
                isActive={pageNum === currentPage}
                onClick={() => {
                  scrollToPage(pageNum, true);
                  onPageChange(pageNum);
                }}
              />
            ))}
        </div>
      </aside>

      {/* Main continuous scroll viewport */}
      <div className="pdf-scroll-viewport" ref={scrollViewportRef}>
        {loading && (
          <div className="pdf-loading-state" role="status">
            <div className="pdf-loading-page skeleton" />
            <div className="pdf-loading-page skeleton" />
          </div>
        )}

        {errorMsg && !loading && (
          <div className="pdf-error-state" role="alert">
            <p className="pdf-error-text">{errorMsg}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setErrorMsg(null);
                setLoading(true);
                onError();
              }}
            >
              Retry
            </button>
          </div>
        )}

        {pdfDoc && (
          <div className="pdf-pages-track">
            {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                data-page-number={pageNum}
                ref={(el) => {
                  pageRefs.current[pageNum] = el;
                }}
                className={`pdf-page-container ${flashPage === pageNum ? 'pdf-page-flash' : ''}`}
                style={{ width: `${pageWidth}px`, minHeight: `${pageHeight}px` }}
              >
                <PdfPageCanvas
                  pdfDoc={pdfDoc}
                  pageNum={pageNum}
                  scale={scale}
                  isVisible={visiblePages.has(pageNum)}
                  width={pageWidth}
                  height={pageHeight}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNum: number;
  scale: number;
  isVisible: boolean;
  width: number;
  height: number;
}

function PdfPageCanvas({ pdfDoc, pageNum, scale, isVisible, width, height }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerInstanceRef = useRef<{ cancel?: () => void } | null>(null);

  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;

    async function renderPage() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }

        const renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (cancelled) return;

        // Render text layer for selection / copy
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          textLayerRef.current.style.width = `${viewport.width}px`;
          textLayerRef.current.style.height = `${viewport.height}px`;

          try {
            const pdfjsLib = setupPdfWorker();
            const textContent = await page.getTextContent();
            if (cancelled) return;

            if (textLayerInstanceRef.current?.cancel) {
              textLayerInstanceRef.current.cancel();
            }

            const textLayer = new pdfjsLib.TextLayer({
              textContentSource: textContent,
              container: textLayerRef.current,
              viewport,
            });
            textLayerInstanceRef.current = textLayer;
            await textLayer.render();
          } catch {
            // Text layer is progressive enhancement; ignore cancel/abort errors
          }
        }

        if (!cancelled) setRendered(true);
      } catch (err: unknown) {
        if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          // Ignored
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      if (textLayerInstanceRef.current?.cancel) {
        try {
          textLayerInstanceRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNum, scale, isVisible]);

  return (
    <div className="pdf-page-sheet" style={{ width: `${width}px`, height: `${height}px` }}>
      {!rendered && (
        <div className="pdf-page-placeholder skeleton">
          <span className="pdf-page-placeholder-num">{pageNum}</span>
        </div>
      )}
      <canvas ref={canvasRef} className={`pdf-canvas ${rendered ? 'visible' : 'hidden'}`} />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
}

interface ThumbnailItemProps {
  pageNum: number;
  pdfDoc: PDFDocumentProxy;
  isActive: boolean;
  onClick: () => void;
}

function ThumbnailItem({ pageNum, pdfDoc, isActive, onClick }: ThumbnailItemProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '150px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || rendered) return;

    let cancelled = false;

    async function renderThumbnail() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewportAtScale1 = page.getViewport({ scale: 1 });
        const thumbScale = 120 / viewportAtScale1.width;
        const viewport = page.getViewport({ scale: thumbScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        // Thumbnail is progressive enhancement
      }
    }

    void renderThumbnail();
    return () => {
      cancelled = true;
    };
  }, [isVisible, rendered, pdfDoc, pageNum]);

  return (
    <button
      type="button"
      ref={containerRef}
      className={`pdf-thumbnail-btn ${isActive ? 'active' : ''}`}
      onClick={onClick}
      aria-label={`Jump to page ${pageNum}`}
      title={`Page ${pageNum}`}
    >
      <div className="pdf-thumbnail-frame">
        {!rendered && <div className="pdf-thumbnail-skeleton skeleton" />}
        <canvas ref={canvasRef} className={`pdf-thumbnail-canvas ${rendered ? 'visible' : 'hidden'}`} />
      </div>
      <span className="pdf-thumbnail-num tabular">{pageNum}</span>
    </button>
  );
}
