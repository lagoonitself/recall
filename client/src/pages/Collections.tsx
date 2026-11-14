import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Collection } from '@app/shared';
import { api } from '../lib/api';
export function Collections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load collections.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter a collection name.');
      return;
    }
    try {
      await api.createCollection(name.trim());
      setName('');
      setCreating(false);
      setError('');
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create collection.');
    }
  }
  async function rename(collection: Collection) {
    const value = window.prompt('Rename collection', collection.name);
    if (value === null) return;
    if (!value.trim()) {
      setError('Enter a collection name.');
      return;
    }
    try {
      await api.updateCollection(collection.id, value.trim());
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not rename collection.');
    }
  }
  async function remove(collection: Collection) {
    if (!window.confirm(`Delete “${collection.name}” and its files? This cannot be undone.`)) return;
    try {
      await api.deleteCollection(collection.id);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete collection.');
    }
  }
  return (
    <main className="container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR SPACE / LIBRARY</p>
          <h1>A little more clarity.</h1>
          <p className="muted">Keep everything you want to remember, together.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          + New collection
        </button>
      </div>
      {creating && (
        <form className="create-form" onSubmit={create}>
          <label htmlFor="collection-name">Collection name</label>
          <div>
            <input
              id="collection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="e.g. Research notes"
            />
            <button className="button primary">Create</button>
            <button className="button secondary" type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="section-title">
        <h2>Collections</h2>
        <span>{collections.length} total</span>
      </div>
      {loading ? (
        <p>Loading your library…</p>
      ) : collections.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">▧</span>
          <h3>A fresh page.</h3>
          <p>Create a collection to start bringing your files together.</p>
          <button className="button secondary" onClick={() => setCreating(true)}>
            Create a collection
          </button>
        </div>
      ) : (
        <div className="collection-grid">
          {collections.map((collection, index) => (
            <article className="collection-card" key={collection.id}>
              <div className="card-top">
                <span className="folder-icon">▰</span>
                <details className="card-menu">
                  <summary aria-label={`Options for ${collection.name}`}>•••</summary>
                  <div>
                    <button onClick={() => void rename(collection)}>Rename</button>
                    <button onClick={() => void remove(collection)}>Delete</button>
                  </div>
                </details>
              </div>
              <Link className="collection-link" to={`/collections/${collection.id}`}>
                <span className="card-number">COLLECTION {String(index + 1).padStart(2, '0')}</span>
                <h3>{collection.name}</h3>
                <p>
                  {counts[collection.id] === undefined
                    ? 'Counting files…'
                    : `${counts[collection.id]} ${counts[collection.id] === 1 ? 'file' : 'files'}`}
                </p>
                <span className="card-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
