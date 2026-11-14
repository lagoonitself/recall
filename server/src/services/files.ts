import type { Modality } from '@app/shared';

const mimeTypes: Record<string, { modality: Modality; ext: string }> = {
  'application/pdf': { modality: 'pdf', ext: 'pdf' },
  'image/jpeg': { modality: 'image', ext: 'jpg' },
  'image/png': { modality: 'image', ext: 'png' },
  'image/webp': { modality: 'image', ext: 'webp' },
  'audio/mpeg': { modality: 'audio', ext: 'mp3' },
  'audio/mp4': { modality: 'audio', ext: 'm4a' },
  'audio/wav': { modality: 'audio', ext: 'wav' },
  'audio/webm': { modality: 'audio', ext: 'webm' },
  'audio/x-m4a': { modality: 'audio', ext: 'm4a' },
  'audio/x-wav': { modality: 'audio', ext: 'wav' },
  'audio/wave': { modality: 'audio', ext: 'wav' },
  'audio/ogg': { modality: 'audio', ext: 'ogg' },
  'video/mp4': { modality: 'video', ext: 'mp4' },
  'video/webm': { modality: 'video', ext: 'webm' },
  'video/quicktime': { modality: 'video', ext: 'mov' },
  'text/plain': { modality: 'text', ext: 'txt' },
  'text/markdown': { modality: 'text', ext: 'md' },
  'text/x-markdown': { modality: 'text', ext: 'md' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    modality: 'text',
    ext: 'docx',
  },
};
export const mimeInfo = (mime: string) => (Object.hasOwn(mimeTypes, mime) ? mimeTypes[mime] : undefined);
export const filePrefix = (userId: string, fileId: string) => `users/${userId}/files/${fileId}/`;
export function fileResponse(row: {
  id: string;
  user_id: string;
  collection_id: string;
  name: string;
  mime_type: string;
  modality: string;
  size_bytes: string;
  status: string;
  pieces_total: number | null;
  pieces_done: number;
  error: string | null;
  created_at: Date;
  preview_chunk_id?: string | null;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    collectionId: row.collection_id,
    name: row.name,
    mimeType: row.mime_type,
    modality: row.modality,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    piecesTotal: row.pieces_total,
    piecesDone: row.pieces_done,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    previewChunkId: row.preview_chunk_id ?? null,
  };
}
