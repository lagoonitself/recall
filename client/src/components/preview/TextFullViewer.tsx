import { useEffect, useState } from 'react';

export interface TextFullViewerProps {
  url: string;
  fileName: string;
  fallbackText?: string | null;
  onError: () => void;
}

export function TextFullViewer({ url, fileName, fallbackText, onError }: TextFullViewerProps) {
  const [content, setContent] = useState<string | null>(fallbackText ?? null);
  const [loading, setLoading] = useState(!fallbackText);

  useEffect(() => {
    let cancelled = false;

    async function fetchText() {
      if (fallbackText) {
        setContent(fallbackText);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not load text document.');
        const text = await res.text();
        if (!cancelled) {
          setContent(text);
        }
      } catch {
        if (!cancelled) {
          onError();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchText();
    return () => {
      cancelled = true;
    };
  }, [url, fallbackText, onError]);

  // Split into paragraphs preserving blank lines
  const paragraphs = content ? content.split(/\r?\n\r?\n/) : [];

  return (
    <div className="preview-text-full-viewport">
      <article className="preview-text-document" aria-label={`Text content of ${fileName}`}>
        {loading && (
          <div className="preview-text-skeleton-group">
            <div className="skeleton preview-text-skeleton-line" style={{ width: '80%' }} />
            <div className="skeleton preview-text-skeleton-line" style={{ width: '95%' }} />
            <div className="skeleton preview-text-skeleton-line" style={{ width: '88%' }} />
            <div className="skeleton preview-text-skeleton-line" style={{ width: '60%' }} />
          </div>
        )}

        {!loading && content && (
          <div className="preview-text-prose">
            {paragraphs.map((p, idx) => (
              <p key={idx} className="preview-text-paragraph">
                {p}
              </p>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
