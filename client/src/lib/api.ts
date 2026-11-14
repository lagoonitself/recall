import { z } from 'zod';
import {
  AuthConfigResponseSchema,
  AuthResponseSchema,
  MeResponseSchema,
  CollectionsResponseSchema,
  CollectionResponseSchema,
  FilesResponseSchema,
  FileResponseSchema,
  UploadUrlResponseSchema,
  ErrorResponseSchema,
  GoogleLoginRequestSchema,
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
  UploadUrlRequestSchema,
  ConversationsResponseSchema,
  ConversationResponseSchema,
  ConversationDetailResponseSchema,
  CreateConversationRequestSchema,
  MediaResponseSchema,
} from '@app/shared';
const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
let token = localStorage.getItem('recall.token');
export function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem('recall.token', value);
  else localStorage.removeItem('recall.token');
}
export function getToken() {
  return token;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${base}/api${path}`, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event('recall:unauthorized'));
    }
    const error = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      error.success ? error.data.error.message : 'Something went wrong. Please try again.',
      response.status,
    );
  }
  return schema.parse(await response.json());
}
const body = (value: unknown) => JSON.stringify(value);
export const api = {
  config: () => request('/auth/config', AuthConfigResponseSchema),
  google: (credential: string) =>
    request('/auth/google', AuthResponseSchema, {
      method: 'POST',
      body: body(GoogleLoginRequestSchema.parse({ credential })),
    }),
  me: () => request('/auth/me', MeResponseSchema),
  collections: () => request('/collections', CollectionsResponseSchema),
  createCollection: (name: string) =>
    request('/collections', CollectionResponseSchema, {
      method: 'POST',
      body: body(CreateCollectionRequestSchema.parse({ name })),
    }),
  updateCollection: (id: string, name: string) =>
    request(`/collections/${id}`, CollectionResponseSchema, {
      method: 'PATCH',
      body: body(UpdateCollectionRequestSchema.parse({ name })),
    }),
  deleteCollection: (id: string) => remove(`/collections/${id}`),
  files: (id: string) => request(`/files?collectionId=${encodeURIComponent(id)}`, FilesResponseSchema),
  uploadUrl: (value: z.input<typeof UploadUrlRequestSchema>) =>
    request('/files/upload-url', UploadUrlResponseSchema, {
      method: 'POST',
      body: body(UploadUrlRequestSchema.parse(value)),
    }),
  file: (id: string) => request(`/files/${id}`, FileResponseSchema),
  complete: (id: string) => request(`/files/${id}/complete`, FileResponseSchema, { method: 'POST' }),
  deleteFile: (id: string) => remove(`/files/${id}`),
  conversations: () => request('/conversations', ConversationsResponseSchema),
  createConversation: (collectionId?: string | null) =>
    request('/conversations', ConversationResponseSchema, {
      method: 'POST',
      body: body(CreateConversationRequestSchema.parse({ collectionId })),
    }),
  conversation: (id: string) => request(`/conversations/${id}`, ConversationDetailResponseSchema),
  chunkMedia: (chunkId: string, thumbnail?: boolean) =>
    request(`/chunks/${chunkId}/media${thumbnail ? '?thumbnail=true' : ''}`, MediaResponseSchema),
  /** Signed URL of the original uploaded file (whole PDF, full video, ...). */
  fileMedia: (fileId: string) => request(`/files/${fileId}/media`, MediaResponseSchema),
  /** Signed URL + file id of the whole original file a chunk belongs to. Use to open a citation inside the full document. */
  chunkDocument: (chunkId: string) =>
    request(`/chunks/${chunkId}/document`, MediaResponseSchema.extend({ fileId: z.string() })),
};
async function remove(path: string) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${base}/api${path}`, { method: 'DELETE', headers });
  if (response.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('recall:unauthorized'));
  }
  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      error.success ? error.data.error.message : 'Could not delete. Please try again.',
      response.status,
    );
  }
}
export function upload(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'content-length') xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error('Upload failed. Please try again.'));
    xhr.send(file);
  });
}
