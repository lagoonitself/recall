import { http, HttpResponse } from 'msw';
import {
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
  GoogleLoginRequestSchema,
  UploadUrlRequestSchema,
  type Collection,
  type File as LibraryFile,
  type User,
} from '@app/shared';
const user: User = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reader@example.com',
  name: 'Reader',
  avatarUrl: null,
  createdAt: new Date().toISOString(),
};
let collections: Collection[] = [];
let files: LibraryFile[] = [];
const reply = () => HttpResponse.json({ token: 'mock-token', user });
const fail = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 });
export const handlers = [
  http.get('*/api/auth/config', () =>
    HttpResponse.json({ googleClientId: 'mock-client-id.apps.googleusercontent.com' }),
  ),
  http.post('*/api/auth/google', async ({ request }) => {
    GoogleLoginRequestSchema.parse(await request.json());
    return reply();
  }),
  http.get('*/api/auth/me', () => HttpResponse.json({ user })),
  http.get('*/api/collections', () => HttpResponse.json({ collections })),
  http.post('*/api/collections', async ({ request }) => {
    const data = CreateCollectionRequestSchema.parse(await request.json());
    const collection: Collection = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: data.name,
      description: data.description ?? null,
      createdAt: new Date().toISOString(),
    };
    collections = [...collections, collection];
    return HttpResponse.json({ collection }, { status: 201 });
  }),
  http.patch('*/api/collections/:id', async ({ params, request }) => {
    const data = UpdateCollectionRequestSchema.parse(await request.json());
    const collection = collections.find((item) => item.id === params.id);
    if (!collection) return fail();
    Object.assign(collection, data);
    return HttpResponse.json({ collection });
  }),
  http.delete('*/api/collections/:id', ({ params }) => {
    collections = collections.filter((item) => item.id !== params.id);
    files = files.filter((item) => item.collectionId !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('*/api/files', ({ request }) => {
    const id = new URL(request.url).searchParams.get('collectionId');
    return HttpResponse.json({ files: files.filter((file) => !id || file.collectionId === id) });
  }),
  http.post('*/api/files/upload-url', async ({ request }) => {
    const data = UploadUrlRequestSchema.parse(await request.json());
    const modality =
      data.mimeType === 'application/pdf'
        ? 'pdf'
        : data.mimeType.startsWith('image/')
          ? 'image'
          : data.mimeType.startsWith('audio/')
            ? 'audio'
            : data.mimeType.startsWith('video/')
              ? 'video'
              : 'text';
    const file: LibraryFile = {
      id: crypto.randomUUID(),
      userId: user.id,
      ...data,
      modality,
      status: 'uploading',
      piecesTotal: null,
      piecesDone: 0,
      error: null,
      createdAt: new Date().toISOString(),
    };
    files = [...files, file];
    return HttpResponse.json({
      fileId: file.id,
      url: `${location.origin}/mock-upload/${file.id}`,
      headers: { 'Content-Type': file.mimeType },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
  }),
  http.put('*/mock-upload/:id', () => new HttpResponse(null, { status: 200 })),
  http.post('*/api/files/:id/complete', ({ params }) => {
    const file = files.find((item) => item.id === params.id);
    if (!file) return fail();
    file.status = 'processing';
    file.piecesTotal = 1;
    setTimeout(() => {
      file.status = 'ready';
      file.piecesDone = 1;
      file.previewChunkId = crypto.randomUUID();
    }, 3000);
    return HttpResponse.json({ file });
  }),
  http.get('*/api/chunks/:id/media', ({ request, params }) => {
    const isThumb = new URL(request.url).searchParams.get('thumbnail') === 'true';
    const chunkId = params.id as string;
    const file = files.find((item) => item.previewChunkId === chunkId);
    if (file && isThumb && (file.modality === 'audio' || file.modality === 'text')) {
      return fail();
    }
    if (isThumb) {
      const svgThumb = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#e8eee3"/><text x="150" y="105" font-family="sans-serif" font-size="14" fill="#385c3d" text-anchor="middle">Preview Thumbnail</text></svg>`;
      return HttpResponse.json({ url: `data:image/svg+xml;utf8,${encodeURIComponent(svgThumb)}` });
    }
    if (file?.modality === 'text') {
      const text = `Document Preview: ${file.name}\n\nThis is sample text content indexed by Recall.\nModality: TEXT\nSize: ${file.sizeBytes} bytes.`;
      return HttpResponse.json({ url: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}` });
    }
    const title = file ? file.name : 'Preview Document';
    const svgFull = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#f8f8f3"/><text x="400" y="280" font-family="Georgia, serif" font-size="24" fill="#252e28" text-anchor="middle">${title}</text><text x="400" y="320" font-family="sans-serif" font-size="14" fill="#667169" text-anchor="middle">Full Preview Page</text></svg>`;
    return HttpResponse.json({ url: `data:image/svg+xml;utf8,${encodeURIComponent(svgFull)}` });
  }),
  http.delete('*/api/files/:id', ({ params }) => {
    files = files.filter((item) => item.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
