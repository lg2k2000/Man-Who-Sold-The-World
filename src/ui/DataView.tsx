import { useRef, useState } from 'react';
import { TABLES, type Dataset, type TableName } from '../data/types';
import { describeStorageError } from '../data/idb';
import type { ImportReport } from '../import/importer';
import { backupFileName, makeBackup, restoreBackup } from '../import/backup';
import { applySnapshot, markSnapshotApplied, snapshotApplied } from '../import/snapshot';
import { TABLE_LABELS } from '../import/tables';
import { useApp, withoutSample } from '../state/app';
import { askConfirm, showExport } from './dialogs';
import { today } from './forms';
import { ImportPanel, ReportDetails } from './ImportPanel';

const EMPTY_HINT: Record<TableName, string> = {
  companies: 'Prospects, customers, and partners. A deal spreadsheet adds the companies it names.',
  contacts: 'People at those companies, with titles and who reports to whom.',
  deals: "Deals with stage, amount, and close date, such as your manager's pipeline sheet.",
  people: 'HPE people: territory teams and account coverage.',
  coverage: 'Which HPE person covers which company. Needs the HPE team and companies first.',
  briefs: 'Research briefs, one per company, as JSON.',
};

/** Imports, the import report, sample data, and backups. */
export function DataView() {
  const data = useApp((s) => s.data);
  const config = useApp((s) => s.config);
  const store = useApp((s) => s.store);
  const hasSample = useApp((s) => s.hasSample);
  const saveTable = useApp((s) => s.saveTable);
  const saveAll = useApp((s) => s.saveAll);
  const storeProblem = useApp((s) => s.storeProblem);
  const snapshot = useApp((s) => s.snapshot);

  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(`Saving failed: ${describeStorageError(e)} Nothing was changed.`);
    } finally {
      setBusy(false);
    }
  };

  const loadSample = () =>
    run(async () => {
      const { default: sample } = await import('../../fixtures/sample/dataset.json');
      const merged = mergeSample(useApp.getState().data, sample as unknown as Dataset);
      await saveAll(merged);
      setMessage('Sample data loaded. Every name in it is fake; remove it before importing real data if you want a clean view.');
    });

  const removeSample = () =>
    run(async () => {
      await saveAll(withoutSample(useApp.getState().data));
      setMessage('Sample data removed.');
    });

  const loadSnapshot = () =>
    run(async () => {
      if (!snapshot) return;
      const { data: next, reports: done } = applySnapshot(useApp.getState().data, snapshot.snap, config, today());
      await saveAll(next);
      markSnapshotApplied(snapshot.snap.id);
      setReports(done.filter((r) => r.added + r.updated + r.rejected.length + r.warnings.length > 0));
      const added = done.reduce((n, r) => n + r.added, 0);
      const updated = done.reduce((n, r) => n + r.updated, 0);
      setMessage(`Loaded the snapshot: ${added} rows added, ${updated} updated. Nothing stored was blanked.`);
    });

  const clearTable = (t: TableName) =>
    run(async () => {
      const ok = await askConfirm({
        title: `Delete all ${TABLE_LABELS[t].toLowerCase()}?`,
        body: `This removes all ${data[t].length} ${TABLE_LABELS[t].toLowerCase()} rows from this browser. Export a backup first if you might want them back.`,
        confirmLabel: `Delete ${data[t].length} rows`,
        danger: true,
      });
      if (!ok) return;
      await saveTable(t, [] as never);
    });

  const exportAll = () =>
    showExport({
      title: 'Export everything',
      fileName: backupFileName(),
      text: makeBackup(useApp.getState().data),
      hint: 'One JSON file with every row. Keep it outside the repository; Restore from file loads it again.',
    });

  const restore = (files: FileList | null) =>
    run(async () => {
      const file = files?.[0];
      if (!file) return;
      const result = restoreBackup(await file.text(), file.name, config);
      if (restoreRef.current) restoreRef.current.value = '';
      if (!result.data) {
        setMessage(result.error);
        return;
      }
      const total = TABLES.reduce((n, t) => n + result.data![t].length, 0);
      const ok = await askConfirm({
        title: 'Replace everything?',
        body: `This replaces everything stored in this browser with the ${total} rows in ${file.name}.`,
        confirmLabel: 'Replace everything',
        danger: true,
      });
      if (!ok) return;
      await saveAll(result.data);
      setReports(result.reports.filter((r) => r.added + r.updated + r.rejected.length + r.warnings.length > 0));
      setMessage(`Restored ${total} rows from ${file.name}.`);
    });

  const totalRows = TABLES.reduce((n, t) => n + data[t].length, 0);

  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-inner">
        <header className="page-head">
          <h2>Data</h2>
          <p className="muted">
            Everything here lives in {store?.kind ?? 'this browser'} and never leaves it.{' '}
            {totalRows === 0 ? 'Nothing is imported yet.' : `${totalRows} rows in all.`}
          </p>
          {storeProblem && <p className="callout warn">{storeProblem.message}</p>}
        </header>

        <ImportPanel busy={busy} onReports={(r) => r.length && setReports(r)} />
        {reports.length > 0 && <Reports reports={reports} onClose={() => setReports([])} />}

        {message && (
          <p className="callout" role="status">
            {message}
          </p>
        )}

        <section className="card">
          <h3>What is stored</h3>
          <table className="tally">
            <tbody>
              {TABLES.map((t) => (
                <tr key={t}>
                  <th scope="row">{TABLE_LABELS[t]}</th>
                  <td className="num">{data[t].length}</td>
                  <td className="muted">
                    {data[t].length === 0
                      ? EMPTY_HINT[t]
                      : `${(data[t] as { is_sample?: boolean }[]).filter((r) => r.is_sample).length || 'No'} sample rows`}
                  </td>
                  <td>
                    {data[t].length > 0 && (
                      <button type="button" className="link" onClick={() => clearTable(t)} disabled={busy}>
                        Delete all
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {snapshot && (
          <section className="card">
            <h3>Snapshot published with this copy</h3>
            <p className="small">
              {snapshot.snap.label}
              {snapshot.snap.made && `, made ${snapshot.snap.made}`}.{' '}
              {snapshot.loadedNow
                ? 'It loaded into this browser when the app opened.'
                : snapshotApplied(snapshot.snap.id)
                  ? 'This browser has loaded it before.'
                  : 'This browser already held data, so it was not loaded on its own.'}
            </p>
            <p className="muted small">
              {snapshot.snap.files.map((f) => `${f.name} (${TABLE_LABELS[f.table]})`).join(', ')}. Loading it again adds and updates rows
              the way an import does and never blanks a field.
            </p>
            <div className="btn-row">
              <button type="button" className="btn solid" onClick={loadSnapshot} disabled={busy}>
                Load the snapshot
              </button>
            </div>
          </section>
        )}

        <div className="card-row">
          <section className="card">
            <h3>Sample data</h3>
            <p className="muted small">
              Fake companies, contacts, deals, and HPE people for trying the app. A banner shows while any sample row is loaded.
            </p>
            <div className="btn-row">
              <button type="button" className="btn solid" onClick={loadSample} disabled={busy}>
                Load sample data
              </button>
              <button type="button" className="btn" onClick={removeSample} disabled={busy || !hasSample}>
                Remove sample data
              </button>
            </div>
          </section>
          <section className="card">
            <h3>Backup</h3>
            <p className="muted small">
              One JSON file with every row, to keep a copy or move the data to another browser. Store it outside the repository.
            </p>
            <div className="btn-row">
              <button type="button" className="btn solid" onClick={exportAll} disabled={totalRows === 0}>
                Export everything
              </button>
              <input
                ref={restoreRef}
                type="file"
                accept=".json,application/json"
                className="visually-hidden"
                id="restore-file"
                onChange={(e) => restore(e.target.files)}
              />
              <label htmlFor="restore-file" className="btn">
                Restore from file
              </label>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/** Adds the sample rows, replacing earlier sample rows with the same key. */
function mergeSample(current: Dataset, sample: Dataset): Dataset {
  const base = withoutSample(current);
  const out = { ...base };
  for (const t of TABLES) (out as Record<TableName, unknown[]>)[t] = [...base[t], ...sample[t]];
  return out;
}

function Reports({ reports, onClose }: { reports: ImportReport[]; onClose(): void }) {
  return (
    <section className="card reports" aria-live="polite">
      <h3>Last import</h3>
      {reports.map((r, i) => (
        <article key={i} className={`report${r.fileErrors.length ? ' failed' : r.rejectedRows ? ' partial' : ' ok'}`}>
          <h4>
            {r.fileName} <span className="muted">into {TABLE_LABELS[r.table]}</span>
          </h4>
          {r.fileErrors.length ? (
            <>
              <p>Nothing was imported.</p>
              <ul>
                {r.fileErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {r.added} added, {r.updated} updated
              {r.kept ? `, ${r.kept} kept as they were` : ''}
              {r.removed ? `, ${r.removed} removed` : ''}, {r.rejectedRows} rejected
              {r.warnings.length ? `, ${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''}` : ''}.
            </p>
          )}
          <ReportDetails r={r} />
        </article>
      ))}
      <button type="button" className="link" onClick={onClose}>
        Dismiss report
      </button>
    </section>
  );
}
