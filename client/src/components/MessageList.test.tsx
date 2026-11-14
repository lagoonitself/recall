import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MessageList } from './MessageList';
import type { Message } from '@app/shared';

afterEach(() => {
  cleanup();
});

describe('MessageList', () => {
  const mockMessages: Message[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      conversationId: '00000000-0000-4000-8000-000000000000',
      role: 'user',
      content: 'Where is the coolant reservoir?',
      attachments: [
        {
          id: 'att-1',
          name: 'engine-bay.jpg',
          modality: 'image',
          mimeType: 'image/jpeg',
        },
      ],
      sources: [],
      steps: [],
      createdAt: '2026-04-18T10:00:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      conversationId: '00000000-0000-4000-8000-000000000000',
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
          thumbUrl: 'https://example.com/thumb.jpg',
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
          payload: { text: 'Analyzing engine bay layout' },
          startedAt: '2026-04-18T10:00:01.000Z',
          endedAt: '2026-04-18T10:00:02.000Z',
        },
      ],
      createdAt: '2026-04-18T10:00:03.000Z',
    },
  ];

  it('renders user and assistant messages with markdown, attachments tiles, and avatar mark', () => {
    render(<MessageList messages={mockMessages} />);

    // User message checks: content, attachment tile, no "YOU" card header
    expect(screen.getByText('Where is the coolant reservoir?')).toBeDefined();
    expect(screen.getByText('engine-bay.jpg')).toBeDefined();
    expect(screen.queryByText('YOU')).toBeNull();

    // Assistant message checks: avatar mark 'r', no "RECALL AGENT" header
    expect(screen.getByText('r')).toBeDefined();
    expect(screen.queryByText('RECALL AGENT')).toBeNull();
    expect(screen.getByText(/The coolant reservoir is on the right side/)).toBeDefined();

    // Citation pills render numbers (1, 2) rather than [S1], [S2]
    expect(screen.getByRole('button', { name: 'Source 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Source 2' })).toBeDefined();

    // Sources section heading and chips
    expect(screen.getByText('Sources · 2')).toBeDefined();
    expect(screen.getByText('manual.pdf')).toBeDefined();
    expect(screen.getByText('coolant-check.mp4')).toBeDefined();
  });

  it('citation pill renders number, sits in citation group, and selects source on click', () => {
    const handleSelect = vi.fn();
    const adjacentMsg: Message[] = [
      {
        id: 'msg-adjacent',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Check the details [S1][S2].',
        attachments: [],
        sources: [
          {
            sid: 'S1',
            chunkId: 'chunk-1',
            fileName: 'manual.pdf',
            modality: 'pdf',
            location: { page: 4 },
            thumbUrl: null,
          },
          {
            sid: 'S2',
            chunkId: 'chunk-2',
            fileName: 'guide.pdf',
            modality: 'pdf',
            location: { page: 8 },
            thumbUrl: null,
          },
        ],
        steps: [],
        createdAt: '2026-04-18T10:00:00.000Z',
      },
    ];

    const { container } = render(
      <MessageList messages={adjacentMsg} onSelectSource={handleSelect} />,
    );

    // Merged adjacent pills inside .citation-group
    const citationGroup = container.querySelector('.citation-group');
    expect(citationGroup).not.toBeNull();
    const pills = citationGroup?.querySelectorAll('.citation-pill');
    expect(pills?.length).toBe(2);
    expect(pills?.[0].textContent).toBe('1');
    expect(pills?.[1].textContent).toBe('2');

    // Clicking pill 1 invokes onSelectSource with S1
    fireEvent.click(pills![0]);
    expect(handleSelect).toHaveBeenCalledWith('S1');
  });

  it('highlights matching source when citation pill is clicked', () => {
    render(<MessageList messages={mockMessages} />);

    const pillS1 = screen.getByRole('button', { name: 'Source 1' });
    fireEvent.click(pillS1);

    const sourceCard = document.getElementById('source-S1');
    expect(sourceCard?.className).toContain('active-highlight');
  });

  it('renders quiet retry button when streaming message has an error', () => {
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
    const retryBtn = screen.getByRole('button', { name: /Retry answer/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('copies answer to clipboard on copy button click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<MessageList messages={mockMessages} />);

    const copyBtn = screen.getByRole('button', { name: /Copy answer/i });
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('The coolant reservoir is on the right side'),
    );
    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeDefined();
    });
  });
});

describe('MessageList sanitizing', () => {
  it('strips script and event-handler HTML from answers', async () => {
    const { render } = await import('@testing-library/react');
    const { MessageList } = await import('./MessageList');
    const { container } = render(
      <MessageList
        messages={[
          {
            id: '00000000-0000-4000-8000-000000000009',
            conversationId: '00000000-0000-4000-8000-000000000008',
            role: 'assistant',
            content: 'Hi <img src=x onerror="alert(1)"><script>alert(2)</script> [S1]',
            attachments: [],
            sources: [],
            steps: [],
            createdAt: new Date().toISOString(),
          },
        ]}
      />,
    );
    expect(container.innerHTML).not.toMatch(/onerror|<script/);
    expect(container.querySelector('.citation-pill')).not.toBeNull();
  });
});
