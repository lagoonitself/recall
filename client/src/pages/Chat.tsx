import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PanelLeft, ArrowDown } from 'lucide-react';
import type { Conversation, Collection, Message, SseEvent, Source } from '@app/shared';
import { api, ApiError } from '../lib/api';
import { streamMessage } from '../lib/sse';
import { MessageList, type StreamingMessageState } from '../components/MessageList';
import { Composer } from '../components/Composer';
import { ScopePicker } from '../components/chat/ScopePicker';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { ChatEmptyState } from '../components/chat/ChatEmptyState';
import type { ActivityStepData } from '../components/ActivityLog';

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  // Navigation & collections state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);

  // Active chat state
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Streaming state
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessageState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSubmissionRef = useRef<{ text: string; files: File[] } | null>(null);
  /** Conversation this page just created: its URL change must not reload (and wipe) the optimistic messages. */
  const createdHereRef = useRef<string | null>(null);

  // Scroll management
  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const [showJumpBottom, setShowJumpBottom] = useState(false);

  const checkIfNearBottom = useCallback(() => {
    const el = threadContainerRef.current;
    if (!el) return true;
    const threshold = 120;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceToBottom <= threshold;
  }, []);

  const handleScroll = useCallback(() => {
    const near = checkIfNearBottom();
    isNearBottomRef.current = near;
    setShowJumpBottom(!near && (messages.length > 0 || !!streamingMessage));
  }, [checkIfNearBottom, messages.length, streamingMessage]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = threadContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowJumpBottom(false);
  }, []);

  // Load conversations list and collections
  const loadInitialData = useCallback(async () => {
    try {
      setConversationsLoading(true);
      const [convRes, collRes] = await Promise.all([api.conversations(), api.collections()]);
      setConversations(convRes.conversations);
      setCollections(collRes.collections);
    } catch {
      // Ignored if unauthenticated or network error
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Load active conversation detail
  const loadConversation = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        const detail = await api.conversation(id);
        setCurrentConversation(detail.conversation);
        setMessages(detail.messages);
        setSelectedCollectionId(detail.conversation.collectionId ?? null);
        // Wait for DOM paint then jump to bottom
        requestAnimationFrame(() => {
          scrollToBottom('instant');
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError('Conversation not found.');
        } else {
          setError(err instanceof Error ? err.message : 'Could not load conversation.');
        }
      } finally {
        setLoading(false);
      }
    },
    [scrollToBottom],
  );

  useEffect(() => {
    if (conversationId) {
      if (createdHereRef.current === conversationId) return;
      createdHereRef.current = null;
      void loadConversation(conversationId);
    } else {
      setCurrentConversation(null);
      setMessages([]);
      setError(null);
    }
  }, [conversationId, loadConversation]);

  // Auto-scroll to bottom while streaming only if already near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages, streamingMessage?.content, scrollToBottom]);

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
        createdHereRef.current = targetConvId;
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
    isNearBottomRef.current = true;
    scrollToBottom('smooth');

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
    // The finished message is built from these locals, not inside a state updater (updaters must stay pure:
    // React runs them twice in StrictMode, which appended the answer twice).
    let answer = '';
    let finalSources: Source[] = [];

    const handleEvent = (event: SseEvent) => {
      switch (event.event) {
        case 'step.start': {
          stepsMap.set(event.data.seq, {
            seq: event.data.seq,
            kind: event.data.kind,
            reasoningText: '',
            startedAtMs: Date.now(),
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
            step.endedAtMs = Date.now();
            setStreamingMessage((prev) => (prev ? { ...prev, steps: Array.from(stepsMap.values()) } : null));
          }
          break;
        }
        case 'answer.delta': {
          answer += event.data.text;
          setStreamingMessage((prev) => (prev ? { ...prev, content: prev.content + event.data.text } : null));
          break;
        }
        case 'sources': {
          finalSources = event.data;
          setStreamingMessage((prev) => (prev ? { ...prev, sources: event.data } : null));
          break;
        }
        case 'done': {
          const completedMsg: Message = {
            id: event.data.messageId,
            conversationId: targetConvId,
            role: 'assistant',
            content: answer,
            attachments: [],
            sources: finalSources,
            steps: Array.from(stepsMap.values()).map((s, idx) => ({
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
              startedAt: new Date(s.startedAtMs ?? Date.now()).toISOString(),
              endedAt: new Date(s.endedAtMs ?? Date.now()).toISOString(),
            })),
            createdAt: new Date().toISOString(),
          };
          setMessages((existing) => [...existing, completedMsg]);
          setStreamingMessage(null);
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
  const scopeLocked = Boolean(conversationId && messages.length > 0);

  return (
    <div className="chat-layout">
      {/* Conversations sidebar with recency grouping & mobile drawer */}
      <ChatSidebar
        conversations={conversations}
        activeConversationId={conversationId}
        loading={conversationsLoading}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
      />

      {/* Main chat column */}
      <main className="chat-main">
        {/* Chat header (48px) */}
        <header className="chat-header">
          <div className="chat-header-left">
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm chat-mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open conversations history"
              title="Open conversations"
            >
              <PanelLeft className="chat-header-panel-icon" strokeWidth={1.75} aria-hidden="true" />
            </button>

            <h1 className="chat-title">
              {currentConversation?.title || (conversationId ? 'Untitled conversation' : 'New chat')}
            </h1>
          </div>

          <div className="chat-header-right">
            <ScopePicker
              collections={collections}
              selectedCollectionId={selectedCollectionId}
              onSelectCollection={setSelectedCollectionId}
              disabled={scopeLocked}
            />
          </div>
        </header>

        {/* Thread area */}
        <div
          ref={threadContainerRef}
          className="chat-thread-container"
          onScroll={handleScroll}
        >
          <div className="chat-thread-content">
            {error && (
              <div className="chat-alert badge-danger" role="alert">
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div className="chat-loading-state">
                <div className="chat-loading-skeletons" aria-label="Loading conversation messages">
                  <div className="skeleton chat-loading-skeleton-row" style={{ width: '60%' }} />
                  <div className="skeleton chat-loading-skeleton-row" style={{ width: '85%' }} />
                  <div className="skeleton chat-loading-skeleton-row" style={{ width: '70%' }} />
                </div>
              </div>
            ) : messages.length === 0 && !streamingMessage ? (
              <ChatEmptyState
                scopeName={selectedCollectionName}
                onSelectSuggestion={(prompt) => void handleSend(prompt, [])}
              />
            ) : (
              <MessageList
                messages={messages}
                streamingMessage={streamingMessage}
                onRetry={handleRetry}
              />
            )}
          </div>
        </div>

        {/* Floating "Jump to latest" button */}
        {showJumpBottom && (
          <button
            type="button"
            className="btn btn-secondary btn-icon btn-sm chat-jump-bottom"
            onClick={() => scrollToBottom('smooth')}
            aria-label="Jump to latest messages"
            title="Jump to latest"
          >
            <ArrowDown className="chat-jump-icon" strokeWidth={2} aria-hidden="true" />
          </button>
        )}

        {/* Bottom Composer docked */}
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
