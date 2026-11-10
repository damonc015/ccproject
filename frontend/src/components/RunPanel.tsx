import type { RunStatus } from '../api';

const ERROR_TEXT: Record<string, string> = {
  NONZERO_EXIT: 'The program exited with an error.',
  TIMEOUT: 'The program was stopped after the 10 second limit.',
  BAD_LANGUAGE: 'Only Python can be run.',
  CODE_TOO_LARGE: 'The source is longer than the 7,000 character limit.',
  DISPATCH_FAILED: 'The sandbox could not be started. Try again.',
};

const STATUS_TEXT: Record<RunStatus['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

interface Props {
  run: RunStatus | null;
  requestError: string;
}

export function RunPanel({ run, requestError }: Props) {
  if (requestError) return <div className="panel-body"><div className="error" role="alert">{requestError}</div></div>;
  if (!run) {
    return (
      <div className="panel-body">
        <div className="empty small">Press Run to execute the shared code in the sandbox. Output appears here.</div>
      </div>
    );
  }

  const active = run.status === 'queued' || run.status === 'running';
  const duration =
    run.startedAt && run.finishedAt ? ((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1) : null;

  return (
    <div className="panel-body">
      <div className="run-head" aria-live="polite">
        <span className={`pill run-${run.status}`}>
          {active && <span className="spinner" />}
          {STATUS_TEXT[run.status]}
        </span>
        {run.exitCode !== null && <span className="muted">exit code {run.exitCode}</span>}
        {duration && <span className="muted">{duration}s</span>}
      </div>

      {run.status === 'queued' && <p className="hint">Waiting for a sandbox. A cold start can take up to a minute.</p>}
      {run.error && <div className="error">{ERROR_TEXT[run.error] ?? run.error}</div>}

      {!active && (
        <>
          <div className="out-label">stdout</div>
          <pre className="output">{run.stdout || <span className="muted">(no output)</span>}</pre>
          {run.stderr && (
            <>
              <div className="out-label">stderr</div>
              <pre className="output stderr">{run.stderr}</pre>
            </>
          )}
        </>
      )}
    </div>
  );
}
