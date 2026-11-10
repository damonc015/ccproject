import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { DEMO_CONFIRM_CODE, DEMO_EMAIL, useAuth } from '../auth/AuthContext';
import { USE_MOCK_AUTH } from '../config';
import { errMsg, useTheme } from '../util';

type Mode = 'signin' | 'signup' | 'confirm';

export function Login() {
  const auth = useAuth();
  useTheme();
  const [mode, setMode] = useState<Mode>('signin');
  // Mock mode opens with the demo account filled in, so sign-in is one click.
  const [email, setEmail] = useState(USE_MOCK_AUTH ? DEMO_EMAIL : '');
  const [password, setPassword] = useState(USE_MOCK_AUTH ? 'demo-password' : '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') await auth.signIn(email, password);
      else if (mode === 'signup') {
        await auth.signUp(email, password, name);
        setMode('confirm');
      } else await auth.confirmSignUp(email, code);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (m: Mode) => {
    // The demo account already exists, so the create-account form starts empty.
    if (m === 'signup' && email === DEMO_EMAIL) {
      setEmail('');
      setPassword('');
    }
    setMode(m);
    setError('');
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand big">
          <span className="logo">{'{ }'}</span> CollabCode
        </div>
        <p className="muted center">Write and run Python together, live.</p>

        {mode !== 'confirm' && (
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchTo('signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchTo('signup')}>
              Create account
            </button>
          </div>
        )}

        {mode === 'confirm' ? (
          <>
            <p>
              We sent a verification code to <strong>{email}</strong>.
            </p>
            <label>
              Verification code
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus required />
            </label>
            <p className="hint">Demo mode: no email is sent. The code is {DEMO_CONFIRM_CODE}.</p>
          </>
        ) : (
          <>
            {mode === 'signup' && (
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
            )}
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={8}
                required
              />
            </label>
          </>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        <button className="btn primary wide" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Verify and continue'}
        </button>

        {mode === 'signin' && USE_MOCK_AUTH && (
          <p className="hint center">Demo mode: the demo account is filled in. Any password of 8+ characters works.</p>
        )}
        {mode === 'confirm' && (
          <button type="button" className="btn ghost wide" onClick={() => switchTo('signup')}>
            Back
          </button>
        )}
      </form>
    </div>
  );
}
