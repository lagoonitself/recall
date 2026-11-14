import { useEffect, useState } from 'react';
import { Check, FileText, Image as ImageIcon, Mic, Search, Video } from 'lucide-react';
import { LogoMark } from './Logo';

interface Scenario {
  question: string;
  steps: string[];
  answer: [string, string, string];
  cite: { label: string; kind: 'pdf' | 'video' | 'audio' | 'image' };
}

const SCENARIOS: Scenario[] = [
  {
    question: 'What does the red thermometer light mean?',
    steps: ['Searched manuals and videos', 'Opened owner-manual.pdf'],
    answer: ['It signals engine coolant', 'over-temperature. Pull over and', 'let the engine cool first'],
    cite: { label: 'p. 42', kind: 'pdf' },
  },
  {
    question: 'When did the lecture cover gradient descent?',
    steps: ['Searched 3 lecture recordings', 'Matched transcript segment'],
    answer: ['Professor Okafor introduces it', 'with the hill analogy, then', 'derives the update rule'],
    cite: { label: '18:42', kind: 'video' },
  },
  {
    question: 'Which invoice is still unpaid?',
    steps: ['Read 14 scanned receipts', 'Compared due dates'],
    answer: ['Invoice #2291 from Larkspur', 'Studio, $1,184.50, was due', 'on 3 October'],
    cite: { label: 'scan 7', kind: 'image' },
  },
];

const KIND_ICON = { pdf: FileText, video: Video, audio: Mic, image: ImageIcon } as const;

type Phase = 'typing' | 'searching' | 'answering' | 'done';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function AuthDemo() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>('typing');
  const [stepCount, setStepCount] = useState(0);
  const scenario = SCENARIOS[index];

  useEffect(() => {
    if (prefersReducedMotion()) {
      setTyped(scenario.question.length);
      setStepCount(scenario.steps.length);
      setPhase('done');
      return;
    }
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    setTyped(0);
    setStepCount(0);
    setPhase('typing');
    const typeMs = 34;
    for (let i = 1; i <= scenario.question.length; i++) at(400 + i * typeMs, () => setTyped(i));
    const typedAt = 400 + scenario.question.length * typeMs;
    at(typedAt + 250, () => setPhase('searching'));
    scenario.steps.forEach((_, i) => at(typedAt + 700 + i * 650, () => setStepCount(i + 1)));
    const answerAt = typedAt + 700 + scenario.steps.length * 650;
    at(answerAt, () => setPhase('answering'));
    at(answerAt + 1100, () => setPhase('done'));
    at(answerAt + 4200, () => setIndex((value) => (value + 1) % SCENARIOS.length));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [index, scenario]);

  const CiteIcon = KIND_ICON[scenario.cite.kind];
  const showAnswer = phase === 'answering' || phase === 'done';

  return (
    <div className="auth-demo" aria-hidden="true">
      <div className="auth-demo-orbit">
        <span className="auth-demo-chip chip-a">
          <FileText size={13} strokeWidth={1.75} /> owner-manual.pdf
        </span>
        <span className="auth-demo-chip chip-b">
          <Video size={13} strokeWidth={1.75} /> lecture-04.mp4
        </span>
        <span className="auth-demo-chip chip-c">
          <Mic size={13} strokeWidth={1.75} /> standup-notes.m4a
        </span>
      </div>

      <div className="auth-demo-window">
        <div className="auth-demo-titlebar">
          <span />
          <span />
          <span />
        </div>

        <div className="auth-demo-question">
          <span>{scenario.question.slice(0, typed)}</span>
          {phase === 'typing' && <span className="auth-demo-caret" />}
        </div>

        <div className="auth-demo-answer">
          <span className="auth-demo-avatar">
            <LogoMark size={14} pulse={phase === 'searching'} />
          </span>
          <div className="auth-demo-answer-body">
            <ul className="auth-demo-steps">
              {phase !== 'typing' && stepCount === 0 && (
                <li className="auth-demo-step is-active">
                  <Search size={12} strokeWidth={2} /> Searching your library…
                </li>
              )}
              {scenario.steps.slice(0, stepCount).map((step) => (
                <li key={step} className="auth-demo-step">
                  <Check size={12} strokeWidth={2.25} /> {step}
                </li>
              ))}
            </ul>
            {showAnswer && (
              <p className="auth-demo-text" key={index}>
                {scenario.answer.map((line, i) => (
                  <span key={line} className="auth-demo-line" style={{ animationDelay: `${i * 140}ms` }}>
                    {line}
                    {i === scenario.answer.length - 1 && (
                      <span className={`auth-demo-cite ${phase === 'done' ? 'is-visible' : ''}`}>
                        <CiteIcon size={11} strokeWidth={2} /> {scenario.cite.label}
                      </span>
                    )}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
