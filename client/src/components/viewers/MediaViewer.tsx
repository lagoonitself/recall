import { useEffect, useRef, useState } from 'react';
import type { Location } from '@app/shared';
import { Play } from 'lucide-react';
import { api } from '../../lib/api';

export interface MediaViewerProps {
  modality: 'audio' | 'video';
  chunkId: string;
  location: Location;
  fileName: string;
  thumbUrl?: string | null;
}

function formatTime(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MediaViewer({ modality, chunkId, location, fileName, thumbUrl }: MediaViewerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSec = location.startSec ?? 0;
  const endSec = location.endSec;

  const loadMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.chunkMedia(chunkId, false);
      setMediaUrl(res.url);
    } catch {
      setError(`Could not load ${modality}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, [chunkId]);

  const seekToStart = () => {
    const el = modality === 'video' ? videoRef.current : audioRef.current;
    if (el) {
      el.currentTime = startSec;
      void el.play().catch(() => {});
    }
  };

  const handleLoadedMetadata = () => {
    const el = modality === 'video' ? videoRef.current : audioRef.current;
    if (el && startSec > 0) {
      el.currentTime = startSec;
    }
  };

  return (
    <div className="media-viewer">
      <div className="media-viewer-header">
        <button
          type="button"
          onClick={seekToStart}
          className="btn btn-secondary btn-sm media-timestamp-btn"
          title={`Seek to ${formatTime(startSec)}`}
        >
          <Play size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>
            Starts at {formatTime(startSec)}
            {endSec !== undefined ? ` – ${formatTime(endSec)}` : ''}
          </span>
        </button>
      </div>

      {loading && <div className="viewer-loading skeleton" />}

      {error && (
        <div className="viewer-error" role="alert">
          <p className="viewer-error-text">{error}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadMedia()}
          >
            Refresh link
          </button>
        </div>
      )}

      {mediaUrl && modality === 'video' && (
        <video
          ref={videoRef}
          controls
          playsInline
          poster={thumbUrl || undefined}
          src={mediaUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onError={() => void loadMedia()}
          className="media-player video-player"
          aria-label={`Video clip: ${fileName}`}
        >
          <track kind="captions" />
        </video>
      )}

      {mediaUrl && modality === 'audio' && (
        <div className="audio-player-wrapper">
          {thumbUrl && <img src={thumbUrl} alt="" className="audio-artwork" aria-hidden="true" />}
          <audio
            ref={audioRef}
            controls
            src={mediaUrl}
            onLoadedMetadata={handleLoadedMetadata}
            onError={() => void loadMedia()}
            className="media-player audio-player"
            aria-label={`Audio clip: ${fileName}`}
          />
        </div>
      )}
    </div>
  );
}
