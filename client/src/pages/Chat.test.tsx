import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Message, SseEvent } from '@app/shared';
import { ChatPage } from './Chat';
import type { StreamingMessageState } from '../components/MessageList';

const mocks = vi.hoisted(() => ({
  conversations: vi.fn(),
  collections: vi.fn(),
  createConversation: vi.fn(),
  conversation: vi.fn(),
  stream: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  api: mocks,
  ApiError: class extends Error {
    status = 500;
  },
}));
vi.mock('../lib/sse', () => ({ streamMessage: mocks.stream }));
vi.mock('../components/Composer', () => ({
  Composer: ({ onSend }: { onSend: (text: string, files: File[]) => void }) => (
    <button onClick={() => onSend('My question', [])}>Send question</button>
  ),
}));
vi.mock('../components/MessageList', () => ({
  MessageList: ({
    messages,
    streamingMessage,
  }: {
    messages: Message[];
    streamingMessage?: StreamingMessageState;
  }) => (
    <div>
      {messages.map((m) => (
        <p key={m.id}>{m.content}</p>
      ))}
      {streamingMessage?.content}
    </div>
  ),
}));
vi.mock('../components/chat/ChatSidebar', () => ({ ChatSidebar: () => null }));
vi.mock('../components/chat/ScopePicker', () => ({ ScopePicker: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collections.mockResolvedValue({ collections: [] });
  mocks.conversations.mockResolvedValue({ conversations: [] });
  const conversation = { id: '11111111-1111-4111-8111-111111111111', title: 'My chat' };
  mocks.createConversation.mockResolvedValue({ conversation });
  mocks.conversation.mockResolvedValue({ conversation, messages: [] });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

describe('Chat stream lifecycle', () => {
  it('keeps the first question after navigation and appends the answer once in StrictMode', async () => {
    let emit: ((event: SseEvent) => void) | undefined;
    let finish: (() => void) | undefined;
    mocks.stream.mockImplementation(({ onEvent }: { onEvent: (event: SseEvent) => void }) => {
      emit = onEvent;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/chat']}>
          <Routes>
            <Route path="/chat/:conversationId?" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('My question')).toHaveLength(1);
    expect(mocks.conversation).not.toHaveBeenCalled();

    await act(async () => {
      emit?.({ event: 'answer.delta', data: { text: 'A cited answer' } });
      emit?.({ event: 'done', data: { messageId: '22222222-2222-4222-8222-222222222222' } });
      finish?.();
    });
    await waitFor(() => expect(screen.getAllByText('A cited answer')).toHaveLength(1));
    expect(screen.getAllByText('My question')).toHaveLength(1);
  });
});
