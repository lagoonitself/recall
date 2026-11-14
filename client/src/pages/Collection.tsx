import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronRight,
  MessageSquare,
  Upload,
  Eye,
  Trash2,
  FileText,
  Image as ImageIcon,
  AudioLines,
  Video as VideoIcon,
  File as FileIcon,
} from 'lucide-react';
import type { File as LibraryFile, Modality } from '@app/shared';
import { api } from '../lib/api';
import { UploadDropzone } from '../components/UploadDropzone';
import { FilePreview } from '../components/FilePreview';
import { ConfirmDialog } from '../components/library/ConfirmDialog';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ModalityIcon({ modality }: { modality: Modality }) {
  switch (modality) {
    case 'pdf':
      return <FileText size={18} strokeWidth={1.75} />;
    case 'image':
      return <ImageIcon size={18} strokeWidth={1.75} />;
    case 'audio':
      return <AudioLines size={18} strokeWidth={1.75} />;
    case 'video':
      return <VideoIcon size={18} strokeWidth={1.75} />;
    case 'text':
    default:
      return <FileIcon size={18} strokeWidth={1.75} />;
  }
}

function FileThumbnail({
  file,
  onClick,
}: {
  file: LibraryFile;
  onClick: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
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

  if (canPreview) {
    return (
      <button
        type="button"
        className="file-thumbnail-box clickable"
        onClick={onClick}
        aria-label={`Preview ${file.name}`}
        title={`Preview ${file.name}`}
      >
        {thumbUrl && !failed ? (
          <img
            src={thumbUrl}
            alt=""
            className="file-thumbnail-img"
            onError={() => setFailed(true)}
          />
        ) : (
          <ModalityIcon modality={file.modality} />
        )}
      </button>
    );
  }

  return (
    <div className="file-thumbnail-box" aria-hidden="true">
      <ModalityIcon modality={file.modality} />
    </div>
  );
}

export function CollectionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [name, setName] = useState('Collection');
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);
  const [deletingFile, setDeletingFile] = useState<LibraryFile | null>(null);
  const [filterText, setFilterText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.files(id);
      setFiles(response.files);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load files.');
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

  // Poll while files are processing
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

  async function handleDeleteFile() {
    if (!deletingFile) return;
    try {
      await api.deleteFile(deletingFile.id);
      if (previewFile?.id === deletingFile.id) setPreviewFile(null);
      setDeletingFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete file.');
    }
  }

  const filteredFiles = filterText.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(filterText.toLowerCase().trim()))
    : files;

  return (
    <main className="collection-page">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="collection-breadcrumbs">
        <Link to="/" className="breadcrumb-link">
          Library
        </Link>
        <ChevronRight size={14} className="breadcrumb-separator" />
        <span className="breadcrumb-current">{name}</span>
      </nav>

      {/* Title row */}
      <div className="collection-title-row">
        <div className="collection-title-group">
          <h1 className="collection-title">{name}</h1>
          {!loading && (
            <span className="library-count">
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </span>
          )}
        </div>

        <div className="collection-actions">
          <Link to="/chat" className="btn btn-secondary">
            <MessageSquare size={16} strokeWidth={1.75} />
            <span>Ask this collection</span>
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} strokeWidth={1.75} />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Dropzone component (manages file picker, empty compact box, and full-page drag overlay) */}
      <UploadDropzone
        collectionId={id}
        collectionName={name}
        hasFiles={files.length > 0}
        onUploaded={() => void load()}
        inputRef={fileInputRef}
        onUploadingChange={(uploading, progress) => {
          setIsUploading(uploading);
          setUploadProgressText(progress);
        }}
      />

      {error && (
        <div role="alert" className="badge badge-danger" style={{ marginBottom: 'var(--space-4)', display: 'block' }}>
          {error}
        </div>
      )}

      {/* Filter bar when file count > 5 */}
      {files.length > 5 && (
        <div className="files-filter-bar">
          <input
            type="search"
            className="input"
            placeholder="Filter files..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
      )}

      {/* File List / Loading Skeletons */}
      {loading ? (
        <div className="file-list" aria-label="Loading files">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="file-row" style={{ height: 60 }}>
              <div className="file-thumbnail-box skeleton" />
              <div className="file-info">
                <div className="skeleton" style={{ width: 140, height: 16, marginBottom: 4 }} />
                <div className="skeleton" style={{ width: 80, height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      ) : files.length > 0 ? (
        <div className="file-list" role="list">
          {isUploading && (
            <div className="upload-progress-row">
              <span className="spinner" style={{ width: 14, height: 14 }} />
              <span>{uploadProgressText || 'Uploading…'}</span>
            </div>
          )}

          {filteredFiles.map((file) => {
            const canPreview = file.status === 'ready' && Boolean(file.previewChunkId);
            const isProcessing = file.status === 'processing';
            const isFailed = file.status === 'failed';
            const isReady = file.status === 'ready';

            return (
              <div
                key={file.id}
                role="listitem"
                className={`file-row ${canPreview ? 'file-row-interactive' : ''}`}
                onClick={(e) => {
                  // If user clicked row background or text (not an action button)
                  const target = e.target as HTMLElement;
                  if (!target.closest('button') && canPreview) {
                    setPreviewFile(file);
                  }
                }}
              >
                {/* 40px Thumbnail */}
                <FileThumbnail file={file} onClick={() => setPreviewFile(file)} />

                {/* Name & metadata */}
                <div className="file-info">
                  {canPreview ? (
                    <button
                      type="button"
                      className="file-name-btn"
                      onClick={() => setPreviewFile(file)}
                      aria-label={`Preview ${file.name}`}
                    >
                      {file.name}
                    </button>
                  ) : (
                    <span className="file-name-static">{file.name}</span>
                  )}
                  <span className="file-meta">
                    {file.modality.toUpperCase()} · {formatFileSize(file.sizeBytes)}
                  </span>
                  {file.error && (
                    <span className="file-meta" style={{ color: 'var(--color-danger)' }}>
                      {file.error}
                    </span>
                  )}
                </div>

                {/* Status dot / badge */}
                <div className="file-status-cell">
                  {isReady && <span className="file-ready-dot" title="Ready" />}
                  {isProcessing && (
                    <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                      <span className="spinner" style={{ width: 12, height: 12 }} />
                      <span>
                        {file.piecesTotal != null
                          ? `Processing ${file.piecesDone ?? 0}/${file.piecesTotal}`
                          : 'Processing'}
                      </span>
                    </span>
                  )}
                  {isFailed && (
                    <span className="badge badge-danger" title={file.error || 'Failed'}>
                      Failed
                    </span>
                  )}
                </div>

                {/* Hover / Focus Actions */}
                <div className="file-actions-cell">
                  {canPreview && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => setPreviewFile(file)}
                      aria-label={`Preview ${file.name}`}
                      title={`Preview ${file.name}`}
                    >
                      <Eye size={16} strokeWidth={1.75} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setDeletingFile(file)}
                    aria-label={`Delete ${file.name}`}
                    title={`Delete ${file.name}`}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Delete file confirmation dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingFile)}
        title="Delete file"
        description={`Are you sure you want to delete “${deletingFile?.name}”? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => void handleDeleteFile()}
        onClose={() => setDeletingFile(null)}
      />

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </main>
  );
}
