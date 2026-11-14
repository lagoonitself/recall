import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { UploadDropzone, prepareFile } from './UploadDropzone';
const convert = vi.hoisted(() => vi.fn());
vi.mock('heic2any', () => ({ default: convert }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('upload validation', () => {
  it('rejects a 60 MB file in the dropzone', async () => {
    render(<UploadDropzone collectionId="00000000-0000-4000-8000-000000000001" onUploaded={() => {}} />);
    const file = new File([new Uint8Array(60 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByLabelText('Upload files'), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('50 MB'));
  });
  it.each([
    ['long.mp4', 'video/mp4'],
    ['long.mov', ''],
  ])('rejects a 90 second video (%s)', async (name, mime) => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((name: string) => {
      const element = original(name);
      if (name === 'video') {
        Object.defineProperty(element, 'duration', { value: 90 });
        Object.defineProperty(element, 'src', {
          set: () => queueMicrotask(() => element.dispatchEvent(new Event('loadedmetadata'))),
        });
      }
      return element;
    }) as typeof document.createElement);
    await expect(prepareFile(new File(['video'], name, { type: mime }))).rejects.toThrow('80 seconds');
    vi.unstubAllGlobals();
  });
  it('converts HEIC to JPEG before upload', async () => {
    convert.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const result = await prepareFile(new File(['heic'], 'photo.heic', { type: 'image/heic' }));
    expect(convert).toHaveBeenCalled();
    expect(result.name).toBe('photo.jpg');
    expect(result.type).toBe('image/jpeg');
  });
  it.each([
    ['notes.md', 'text/markdown'],
    ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['recording.ogg', 'audio/ogg'],
    ['recording.m4a', 'audio/mp4'],
    ['recording.wav', 'audio/wav'],
  ])('infers the MIME type for %s when the browser omits it', async (name, mime) => {
    const result = await prepareFile(new File(['content'], name, { lastModified: 123 }));
    expect(result.type).toBe(mime);
    expect(result.name).toBe(name);
    expect(result.lastModified).toBe(123);
  });
});
