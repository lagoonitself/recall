import { z } from 'zod';

export const ModalitySchema = z.enum(['pdf', 'image', 'audio', 'video', 'text']);
export type Modality = z.infer<typeof ModalitySchema>;
export const FileStatusSchema = z.enum(['uploading', 'queued', 'processing', 'ready', 'failed']);
export type FileStatus = z.infer<typeof FileStatusSchema>;
export const StepKindSchema = z.enum(['reasoning', 'tool_call', 'tool_result', 'sources_opened']);
export type StepKind = z.infer<typeof StepKindSchema>;
const id = z.uuid();
const date = z.iso.datetime();
export const ErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export const UserSchema = z.object({
  id,
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  createdAt: date,
});
export type User = z.infer<typeof UserSchema>;
/** Sign-in is Google only (D22): the browser gets an ID token from Google Identity Services and sends it here. The server verifies it against GOOGLE_CLIENT_ID. */
export const GoogleLoginRequestSchema = z.object({ credential: z.string().min(1).max(4096) });
export type GoogleLoginRequest = z.infer<typeof GoogleLoginRequestSchema>;
/** Public client config the browser needs before login. `googleClientId` is null when Google sign-in is off. */
export const AuthConfigResponseSchema = z.object({ googleClientId: z.string().nullable() });
export type AuthConfigResponse = z.infer<typeof AuthConfigResponseSchema>;
export const AuthResponseSchema = z.object({ token: z.string(), user: UserSchema });
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export const MeResponseSchema = z.object({ user: UserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;
export const CollectionSchema = z.object({
  id,
  userId: id,
  name: z.string(),
  description: z.string().nullable(),
  createdAt: date,
  /** Present on list responses. */
  fileCount: z.number().int().nonnegative().optional(),
});
export type Collection = z.infer<typeof CollectionSchema>;
export const CreateCollectionRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;
export const UpdateCollectionRequestSchema = CreateCollectionRequestSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
);
export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequestSchema>;
export const CollectionResponseSchema = z.object({ collection: CollectionSchema });
export type CollectionResponse = z.infer<typeof CollectionResponseSchema>;
export const CollectionsResponseSchema = z.object({ collections: z.array(CollectionSchema) });
export type CollectionsResponse = z.infer<typeof CollectionsResponseSchema>;
export const FileSchema = z.object({
  id,
  userId: id,
  collectionId: id,
  name: z.string(),
  mimeType: z.string(),
  modality: ModalitySchema,
  sizeBytes: z.number().int().nonnegative(),
  status: FileStatusSchema,
  piecesTotal: z.number().int().nonnegative().nullable(),
  piecesDone: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: date,
  previewChunkId: id.nullable().optional(),
});
export type File = z.infer<typeof FileSchema>;
export const UploadUrlRequestSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  collectionId: id,
});
export type UploadUrlRequest = z.infer<typeof UploadUrlRequestSchema>;
/** The browser must PUT the file to `url` sending exactly these `headers` (Content-Type and Content-Length are signed). */
export const UploadUrlResponseSchema = z.object({
  fileId: id,
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: date,
});
export type UploadUrlResponse = z.infer<typeof UploadUrlResponseSchema>;
export const ListFilesQuerySchema = z.object({ collectionId: id.optional() });
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>;
export const FileResponseSchema = z.object({ file: FileSchema });
export type FileResponse = z.infer<typeof FileResponseSchema>;
export const FilesResponseSchema = z.object({ files: z.array(FileSchema) });
export type FilesResponse = z.infer<typeof FilesResponseSchema>;
export const MediaQuerySchema = z.object({ thumbnail: z.enum(['true', 'false']).optional() });
export type MediaQuery = z.infer<typeof MediaQuerySchema>;
export const MediaResponseSchema = z.object({ url: z.string().url() });
export type MediaResponse = z.infer<typeof MediaResponseSchema>;
export const LocationSchema = z.object({
  page: z.number().int().positive().optional(),
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().nonnegative().optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
});
export type Location = z.infer<typeof LocationSchema>;
export const SourceSchema = z.object({
  sid: z.string(),
  chunkId: id,
  fileName: z.string(),
  modality: ModalitySchema,
  location: LocationSchema,
  thumbUrl: z.string().url().nullable(),
});
export type Source = z.infer<typeof SourceSchema>;
/** Wire shape. Storage keys (r2_key) stay in the database and never reach the browser. */
export const AttachmentSchema = z.object({
  id,
  modality: ModalitySchema,
  mimeType: z.string(),
  name: z.string(),
  durationSec: z.number().nonnegative().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;
export const AgentStepSchema = z.object({
  id: z.number().int(),
  seq: z.number().int().nonnegative(),
  kind: StepKindSchema,
  payload: z.unknown(),
  startedAt: date,
  endedAt: date.nullable(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;
export const MessageSchema = z.object({
  id,
  conversationId: id,
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  attachments: z.array(AttachmentSchema),
  sources: z.array(SourceSchema),
  steps: z.array(AgentStepSchema),
  createdAt: date,
});
export type Message = z.infer<typeof MessageSchema>;
export const ConversationSchema = z.object({
  id,
  userId: id,
  collectionId: id.nullable(),
  title: z.string().nullable(),
  createdAt: date,
});
export type Conversation = z.infer<typeof ConversationSchema>;
export const CreateConversationRequestSchema = z.object({ collectionId: id.nullable().optional() });
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export const ConversationsResponseSchema = z.object({ conversations: z.array(ConversationSchema) });
export type ConversationsResponse = z.infer<typeof ConversationsResponseSchema>;
export const ConversationResponseSchema = z.object({ conversation: ConversationSchema });
export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;
export const ConversationDetailResponseSchema = z.object({
  conversation: ConversationSchema,
  messages: z.array(MessageSchema),
});
export type ConversationDetailResponse = z.infer<typeof ConversationDetailResponseSchema>;
// Multipart files are carried separately from the text fields.
export const SendMessageRequestSchema = z.object({ text: z.string() });
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export const EmptyRequestSchema = z.object({}).strict();
export type EmptyRequest = z.infer<typeof EmptyRequestSchema>;
export const NoContentResponseSchema = z.void();
export type NoContentResponse = z.infer<typeof NoContentResponseSchema>;
export const IdParamsSchema = z.object({ id });
export type IdParams = z.infer<typeof IdParamsSchema>;
const seq = z.number().int().nonnegative();
export const SseEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('step.start'), data: z.object({ seq, kind: StepKindSchema }) }),
  z.object({ event: z.literal('reasoning.delta'), data: z.object({ seq, text: z.string() }) }),
  z.object({
    event: z.literal('tool.call'),
    data: z.object({ seq, name: z.string(), args: z.record(z.string(), z.unknown()) }),
  }),
  z.object({
    event: z.literal('tool.result'),
    data: z.object({ seq, name: z.string(), summary: z.string(), items: z.array(z.unknown()) }),
  }),
  z.object({ event: z.literal('step.end'), data: z.object({ seq, ms: z.number().nonnegative() }) }),
  z.object({ event: z.literal('answer.delta'), data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal('sources'), data: z.array(SourceSchema) }),
  z.object({ event: z.literal('done'), data: z.object({ messageId: id }) }),
  z.object({ event: z.literal('error'), data: z.object({ message: z.string() }) }),
]);
export type SseEvent = z.infer<typeof SseEventSchema>;
