import { useEffect, useState, type FormEvent } from 'react';
import { api, type Collaborator, type Role } from '../api';
import { errMsg } from '../util';
import { Modal } from './Modal';

interface Props {
  documentId: string;
  myRole: Role;
  onClose: () => void;
}

export function ShareDialog({ documentId, myRole, onClose }: Props) {
  const [people, setPeople] = useState<Collaborator[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const isOwner = myRole === 'owner';

  useEffect(() => {
    api.listCollaborators(documentId).then(setPeople).catch((e) => setError(errMsg(e)));
  }, [documentId]);

  const apply = (p: Promise<Collaborator[]>) =>
    p
      .then((next) => {
        setPeople(next);
        setError('');
      })
      .catch((e) => setError(errMsg(e)));

  async function add(e: FormEvent) {
    e.preventDefault();
    await apply(api.shareDocument(documentId, email, role));
    setEmail('');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy the link.');
    }
  }

  return (
    <Modal title="Share document" onClose={onClose}>
      <div className="stack">
        {isOwner ? (
          <form className="row" onSubmit={add}>
            <input type="email" className="grow" placeholder="Add people by email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email to share with" />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn primary">Share</button>
          </form>
        ) : (
          <p className="hint">Only the owner can change who has access.</p>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        <ul className="people">
          {people === null && <li className="muted">Loading…</li>}
          {people?.map((p) => (
            <li key={p.userId}>
              <span className="avatar">{p.name[0]?.toUpperCase()}</span>
              <span className="grow">
                <strong>{p.name}</strong>
                <span className="muted block">{p.email}</span>
              </span>
              {isOwner && p.role !== 'owner' ? (
                <>
                  <select value={p.role} onChange={(e) => apply(api.shareDocument(documentId, p.email, e.target.value as Role))} aria-label={`Role for ${p.name}`}>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button className="btn ghost icon" title="Remove access" aria-label={`Remove ${p.name}`} onClick={() => apply(api.unshareDocument(documentId, p.userId))}>
                    ✕
                  </button>
                </>
              ) : (
                <span className={`badge role-${p.role}`}>{p.role}</span>
              )}
            </li>
          ))}
        </ul>

        <div className="row end">
          <button className="btn" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
