import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MessageList } from './MessageList';
import type { Message } from '@app/shared';

afterEach(() => {
  cleanup();
});

describe('MessageList', () => {
  const mockMessages: Message[] = [
    {
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      content: 'Where is the coolant reservoir?',
      attachments: [
        {
          id: 'a1',
          name: 'engine-bay.jpg',
          mimeType: 'image/jpeg',
          modality: 'image',
        },
      ],
      sources: [],
      steps: [],
      createdAt: '2026-04-18T10:00:00.000Z',
    },
    {
      id: 'm2',
      conversationId: 'c1',
      role: 'assistant',
      content: 'The coolant reservoir is on the right side [S1]. See the video [S2].',
      attachments: [],
      sources: [
        {
          sid: 'S1',
          chunkId: '11111111-1111-4111-8111-111111111111',
          fileName: 'manual.pdf',
          modality: 'pdf',
          location: { page: 42 },
          thumbUrl: null,
        },
        {
          sid: 'S2',
          chunkId: '22222222-2222-4222-8222-222222222222',
          fileName: 'coolant-check.mp4',
          modality: 'video',
          location: { startSec: 15 },
          thumbUrl: null,
        },
      ],
      steps: [
        {
          id: 1,
          seq: 0,
          kind: 'reasoning',
          payload: { text: 'Looking up reservoir location' },
          startedAt: '2026-04-18T10:00:01.000Z',
          endedAt: '2026-04-18T10:00:02.000Z',
        },
      ],
      createdAt: '2026-04-18T10:00:03.000Z',
    },
  ];

  it('renders user and assistant messages with markdown and attachments', () => {
    render(<MessageList messages={mockMessages} />);

    expect(screen.getByText('Where is the coolant reservoir?')).toBeDefined();
    expect(screen.getByText('engine-bay.jpg')).toBeDefined();
    expect(screen.getByText(/The coolant reservoir is on the right side/)).toBeDefined();
    expect(screen.getByRole('button', { name: /View cited source S1/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /View cited source S2/i })).toBeDefined();
    expect(screen.getByText('manual.pdf')).toBeDefined();
    expect(screen.getByText('coolant-check.mp4')).toBeDefined();
  });

  it('highlights matching source when citation chip is clicked', () => {
    render(<MessageList messages={mockMessages} />);

    const chipS1 = screen.getByRole('button', { name: /View cited source S1/i });
    fireEvent.click(chipS1);

    const sourceCard = document.getElementById('source-S1');
    expect(sourceCard?.className).toContain('active-highlight');
  });

  it('renders retry button when streaming message has an error', () => {
    const handleRetry = vi.fn();
    render(
      <MessageList
        messages={[]}
        streamingMessage={{
          role: 'assistant',
          content: 'Partial response',
          steps: [],
          sources: [],
          isStreaming: false,
          error: 'Connection interrupted',
        }}
        onRetry={handleRetry}
      />,
    );

    expect(screen.getByText('Connection interrupted')).toBeDefined();
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
