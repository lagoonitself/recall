import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SourceCard } from './SourceCard';
import type { Source } from '@app/shared';

afterEach(() => {
  cleanup();
});

describe('SourceCard', () => {
  const mockPdfSource: Source = {
    sid: 'S1',
    chunkId: '11111111-1111-4111-8111-111111111111',
    fileName: 'vehicle-manual.pdf',
    modality: 'pdf',
    location: { page: 42 },
    thumbUrl: 'https://example.com/thumb.jpg',
  };

  const mockVideoSource: Source = {
    sid: 'S2',
    chunkId: '22222222-2222-4222-8222-222222222222',
    fileName: 'service-clip.mp4',
    modality: 'video',
    location: { startSec: 24, endSec: 65 },
    thumbUrl: null,
  };

  it('renders source header with sid, filename, and location', () => {
    render(<SourceCard source={mockPdfSource} />);

    expect(screen.getByText('S1')).toBeDefined();
    expect(screen.getByText('vehicle-manual.pdf')).toBeDefined();
    expect(screen.getByText('· page 42')).toBeDefined();
  });

  it('expands when clicked and calls onOpen', () => {
    const handleOpen = vi.fn();
    render(<SourceCard source={mockPdfSource} onOpen={handleOpen} />);

    const toggleBtn = screen.getByRole('button', { name: /vehicle-manual\.pdf/i });
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggleBtn);

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Page 42')).toBeDefined();
  });

  it('auto-expands when isActive is true', () => {
    render(<SourceCard source={mockVideoSource} isActive={true} />);

    expect(screen.getByRole('article').className).toContain('active-highlight');
    expect(screen.getByText(/Starts at 0:24/)).toBeDefined();
  });
});
