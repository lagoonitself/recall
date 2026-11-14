import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import type { Conversation, Collection, Message, SseEvent } from '@app/shared';
import { api, ApiError } from '../lib/api';
import { streamMessage } from '../lib/sse';
import { MessageList, type StreamingMessageState } from '../components/MessageList';
import { Composer } from '../components/Composer';
import type { ActivityStepData } from '../components/ActivityLog';

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  // Navigation & collections state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Active chat state
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Streaming state
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessageState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSubmissionRef = useRef<{ text: string; files: File[] } | null>(null);

  // Auto-scroll anchor
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    scrollEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  // Load conversations list and collections
  const loadInitialData = useCallback(async () => {
    try {
      const [convRes, collRes] = await Promise.all([api.conversations(), api.collections()]);
      setConversations(convRes.conversations);
      setCollections(collRes.collections);
    } catch {
      // Ignored if unauthenticated or network error
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Load active conversation detail
  const loadConversation = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const detail = await api.conversation(id);
      setCurrentConversation(detail.conversation);
      setMessages(detail.messages);
      setSelectedCollectionId(detail.conversation.collectionId ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Conversation not found.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not load conversation.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (conversationId) {
      void loadConversation(conversationId);
    } else {
      setCurrentConversation(null);
      setMessages([]);
      setError(null);
    }
  }, [conversationId, loadConversation]);

  // Scroll to bottom when new messages or tokens arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage?.content]);

  // Stop active stream
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (streamingMessage) {
      setStreamingMessage((prev) => (prev ? { ...prev, isStreaming: false } : null));
    }
  };

  // Send message and stream response
  const handleSend = async (text: string, files: File[]) => {
    setError(null);
    lastSubmissionRef.current = { text, files };

    let targetConvId = conversationId;

    // Create conversation first if not in an existing one
    if (!targetConvId) {
      try {
        const res = await api.createConversation(selectedCollectionId);
        targetConvId = res.conversation.id;
        setCurrentConversation(res.conversation);
        setConversations((prev) => [res.conversation, ...prev]);
        navigate(`/chat/${targetConvId}`, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create conversation.');
        return;
      }
    }

    // Optimistically add user message to list
    const tempUserMessage: Message = {
      id: crypto.randomUUID(),
      conversationId: targetConvId,
      role: 'user',
      content: text,
      attachments: files.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        mimeType: f.type || 'application/octet-stream',
        modality: f.type.startsWith('image/')
          ? 'image'
          : f.type.startsWith('video/')
            ? 'video'
            : f.type.startsWith('audio/')
              ? 'audio'
              : f.type === 'application/pdf'
                ? 'pdf'
                : 'text',
      })),
      sources: [],
      steps: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMessage]);

    // Initialize streaming message
    const initialStreamingState: StreamingMessageState = {
      role: 'assistant',
      content: '',
      steps: [],
      sources: [],
      isStreaming: true,
      error: null,
    };
    setStreamingMessage(initialStreamingState);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const stepsMap = new Map<number, ActivityStepData>();

    const handleEvent = (event: SseEvent) => {
      switch (event.event) {
        case 'step.start': {
          stepsMap.set(event.data.seq, {
            seq: event.data.seq,
            kind: event.data.kind,
            reasoningText: '',
          });
          setStreamingMessage((prev) => (prev ? { ...prev, steps: Array.from(stepsMap.values()) } : null));
          break;
        }
        case 'reasoning.delta': {
          const step = stepsMap.get(event.data.seq);
          if (step) {
            step.reasoningText = (step.reasoningText || '') + event.data.text;
            setStreamingMessage((prev) => (prev ? { ...prev, steps: Array.from(stepsMap.values()) } : null));
          }
          break;
        }
        case 'tool.call': {
          const step = stepsMap.get(event.data.seq);
          if (step) {
            step.toolName = event.data.name;
            step.toolArgs = event.data.args;
            setStreamingMessage((prev) => (prev ? { ...prev, steps: Array.from(stepsMap.values()) } : null));
          }
          break;
        }
        case 'tool.result': {
          const step = stepsMap.get(event.data.seq);
          if (step) {
            step.toolSummary = event.data.summary;
            step.toolItems = event.data.items;
            setStreamingMessage((prev) => (prev ? { ...prev, steps: Array.from(stepsMap.values()) } : null));
          }
          break;
        }
        case 'step.end': {
          const step = stepsMap.get(event.data.seq);
          if (step) {
            step.ms = event.data.ms;
            setStreamingMessage((prev) => (prev ? { ...prev, steps: Array.from(stepsMap.values()) } : null));
          }
          break;
        }
        case 'answer.delta': {
          setStreamingMessage((prev) => (prev ? { ...prev, content: prev.content + event.data.text } : null));
          break;
        }
        case 'sources': {
          setStreamingMessage((prev) => (prev ? { ...prev, sources: event.data } : null));
          break;
        }
        case 'done': {
          const finalMsgId = event.data.messageId;
          setStreamingMessage((prev) => {
            if (!prev) return null;
            const completedMsg: Message = {
              id: finalMsgId,
              conversationId: targetConvId,
              role: 'assistant',
              content: prev.content,
              attachments: [],
              sources: prev.sources,
              steps: prev.steps.map((s, idx) => ({
                id: idx + 1,
                seq: s.seq,
                kind: s.kind,
                payload: {
                  text: s.reasoningText,
                  name: s.toolName,
                  args: s.toolArgs,
                  summary: s.toolSummary,
                  items: s.toolItems,
                },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              })),
              createdAt: new Date().toISOString(),
            };
            setMessages((existing) => [...existing, completedMsg]);
            return null;
          });
          abortControllerRef.current = null;
          void loadInitialData();
          break;
        }
        case 'error': {
          setStreamingMessage((prev) =>
            prev
              ? {
                  ...prev,
                  isStreaming: false,
                  error: event.data.message,
                }
              : null,
          );
          abortControllerRef.current = null;
          break;
        }
      }
    };

    try {
      await streamMessage({
        conversationId: targetConvId,
        text,
        files,
        signal: controller.signal,
        onEvent: handleEvent,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        // Handled via handleStop
        return;
      }
      setStreamingMessage((prev) =>
        prev
          ? {
              ...prev,
              isStreaming: false,
              error: err instanceof Error ? err.message : 'Stream failed.',
            }
          : null,
      );
    }
  };

  const handleRetry = () => {
    if (lastSubmissionRef.current) {
      const { text, files } = lastSubmissionRef.current;
      void handleSend(text, files);
    }
  };

  const handleNewChat = () => {
    navigate('/chat');
    setSidebarOpen(false);
  };

  const selectedCollectionName = collections.find((c) => c.id === selectedCollectionId)?.name;

  return (
    <div className="chat-layout">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="chat-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* Conversations sidebar */}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Conversations">
        <div className="sidebar-top">
          <button type="button" className="button primary new-chat-btn" onClick={handleNewChat}>
            + New Chat
          </button>
          <button
            type="button"
            className="icon-button close-sidebar-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations menu"
          >
            ✕
          </button>
        </div>

        <div className="conversation-list" role="navigation" aria-label="Recent chats">
          <p className="eyebrow sidebar-eyebrow">RECENT CHATS</p>
          {conversations.length === 0 ? (
            <p className="muted sidebar-empty">No conversations yet.</p>
          ) : (
            conversations.map((conv) => (
              <Link
                key={conv.id}
                to={`/chat/${conv.id}`}
                className={`conversation-item ${conv.id === conversationId ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="conv-title">{conv.title || 'Untitled conversation'}</span>
                <span className="conv-date">
                  {new Date(conv.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </Link>
            ))
          )}
        </div>
      </aside>

      {/* Main chat column */}
      <main className="chat-main">
        {/* Top header bar */}
        <header className="chat-header">
          <button
            type="button"
            className="icon-button mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversation history"
          >
            ☰
          </button>

          <div className="chat-header-info">
            <h1 className="chat-title">{currentConversation?.title || 'Recall Assistant'}</h1>
            <span className="chat-scope-badge">
              {selectedCollectionName ? `📁 ${selectedCollectionName}` : '🌐 All collections'}
            </span>
          </div>

          {/* Collection picker */}
          <div className="chat-collection-picker">
            <label htmlFor="collection-select" className="visually-hidden">
              Scope search to collection
            </label>
            <select
              id="collection-select"
              className="collection-select"
              value={selectedCollectionId ?? ''}
              onChange={(e) => setSelectedCollectionId(e.target.value || null)}
              disabled={Boolean(conversationId && messages.length > 0)}
              aria-label="Filter context by collection"
            >
              <option value="">All Collections</option>
              {collections.map((coll) => (
                <option key={coll.id} value={coll.id}>
                  {coll.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Content & messages thread */}
        <div className="chat-thread-container">
          {error && (
            <div className="chat-alert error-alert" role="alert">
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="chat-loading-state">
              <p>Loading messages…</p>
            </div>
          ) : messages.length === 0 && !streamingMessage ? (
            <div className="chat-empty-state">
              <div className="empty-icon" aria-hidden="true">
                💬
              </div>
              <h2>Ask your library anything</h2>
              <p className="muted">
                Recall retrieves exact passages, audio snippets, video frames, and manual pages. Attach
                photos, voice notes, or documents to search multimodal source material.
              </p>
              <div className="empty-suggestions">
                <button
                  type="button"
                  className="suggestion-chip"
                  onClick={() => void handleSend('What warning lights are in my vehicle manual?', [])}
                >
                  "What warning lights are in my vehicle manual?"
                </button>
                <button
                  type="button"
                  className="suggestion-chip"
                  onClick={() =>
                    void handleSend('Explain the maintenance procedure for checking coolant', [])
                  }
                >
                  "Explain the maintenance procedure for checking coolant"
                </button>
              </div>
            </div>
          ) : (
            <MessageList messages={messages} streamingMessage={streamingMessage} onRetry={handleRetry} />
          )}

          <div ref={scrollEndRef} className="scroll-anchor" />
        </div>

        {/* Bottom Composer */}
        <div className="chat-composer-section">
          <Composer
            onSend={(text, files) => void handleSend(text, files)}
            onStop={handleStop}
            isStreaming={streamingMessage?.isStreaming ?? false}
          />
        </div>
      </main>
    </div>
  );
}
