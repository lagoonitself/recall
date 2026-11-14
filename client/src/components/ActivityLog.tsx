import { useState } from 'react';
import type { AgentStep, StepKind } from '@app/shared';

export interface ActivityStepData {
  seq: number;
  kind: StepKind;
  ms?: number;
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

const STEP_ICONS: Record<StepKind, string> = {
  reasoning: '🧠',
  tool_call: '🔧',
  tool_result: '📄',
  sources_opened: '👁',
};

const STEP_LABELS: Record<StepKind, string> = {
  reasoning: 'Reasoning',
  tool_call: 'Tool call',
  tool_result: 'Result',
  sources_opened: 'Opened',
};

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
      reasoningText: (payload.text as string) || undefined,
      toolName: (payload.name as string) || undefined,
      toolArgs: (payload.args as Record<string, unknown>) || undefined,
      toolSummary: (payload.summary as string) || undefined,
      toolItems: (payload.items as unknown[]) || undefined,
    };
  }
  return step;
}

export function ActivityLog({ steps, isStreaming = false }: ActivityLogProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!steps || steps.length === 0) {
    return null;
  }

  const normalized = steps.map(normalizeStep);

  const totalMs = normalized.reduce((acc, step) => acc + (step.ms ?? 0), 0);
  const timeDisplay = totalMs > 0 ? `${(totalMs / 1000).toFixed(1)} s` : isStreaming ? 'live' : '0.1 s';

  return (
    <details className="activity-log" open={isOpen} onToggle={(e) => setIsOpen(e.currentTarget.open)}>
      <summary className="activity-summary" aria-label="Toggle agent activity steps">
        <span className="summary-title">
          <span className="chevron" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
          <strong>Agent activity</strong>
          <span className="summary-meta">
            ({normalized.length} {normalized.length === 1 ? 'step' : 'steps'}, {timeDisplay})
          </span>
        </span>
        {isStreaming && (
          <span className="live-pulse" aria-label="Agent is actively thinking">
            <span className="pulse-dot" /> Live
          </span>
        )}
      </summary>

      <div className="activity-steps" role="list">
        {normalized.map((step, idx) => {
          const icon = STEP_ICONS[step.kind] || '⚙';
          const label = step.toolName ? step.toolName : STEP_LABELS[step.kind];

          return (
            <div className={`activity-step kind-${step.kind}`} key={`${step.seq}-${idx}`} role="listitem">
              <div className="step-header">
                <span className="step-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="step-kind">{label}</span>
                {step.ms !== undefined && step.ms > 0 && <span className="step-ms">{step.ms} ms</span>}
              </div>

              <div className="step-body">
                {step.kind === 'reasoning' && (
                  <p className="step-reasoning">{step.reasoningText || 'Thinking…'}</p>
                )}

                {step.kind === 'tool_call' && step.toolArgs && (
                  <pre className="step-args">{JSON.stringify(step.toolArgs, null, 2)}</pre>
                )}

                {step.kind === 'tool_result' && (
                  <div className="step-result">
                    <p className="step-summary">{step.toolSummary}</p>
                  </div>
                )}

                {step.kind === 'sources_opened' && (
                  <div className="step-opened">
                    {step.toolSummary ? (
                      <p className="step-summary">{step.toolSummary}</p>
                    ) : (
                      <p className="step-summary">Loaded sources for multimodal inspection</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
