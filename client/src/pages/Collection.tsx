import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { File as LibraryFile } from '@app/shared';
import { api } from '../lib/api';
import { UploadDropzone } from '../components/UploadDropzone';

function FileThumbnail({ file, onClick }: { file: LibraryFile; onClick: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const icon = { pdf: '▤', image: '▥', audio: '♫', video: '▶', text: '≡' }[file.modality];
  const canPreview = file.status === 'ready' && Boolean(file.previewChunkId);
  const hasThumb =
    canPreview && (file.modality === 'pdf' || file.modality === 'image' || file.modality === 'video');

  useEffect(() => {
    if (!hasThumb || !file.previewChunkId) return;
    let active = true;
    api
      .chunkMedia(file.previewChunkId, true)
      .then((res) => {
        if (active) setThumbUrl(res.url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [hasThumb, file.previewChunkId]);

  return (
    <button
      type="button"
      className="file-thumb-btn"
      onClick={canPreview ? onClick : undefined}
      disabled={!canPreview}
      aria-label={canPreview ? `Preview ${file.name}` : undefined}
    >
      {thumbUrl && !failed ? (
        <img src={thumbUrl} alt="" className="file-thumb-img" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{icon}</span>
      )}
    </button>
  );
}

function FilePreviewModal({ file, onClose }: { file: LibraryFile; onClose: () => void }) {
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

export function CollectionPage() {
  const { id = '' } = useParams();
  const [name, setName] = useState('Collection');
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await api.files(id);
      setFiles(response.files);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load files.');
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
    api
      .collections()
      .then(({ collections }) =>
        setName(collections.find((collection) => collection.id === id)?.name || 'Collection'),
      )
      .catch(() => {});
  }, [id, load]);
  useEffect(() => {
    if (!files.some((file) => !['ready', 'failed'].includes(file.status))) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 3000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [files, load]);
  async function remove(file: LibraryFile) {
    if (!window.confirm(`Delete “${file.name}”?`)) return;
    try {
      await api.deleteFile(file.id);
      if (previewFile?.id === file.id) setPreviewFile(null);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete file.');
    }
  }
  return (
    <main className="container">
      <Link className="back-link" to="/">
        ← All collections
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR LIBRARY / COLLECTION</p>
          <h1>{name}</h1>
          <p className="muted">Your source material, all in one place.</p>
        </div>
      </div>
      <UploadDropzone collectionId={id} onUploaded={() => void load()} />
      <div className="section-title">
        <h2>Files</h2>
        <span>{files.length} total</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading files…</p>
      ) : files.length === 0 ? (
        <div className="empty compact">
          <h3>Nothing here yet.</h3>
          <p>Add a file to give this collection a starting point.</p>
        </div>
      ) : (
        <div className="file-list">
          {files.map((file) => (
            <article className="file-row" key={file.id}>
              <FileThumbnail file={file} onClick={() => setPreviewFile(file)} />
              <div className="file-info">
                <strong>{file.name}</strong>
                <span>
                  {file.modality.toUpperCase()} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
                </span>
                {file.piecesTotal !== null && file.status === 'processing' && (
                  <>
                    <progress
                      max={file.piecesTotal || 1}
                      value={file.piecesDone}
                      aria-label={`Processing ${file.name}`}
                    />
                    <span>
                      {file.piecesDone} / {file.piecesTotal} pieces
                    </span>
                  </>
                )}
                {file.error && <span className="error">{file.error}</span>}
              </div>
              <span className={`status ${file.status}`}>{file.status}</span>
              <div className="file-actions">
                {file.status === 'ready' && file.previewChunkId && (
                  <button
                    type="button"
                    className="button secondary preview-action"
                    onClick={() => setPreviewFile(file)}
                    aria-label={`Preview ${file.name}`}
                  >
                    Preview
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void remove(file)}
                  aria-label={`Delete ${file.name}`}
                >
                  ×
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </main>
  );
}
