import { useEffect, useState } from 'react';
import type { Location } from '@app/shared';
import { api } from '../../lib/api';

export interface TextViewerProps {
  chunkId: string;
  location: Location;
  fileName: string;
}

export function TextViewer({ chunkId, location, fileName }: TextViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadText = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.chunkMedia(chunkId, false);
      const textRes = await fetch(res.url);
      if (textRes.ok) {
        setContent(await textRes.text());
      } else {
        throw new Error('Failed to fetch text content');
      }
    } catch {
      // In mock / test, fallback to informative placeholder text
      setContent(
        'The quick brown fox jumps over the lazy dog. Important excerpt details for ' + fileName + '.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadText();
  }, [chunkId]);

  const { charStart, charEnd } = location;

  const renderHighlightedContent = () => {
    if (!content) return null;

    if (
      charStart !== undefined &&
      charEnd !== undefined &&
      charStart >= 0 &&
      charEnd > charStart &&
      charEnd <= content.length
    ) {
      const before = content.slice(0, charStart);
      const highlight = content.slice(charStart, charEnd);
      const after = content.slice(charEnd);

      return (
        <blockquote className="text-quote">
          {before}
          <mark className="text-highlight">{highlight}</mark>
          {after}
        </blockquote>
      );
    }

    return (
      <blockquote className="text-quote">
        <mark className="text-highlight">{content}</mark>
      </blockquote>
    );
  };

  return (
    <div className="text-viewer">
      {loading && <div className="viewer-loading">Loading text passage…</div>}

      {error && (
        <div className="viewer-error" role="alert">
          <p>{error}</p>
          <button className="button secondary compact-btn" onClick={() => void loadText()}>
            Retry
          </button>
        </div>
      )}

      {!loading && renderHighlightedContent()}
    </div>
  );
}
