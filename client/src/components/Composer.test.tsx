import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { Composer } from './Composer';

afterEach(() => {
  cleanup();
});

describe('Composer', () => {
  it('renders textarea and single attach button without voice recorder', () => {
    const handleSend = vi.fn();
    render(<Composer onSend={handleSend} />);

    expect(screen.getByPlaceholderText(/Ask about your library…/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Attach files/i })).toBeDefined();
    // Voice recorder must NOT be present
    expect(screen.queryByRole('button', { name: /Record voice note/i })).toBeNull();
    // Separate photo / document buttons must NOT be present
    expect(screen.queryByRole('button', { name: /Add photo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Attach documents/i })).toBeNull();

    const sendBtn = screen.getByRole('button', { name: /Send message/i });
    expect(sendBtn).toBeDefined();
    // Send button must be disabled when empty
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables send button when text is entered and submits on Enter', () => {
    const handleSend = vi.fn();
    render(<Composer onSend={handleSend} />);

    const textarea = screen.getByRole('textbox', { name: /Message text/i });
    const sendBtn = screen.getByRole('button', { name: /Send message/i });

    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: 'How do I check oil?' } });
    expect((sendBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(handleSend).toHaveBeenCalledWith('How do I check oil?', []);
    expect((textarea as HTMLTextAreaElement).value).toBe('');
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
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

    const stopBtn = screen.getByRole('button', { name: /Stop generating/i });
    expect(stopBtn).toBeDefined();

    fireEvent.click(stopBtn);
    expect(handleStop).toHaveBeenCalledTimes(1);
  });

  it('supports attaching files via paste into textarea', async () => {
    const handleSend = vi.fn();
    render(<Composer onSend={handleSend} />);

    const textarea = screen.getByRole('textbox', { name: /Message text/i });
    const file = new File(['sample text content'], 'sample.txt', { type: 'text/plain' });

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('sample.txt')).toBeDefined();
    });

    // Send button should now be enabled even without text
    const sendBtn = screen.getByRole('button', { name: /Send message/i });
    expect((sendBtn as HTMLButtonElement).disabled).toBe(false);

    // Clicking remove button should remove the file and disable send
    const removeBtn = screen.getByRole('button', { name: /Remove sample.txt/i });
    fireEvent.click(removeBtn);

    expect(screen.queryByText('sample.txt')).toBeNull();
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
