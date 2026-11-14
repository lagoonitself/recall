import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Composer } from './Composer';

afterEach(() => {
  cleanup();
});

describe('Composer', () => {
  it('renders textarea and action buttons', () => {
    const handleSend = vi.fn();
    render(<Composer onSend={handleSend} />);

    expect(screen.getByPlaceholderText(/Ask anything about your library/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Add photo attachment/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Attach documents/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Record voice note/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Send message/i })).toBeDefined();
  });

  it('submits text when Enter is pressed without Shift', () => {
    const handleSend = vi.fn();
    render(<Composer onSend={handleSend} />);

    const textarea = screen.getByRole('textbox', { name: /Message text/i });
    fireEvent.change(textarea, { target: { value: 'How do I check oil?' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(handleSend).toHaveBeenCalledWith('How do I check oil?', []);
    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });

  it('does not submit on Shift+Enter', () => {
    const handleSend = vi.fn();
    render(<Composer onSend={handleSend} />);

    const textarea = screen.getByRole('textbox', { name: /Message text/i });
    fireEvent.change(textarea, { target: { value: 'Line 1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(handleSend).not.toHaveBeenCalled();
  });

  it('renders Stop button when isStreaming is true and calls onStop', () => {
    const handleSend = vi.fn();
    const handleStop = vi.fn();
    render(<Composer onSend={handleSend} onStop={handleStop} isStreaming={true} />);

    const stopBtn = screen.getByRole('button', { name: /Stop generation/i });
    expect(stopBtn).toBeDefined();

    fireEvent.click(stopBtn);
    expect(handleStop).toHaveBeenCalledTimes(1);
  });
});
