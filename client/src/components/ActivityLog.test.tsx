import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { ActivityLog, deriveActivitySummary, type ActivityStepData } from './ActivityLog';
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
  it('renders summary line when collapsed and human sentences (not JSON) when expanded', async () => {
    const fixturePath = path.resolve(__dirname, '../mocks/fixtures/chat-demo.sse');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(createStreamFromText(content))) {
      events.push(ev);
    }

    const steps = await eventsToSteps(events);
    expect(steps).toHaveLength(4);

    const { container } = render(<ActivityLog steps={steps} />);

    // Collapsed header check - human summary derived from steps
    const summaryText = deriveActivitySummary(steps);
    expect(screen.getByText(summaryText)).toBeDefined();
    expect(summaryText).toMatch(/Searched 1 time/);
    expect(summaryText).toMatch(/read 2 sources/);

    // Expand the activity log
    const headerBtn = screen.getByRole('button', { name: new RegExp(summaryText, 'i') });
    fireEvent.click(headerBtn);

    // Step 0: Reasoning
    expect(screen.getByText('Reasoned')).toBeDefined();
    expect(
      screen.getAllByText(/The user is asking about the engine warning light/).length,
    ).toBeGreaterThan(0);

    // Step 1: Human sentence for search_library (never raw JSON)
    expect(
      screen.getByText('Searched for "engine coolant temperature warning light"'),
    ).toBeDefined();

    // Step 2: Tool result with summary
    expect(
      screen.getAllByText(/Found 2 matching pieces across manuals and service records/).length,
    ).toBeGreaterThan(0);

    // Step 3: Sources opened
    expect(screen.getAllByText(/Opened 2 sources: owner-manual.pdf/).length).toBeGreaterThan(0);

    // Raw JSON is enclosed in collapsed details disclosure
    const rawDetails = container.querySelectorAll('.activity-raw-disclosure');
    expect(rawDetails.length).toBeGreaterThan(0);
  });

  it('renders live status with aria-live while streaming', () => {
    const liveSteps: ActivityStepData[] = [
      {
        seq: 0,
        kind: 'tool_call',
        toolName: 'search_library',
        toolArgs: { query: 'yenepoya' },
      },
    ];

    render(<ActivityLog steps={liveSteps} isStreaming={true} />);

    expect(screen.getByText('Searching your library for "yenepoya"…')).toBeDefined();
    const liveIndicator = document.querySelector('[aria-live="polite"]');
    expect(liveIndicator).not.toBeNull();
  });
});
