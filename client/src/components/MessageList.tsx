import React, { memo, useCallback, useMemo, useState } from 'react';
import type { Message, Source, AgentStep } from '@app/shared';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ActivityLog, type ActivityStepData } from './ActivityLog';
import { SourceCard } from './SourceCard';

export interface StreamingMessageState {
  role: 'assistant';
  content: string;
  steps: ActivityStepData[];
  sources: Source[];
  isStreaming: boolean;
  error?: string | null;
}

export interface MessageListProps {
  messages: Message[];
  streamingMessage?: StreamingMessageState | null;
  onRetry?: () => void;
}

// Custom hook / helper to convert markdown to HTML with clickable citation chips
function useMarkdownWithCitations(content: string) {
  return useMemo(() => {
    if (!content) return '';
    try {
      // Answers and user text are untrusted (an uploaded file can steer the model): sanitize before rendering.
      const rawHtml = DOMPurify.sanitize(marked.parse(content, { async: false }) as string, {
        FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
        FORBID_ATTR: ['style'],
      });
      // Replace [S1], [S2], [S#] with clickable citation button elements
      return rawHtml.replace(
        /\[(S\d+)\]/g,
        '<button type="button" class="citation-chip" data-sid="$1" aria-label="View cited source $1">[$1]</button>',
      );
    } catch {
      return DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });
    }
  }, [content]);
}

interface MessageItemProps {
  message: Message | StreamingMessageState;
  isStreaming?: boolean;
  onRetry?: () => void;
  activeSourceSid: string | null;
  onSelectSource: (sid: string) => void;
}

const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
  onRetry,
  activeSourceSid,
  onSelectSource,
}: MessageItemProps) {
  const isUser = message.role === 'user';
  const htmlContent = useMarkdownWithCitations(message.content);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.citation-chip');
    if (target) {
      const sid = target.getAttribute('data-sid');
      if (sid) {
        onSelectSource(sid);
      }
    }
  };

  const steps = 'steps' in message ? message.steps : [];
  const sources = 'sources' in message ? message.sources : [];
  const attachments = 'attachments' in message ? message.attachments : [];
  const error = 'error' in message ? message.error : null;

  return (
    <article
      className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}
      aria-label={`${isUser ? 'User' : 'Assistant'} message`}
    >
      <header className="message-header">
        <span className="message-role-label">{isUser ? 'You' : 'Recall Agent'}</span>
        {'createdAt' in message && message.createdAt && (
          <time className="message-time" dateTime={message.createdAt}>
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        )}
      </header>

      {/* User attachments */}
      {isUser && attachments && attachments.length > 0 && (
        <div className="message-attachments" role="list" aria-label="Message attachments">
          {attachments.map((att) => (
            <div className="attachment-chip" key={att.id} role="listitem">
              <span className="chip-icon" aria-hidden="true">
                {{ pdf: '📄', image: '🖼️', audio: '🎧', video: '🎬', text: '📝' }[att.modality] || '📎'}
              </span>
              <span className="chip-name">{att.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Assistant activity log */}
      {!isUser && steps && steps.length > 0 && (
        <ActivityLog steps={steps as (AgentStep | ActivityStepData)[]} isStreaming={isStreaming} />
      )}

      {/* Content body */}
      <div
        className="message-content"
        onClick={handleContainerClick}
        aria-live={isStreaming ? 'polite' : 'off'}
        aria-atomic="false"
      >
        {isUser ? (
          <p className="user-text">{message.content}</p>
        ) : (
          <div className="prose-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
        )}
      </div>

      {/* Error and retry state */}
      {error && (
        <div className="message-error-card" role="alert">
          <p className="error">{error}</p>
          {onRetry && (
            <button type="button" className="button secondary compact-btn retry-btn" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      {/* Sources cards section */}
      {!isUser && sources && sources.length > 0 && (
        <section className="message-sources-section" aria-label="Cited sources">
          <h4 className="sources-heading">Sources</h4>
          <div className="sources-grid">
            {sources.map((src) => (
              <SourceCard
                key={src.sid}
                source={src}
                isActive={activeSourceSid === src.sid}
                onOpen={() => onSelectSource(src.sid)}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  );
});

export function MessageList({ messages, streamingMessage, onRetry }: MessageListProps) {
  const [activeSourceSid, setActiveSourceSid] = useState<string | null>(null);

  const handleSelectSource = useCallback((sid: string) => {
    setActiveSourceSid((prev) => (prev === sid ? null : sid));
  }, []);

  return (
    <div className="message-list-container" role="feed" aria-label="Chat messages">
      {/* Polite live region announcing streaming state */}
      <div className="visually-hidden" aria-live="polite" aria-atomic="false">
        {streamingMessage?.isStreaming ? 'Recall agent is generating a response…' : ''}
      </div>

      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          activeSourceSid={activeSourceSid}
          onSelectSource={handleSelectSource}
        />
      ))}

      {streamingMessage && (
        <MessageItem
          key="streaming-active"
          message={streamingMessage}
          isStreaming={streamingMessage.isStreaming}
          onRetry={onRetry}
          activeSourceSid={activeSourceSid}
          onSelectSource={handleSelectSource}
        />
      )}
    </div>
  );
}
