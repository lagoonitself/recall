import { z } from 'zod';

export type Modality = 'image' | 'pdf' | 'audio' | 'video';
export interface ModelCapabilities {
  input: Record<Modality, boolean>;
  tools: boolean;
  reasoning: boolean;
  maxMediaPartsPerRequest: number;
}
export type MediaPart = { type: Modality; mimeType: string; data: Uint8Array };
export type TextPart = { type: 'text'; text: string };
export type AgentMessage =
  | { role: 'user'; content: (TextPart | MediaPart)[] }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: { id: string; name: string; args: unknown }[];
      providerState?: unknown;
    }
  | { role: 'tool'; toolCallId: string; content: string | (TextPart | MediaPart)[] };
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export const PieceDescriptionSchema = z.object({
  summary: z.string(),
  transcript: z.string(),
  visible_text: z.string(),
  tags: z.array(z.string()),
});
export type PieceDescription = z.infer<typeof PieceDescriptionSchema>;
export type ProviderEvent =
  | { type: 'reasoning.delta'; text: string }
  | { type: 'text.delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'turn.end'; stopReason: 'tool_calls' | 'stop' | 'length'; providerState?: unknown };
export interface LlmProvider {
  capabilities(model: string): ModelCapabilities;
  streamTurn(input: {
    model: string;
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
  }): AsyncIterable<ProviderEvent>;
  describe(input: { model: string; pieces: MediaPart[] }): Promise<PieceDescription[]>;
}
