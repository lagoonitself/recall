import type { SseEvent, StepKind } from '@app/shared';
import type { AgentMessage, LlmProvider, ToolDefinition } from './provider/index.js';
import { MAX_ROUNDS, TOOLS } from './prompt.js';
import type { RegisteredSource, TurnTools } from './tools.js';

export type StepRecord = {
  seq: number;
  kind: StepKind;
  payload: Record<string, unknown>;
  startedAt: Date;
  endedAt: Date | null;
};
export type LoopResult = {
  status: 'done' | 'aborted' | 'error';
  answer: string;
  steps: StepRecord[];
  /** Sources cited in the answer, in order of first citation. */
  cited: RegisteredSource[];
  providerState?: unknown;
  error?: string;
};

const CITATION = /\[S(\d+)\]/g;
/** Text that might still become a citation once the next chunk arrives. */
const PARTIAL = /\[(S\d*)?$/;

/**
 * Removes `[S#]` citations a tool never returned (ARCHITECTURE §5.6) from streamed text. A citation split
 * across chunks is held back until it is complete.
 */
export class CitationFilter {
  private tail = '';
  constructor(private readonly valid: (sid: string) => boolean) {}
  push(text: string): string {
    const combined = this.tail + text;
    const match = PARTIAL.exec(combined);
    this.tail = match ? match[0] : '';
    return this.clean(match ? combined.slice(0, match.index) : combined);
  }
  flush(): string {
    const rest = this.clean(this.tail);
    this.tail = '';
    return rest;
  }
  private clean(text: string) {
    return text.replace(CITATION, (whole, n: string) => (this.valid(`S${n}`) ? whole : ''));
  }
}

export function citedSids(answer: string): string[] {
  return [...new Set([...answer.matchAll(CITATION)].map((m) => `S${m[1]}`))];
}

/** Text shorter than this at the start of a round is held back: it may turn out to be a preamble before a tool call. */
const ANSWER_HOLD_CHARS = 160;

export async function runAgent(input: {
  provider: LlmProvider;
  model: string;
  system: string;
  messages: AgentMessage[];
  tools: TurnTools;
  emit: (event: SseEvent) => void;
  signal: AbortSignal;
  maxRounds?: number;
  toolDefinitions?: ToolDefinition[];
}): Promise<LoopResult> {
  const { provider, tools, emit, signal } = input;
  const maxRounds = input.maxRounds ?? MAX_ROUNDS;
  const messages = [...input.messages];
  const steps: StepRecord[] = [];
  const filter = new CitationFilter((sid) => tools.sources.has(sid));
  let answer = '';
  let providerState: unknown;

  const startStep = (kind: StepKind, payload: Record<string, unknown>) => {
    const step: StepRecord = { seq: steps.length, kind, payload, startedAt: new Date(), endedAt: null };
    steps.push(step);
    emit({ event: 'step.start', data: { seq: step.seq, kind } });
    return step;
  };
  const endStep = (step: StepRecord) => {
    if (step.endedAt) return;
    step.endedAt = new Date();
    emit({
      event: 'step.end',
      data: { seq: step.seq, ms: step.endedAt.getTime() - step.startedAt.getTime() },
    });
  };
  const emitAnswer = (text: string) => {
    if (!text) return;
    answer += text;
    emit({ event: 'answer.delta', data: { text } });
  };
  const reasoningStep = (text: string) => {
    const step = startStep('reasoning', { text });
    emit({ event: 'reasoning.delta', data: { seq: step.seq, text } });
    endStep(step);
  };
  const finish = (status: LoopResult['status'], error?: string): LoopResult => {
    if (status !== 'error') emitAnswer(filter.flush());
    for (const step of steps) if (!step.endedAt) step.endedAt = new Date();
    const cited = citedSids(answer).map((sid) => tools.sources.get(sid)!);
    return { status, answer: answer.trim(), steps, cited, providerState, error };
  };

  try {
    for (let round = 0; round < maxRounds; round++) {
      // Last round: no tools, so the model has to answer with what it found.
      const lastRound = round === maxRounds - 1;
      let reasoning: StepRecord | undefined;
      let pending = '';
      let answeredThisRound = false;
      let roundText = '';
      /** Text the user has not seen as answer: shown as a reasoning step if the round ends in tool calls. */
      let unshown = '';
      const calls: { id: string; name: string; args: unknown }[] = [];
      let stopReason: 'tool_calls' | 'stop' | 'length' = 'stop';
      const closeReasoning = () => {
        if (reasoning) endStep(reasoning);
        reasoning = undefined;
      };
      const flushPendingAsAnswer = () => {
        if (!answeredThisRound && answer && pending.trim()) pending = '\n\n' + pending.trimStart();
        answeredThisRound = true;
        emitAnswer(filter.push(pending));
        pending = '';
      };

      for await (const event of provider.streamTurn({
        model: input.model,
        system: input.system,
        messages,
        tools: lastRound ? [] : (input.toolDefinitions ?? TOOLS),
      })) {
        if (signal.aborted) break;
        if (event.type === 'reasoning.delta') {
          if (!event.text) continue;
          reasoning ??= startStep('reasoning', { text: '' });
          reasoning.payload.text = String(reasoning.payload.text) + event.text;
          emit({ event: 'reasoning.delta', data: { seq: reasoning.seq, text: event.text } });
        } else if (event.type === 'text.delta') {
          closeReasoning();
          roundText += event.text;
          if (calls.length) {
            unshown += event.text;
            continue;
          }
          pending += event.text;
          if (answeredThisRound || pending.length >= ANSWER_HOLD_CHARS) flushPendingAsAnswer();
        } else if (event.type === 'tool_call') {
          closeReasoning();
          if (lastRound) continue;
          if (!answeredThisRound) {
            unshown = pending + unshown;
            pending = '';
          }
          calls.push({ id: event.id, name: event.name, args: event.args });
        } else {
          stopReason = event.stopReason;
          providerState = event.providerState;
        }
      }
      closeReasoning();
      if (signal.aborted) return finish('aborted');

      if (!calls.length) {
        flushPendingAsAnswer();
        if (stopReason === 'length') emitAnswer('\n\n_(The answer was cut off at the length limit.)_');
        return finish('done');
      }

      // A tool call follows: whatever text came before it was the model thinking out loud.
      if (unshown.trim()) reasoningStep(unshown.trim());
      messages.push({ role: 'assistant', content: roundText, toolCalls: calls, providerState });

      const media: AgentMessage[] = [];
      for (const call of calls) {
        if (signal.aborted) return finish('aborted');
        const args =
          call.args && typeof call.args === 'object' && !Array.isArray(call.args)
            ? (call.args as Record<string, unknown>)
            : { value: call.args };
        const callStep = startStep('tool_call', { name: call.name, args });
        emit({ event: 'tool.call', data: { seq: callStep.seq, name: call.name, args } });
        endStep(callStep);
        const resultStep = startStep(call.name === 'open_sources' ? 'sources_opened' : 'tool_result', {
          name: call.name,
        });
        const outcome = await tools.run(call.name, call.args);
        Object.assign(resultStep.payload, { summary: outcome.summary, items: outcome.items });
        emit({
          event: 'tool.result',
          data: { seq: resultStep.seq, name: call.name, summary: outcome.summary, items: outcome.items },
        });
        endStep(resultStep);
        messages.push({ role: 'tool', toolCallId: call.id, content: outcome.modelText });
        if (outcome.media.length) media.push({ role: 'user', content: outcome.media });
      }
      // Media goes after all tool results: providers reject anything between a tool call and its results.
      messages.push(...media);
    }
    return finish('done');
  } catch (error) {
    console.error('agent loop failed', error);
    const message = 'The assistant ran into a problem. Please try again.';
    return finish('error', message);
  }
}
