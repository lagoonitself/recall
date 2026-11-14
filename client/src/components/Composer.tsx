import { useState, useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';

const MAX_ATTACHMENTS = 3;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_DURATION_SEC = 80;

export interface ComposerProps {
  onSend: (text: string, files: File[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
}

export function Composer({ onSend, onStop, isStreaming = false, disabled = false }: ComposerProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  // Clean up recording timer and stream on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

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

  async function handleAddFiles(newFileList: FileList | null) {
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
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function startRecording() {
    setError(null);
    if (files.length >= MAX_ATTACHMENTS) {
      setError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setIsRecording(false);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setError('Microphone access was denied or is unavailable.');
      setIsRecording(false);
    }
  }

  function stopAndSaveRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    mediaRecorderRef.current.onstop = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setIsRecording(false);

      const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mime });
      const voiceFile = new File([audioBlob], `voice-note-${Date.now()}.${ext}`, { type: mime });

      const combined = [...files, voiceFile];
      const totalSize = combined.reduce((acc, f) => acc + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        setError('Recorded audio exceeds the 20 MB message limit.');
        return;
      }
      setFiles(combined);
    };

    mediaRecorderRef.current.stop();
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setIsRecording(false);
        audioChunksRef.current = [];
      };
      mediaRecorderRef.current.stop();
    } else {
      setIsRecording(false);
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;

    onSend(trimmed, files);
    setText('');
    setFiles([]);
    setError(null);
  }

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="composer-container">
      {error && (
        <div className="composer-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="composer-dismiss-btn"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="attachment-chips" role="list" aria-label="Attached files">
          {files.map((file, idx) => (
            <div className="attachment-chip" key={`${file.name}-${idx}`} role="listitem">
              <span className="chip-icon" aria-hidden="true">
                {file.type.startsWith('image/')
                  ? '🖼️'
                  : file.type.startsWith('video/')
                    ? '🎬'
                    : file.type.startsWith('audio/')
                      ? '🎧'
                      : file.type === 'application/pdf'
                        ? '📄'
                        : '📝'}
              </span>
              <span className="chip-name" title={file.name}>
                {file.name}
              </span>
              <span className="chip-size">
                ({(file.size / 1024 / (file.size > 1024 * 1024 ? 1024 : 1)).toFixed(1)}{' '}
                {file.size > 1024 * 1024 ? 'MB' : 'KB'})
              </span>
              <button
                type="button"
                className="chip-remove-btn"
                onClick={() => handleRemoveFile(idx)}
                aria-label={`Remove attachment ${file.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {isRecording ? (
        <div className="recording-bar" role="status" aria-live="polite">
          <div className="recording-pulse-wrapper">
            <span className="recording-dot" />
            <span className="recording-label">Recording voice note</span>
            <span className="recording-timer">{formatTimer(recordSeconds)}</span>
          </div>

          <div className="recording-actions">
            <button
              type="button"
              className="button secondary compact-btn cancel-record-btn"
              onClick={cancelRecording}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary compact-btn done-record-btn"
              onClick={stopAndSaveRecording}
            >
              Done ✓
            </button>
          </div>
        </div>
      ) : (
        <form
          className="composer-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div className="composer-input-row">
            <textarea
              ref={textareaRef}
              rows={1}
              className="composer-textarea"
              placeholder="Ask anything about your library or attachments…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled || isStreaming}
              aria-label="Message text"
            />

            <div className="composer-controls">
              {/* Photo picker */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="visually-hidden"
                id="photo-picker"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  void handleAddFiles(e.target.files);
                  e.target.value = '';
                }}
                disabled={disabled || isStreaming || files.length >= MAX_ATTACHMENTS}
              />
              <button
                type="button"
                className="icon-button composer-tool-btn"
                onClick={() => photoInputRef.current?.click()}
                disabled={disabled || isStreaming || files.length >= MAX_ATTACHMENTS}
                aria-label="Add photo attachment"
                title="Add photo"
              >
                📷
              </button>

              {/* General file picker */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf,text/*,.docx,.md"
                multiple
                className="visually-hidden"
                id="file-picker"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  void handleAddFiles(e.target.files);
                  e.target.value = '';
                }}
                disabled={disabled || isStreaming || files.length >= MAX_ATTACHMENTS}
              />
              <button
                type="button"
                className="icon-button composer-tool-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isStreaming || files.length >= MAX_ATTACHMENTS}
                aria-label="Attach documents, audio, or video"
                title="Attach file"
              >
                📎
              </button>

              {/* Voice recording button */}
              <button
                type="button"
                className="icon-button composer-tool-btn"
                onClick={() => void startRecording()}
                disabled={disabled || isStreaming || files.length >= MAX_ATTACHMENTS}
                aria-label="Record voice note"
                title="Record voice note"
              >
                🎙️
              </button>

              {/* Submit or Stop button */}
              {isStreaming ? (
                <button
                  type="button"
                  className="button stop-btn"
                  onClick={onStop}
                  aria-label="Stop generation"
                  title="Stop generating response"
                >
                  <span className="stop-square" /> Stop
                </button>
              ) : (
                <button
                  type="submit"
                  className="button primary send-btn"
                  disabled={disabled || (!text.trim() && files.length === 0)}
                  aria-label="Send message"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
