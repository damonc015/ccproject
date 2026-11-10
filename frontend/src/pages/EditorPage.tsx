import { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type DocumentSummary, type RunStatus } from '../api';
import { useAuth } from '../auth/AuthContext';
import { MockCollabProvider, type PresenceUser } from '../collab/mockProvider';
import { Editor } from '../components/Editor';
import { RunPanel } from '../components/RunPanel';
import { ShareDialog } from '../components/ShareDialog';
import { VersionPanel } from '../components/VersionPanel';
import { errMsg, useTheme } from '../util';

const CONN_TEXT = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected' };
const SAVE_TEXT = { saving: 'Saving…', saved: 'Saved', failed: 'Save failed', pending: 'Unsaved changes' };
const POLL_MS = 1000;
const FONT_KEY = 'ccdemo.fontSize';

export function EditorPage() {
  const { documentId = '' } = useParams();
  const { user } = useAuth();
  const [dark, setDark] = useTheme();
  const [doc, setDoc] = useState<DocumentSummary | null>(null);
  const [provider, setProvider] = useState<MockCollabProvider | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<'output' | 'versions'>('output');
  const [sharing, setSharing] = useState(false);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(FONT_KEY)) || 14);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [runError, setRunError] = useState('');
  const [runBusy, setRunBusy] = useState(false);
  const runToken = useRef(0);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Load the document record + content, then open the (mock) collaboration session.
  useEffect(() => {
    let cancelled = false;
    let created: MockCollabProvider | null = null;
    setDoc(null);
    setProvider(null);
    setLoadError('');
    setRun(null);

    Promise.all([api.getDocument(documentId), api.loadContent(documentId)])
      .then(([meta, content]) => {
        if (cancelled) return;
        const me: PresenceUser = { name: user?.name ?? 'You', color: '#3b5bdb', colorLight: '#3b5bdb33' };
        created = new MockCollabProvider({
          user: me,
          initialContent: content,
          readOnly: meta.role === 'viewer',
          persist: (text) => api.saveContent(documentId, text),
        });
        created.connect();
        setDoc(meta);
        setProvider(created);
      })
      .catch((e) => !cancelled && setLoadError(errMsg(e)));

    return () => {
      cancelled = true;
      runToken.current++;
      created?.destroy();
    };
  }, [documentId, user?.name]);

  useEffect(() => {
    if (!provider) return;
    const unsub = provider.subscribe(rerender);
    provider.awareness.on('change', rerender);
    return () => {
      unsub();
      provider.awareness.off('change', rerender);
    };
  }, [provider]);

  useEffect(() => localStorage.setItem(FONT_KEY, String(fontSize)), [fontSize]);

  if (loadError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="error" role="alert">{loadError}</div>
          <Link className="btn wide" to="/">
            Back to documents
          </Link>
        </div>
      </div>
    );
  }
  if (!doc || !provider) return <div className="auth-page muted">Opening document…</div>;

  const canEdit = doc.role !== 'viewer';
  const people = [...provider.awareness.getStates().entries()]
    .filter(([, s]) => s.user)
    .map(([id, s]) => ({ id, user: s.user as PresenceUser, self: id === provider.doc.clientID }));

  async function startRun() {
    const token = ++runToken.current;
    setTab('output');
    setRunError('');
    setRunBusy(true);
    setRun({ jobId: '', status: 'queued', stdout: '', stderr: '', exitCode: null, error: '', startedAt: null, finishedAt: null });
    try {
      // Production: the collab server captures the shared text, writes the queued job and returns jobId.
      const { jobId } = await api.startRun(documentId, provider!.getText());
      for (;;) {
        const status = await api.getRun(documentId, jobId);
        if (token !== runToken.current) return;
        setRun(status);
        if (status.status === 'completed' || status.status === 'failed') break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (e) {
      if (token !== runToken.current) return;
      setRunError(errMsg(e));
    }
    setRunBusy(false);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([provider!.getText()], { type: 'text/x-python' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = doc!.title.endsWith('.py') ? doc!.title : `${doc!.title}.py`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page editor-page">
      <header className="topbar">
        <Link to="/" className="btn ghost icon" title="Back to documents" aria-label="Back to documents">
          ←
        </Link>
        <div className="doc-title">
          <strong>{doc.title}</strong>
          <span className={`badge role-${doc.role}`}>{doc.role}</span>
        </div>

        <span className={`pill conn-${provider.status}`} title="Connection to the collaboration server">
          <span className="dot" />
          {CONN_TEXT[provider.status]}
        </span>
        {canEdit && (
          <span className={`pill save-${provider.saveStatus}`}>
            {SAVE_TEXT[provider.saveStatus]}
            {provider.saveStatus === 'failed' && (
              <button className="link" onClick={() => provider.retrySave()}>
                Retry
              </button>
            )}
          </span>
        )}

        <div className="spacer" />

        <div className="presence" aria-label="People in this document">
          {people.map((p) => (
            <span key={p.id} className="avatar" style={{ background: p.user.color }} title={p.self ? `${p.user.name} (you)` : p.user.name}>
              {p.user.name[0]?.toUpperCase()}
            </span>
          ))}
        </div>

        <details className="menu">
          <summary className="btn">Demo</summary>
          <div className="menu-items">
            <button onClick={() => (provider.status === 'disconnected' ? provider.connect() : provider.disconnect())}>
              {provider.status === 'disconnected' ? 'Reconnect' : 'Drop connection'}
            </button>
            <button onClick={() => provider.simulatePeerEdit()}>Simulate collaborator edit</button>
            <button
              disabled={!canEdit}
              onClick={() => {
                provider.failNextSave = true;
                rerender();
              }}
            >
              {provider.failNextSave ? 'Next save will fail ✓' : 'Fail the next save'}
            </button>
          </div>
        </details>

        <details className="menu">
          <summary className="btn">View</summary>
          <div className="menu-items">
            <button onClick={() => setDark(!dark)}>{dark ? 'Light theme' : 'Dark theme'}</button>
            <button onClick={() => setFontSize((s) => Math.min(22, s + 1))}>Larger text ({fontSize}px)</button>
            <button onClick={() => setFontSize((s) => Math.max(11, s - 1))}>Smaller text</button>
            <button onClick={download}>Download .py</button>
          </div>
        </details>

        <button className="btn" onClick={() => setSharing(true)}>
          Share
        </button>
        <button className="btn primary" onClick={startRun} disabled={runBusy}>
          {runBusy ? 'Running…' : '▶ Run'}
        </button>
      </header>

      {!canEdit && <div className="banner">You have view-only access. Edits by others still appear live.</div>}

      <div className="workspace">
        <Editor provider={provider} readOnly={!canEdit} dark={dark} fontSize={fontSize} />
        <aside className="side">
          <div className="tabs compact" role="tablist">
            <button role="tab" aria-selected={tab === 'output'} onClick={() => setTab('output')}>
              Output
            </button>
            <button role="tab" aria-selected={tab === 'versions'} onClick={() => setTab('versions')}>
              Versions
            </button>
          </div>
          {tab === 'output' ? (
            <RunPanel run={run} requestError={runError} />
          ) : (
            <VersionPanel
              documentId={documentId}
              canEdit={canEdit}
              getCurrentText={() => provider.getText()}
              onRestore={(content) => provider.replaceContent(content)}
            />
          )}
        </aside>
      </div>

      {sharing && <ShareDialog documentId={documentId} myRole={doc.role} onClose={() => setSharing(false)} />}
    </div>
  );
}
