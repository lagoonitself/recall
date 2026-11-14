import { http, HttpResponse } from 'msw';
import {
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
  GoogleLoginRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  UploadUrlRequestSchema,
  CreateConversationRequestSchema,
  type Collection,
  type File as LibraryFile,
  type User,
  type Conversation,
  type Message,
  type Modality,
} from '@app/shared';
import chatDemoSse from './fixtures/chat-demo.sse?raw';

const user: User = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reader@example.com',
  name: 'Reader',
  avatarUrl: null,
  createdAt: new Date().toISOString(),
};

let collections: Collection[] = [];
let files: LibraryFile[] = [];

// Seed initial conversation
const defaultConversationId = '00000000-0000-4000-8000-000000000010';
let conversations: Conversation[] = [
  {
    id: defaultConversationId,
    userId: user.id,
    collectionId: null,
    title: 'Vehicle coolant warning',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const conversationMessages: Record<string, Message[]> = {
  [defaultConversationId]: [
    {
      id: '00000000-0000-4000-8000-000000000020',
      conversationId: defaultConversationId,
      role: 'user',
      content: 'What does the red engine thermometer warning light mean in my vehicle?',
      attachments: [],
      sources: [],
      steps: [],
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      conversationId: defaultConversationId,
      role: 'assistant',
      content:
        "According to the vehicle's owner manual [S1], the illuminated red thermometer indicator indicates an **engine coolant over-temperature warning**.\n\nThe maintenance video demonstrates how technicians inspect the coolant reservoir level and check the pressure cap [S2].\n\n**Recommended actions:**\n1. Safely pull over and turn off the engine.\n2. Allow the engine to cool for at least 15 minutes before checking fluid levels.\n3. Do not open the radiator pressure cap while the engine is hot.",
      attachments: [],
      sources: [
        {
          sid: 'S1',
          chunkId: '11111111-1111-4111-8111-111111111111',
          fileName: 'owner-manual.pdf',
          modality: 'pdf',
          location: { page: 42 },
          thumbUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400',
        },
        {
          sid: 'S2',
          chunkId: '22222222-2222-4222-8222-222222222222',
          fileName: 'coolant-service.mp4',
          modality: 'video',
          location: { startSec: 24, endSec: 65 },
          thumbUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400',
        },
      ],
      steps: [
        {
          id: 1,
          seq: 0,
          kind: 'reasoning',
          payload: {
            text: 'The user is asking about the engine warning light. I should check the owner manual and maintenance videos in the library.',
          },
          startedAt: new Date(Date.now() - 3590000).toISOString(),
          endedAt: new Date(Date.now() - 3589000).toISOString(),
        },
        {
          id: 2,
          seq: 1,
          kind: 'tool_call',
          payload: {
            name: 'search_library',
            args: {
              query: 'engine coolant temperature warning light',
              types: ['pdf', 'video'],
            },
          },
          startedAt: new Date(Date.now() - 3589000).toISOString(),
          endedAt: new Date(Date.now() - 3588900).toISOString(),
        },
        {
          id: 3,
          seq: 2,
          kind: 'tool_result',
          payload: {
            name: 'search_library',
            summary: 'Found 2 matching pieces across manuals and service records.',
            items: [],
          },
          startedAt: new Date(Date.now() - 3588900).toISOString(),
          endedAt: new Date(Date.now() - 3588700).toISOString(),
        },
        {
          id: 4,
          seq: 3,
          kind: 'sources_opened',
          payload: {
            name: 'open_sources',
            summary: 'Opened 2 sources: owner-manual.pdf (p. 42) and coolant-service.mp4 (00:24).',
          },
          startedAt: new Date(Date.now() - 3588700).toISOString(),
          endedAt: new Date(Date.now() - 3588400).toISOString(),
        },
      ],
      createdAt: new Date(Date.now() - 3588000).toISOString(),
    },
  ],
};

const reply = () => HttpResponse.json({ token: 'mock-token', user });
const fail = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 });

