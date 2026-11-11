import { useEffect, useState, type FormEvent } from 'react';
import { api, type VersionMeta } from '../api';
import { errMsg, relTime } from '../util';
import { USE_LOCAL_API } from '../config';

interface Props {
  documentId: string;
  canEdit: boolean;
  getCurrentText: () => string;
  onRestore: (content: string) => void;
}

export function VersionPanel({ documentId, canEdit, getCurrentText, onRestore }: Props) {
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ meta: VersionMeta; content: string | null } | null>(null);

  useEffect(() => {
    api.listVersions(documentId).then(setVersions).catch((e) => setError(errMsg(e)));
  }, [documentId]);

  async function snapshot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const v = await api.createVersion(documentId, label, getCurrentText());
      setVersions((prev) => [v, ...(prev ?? [])]);
      setLabel('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function open(meta: VersionMeta) {
    setPreview({ meta, content: null });
    try {
      const content = await api.getVersionContent(documentId, meta.versionId);
      setPreview((p) => (p?.meta.versionId === meta.versionId ? { meta, content } : p));
    } catch (err) {
      setError(errMsg(err));
      setPreview(null);
    }
  }

  if (preview) {
    return (
      <div className="panel-body">
        <button className="btn ghost" onClick={() => setPreview(null)}>
          ← All versions
        </button>
        <div>
          <strong>{preview.meta.label}</strong>
          <div className="muted">
            {preview.meta.createdByName} · {relTime(preview.meta.createdAt)}
          </div>
        </div>
        <pre className="output preview">{preview.content ?? 'Loading…'}</pre>
        {canEdit && (
          <button
            className="btn primary"
            disabled={preview.content === null}
            onClick={() => {
              onRestore(preview.content!);
              setPreview(null);
            }}
          >
            Restore this version
          </button>
        )}
        <p className="hint">{USE_LOCAL_API
          ? 'Restoring replaces the local editor text. Live collaboration is simulated in this demo.'
          : 'Restoring is applied as a new edit, so collaborators see it live and nothing is lost.'}</p>
      </div>
    );
  }

  return (
    <div className="panel-body">
      {canEdit && (
        <form className="row" onSubmit={snapshot}>
          <input className="grow" placeholder="Version label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Version label" />
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save version'}
          </button>
        </form>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      {versions === null ? (
        <p className="muted">Loading versions…</p>
      ) : versions.length === 0 ? (
        <div className="empty small">No saved versions yet.</div>
      ) : (
        <ul className="versions">
          {versions.map((v) => (
            <li key={v.versionId}>
              <button onClick={() => open(v)}>
                <strong>{v.label}</strong>
                <span className="muted">
                  {v.createdByName} · {relTime(v.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
