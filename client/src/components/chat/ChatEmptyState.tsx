import { Sparkles, Calendar, Video, Layers } from 'lucide-react';
import { LogoMark } from '../brand/Logo';

export interface ChatEmptyStateProps {
  scopeName?: string | null;
  onSelectSuggestion: (prompt: string) => void;
}

const SUGGESTIONS = [
  {
    icon: Sparkles,
    label: 'Summarize the key points',
  },
  {
    icon: Calendar,
    label: 'Find dates and deadlines',
  },
  {
    icon: Video,
    label: 'What does the video say about…',
  },
  {
    icon: Layers,
    label: 'Compare these documents',
  },
];

export function ChatEmptyState({ scopeName, onSelectSuggestion }: ChatEmptyStateProps) {
  const scopeText = scopeName ? `Searching ${scopeName}` : 'Searching all collections';

  return (
    <div className="chat-empty-state">
      <div className="chat-empty-content">
        <div className="chat-empty-orb" aria-hidden="true">
          <span className="chat-empty-ring ring-1" />
          <span className="chat-empty-ring ring-2" />
          <span className="chat-empty-ring ring-3" />
          <LogoMark size={32} />
        </div>
        <h1 className="chat-empty-headline font-serif">What do you want to know?</h1>
        <p className="chat-empty-scope">{scopeText}</p>
        <div className="chat-empty-grid" role="group" aria-label="Suggested prompts">
          {SUGGESTIONS.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className="chat-empty-suggestion"
                style={{ animationDelay: `${180 + index * 60}ms` }}
                onClick={() => onSelectSuggestion(item.label)}
              >
                <span className="chat-suggestion-icon-wrap" aria-hidden="true">
                  <Icon className="chat-suggestion-icon" strokeWidth={1.75} />
                </span>
                <span className="chat-suggestion-text">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
