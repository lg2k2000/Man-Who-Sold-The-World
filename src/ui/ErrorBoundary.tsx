import { Component, type ReactNode } from 'react';
import { useApp } from '../state/app';
import { backupFileName, makeBackup } from '../import/backup';
import { downloadText } from './download';

interface State {
  error: Error | null;
}

/** Catches a crash anywhere in the app and offers a reload and a backup of the data. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Something broke on this page.</h1>
        <p>Your imported data is still saved in this browser. Reloading usually fixes this. If it keeps happening, save a backup first.</p>
        <div className="btn-row">
          <button type="button" className="btn solid" onClick={() => location.reload()}>
            Reload
          </button>
          <button type="button" className="btn" onClick={() => downloadText(backupFileName(), makeBackup(useApp.getState().data))}>
            Save a backup
          </button>
        </div>
        <pre>{this.state.error.message}</pre>
      </div>
    );
  }
}

/** Shown instead of the app when config/territories.json does not pass its checks. */
export function ConfigError({ problems }: { problems: string[] }) {
  return (
    <div className="crash" role="alert">
      <h1>config/territories.json has problems.</h1>
      <p>The map needs a valid territory file. Fix these and reload:</p>
      <ul>
        {problems.map((p) => (
          <li key={p}>
            <code>{p}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
