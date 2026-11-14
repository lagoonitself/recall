import React, { memo, useMemo, useState, useRef, useCallback } from 'react';
import { LogoMark } from './brand/Logo';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Message, Source, AgentStep } from '@app/shared';
import { Copy, Check, RotateCcw, AlertCircle } from 'lucide-react';
import { ActivityLog, type ActivityStepData } from './ActivityLog';
import { SourcesSection } from './SourceCard';
import { ModalityIcon } from './messages/ModalityIcon';
import { CitationPopover } from './messages/CitationPopover';

export interface StreamingMessageState {
  id?: string;
  role: 'assistant';
  content: string;
  steps: ActivityStepData[];
  sources: Source[];
  isStreaming: boolean;
  error?: string | null;
  createdAt?: string;
}

export interface MessageListProps {
  messages: Message[];
  streamingMessage?: StreamingMessageState | null;
  streamingMessageId?: string | null;
  activeSourceSid?: string | null;
  onSelectSource?: (sid: string) => void;
  onRetry?: () => void;
}

function parseMarkdownWithCitations(content: string, sources: Source[] = []) {
  if (!content) return '';
  try {
    const rawHtml = DOMPurify.sanitize(marked.parse(content, { async: false }) as string, {
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
      FORBID_ATTR: ['style'],
    });

    // Replace [S1], [S2] clusters with tiny superscript-like citation pills
    return rawHtml.replace(/(?:\[S\d+\]\s*)+/g, (match) => {
      const sids = [...match.matchAll(/\[(S(\d+))\]/g)];
      const buttons = sids
        .map(([, sid, numStr]) => {
          const foundIdx = sources.findIndex((s) => s.sid === sid);
          const displayNum = foundIdx !== -1 ? foundIdx + 1 : parseInt(numStr, 10);
          return `<button type="button" class="citation-pill citation-chip" data-sid="${sid}" data-num="${displayNum}" aria-label="Source ${displayNum}" title="Source ${displayNum}">${displayNum}</button>`;
        })
        .join('');
      return `<span class="citation-group">${buttons}</span>`;
    });
  } catch {
    return DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });
  }
}

interface MessageItemProps {
  message: Message | StreamingMessageState;
  isStreaming: boolean;
  activeSourceSid: string | null;
  onSelectSource: (sid: string) => void;
  onRetry?: () => void;
}

