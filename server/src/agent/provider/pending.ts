import { capabilities } from './capabilities.js';
import type { LlmProvider, ProviderEvent, PieceDescription } from './types.js';

export class PendingProvider implements LlmProvider {
  constructor(readonly provider: string) {}
  capabilities = capabilities;
  async *streamTurn(): AsyncIterable<ProviderEvent> {
    throw new Error(`${this.provider} adapter is not implemented`);
  }
  async describe(): Promise<PieceDescription[]> {
    throw new Error(`${this.provider} adapter is not implemented`);
  }
}
