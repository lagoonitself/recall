import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FilePreview } from './FilePreview';
import type { File as LibraryFile } from '@app/shared';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 14,
      getPage: vi.fn(() =>
        Promise.resolve({
          getViewport: () => ({ width: 612, height: 792, scale: 1 }),
          render: () => ({
            promise: Promise.resolve(),
            cancel: vi.fn(),
          }),
          getTextContent: () => Promise.resolve({ items: [] }),
        }),
      ),
      destroy: vi.fn(),
    }),
  })),
  TextLayer: vi.fn().mockImplementation(() => ({
    render: () => Promise.resolve(),
    cancel: vi.fn(),
  })),
}));

// Mock api
vi.mock('../lib/api', () => ({
  api: {
    fileMedia: vi.fn((id: string) => Promise.resolve({ url: `https://example.com/media/${id}.pdf` })),
    chunkMedia: vi.fn((chunkId: string) =>
      Promise.resolve({ url: `https://example.com/chunk/${chunkId}` }),
    ),
    chunkDocument: vi.fn((chunkId: string) =>
      Promise.resolve({ url: `https://example.com/doc/${chunkId}.pdf` }),
    ),
  },
}));

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = MockIntersectionObserver as any;
global.IntersectionObserver = MockIntersectionObserver as any;

describe('FilePreview', () => {
  const mockPdfFile: LibraryFile = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    collectionId: '33333333-3333-3333-3333-333333333333',
    name: 'Quarterly_Report_2026.pdf',
    modality: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: Math.floor(1048576 * 2.5), // 2.5 MB
    piecesTotal: 14,
    piecesDone: 14,
    error: null,
    createdAt: new Date().toISOString(),
    status: 'ready',
    previewChunkId: '44444444-4444-4444-4444-444444444444',
  };

  const mockImageFile: LibraryFile = {
    id: '55555555-5555-5555-5555-555555555555',
    userId: '22222222-2222-2222-2222-222222222222',
    collectionId: '33333333-3333-3333-3333-333333333333',
    name: 'architecture_diagram.png',
    modality: 'image',
    mimeType: 'image/png',
    sizeBytes: Math.floor(1048576 * 1.2), // 1.2 MB
    piecesTotal: 1,
    piecesDone: 1,
    error: null,
    createdAt: new Date().toISOString(),
    status: 'ready',
    previewChunkId: '66666666-6666-6666-6666-666666666666',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders title and metadata', async () => {
    const handleClose = vi.fn();
    render(<FilePreview file={mockPdfFile} onClose={handleClose} />);

    expect(screen.getByText('Quarterly_Report_2026.pdf')).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('preview-title');
  });

  it('calls onClose when Escape key is pressed', async () => {
    const handleClose = vi.fn();
    render(<FilePreview file={mockPdfFile} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('displays PDF page indicator and controls', async () => {
    const handleClose = vi.fn();
    render(<FilePreview file={mockPdfFile} initialPage={3} onClose={handleClose} />);

    // Page indicator input should be present
    const pageInput = screen.getByLabelText('Current page number');
    expect(pageInput).toBeDefined();

    // Previous and Next page buttons exist
    expect(screen.getByTitle('Previous page')).toBeDefined();
    expect(screen.getByTitle('Next page')).toBeDefined();

    // Zoom controls exist
    expect(screen.getByTitle('Zoom in')).toBeDefined();
    expect(screen.getByTitle('Zoom out')).toBeDefined();
    expect(screen.getByTitle('Fit to width')).toBeDefined();

    // Thumbnail toggle button exists
    expect(screen.getByTitle('Toggle thumbnails')).toBeDefined();
  });

  it('renders image viewer with zoom controls for image modality', async () => {
    const handleClose = vi.fn();
    render(<FilePreview file={mockImageFile} onClose={handleClose} />);

    expect(screen.getByText('architecture_diagram.png')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'architecture_diagram.png' })).toBeDefined();
    });

    expect(screen.getByTitle('Fit to screen')).toBeDefined();
  });
});