const MessageItem = memo(function MessageItem({
  message,
  isStreaming,
  activeSourceSid,
  onSelectSource,
  onRetry,
}: MessageItemProps) {
  const isUser = message.role === 'user';
  const sources = ('sources' in message && Array.isArray(message.sources) ? message.sources : []) as Source[];
  const steps = ('steps' in message && Array.isArray(message.steps) ? message.steps : []) as (
    AgentStep | ActivityStepData
  )[];

  const [copied, setCopied] = useState(false);
  const [popover, setPopover] = useState<{
    source: Source;
    index: number;
    anchorRect: DOMRect;
  } | null>(null);

  const closeTimeoutRef = useRef<number | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is not available
    }
  }, [message.content]);

  const htmlContent = useMemo(
    () => parseMarkdownWithCitations(message.content, sources),
    [message.content, sources],
  );

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const pill = (e.target as HTMLElement).closest<HTMLButtonElement>('.citation-pill');
    if (!pill) return;
    const sid = pill.getAttribute('data-sid');
    if (!sid) return;

    onSelectSource(sid);
    setPopover(null);

    const el = document.getElementById(`source-${sid}`);
    if (el) {
      el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleOpenPopover = (source: Source, index: number, rect: DOMRect) => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setPopover({ source, index, anchorRect: rect });
  };

  const handleClosePopover = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setPopover(null);
    }, 150);
  };

  const handleMouseOverContent = (e: React.MouseEvent<HTMLDivElement>) => {
    const pill = (e.target as HTMLElement).closest<HTMLButtonElement>('.citation-pill');
    if (!pill) return;
    const sid = pill.getAttribute('data-sid');
    if (!sid) return;
    const source = sources.find((s) => s.sid === sid);
    if (!source) return;
    const index = sources.indexOf(source) + 1;
    handleOpenPopover(source, index, pill.getBoundingClientRect());
  };

  const handleMouseOutContent = (e: React.MouseEvent<HTMLDivElement>) => {
    const pill = (e.target as HTMLElement).closest<HTMLButtonElement>('.citation-pill');
    if (pill) {
      handleClosePopover();
    }
  };

  const handleFocusCaptureContent = (e: React.FocusEvent<HTMLDivElement>) => {
    const pill = (e.target as HTMLElement).closest<HTMLButtonElement>('.citation-pill');
    if (!pill) return;
    const sid = pill.getAttribute('data-sid');
    if (!sid) return;
    const source = sources.find((s) => s.sid === sid);
    if (!source) return;
    const index = sources.indexOf(source) + 1;
    handleOpenPopover(source, index, pill.getBoundingClientRect());
  };

  const handleBlurCaptureContent = () => {
    handleClosePopover();
  };

  const attachments = (
    message as unknown as { attachments?: Array<{ id: string; name: string; modality?: string }> }
  ).attachments;

  // 1. User Message
  if (isUser) {
    return (
      <article className="message-item user-message" aria-label="User message">
        {/* Attachments shown above the bubble as small tiles */}
        {attachments && attachments.length > 0 && (
          <div className="message-attachments-row" role="list" aria-label="Attachments">
            {attachments.map((att) => (
              <div key={att.id} className="attachment-tile" role="listitem">
                <ModalityIcon modality={att.modality} size={14} className="attachment-icon" />
                <span className="attachment-name" title={att.name}>
                  {att.name}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="user-bubble">
          <div className="user-bubble-text">{message.content}</div>
        </div>

        {/* Timestamp on hover */}
        {message.createdAt && (
          <time
            className="message-timestamp"
            dateTime={message.createdAt}
            title={new Date(message.createdAt).toLocaleString()}
          >
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        )}
      </article>
    );
  }

  // 2. Assistant Message
  const errorMessage = 'error' in message ? message.error : null;

  return (
    <article className="message-item assistant-message" aria-label="Recall assistant response">
      <div className="assistant-layout">
        {/* Small 20px accent "r" avatar mark */}
        <div className="assistant-avatar" aria-hidden="true">
          <LogoMark size={14} pulse={Boolean(isStreaming)} />
        </div>

        <div className="assistant-body">
          {/* (1) Activity */}
          {steps && steps.length > 0 && <ActivityLog steps={steps} isStreaming={isStreaming} />}

          {/* (2) Answer Prose */}
          <div
            className="prose-content"
            onClick={handleContentClick}
            onMouseOver={handleMouseOverContent}
            onMouseOut={handleMouseOutContent}
            onFocusCapture={handleFocusCaptureContent}
            onBlurCapture={handleBlurCaptureContent}
            aria-live={isStreaming ? 'polite' : 'off'}
          >
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
            {isStreaming && <span className="streaming-caret" aria-hidden="true" />}
          </div>

          {/* Quiet inline error */}
          {errorMessage && (
            <div className="message-error" role="alert">
              <AlertCircle size={14} className="message-error-icon" aria-hidden="true" />
              <span className="message-error-text">{errorMessage}</span>
              {onRetry && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost error-retry-btn"
                  onClick={onRetry}
                  aria-label="Retry answer"
                >
                  <RotateCcw size={13} strokeWidth={1.75} aria-hidden="true" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* (3) Sources */}
          {sources && sources.length > 0 && (
            <SourcesSection
              sources={sources}
              activeSourceSid={activeSourceSid}
              onSelectSource={onSelectSource}
            />
          )}

          {/* (4) Action row on hover/focus */}
          <div className="message-actions-row">
            <button
              type="button"
              className="btn btn-sm btn-ghost action-btn"
              onClick={handleCopy}
              aria-label={copied ? 'Copied answer to clipboard' : 'Copy answer'}
              title={copied ? 'Copied' : 'Copy'}
            >
              {copied ? (
                <Check size={13} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {!errorMessage && onRetry && (
              <button
                type="button"
                className="btn btn-sm btn-ghost action-btn"
                onClick={onRetry}
                aria-label="Retry response"
                title="Retry"
              >
                <RotateCcw size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Citation Popover */}
      {popover && (
        <CitationPopover
          source={popover.source}
          index={popover.index}
          anchorRect={popover.anchorRect}
          onOpen={() => {
            onSelectSource(popover.source.sid);
            setPopover(null);
            const el = document.getElementById(`source-${popover.source.sid}`);
            if (el) el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
          }}
          onClose={() => setPopover(null)}
          onMouseEnter={() => {
            if (closeTimeoutRef.current) {
              window.clearTimeout(closeTimeoutRef.current);
              closeTimeoutRef.current = null;
            }
          }}
          onMouseLeave={handleClosePopover}
        />
      )}
    </article>
  );
});

export function MessageList({
  messages,
  streamingMessage,
  streamingMessageId,
  activeSourceSid: externalActiveSid,
  onSelectSource: externalSelectSource,
  onRetry,
}: MessageListProps) {
  const [internalActiveSid, setInternalActiveSid] = useState<string | null>(null);

  const activeSourceSid = externalActiveSid !== undefined ? externalActiveSid : internalActiveSid;
  const onSelectSource = useCallback(
    (sid: string) => {
      if (externalSelectSource) {
        externalSelectSource(sid);
      } else {
        setInternalActiveSid((prev) => (prev === sid ? null : sid));
      }
    },
    [externalSelectSource],
  );

  return (
    <div className="message-list" role="region" aria-label="Conversation messages">
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          isStreaming={msg.id === streamingMessageId}
          activeSourceSid={activeSourceSid}
          onSelectSource={onSelectSource}
          onRetry={onRetry}
        />
      ))}

      {streamingMessage && (
        <MessageItem
          key={streamingMessage.id || 'streaming-active'}
          message={streamingMessage}
          isStreaming={streamingMessage.isStreaming}
          activeSourceSid={activeSourceSid}
          onSelectSource={onSelectSource}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}
