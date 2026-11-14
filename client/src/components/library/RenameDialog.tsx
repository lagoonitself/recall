import { useEffect, useRef, useState, type FormEvent } from 'react';

interface RenameDialogProps {
  isOpen: boolean;
  initialName: string;
  onRename: (name: string) => void;
  onClose: () => void;
}

export function RenameDialog({ isOpen, initialName, onRename, onClose }: RenameDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onRename(name.trim());
      onClose();
    }
  };

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-dialog-title"
        onSubmit={handleSubmit}
      >
        <h3 id="rename-dialog-title" className="dialog-title">
          Rename collection
        </h3>
        <input
          ref={inputRef}
          type="text"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Collection name"
          required
        />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