export const handlers = [
  http.get('*/api/auth/config', () =>
    HttpResponse.json({ googleClientId: 'mock-client-id.apps.googleusercontent.com' }),
  ),
  http.post('*/api/auth/login', async ({ request }) => {
    const data = LoginRequestSchema.parse(await request.json());
    user.email = data.email.toLowerCase();
    return reply();
  }),
  http.post('*/api/auth/register', async ({ request }) => {
    const data = RegisterRequestSchema.parse(await request.json());
    user.email = data.email.toLowerCase();
    user.name = data.name || null;
    return reply();
  }),
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
  http.get('*/api/files/:id', ({ params }) => {
    const file = files.find((item) => item.id === params.id);
    return file ? HttpResponse.json({ file }) : fail();
  }),
  http.get('*/api/files', ({ request }) => {
    const id = new URL(request.url).searchParams.get('collectionId');
    return HttpResponse.json({ files: files.filter((file) => !id || file.collectionId === id) });
  }),
  http.post('*/api/files/upload-url', async ({ request }) => {
    const data = UploadUrlRequestSchema.parse(await request.json());
    const modality: Modality =
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

  // Conversations API
  http.get('*/api/conversations', () => {
    return HttpResponse.json({ conversations });
  }),

  http.post('*/api/conversations', async ({ request }) => {
    const data = CreateConversationRequestSchema.parse(await request.json().catch(() => ({})));
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      userId: user.id,
      collectionId: data.collectionId ?? null,
      title: null,
      createdAt: new Date().toISOString(),
    };
    conversations = [conversation, ...conversations];
    conversationMessages[conversation.id] = [];
    return HttpResponse.json({ conversation }, { status: 201 });
  }),

  http.get('*/api/conversations/:id', ({ params }) => {
    const id = params.id as string;
    const conversation = conversations.find((c) => c.id === id);
    if (!conversation) return fail();
    const messages = conversationMessages[id] || [];
    return HttpResponse.json({ conversation, messages });
  }),

  http.post('*/api/conversations/:id/messages', async ({ params, request }) => {
    const conversationId = params.id as string;
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) return fail();

    const formData = await request.formData();
    const text = (formData.get('text') as string) || '';
    const uploadedFiles = formData.getAll('files') as globalThis.File[];

    if (!conversation.title) {
      conversation.title = text.slice(0, 32) || 'New conversation';
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: text,
      attachments: uploadedFiles.map((f) => {
        const modality: Modality = f.type.startsWith('image/')
          ? 'image'
          : f.type.startsWith('video/')
            ? 'video'
            : f.type.startsWith('audio/')
              ? 'audio'
              : f.type === 'application/pdf'
                ? 'pdf'
                : 'text';
        return {
          id: crypto.randomUUID(),
          name: f.name,
          mimeType: f.type || 'application/octet-stream',
          modality,
        };
      }),
      sources: [],
      steps: [],
      createdAt: new Date().toISOString(),
    };

    if (!conversationMessages[conversationId]) {
      conversationMessages[conversationId] = [];
    }
    conversationMessages[conversationId].push(userMessage);

    // Split fixture frames and stream with small delays so dev sees live updates
    const frames = chatDemoSse
      .split(/\n\n+/)
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => f + '\n\n');

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for (const frame of frames) {
            controller.enqueue(encoder.encode(frame));
            // Small visible delay between chunks (60ms)
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
        } finally {
          controller.close();
        }
      },
    });

    // Save mock assistant response to state
    const assistantMessage: Message = {
      id: '33333333-3333-4333-8333-333333333333',
      conversationId,
      role: 'assistant',
      content:
        "According to the vehicle's owner manual [S1], the illuminated red thermometer indicator indicates an **engine coolant over-temperature warning**.\n\nThe maintenance video demonstrates how technicians inspect the coolant reservoir level and check the pressure cap [S2].\n\n**Recommended actions:**\n1. Safely pull over and turn off the engine.\n2. Allow the engine to cool for at least 15 minutes before checking fluid levels.\n3. Do not open the radiator pressure cap while the engine is hot.",
      attachments: [],
      sources: [
        {
          sid: 'S1',
          chunkId: '11111111-1111-4111-8111-111111111111',
          fileName: 'owner-manual.pdf',
          modality: 'pdf',
          location: { page: 42 },
          thumbUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400',
        },
        {
          sid: 'S2',
          chunkId: '22222222-2222-4222-8222-222222222222',
          fileName: 'coolant-service.mp4',
          modality: 'video',
          location: { startSec: 24, endSec: 65 },
          thumbUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400',
        },
      ],
      steps: [
        {
          id: 1,
          seq: 0,
          kind: 'reasoning',
          payload: {
            text: 'The user is asking about the engine warning light. I should check the owner manual and maintenance videos in the library.',
          },
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
        {
          id: 2,
          seq: 1,
          kind: 'tool_call',
          payload: {
            name: 'search_library',
            args: {
              query: 'engine coolant temperature warning light',
              types: ['pdf', 'video'],
            },
          },
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
        {
          id: 3,
          seq: 2,
          kind: 'tool_result',
          payload: {
            name: 'search_library',
            summary: 'Found 2 matching pieces across manuals and service records.',
            items: [],
          },
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
        {
          id: 4,
          seq: 3,
          kind: 'sources_opened',
          payload: {
            name: 'open_sources',
            summary: 'Opened 2 sources: owner-manual.pdf (p. 42) and coolant-service.mp4 (00:24).',
          },
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    };
    conversationMessages[conversationId].push(assistantMessage);

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }),

  // Full original file (library preview). Multi-page sample PDF for pdf files.
  http.get('*/api/files/:id/media', ({ params }) => {
    const file = files.find((item) => item.id === params.id);
    if (!file) return fail();
    if (file.modality === 'pdf') {
      return HttpResponse.json({
        url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      });
    }
    return HttpResponse.json({
      url: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=1600',
    });
  }),
  // Whole document a cited chunk belongs to.
  http.get('*/api/chunks/:id/document', ({ params }) => {
    const file =
      files.find((item) => item.previewChunkId === params.id) ?? files.find((f) => f.modality === 'pdf');
    return HttpResponse.json({
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      fileId: file?.id ?? '22222222-2222-4222-8222-222222222222',
    });
  }),

  // Chunk media URL endpoint (signed URL for piece or thumbnail)
  http.get('*/api/chunks/:id/media', ({ params, request }) => {
    const isThumb = new URL(request.url).searchParams.get('thumbnail') === 'true';
    if (params.id === '11111111-1111-4111-8111-111111111111') {
      return HttpResponse.json({
        url: isThumb
          ? 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400'
          : 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      });
    }
    return HttpResponse.json({
      url: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400',
    });
  }),
];
