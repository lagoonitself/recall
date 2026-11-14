import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CollectionPage } from './Collection';
import { api } from '../lib/api';
import type { File as LibraryFile } from '@app/shared';

const mockFile: LibraryFile = {
  id: '11111111-1111-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000001',
  collectionId: '22222222-2222-4000-8000-000000000002',
  name: 'notes.txt',
  mimeType: 'text/plain',
  modality: 'text',
  sizeBytes: 1024,
  status: 'ready',
  piecesTotal: 1,
  piecesDone: 1,
  error: null,
  createdAt: new Date().toISOString(),
  previewChunkId: '33333333-3333-4000-8000-000000000003',
};

const mockImageFile: LibraryFile = {
  id: '44444444-4444-4000-8000-000000000004',
  userId: '00000000-0000-4000-8000-000000000001',
  collectionId: '22222222-2222-4000-8000-000000000002',
  name: 'diagram.png',
  mimeType: 'image/png',
  modality: 'image',
  sizeBytes: 2048,
  status: 'ready',
  piecesTotal: 1,
  piecesDone: 1,
  error: null,
  createdAt: new Date().toISOString(),
  previewChunkId: '55555555-5555-4000-8000-000000000005',
};

describe('CollectionPage preview', () => {
  beforeEach(() => {
    vi.spyOn(api, 'collections').mockResolvedValue({
      collections: [
        {
          id: '22222222-2222-4000-8000-000000000002',
          userId: '00000000-0000-4000-8000-000000000001',
          name: 'Research Papers',
          description: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    vi.spyOn(api, 'files').mockResolvedValue({
      files: [mockFile, mockImageFile],
    });
    vi.spyOn(api, 'chunkMedia').mockImplementation(async (chunkId, thumbnail) => {
      if (thumbnail) {
        return { url: 'https://r2.example.com/thumb.jpg' };
      }
      return { url: `https://r2.example.com/media/${chunkId}` };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders files and opens preview modal for image', async () => {
    render(
      <MemoryRouter initialEntries={['/collections/22222222-2222-4000-8000-000000000002']}>
        <Routes>
          <Route path="/collections/:id" element={<CollectionPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeDefined();
      expect(screen.getByText('notes.txt')).toBeDefined();
    });

    const previewButtons = screen.getAllByRole('button', { name: /Preview diagram\.png/i });
    expect(previewButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByRole('heading', { name: 'diagram.png' })).toBeDefined();
    });

    // Close preview modal via close button
    const closeBtn = screen.getByRole('button', { name: /Close preview/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('closes preview modal on Escape key', async () => {
    render(
      <MemoryRouter initialEntries={['/collections/22222222-2222-4000-8000-000000000002']}>
        <Routes>
          <Route path="/collections/:id" element={<CollectionPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('notes.txt')).toBeDefined();
    });

    // Mock fetch for text content
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'Sample text snippet from document',
    } as unknown as Response);

    try {
      const previewBtns = screen.getAllByRole('button', { name: 'Preview notes.txt' });
      fireEvent.click(previewBtns[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeDefined();
        expect(screen.getByText('Sample text snippet from document')).toBeDefined();
      });

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retries fetching signed URL when media error occurs', async () => {
    let callCount = 0;
    vi.spyOn(api, 'chunkMedia').mockImplementation(async () => {
      callCount++;
      return { url: `https://r2.example.com/media-retry-${callCount}` };
    });

    render(
      <MemoryRouter initialEntries={['/collections/22222222-2222-4000-8000-000000000002']}>
        <Routes>
          <Route path="/collections/:id" element={<CollectionPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeDefined();
    });

    const previewBtns = screen.getAllByRole('button', { name: 'Preview diagram.png' });
    fireEvent.click(previewBtns[0]);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'diagram.png' })).toBeDefined();
    });

    const img = screen.getByRole('img', { name: 'diagram.png' });
    // Trigger error on image to simulate expired signed URL
    fireEvent.error(img);

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });
});
