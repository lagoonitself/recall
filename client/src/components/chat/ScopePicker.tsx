import { useState, useRef, useEffect, useId } from 'react';
import { Library, ChevronDown, Check } from 'lucide-react';
import type { Collection } from '@app/shared';

export interface ScopePickerProps {
  collections: Collection[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  disabled?: boolean;
}

export function ScopePicker({
  collections,
  selectedCollectionId,
  onSelectCollection,
  disabled = false,
}: ScopePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();

  // All options: null represents "All collections", followed by each collection
  const options: Array<{ id: string | null; name: string }> = [
    { id: null, name: 'All collections' },
    ...collections.map((c) => ({ id: c.id, name: c.name })),
  ];

  const selectedIndex = options.findIndex((opt) => opt.id === selectedCollectionId);
  const selectedName = selectedIndex >= 0 ? options[selectedIndex].name : 'All collections';

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Sync active index when opening
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [isOpen, selectedIndex]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (id: string | null) => {
    onSelectCollection(id);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < options.length) {
          handleSelect(options[activeIndex].id);
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="chat-scope-container" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-sm chat-scope-trigger"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label="Filter context by collection"
        title={disabled ? 'Scope is locked once conversation starts' : `Scope: ${selectedName}`}
      >
        <Library className="chat-scope-icon" strokeWidth={1.75} aria-hidden="true" />
        <span className="chat-scope-label">{selectedName}</span>
        <ChevronDown className="chat-scope-chevron" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {isOpen && (
        <ul
          id={listboxId}
          ref={listboxRef}
          className="chat-scope-menu"
          role="listbox"
          aria-label="Filter context by collection"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.id === selectedCollectionId;
            const isHighlighted = idx === activeIndex;

            return (
              <li
                key={opt.id ?? 'all'}
                id={`${listboxId}-option-${idx}`}
                role="option"
                aria-selected={isSelected}
                className={`chat-scope-item ${isSelected ? 'selected' : ''} ${
                  isHighlighted ? 'highlighted' : ''
                }`}
                onClick={() => handleSelect(opt.id)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <span className="chat-scope-item-name">{opt.name}</span>
                {isSelected && <Check className="chat-scope-check" strokeWidth={2} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
