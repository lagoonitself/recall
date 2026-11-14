import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { File as LibraryFile } from '@app/shared';
import { api } from '../lib/api';
import { UploadDropzone } from '../components/UploadDropzone';
export function CollectionPage() {
  const { id = '' } = useParams();
  const [name, setName] = useState('Collection');
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
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
              <span className="file-icon" aria-hidden="true">
                {{ pdf: '▤', image: '▧', audio: '♫', video: '▶', text: '≡' }[file.modality]}
              </span>
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
              <button
                className="icon-button"
                onClick={() => void remove(file)}
                aria-label={`Delete ${file.name}`}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
