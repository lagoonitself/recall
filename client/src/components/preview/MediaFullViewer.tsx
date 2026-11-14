import { AudioLines } from 'lucide-react';

export interface MediaFullViewerProps {
  url: string;
  modality: 'audio' | 'video';
  fileName: string;
  posterUrl?: string | null;
  onError: () => void;
}

export function MediaFullViewer({
  url,
  modality,
  fileName,
  posterUrl,
  onError,
}: MediaFullViewerProps) {
  if (modality === 'video') {
    return (
      <div className="preview-media-full-viewport">
        <video
          controls
          playsInline
          src={url}
          poster={posterUrl || undefined}
          className="preview-video-element"
          onError={onError}
          aria-label={`Video player for ${fileName}`}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  return (
    <div className="preview-media-full-viewport audio-viewport">
      <div className="preview-audio-card" role="region" aria-label={`Audio player for ${fileName}`}>
        <div className="preview-audio-icon-wrap" aria-hidden="true">
          <AudioLines size={44} strokeWidth={1.5} className="preview-audio-icon" />
        </div>
        <div className="preview-audio-info">
          <h3 className="preview-audio-title font-serif" title={fileName}>
            {fileName}
          </h3>
        </div>
        <audio
          controls
          src={url}
          className="preview-audio-element"
          onError={onError}
          aria-label={`Audio player for ${fileName}`}
        />
      </div>
    </div>
  );
}
