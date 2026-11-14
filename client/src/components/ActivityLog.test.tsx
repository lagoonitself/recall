import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { ActivityLog, type ActivityStepData } from './ActivityLog';
import { parseSseStream } from '../lib/sse';
import type { SseEvent } from '@app/shared';

function createStreamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

async function eventsToSteps(events: SseEvent[]): Promise<ActivityStepData[]> {
  const stepsMap = new Map<number, ActivityStepData>();

  for (const ev of events) {
    if (ev.event === 'step.start') {
      stepsMap.set(ev.data.seq, {
        seq: ev.data.seq,
        kind: ev.data.kind,
        reasoningText: '',
      });
    } else if (ev.event === 'reasoning.delta') {
      const step = stepsMap.get(ev.data.seq);
      if (step) {
        step.reasoningText = (step.reasoningText || '') + ev.data.text;
      }
    } else if (ev.event === 'tool.call') {
      const step = stepsMap.get(ev.data.seq);
      if (step) {
        step.toolName = ev.data.name;
        step.toolArgs = ev.data.args;
      }
    } else if (ev.event === 'tool.result') {
      const step = stepsMap.get(ev.data.seq);
      if (step) {
        step.toolSummary = ev.data.summary;
        step.toolItems = ev.data.items;
      }
    } else if (ev.event === 'step.end') {
      const step = stepsMap.get(ev.data.seq);
      if (step) {
        step.ms = ev.data.ms;
      }
    }
  }

  return Array.from(stepsMap.values()).sort((a, b) => a.seq - b.seq);
}

describe('ActivityLog', () => {
  it('renders all steps correctly from the chat-demo.sse fixture', async () => {
    const fixturePath = path.resolve(__dirname, '../mocks/fixtures/chat-demo.sse');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(createStreamFromText(content))) {
      events.push(ev);
    }

    const steps = await eventsToSteps(events);

    expect(steps).toHaveLength(4);

    render(<ActivityLog steps={steps} />);

    // Header checks
    expect(screen.getByText('Agent activity')).toBeDefined();
    expect(screen.getByText(/\(4 steps,/)).toBeDefined();

    // Step 0: reasoning
    expect(screen.getByText(/The user is asking about the engine warning light/)).toBeDefined();

    // Step 1: tool call search_library
    expect(screen.getByText('search_library')).toBeDefined();
    expect(screen.getByText(/"query": "engine coolant temperature warning light"/)).toBeDefined();

    // Step 2: tool result
    expect(screen.getByText(/Found 2 matching pieces across manuals and service records/)).toBeDefined();

    // Step 3: sources opened
    expect(screen.getByText(/Opened 2 sources: owner-manual.pdf/)).toBeDefined();
  });
});
