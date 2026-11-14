import React, { useState } from 'react';
import type { AgentStep, StepKind } from '@app/shared';
import { Search, BookOpen, Sparkles, Wrench, ChevronRight } from 'lucide-react';

export interface ActivityStepData {
  seq: number;
  kind: StepKind;
  ms?: number;
  /** Wall-clock times (ms since epoch) so the header can show real elapsed time, model thinking included. */
  startedAtMs?: number;
  endedAtMs?: number;
  reasoningText?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolSummary?: string;
  toolItems?: unknown[];
}

export interface ActivityLogProps {
  steps: (AgentStep | ActivityStepData)[];
  isStreaming?: boolean;
}

function normalizeStep(step: AgentStep | ActivityStepData): ActivityStepData {
  if ('payload' in step && step.payload !== undefined) {
    const payload = (step.payload as Record<string, unknown>) || {};
    const ms =
      step.endedAt && step.startedAt
        ? Math.max(0, new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime())
        : undefined;

    return {
      seq: step.seq,
      kind: step.kind,
      ms,
      startedAtMs: new Date(step.startedAt).getTime(),
      endedAtMs: step.endedAt ? new Date(step.endedAt).getTime() : undefined,
      reasoningText: (payload.text as string) || undefined,
      toolName: (payload.name as string) || undefined,
      toolArgs: (payload.args as Record<string, unknown>) || undefined,
      toolSummary: (payload.summary as string) || undefined,
      toolItems: (payload.items as unknown[]) || undefined,
    };
  }
  return step as ActivityStepData;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTime(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function deriveActivitySummary(steps: ActivityStepData[]): string {
  let searchCount = 0;
  let sourceCount = 0;
  let totalMs = 0;

  for (const s of steps) {
    if (s.ms) totalMs += s.ms;

    if (s.toolName === 'search_library' || (s.kind === 'tool_call' && s.toolArgs?.query)) {
      searchCount += 1;
    }

    if (s.kind === 'sources_opened' || s.toolName === 'open_sources') {
      if (Array.isArray(s.toolArgs?.source_ids)) {
        sourceCount = Math.max(sourceCount, (s.toolArgs.source_ids as string[]).length);
      } else if (Array.isArray(s.toolItems)) {
        sourceCount = Math.max(sourceCount, s.toolItems.length);
      } else if (s.toolSummary) {
        const m = s.toolSummary.match(/Opened (\d+) sources?/i);
        if (m) {
          sourceCount = Math.max(sourceCount, parseInt(m[1], 10));
        } else {
          sourceCount = Math.max(sourceCount, 1);
        }
      } else {
        sourceCount = Math.max(sourceCount, 1);
      }
    }
  }

  const starts = steps.flatMap((s) => (s.startedAtMs !== undefined ? [s.startedAtMs] : []));
  const ends = steps.flatMap((s) => (s.endedAtMs !== undefined ? [s.endedAtMs] : []));
  if (starts.length && ends.length) {
    totalMs = Math.max(0, Math.max(...ends) - Math.min(...starts));
  }
  const durationStr = `${(totalMs / 1000).toFixed(1)} s`;
  const parts: string[] = [];

  if (searchCount > 0) {
    parts.push(`Searched ${searchCount} ${searchCount === 1 ? 'time' : 'times'}`);
  }
  if (sourceCount > 0) {
    parts.push(`read ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`);
  }

  if (parts.length === 0) {
    return `Thought for ${durationStr}`;
  }

  return `${parts.join(' · ')} · ${durationStr}`;
}

function getLiveLabel(steps: ActivityStepData[]): string {
  if (steps.length === 0) return 'Thinking…';
  const latest = steps[steps.length - 1];

  if (latest.toolName === 'search_library' || latest.toolArgs?.query) {
    const q = (latest.toolArgs?.query as string) || '';
    return q ? `Searching your library for "${q}"…` : 'Searching your library…';
  }

  if (latest.kind === 'sources_opened' || latest.toolName === 'open_sources') {
    const count = Array.isArray(latest.toolArgs?.source_ids)
      ? latest.toolArgs.source_ids.length
      : Array.isArray(latest.toolItems)
        ? latest.toolItems.length
        : 2;
    return `Reading ${count} sources…`;
  }

  if (latest.kind === 'reasoning') {
    return 'Reasoning…';
  }

  return 'Thinking…';
}

function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 140 || text.includes('\n');

  return (
    <div className="activity-reasoning-wrap">
      <p className={`activity-reasoning-p ${!expanded && isLong ? 'clamped' : ''}`}>{text}</p>
      {isLong && (
        <button type="button" className="activity-reasoning-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function renderStepDetails(step: ActivityStepData) {
  const { kind, toolName, toolArgs, toolSummary, toolItems, reasoningText, ms } = step;

  // 1. Reasoning step
  if (kind === 'reasoning' || reasoningText) {
    return {
      icon: <Sparkles size={11} strokeWidth={1.75} aria-hidden="true" />,
      title: 'Reasoned',
      body: reasoningText ? <ReasoningBlock text={reasoningText} /> : null,
      chips: [],
      ms,
      raw: { kind, text: reasoningText },
    };
  }

  // 2. Search library tool call
  if (toolName === 'search_library' && toolArgs?.query) {
    const query = String(toolArgs.query);
    return {
      icon: <Search size={11} strokeWidth={1.75} aria-hidden="true" />,
      title: `Searched for "${query}"`,
      body: null,
      chips: [],
      ms,
      raw: toolArgs,
    };
  }

  // 3. Search library tool result
  if (kind === 'tool_result' && (toolName === 'search_library' || toolItems || toolSummary)) {
    const chips: string[] = [];
    if (Array.isArray(toolItems)) {
      for (const item of toolItems) {
        if (typeof item === 'object' && item !== null) {
          const rec = item as Record<string, unknown>;
          if (rec.fileName) {
            let label = String(rec.fileName);
            if (rec.page !== undefined) {
              label += ` · p. ${rec.page}`;
            } else if (rec.startSec !== undefined) {
              label += ` · ${formatTime(Number(rec.startSec))}`;
            }
            chips.push(label);
          }
        }
      }
    }

    const matchCount = chips.length || (Array.isArray(toolItems) ? toolItems.length : 0);
    const title =
      toolSummary ||
      (matchCount > 0 ? `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}` : 'Found matching pieces');

    return {
      icon: <Search size={11} strokeWidth={1.75} aria-hidden="true" />,
      title,
      body: null,
      chips,
      ms,
      raw: { summary: toolSummary, items: toolItems },
    };
  }

  // 4. Open sources / sources opened
  if (kind === 'sources_opened' || toolName === 'open_sources') {
    let sids: string[] = [];
    if (Array.isArray(toolArgs?.source_ids)) {
      sids = toolArgs.source_ids as string[];
    }

    const chips: string[] = [];
    // Extract chips from summary string if available e.g. "Opened 2 sources: owner-manual.pdf (p. 42) and coolant-service.mp4 (00:24)."
    if (toolSummary) {
      const match = toolSummary.match(/Opened \d+ sources?:\s*(.+)\.?$/i);
      if (match && match[1]) {
        const parts = match[1].split(/\s+and\s+|,\s*/);
        for (const p of parts) {
          const clean = p.replace(/\.$/, '').trim();
          if (clean) chips.push(clean);
        }
      }
    }

    const title = sids.length > 0 ? `Read ${sids.join(', ')}` : toolSummary || 'Read sources';

    return {
      icon: <BookOpen size={11} strokeWidth={1.75} aria-hidden="true" />,
      title,
      body: null,
      chips,
      ms,
      raw: { args: toolArgs, summary: toolSummary, items: toolItems },
    };
  }

  // 5. Generic / other tool
  const title = toolName ? toolName.replace(/_/g, ' ') : 'Executed step';
  return {
    icon: <Wrench size={11} strokeWidth={1.75} aria-hidden="true" />,
    title,
    body: toolSummary ? <p className="activity-step-summary">{toolSummary}</p> : null,
    chips: [],
    ms,
    raw: { name: toolName, args: toolArgs, summary: toolSummary, items: toolItems },
  };
}

export function ActivityLog({ steps, isStreaming = false }: ActivityLogProps) {
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  if (!steps || steps.length === 0) return null;

  const normalized = steps.map(normalizeStep);
  // Collapsed by default when done, expanded while streaming
  const isExpanded = userExpanded !== null ? userExpanded : isStreaming;

  const summary = deriveActivitySummary(normalized);
  const liveLabel = getLiveLabel(normalized);

  return (
    <div className={`activity-log ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        type="button"
        className="activity-header-btn"
        onClick={() => setUserExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="activity-timeline-content"
      >
        <div className="activity-header-left">
          {isStreaming ? (
            <div className="activity-live-indicator" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <span className="activity-live-label">{liveLabel}</span>
            </div>
          ) : (
            <div className="activity-done-header">
              <ChevronRight
                size={14}
                className={`activity-chevron ${isExpanded ? 'expanded' : ''}`}
                aria-hidden="true"
              />
              <span className="activity-summary-text">{summary}</span>
            </div>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="activity-timeline" id="activity-timeline-content">
          {normalized.map((step) => {
            const { icon, title, body, chips, ms, raw } = renderStepDetails(step);
            return (
              <div key={step.seq} className="activity-timeline-item">
                <span className="activity-dot" aria-hidden="true">
                  {icon}
                </span>

                <div className="activity-step-main">
                  <div className="activity-step-header">
                    <span className="activity-step-title">{title}</span>
                    {ms !== undefined && <span className="activity-step-duration">{formatDuration(ms)}</span>}
                  </div>

                  {body}

                  {chips && chips.length > 0 && (
                    <div className="activity-chips-list">
                      {chips.map((chip, idx) => (
                        <span key={idx} className="activity-chip">
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}

                  <details className="activity-raw-disclosure">
                    <summary className="activity-raw-summary">View raw</summary>
                    <pre className="activity-raw-pre">{JSON.stringify(raw, null, 2)}</pre>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
