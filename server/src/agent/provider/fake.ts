import { capabilities } from './capabilities.js';
import { PieceDescriptionSchema } from './types.js';
import type { LlmProvider, PieceDescription, ProviderEvent } from './types.js';
export interface FakeScript {
  turns?: ProviderEvent[][];
  descriptions?: PieceDescription[];
}
export class FakeProvider implements LlmProvider {
  private readonly turns: ProviderEvent[][];
  private readonly descriptions: PieceDescription[] | undefined;
  constructor(script: FakeScript = {}) {
    this.turns = structuredClone(script.turns ?? [[{ type: 'turn.end', stopReason: 'stop' }]]);
    this.descriptions =
      script.descriptions === undefined
        ? undefined
        : PieceDescriptionSchema.array().parse(script.descriptions);
  }
  capabilities(model: string) {
    return capabilities(model);
  }
  async *streamTurn(input: Parameters<LlmProvider['streamTurn']>[0]): AsyncIterable<ProviderEvent> {
    void input;
    const turn = this.turns.shift();
    if (!turn) throw new Error('FakeProvider has no scripted turns remaining');
    for (const event of turn) yield structuredClone(event);
  }
  async describe(input: Parameters<LlmProvider['describe']>[0]): Promise<PieceDescription[]> {
    if (this.descriptions && this.descriptions.length !== input.pieces.length)
      throw new Error('FakeProvider description count must match piece count');
    return PieceDescriptionSchema.array().parse(
      this.descriptions ??
        input.pieces.map(() => ({ summary: '', transcript: '', visible_text: '', tags: [] })),
    );
  }
}
