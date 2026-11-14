import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { Paperclip, ArrowUp, Square, X, FileText, Video, Music, File as FileIcon } from 'lucide-react';

const MAX_ATTACHMENTS = 3;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_DURATION_SEC = 80;

export interface ComposerProps {
  onSend: (text: string, files: File[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
}

export function Composer({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dragCounterRef = useRef(0);
  const objectUrlsRef = useRef<Map<File, string>>(new Map());

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 24), 180)}px`;
    }
  }, [text]);

  // Manage object URLs for image thumbnails and revoke them properly
  useEffect(() => {
    const currentUrls = objectUrlsRef.current;
    const currentFilesSet = new Set(files);

    // Revoke removed files
    for (const [file, url] of currentUrls.entries()) {
      if (!currentFilesSet.has(file)) {
        URL.revokeObjectURL(url);
        currentUrls.delete(file);
      }
    }

    // Create object URLs for new image files
    for (const file of files) {
      if (file.type.startsWith('image/') && !currentUrls.has(file)) {
        currentUrls.set(file, URL.createObjectURL(file));
      }
    }

    return () => {
      // Clean up on unmount
      for (const url of currentUrls.values()) {
        URL.revokeObjectURL(url);
      }
      currentUrls.clear();
    };
  }, [files]);

  async function processAttachment(file: File): Promise<File> {
    const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
    let prepared = file;

    if (isHeic) {
      try {
        const { default: convert } = await import('heic2any');
        const result = await convert({ blob: file, toType: 'image/jpeg' });
        const blob = Array.isArray(result) ? result[0] : result;
        prepared = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
          type: 'image/jpeg',
        });
      } catch {
        throw new Error(`Failed to convert HEIC image: ${file.name}`);
      }
    }

    if (prepared.type.startsWith('video/')) {
      const url = URL.createObjectURL(prepared);
      try {
        const duration = await new Promise<number>((resolve, reject) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => resolve(video.duration);
          video.onerror = () => reject(new Error(`Could not read video duration: ${prepared.name}`));
          video.src = url;
        });
        if (!Number.isFinite(duration) || duration > MAX_VIDEO_DURATION_SEC) {
          throw new Error(
            `Video "${prepared.name}" exceeds the ${MAX_VIDEO_DURATION_SEC}s limit (${Math.round(duration)}s).`,
          );
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    return prepared;
  }

  async function handleAddFiles(newFileList: FileList | File[] | null) {
    if (!newFileList || newFileList.length === 0) return;
    setError(null);

    const incoming = Array.from(newFileList);
    if (files.length + incoming.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }

    try {
      const processed: File[] = [];
      for (const f of incoming) {
        processed.push(await processAttachment(f));
      }

      const combined = [...files, ...processed];
      const totalSize = combined.reduce((acc, f) => acc + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        setError(
          `Attachments total ${(totalSize / 1024 / 1024).toFixed(1)} MB (limit: 20 MB). Please choose smaller files.`,
        );
        return;
      }

      setFiles(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error processing attachment.');
    }
  }

  function handleRemoveFile(index: number) {
    setFiles((prev) => {
      const target = prev[index];
      if (target) {
        const url = objectUrlsRef.current.get(target);
        if (url) {
          URL.revokeObjectURL(url);
          objectUrlsRef.current.delete(target);
        }
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      void handleAddFiles(e.clipboardData.files);
    }
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleAddFiles(e.dataTransfer.files);
    }
  }

  function handleSubmit() {
    if (isStreaming || disabled) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;

    onSend(trimmed, files);
    setText('');
    setFiles([]);
    setError(null);
  }

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/')) return Video;
    if (file.type.startsWith('audio/')) return Music;
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return FileText;
    if (
      file.type.startsWith('text/') ||
      file.name.endsWith('.docx') ||
      file.name.endsWith('.md')
    ) {
      return FileText;
    }
    return FileIcon;
  };

  const canSend = !disabled && !isStreaming && (text.trim().length > 0 || files.length > 0);

  return (
    <div className="composer-container">
      <div
        className={`composer-box ${isDragging ? 'dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Attachment chips row */}
        {files.length > 0 && (
          <div className="composer-attachments" role="list" aria-label="Attached files">
            {files.map((file, idx) => {
              const isImage = file.type.startsWith('image/');
              const thumbUrl = objectUrlsRef.current.get(file);
              const Icon = getFileIcon(file);

              return (
                <div
                  className="composer-attachment-tile"
                  key={`${file.name}-${idx}`}
                  role="listitem"
                  title={`${file.name} (${formatFileSize(file.size)})`}
                >
                  {isImage && thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={file.name}
                      className="composer-tile-thumb"
                    />
                  ) : (
                    <div className="composer-tile-file">
                      <Icon className="composer-tile-icon" strokeWidth={1.75} aria-hidden="true" />
                      <span className="composer-tile-name">{file.name}</span>
                      <span className="composer-tile-size">{formatFileSize(file.size)}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="composer-tile-remove"
                    onClick={() => handleRemoveFile(idx)}
                    aria-label={`Remove ${file.name}`}
                    title={`Remove ${file.name}`}
                  >
                    <X className="composer-remove-icon" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          className="composer-textarea"
          placeholder="Ask about your library…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isStreaming}
          aria-label="Message text"
        />

        {/* Footer row */}
        <div className="composer-footer">
          <div className="composer-actions-left">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,application/pdf,text/*,.docx,.md"
              multiple
              className="visually-hidden"
              id="file-attachment-input"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                void handleAddFiles(e.target.files);
                e.target.value = '';
              }}
              disabled={disabled || isStreaming || files.length >= MAX_ATTACHMENTS}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm composer-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isStreaming || files.length >= MAX_ATTACHMENTS}
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="composer-action-icon" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="composer-hint" aria-hidden="true">
            Enter to send · Shift+Enter for new line
          </div>

          <div className="composer-actions-right">
            {isStreaming ? (
              <button
                type="button"
                className="btn btn-primary composer-stop-btn"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="composer-stop-icon" strokeWidth={2} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary composer-send-btn"
                onClick={handleSubmit}
                disabled={!canSend}
                aria-label="Send message"
                title="Send message"
              >
                <ArrowUp className="composer-send-icon" strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error under composer */}
      {error && (
        <div className="composer-error" role="alert">
          <span className="composer-error-text">{error}</span>
          <button
            type="button"
            className="composer-dismiss-btn"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            title="Dismiss error"
          >
            <X className="composer-dismiss-icon" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
