import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatSidebar } from './ChatSidebar';
import type { Conversation } from '@app/shared';

afterEach(() => {
  cleanup();
});

const now = Date.now();
const mockConversations: Conversation[] = [
  {
    id: 'conv-today',
    userId: 'user-1',
    collectionId: null,
    title: 'Chat from today',
    createdAt: new Date(now - 1000 * 60 * 30).toISOString(), // 30 mins ago
  },
  {
    id: 'conv-yesterday',
    userId: 'user-1',
    collectionId: null,
    title: 'Chat from yesterday',
    createdAt: new Date(now - 1000 * 60 * 60 * 25).toISOString(), // 25 hours ago
  },
  {
    id: 'conv-week',
    userId: 'user-1',
    collectionId: null,
    title: 'Chat from 4 days ago',
    createdAt: new Date(now - 1000 * 60 * 60 * 24 * 4).toISOString(), // 4 days ago
  },
  {
    id: 'conv-older',
    userId: 'user-1',
    collectionId: null,
    title: 'Chat from 2 weeks ago',
    createdAt: new Date(now - 1000 * 60 * 60 * 24 * 14).toISOString(), // 14 days ago
  },
];

describe('ChatSidebar', () => {
  it('groups conversations into Today, Yesterday, Previous 7 days, and Older', () => {
    const handleClose = vi.fn();
    const handleNewChat = vi.fn();

    render(
      <MemoryRouter>
        <ChatSidebar
          conversations={mockConversations}
          isOpen={true}
          onClose={handleClose}
          onNewChat={handleNewChat}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('Chat from today')).toBeDefined();

    expect(screen.getByText('Yesterday')).toBeDefined();
    expect(screen.getByText('Chat from yesterday')).toBeDefined();

    expect(screen.getByText('Previous 7 days')).toBeDefined();
    expect(screen.getByText('Chat from 4 days ago')).toBeDefined();

    expect(screen.getByText('Older')).toBeDefined();
    expect(screen.getByText('Chat from 2 weeks ago')).toBeDefined();
  });

  it('triggers new chat on button click and global shortcut', () => {
    const handleClose = vi.fn();
    const handleNewChat = vi.fn();

    render(
      <MemoryRouter>
        <ChatSidebar
          conversations={mockConversations}
          isOpen={false}
          onClose={handleClose}
          onNewChat={handleNewChat}
        />
      </MemoryRouter>,
    );

    const newBtn = screen.getByRole('button', { name: /New chat/i });
    fireEvent.click(newBtn);
    expect(handleNewChat).toHaveBeenCalledTimes(1);

    // Ctrl+K
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(handleNewChat).toHaveBeenCalledTimes(2);
  });

  it('displays empty state when there are no conversations', () => {
    const handleClose = vi.fn();
    const handleNewChat = vi.fn();

    render(
      <MemoryRouter>
        <ChatSidebar
          conversations={[]}
          isOpen={true}
          onClose={handleClose}
          onNewChat={handleNewChat}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('No chats yet')).toBeDefined();
  });
});
