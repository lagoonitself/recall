import { useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SquarePen, X } from 'lucide-react';
import type { Conversation } from '@app/shared';

export interface ChatSidebarProps {
  conversations: Conversation[];
  activeConversationId?: string;
  loading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
}

type GroupedConversations = {
  today: Conversation[];
  yesterday: Conversation[];
  previous7Days: Conversation[];
  older: Conversation[];
};

export function ChatSidebar({
  conversations,
  activeConversationId,
  loading = false,
  isOpen,
  onClose,
  onNewChat,
}: ChatSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null);

  // Group conversations by recency
  const grouped = useMemo<GroupedConversations>(() => {
    const groups: GroupedConversations = {
      today: [],
      yesterday: [],
      previous7Days: [],
      older: [],
    };

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const conv of conversations) {
      const convDate = new Date(conv.createdAt);
      const convMidnight = new Date(
        convDate.getFullYear(),
        convDate.getMonth(),
        convDate.getDate(),
      ).getTime();
      const diffDays = Math.floor((todayMidnight - convMidnight) / oneDayMs);

      if (diffDays <= 0) {
        groups.today.push(conv);
      } else if (diffDays === 1) {
        groups.yesterday.push(conv);
      } else if (diffDays <= 7) {
        groups.previous7Days.push(conv);
      } else {
        groups.older.push(conv);
      }
    }

    return groups;
  }, [conversations]);

  // Detect platform for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const shortcutHint = isMac ? '⌘K' : 'Ctrl K';

  // Global Ctrl/Cmd + K shortcut for new chat
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onNewChat();
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [onNewChat]);

  // Trap focus and handle Escape when mobile drawer is open
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && sidebarRef.current) {
        const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const renderGroup = (label: string, items: Conversation[]) => {
    if (items.length === 0) return null;

    return (
      <div className="chat-sidebar-group" key={label}>
        <div className="chat-sidebar-group-label">{label}</div>
        <div className="chat-sidebar-group-items" role="group" aria-label={label}>
          {items.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <Link
                key={conv.id}
                to={`/chat/${conv.id}`}
                className={`chat-sidebar-item ${isActive ? 'active' : ''}`}
                onClick={onClose}
                title={conv.title || 'Untitled conversation'}
              >
                <span className="chat-sidebar-item-title">
                  {conv.title || 'Untitled conversation'}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile off-canvas backdrop */}
      {isOpen && (
        <div
          className="chat-sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        className={`chat-sidebar ${isOpen ? 'open' : ''}`}
        aria-label="Conversations"
      >
        <div className="chat-sidebar-header">
          <button
            type="button"
            className="btn btn-secondary chat-new-btn"
            onClick={onNewChat}
          >
            <SquarePen className="chat-new-icon" strokeWidth={1.75} aria-hidden="true" />
            <span>New chat</span>
            <kbd className="kbd chat-new-kbd">{shortcutHint}</kbd>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm chat-sidebar-close"
            onClick={onClose}
            aria-label="Close conversations menu"
            title="Close sidebar"
          >
            <X className="chat-sidebar-close-icon" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <nav className="chat-sidebar-nav" aria-label="Conversation history">
          {loading ? (
            <div className="chat-sidebar-skeletons" aria-label="Loading conversations">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="chat-sidebar-skeleton-row skeleton" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="chat-sidebar-empty">No chats yet</p>
          ) : (
            <div className="chat-sidebar-groups">
              {renderGroup('Today', grouped.today)}
              {renderGroup('Yesterday', grouped.yesterday)}
              {renderGroup('Previous 7 days', grouped.previous7Days)}
              {renderGroup('Older', grouped.older)}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
