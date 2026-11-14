import { describe, expect, it } from 'vitest';
import { PieceDescriptionSchema } from './types.js';
import type { AgentMessage, LlmProvider, MediaPart, ProviderEvent } from './types.js';

export async function collect(events: AsyncIterable<ProviderEvent>) {
  const result: ProviderEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

export interface ContractScenario {
  create: () => LlmProvider;
  model: string;
  piece: MediaPart;
  reasoning: boolean;
  firstInput: Parameters<LlmProvider['streamTurn']>[0];
  followup: (events: ProviderEvent[]) => AgentMessage[];
}

export function providerContract(name: string, scenario: ContractScenario) {
  describe(name + ' provider contract', () => {
    it('streams tool calls with parsed arguments and a final state', async () => {
      const events = await collect(scenario.create().streamTurn(scenario.firstInput));
      const call = events.find((event) => event.type === 'tool_call');
      expect(call).toMatchObject({
        type: 'tool_call',
        id: expect.any(String),
        name: expect.any(String),
        args: expect.any(Object),
      });
      expect(events.at(-1)).toMatchObject({ type: 'turn.end', stopReason: 'tool_calls' });
      if (scenario.reasoning)
        expect(events.some((event) => event.type === 'reasoning.delta' && event.text.length > 0)).toBe(true);
    });
    it('accepts provider state on the next turn and streams text', async () => {
      const provider = scenario.create();
      const first = await collect(provider.streamTurn(scenario.firstInput));
      const end = first.at(-1);
      if (end?.type !== 'turn.end') throw new Error('Missing turn end');
      const messages = scenario.followup(first);
      const assistant = messages.find((message) => message.role === 'assistant');
      expect(assistant?.role === 'assistant' && assistant.providerState).toEqual(end.providerState);
      const events = await collect(provider.streamTurn({ ...scenario.firstInput, messages }));
      expect(events.some((event) => event.type === 'text.delta' && event.text.length > 0)).toBe(true);
      expect(events.at(-1)).toMatchObject({ type: 'turn.end', stopReason: 'stop' });
    });
    it('returns a validated description for each piece', async () => {
      const descriptions = await scenario
        .create()
        .describe({ model: scenario.model, pieces: [scenario.piece] });
      expect(descriptions).toHaveLength(1);
      expect(PieceDescriptionSchema.safeParse(descriptions[0]).success).toBe(true);
    });
  });
}
