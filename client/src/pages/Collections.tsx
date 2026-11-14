import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Folder, MoreHorizontal, Plus } from 'lucide-react';
import type { Collection } from '@app/shared';
import { api } from '../lib/api';
import { ConfirmDialog } from '../components/library/ConfirmDialog';
import { RenameDialog } from '../components/library/RenameDialog';

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

export function Collections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  // Card overflow menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Dialog states
  const [renamingCollection, setRenamingCollection] = useState<Collection | null>(null);
  const [deletingCollection, setDeletingCollection] = useState<Collection | null>(null);

  const menuContainerRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.collections();
      setCollections(result.collections);
      const entries = await Promise.all(
        result.collections.map(
          async (collection) => [collection.id, (await api.files(collection.id)).files.length] as const,
        ),
      );
      setCounts(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load collections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Handle outside click and escape for overflow menu
  useEffect(() => {
    if (!openMenuId) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
    }
  }, [creating]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    try {
      await api.createCollection(name.trim());
      setName('');
      setCreating(false);
      setError('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create collection.');
    }
  }

  async function handleRename(newName: string) {
    if (!renamingCollection) return;
    try {
      await api.updateCollection(renamingCollection.id, newName);
      setRenamingCollection(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename collection.');
    }
  }

  async function handleDelete() {
    if (!deletingCollection) return;
    try {
      await api.deleteCollection(deletingCollection.id);
      setDeletingCollection(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete collection.');
    }
  }

  return (
    <main className="library-container">
      {/* Header row */}
      <div className="library-header">
        <div className="library-title-group">
          <h1 className="library-title">Library</h1>
          {!loading && (
            <span className="library-count">
              {collections.length} {collections.length === 1 ? 'collection' : 'collections'}
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
        >
          <Plus size={16} strokeWidth={1.75} />
          <span>New collection</span>
        </button>
      </div>

      {/* Inline create input */}
      {creating && (
        <div className="library-create-inline">
          <form className="library-create-form" onSubmit={handleCreate}>
            <input
              ref={createInputRef}
              type="text"
              className="input library-create-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name..."
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setCreating(false);
                  setName('');
                }
              }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
              Create
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setCreating(false);
                setName('');
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {error && (
        <div role="alert" className="badge badge-danger" style={{ marginBottom: 'var(--space-4)', display: 'block' }}>
          {error}
        </div>
      )}

      {/* Skeletons while loading */}
      {loading ? (
        <div className="collections-grid" aria-label="Loading collections">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="collection-card-skeleton skeleton" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        /* Empty state */
        <div className="library-empty">
          <h2 className="library-empty-headline">Start your library</h2>
          <p className="library-empty-help">
            Create your first collection to organize and search research papers, transcripts, and media.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} strokeWidth={1.75} />
            <span>New collection</span>
          </button>
        </div>
      ) : (
        /* Grid of collection cards */
        <div className="collections-grid">
          {collections.map((collection) => {
            const count = counts[collection.id] ?? collection.fileCount ?? 0;
            const relativeDate = formatRelativeTime(collection.createdAt);
            const isMenuOpen = openMenuId === collection.id;

            return (
              <article key={collection.id} className="collection-card">
                <div className="collection-card-top">
                  <Folder className="collection-card-icon" size={18} strokeWidth={1.75} />
                  <div
                    className="collection-card-menu-wrapper"
                    ref={isMenuOpen ? menuContainerRef : undefined}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      aria-label={`Options for ${collection.name}`}
                      title="Options"
                      onClick={() => setOpenMenuId(isMenuOpen ? null : collection.id)}
                    >
                      <MoreHorizontal size={16} strokeWidth={1.75} />
                    </button>

                    {isMenuOpen && (
                      <div className="card-menu-popover" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="card-menu-item"
                          onClick={() => {
                            setOpenMenuId(null);
                            setRenamingCollection(collection);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="card-menu-item danger"
                          onClick={() => {
                            setOpenMenuId(null);
                            setDeletingCollection(collection);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <Link className="collection-card-link" to={`/collections/${collection.id}`}>
                  <h2 className="collection-card-name" title={collection.name}>
                    {collection.name}
                  </h2>
                  <span className="collection-card-meta">
                    {count} {count === 1 ? 'file' : 'files'}
                    {relativeDate ? ` · created ${relativeDate}` : ''}
                  </span>
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {/* Rename dialog */}
      <RenameDialog
        isOpen={Boolean(renamingCollection)}
        initialName={renamingCollection?.name ?? ''}
        onRename={handleRename}
        onClose={() => setRenamingCollection(null)}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingCollection)}
        title="Delete collection"
        description={`Are you sure you want to delete “${deletingCollection?.name}” and all its files? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => void handleDelete()}
        onClose={() => setDeletingCollection(null)}
      />
    </main>
  );
}
