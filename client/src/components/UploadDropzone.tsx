import { useRef, useState, type DragEvent } from 'react';
import { api, upload } from '../lib/api';
const limit = 50 * 1024 * 1024;
export async function prepareFile(file: File): Promise<File> {
  if (!file.size || file.size > limit) throw new Error(`${file.name}: choose a file up to 50 MB.`);
  const heic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
  if (!heic && !/^(image\/|audio\/|video\/|text\/|application\/pdf$)/.test(file.type))
    throw new Error(`${file.name}: this file type is not supported.`);
  if (file.type.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error(`${file.name}: could not read video duration.`));
        video.src = url;
      });
      if (!Number.isFinite(duration) || duration > 80)
        throw new Error(`${file.name}: video must be 80 seconds or shorter.`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (heic) {
    const { default: convert } = await import('heic2any');
    const result = await convert({ blob: file, toType: 'image/jpeg' });
    const blob = Array.isArray(result) ? result[0] : result;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  }
  return file;
}
export function UploadDropzone({
  collectionId,
  onUploaded,
}: {
  collectionId: string;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  async function handle(files: FileList | File[]) {
    setBusy(true);
    setMessage('');
    const errors: string[] = [];
    for (const original of Array.from(files)) {
      try {
        const file = await prepareFile(original);
        const signed = await api.uploadUrl({
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          collectionId,
        });
        await upload(signed.url, signed.headers, file, (percent) => setProgress(`${file.name}: ${percent}%`));
        await api.complete(signed.fileId);
        onUploaded();
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Upload failed.');
      }
    }
    setProgress('');
    setMessage(errors.join(' '));
    setBusy(false);
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!busy) void handle(event.dataTransfer.files);
  }
  return (
    <section
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      aria-label="Upload files"
    >
      <span className="upload-icon" aria-hidden="true">
        ↑
      </span>
      <h2>Add to your collection</h2>
      <p>Drop files here, or choose them from your device.</p>
      <button className="button secondary" disabled={busy} onClick={() => input.current?.click()}>
        Choose files
      </button>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        multiple
        accept="image/*,audio/*,video/*,text/*,application/pdf,.heic,.heif"
        onChange={(event) => {
          if (event.target.files) void handle(event.target.files);
          event.target.value = '';
        }}
      />
      <small>PDF, images, audio, video or text · Up to 50 MB each · Video up to 80 sec</small>
      <p aria-live="polite">{progress}</p>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
    </section>
  );
}
