import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type DocumentSummary } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { errMsg, relTime, useTheme } from '../util';

type Filter = 'all' | 'mine' | 'shared';
type Sort = 'updated' | 'title';

export function Gallery() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useTheme();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    api
      .listDocuments()
      .then(setDocs)
      .catch((e) => setError(errMsg(e)));

  useEffect(() => {
    void refresh();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? [])
      .filter((d) => (filter === 'all' ? true : filter === 'mine' ? d.role === 'owner' : d.role !== 'owner'))
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.ownerName.toLowerCase().includes(q))
      .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [docs, query, filter, sort]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const doc = await api.createDocument(title);
      navigate(`/doc/${doc.documentId}`);
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  async function remove(doc: DocumentSummary) {
    if (!window.confirm(`Delete "${doc.title}" for everyone? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.documentId);
      await refresh();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo">{'{ }'}</span> CollabCode
        </div>
        <div className="spacer" />
        <button className="btn ghost icon" onClick={() => setDark(!dark)} title="Toggle theme" aria-label="Toggle theme">
          {dark ? '☀' : '☾'}
        </button>
        <span className="muted hide-sm">{user?.email}</span>
        <button className="btn" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="gallery">
        <div className="gallery-head">
          <h1>Documents</h1>
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New document
          </button>
        </div>

        <div className="filters">
          <div className="tabs compact" role="tablist">
            {(['all', 'mine', 'shared'] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'mine' ? 'Owned by me' : 'Shared with me'}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <input className="search" placeholder="Search by title or owner" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort documents">
            <option value="updated">Last modified</option>
            <option value="title">Title</option>
          </select>
        </div>

        {error && <div className="error" role="alert">{error}</div>}

        {docs === null ? (
          <p className="muted">Loading documents…</p>
        ) : shown.length === 0 ? (
          <div className="empty">
            {docs.length === 0 ? 'No documents yet. Create one to get started.' : 'No documents match these filters.'}
          </div>
        ) : (
          <div className="grid">
            {shown.map((d) => (
              <Link key={d.documentId} to={`/doc/${d.documentId}`} className="card">
                <div className="card-top">
                  <span className="file-icon">py</span>
                  <span className={`badge role-${d.role}`}>{d.role}</span>
                </div>
                <div className="card-title">{d.title}</div>
                <div className="card-meta">
                  {d.role === 'owner' ? 'You' : d.ownerName} · {relTime(d.updatedAt)}
                </div>
                {d.role === 'owner' && (
                  <button
                    className="btn ghost icon card-del"
                    title="Delete document"
                    aria-label={`Delete ${d.title}`}
                    onClick={(e) => {
                      e.preventDefault();
                      void remove(d);
                    }}
                  >
                    🗑
                  </button>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      {creating && (
        <Modal title="New document" onClose={() => setCreating(false)}>
          <form onSubmit={create} className="stack">
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="untitled.py" autoFocus />
            </label>
            <div className="row end">
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
