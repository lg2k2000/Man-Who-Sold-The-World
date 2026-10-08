import { useRef, useState } from 'react';
import { TABLES, type Dataset, type TableName } from '../data/types';
import { requestPersistence } from '../data/idb';
import { guessTable, importTable, type ImportReport } from '../import/importer';
import { backupFileName, makeBackup, restoreBackup } from '../import/backup';
import { COLUMNS, FILE_FORMAT, TABLE_LABELS } from '../import/tables';
import { useApp, withoutSample } from '../state/app';
import { downloadText } from './download';

const EMPTY_HINT: Record<TableName, string> = {
  people: 'HPE people: territory teams and account coverage.',
  coverage: 'Which person covers which prospect. Needs people and prospects first.',
  partners: 'Channel partners, their states, and contacts.',
  prospects: 'Companies to call, with HQ location, segment, and tier fit.',
  deals: 'Open and closed deals by op_id. Needs prospects first.',
  briefs: 'Research briefs, one per prospect, as JSON.',
  stakeholders: 'People inside each prospect, as JSON.',
};

/** Imports, the rejected-row report, sample data, and backups. */
export function DataView() {
  const data = useApp((s) => s.data);
  const config = useApp((s) => s.config);
  const store = useApp((s) => s.store);
  const hasSample = useApp((s) => s.hasSample);
  const saveTable = useApp((s) => s.saveTable);
  const saveAll = useApp((s) => s.saveAll);
  const storeProblem = useApp((s) => s.storeProblem);

  const [pending, setPending] = useState<{ file: File; table: TableName }[]>([]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(`Saving failed: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.`);
    } finally {
      setBusy(false);
    }
  };

  const choose = (files: FileList | null) => {
    setReports([]);
    setPending(
      [...(files ?? [])].map((file) => ({ file, table: guessTable(file.name) ?? (file.name.endsWith('.json') ? 'briefs' : 'people') })),
    );
    if (fileRef.current) fileRef.current.value = '';
  };

  const importPending = () =>
    run(async () => {
      const out: ImportReport[] = [];
      for (const { file, table } of pending) {
        const result = importTable(table, await file.text(), file.name, useApp.getState().data, config, { replace });
        out.push(result.report);
        if (result.rows) await saveTable(table, result.rows);
      }
      setReports(out);
      setPending([]);
      void requestPersistence();
    });

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

  const clearTable = (t: TableName) =>
    run(async () => {
      if (!window.confirm(`Delete all ${data[t].length} ${TABLE_LABELS[t].toLowerCase()} rows from this browser?`)) return;
      await saveTable(t, [] as never);
    });

  const exportAll = () => downloadText(backupFileName(), makeBackup(useApp.getState().data));

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
      if (!window.confirm(`Replace everything in this browser with the ${total} rows in ${file.name}?`)) return;
      await saveAll(result.data);
      setReports(result.reports.filter((r) => r.added + r.updated + r.rejected.length + r.warnings.length > 0));
      setMessage(`Restored ${total} rows from ${file.name}.`);
    });

  const totalRows = TABLES.reduce((n, t) => n + data[t].length, 0);

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <h2>Data</h2>
          <p className="muted">
            Everything here lives in {store?.kind ?? 'this browser'} and never leaves it.{' '}
            {totalRows === 0 ? 'Nothing is imported yet.' : `${totalRows} rows in all.`}
          </p>
          {storeProblem && <p className="callout warn">{storeProblem.message}</p>}
        </header>

        <section className="card">
          <h3>Import a file</h3>
          <p className="muted small">
            Pick one or more files. The table is guessed from each file name; check it before importing. People and partners go first, then
            prospects, then the rest.
          </p>
          <div className="import-row">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              multiple
              className="visually-hidden"
              id="import-file"
              onChange={(e) => choose(e.target.files)}
              disabled={busy}
            />
            <label htmlFor="import-file" className="btn">
              Choose files
            </label>
            <label className="check">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace each table instead of merging by key
            </label>
          </div>
          {pending.length > 0 && (
            <div className="pending">
              {pending.map((p, i) => (
                <div key={i} className="pending-row">
                  <span className="mono">{p.file.name}</span>
                  <span className="muted">into</span>
                  <select
                    aria-label={`Table for ${p.file.name}`}
                    value={p.table}
                    onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, table: e.target.value as TableName } : x)))}
                  >
                    {TABLES.map((t) => (
                      <option key={t} value={t}>
                        {TABLE_LABELS[t]} ({FILE_FORMAT[t].toUpperCase()})
                      </option>
                    ))}
                  </select>
                  <span className="muted small">
                    needs{' '}
                    {COLUMNS[p.table]
                      .filter((c) => c.required)
                      .map((c) => c.name)
                      .join(', ')}
                  </span>
                </div>
              ))}
              <div className="btn-row">
                <button type="button" className="btn solid" onClick={importPending} disabled={busy}>
                  Import {pending.length} file{pending.length > 1 ? 's' : ''}
                </button>
                <button type="button" className="btn" onClick={() => setPending([])} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {reports.length > 0 && <Reports reports={reports} onClose={() => setReports([])} />}
        </section>

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

        <div className="card-row">
          <section className="card">
            <h3>Sample data</h3>
            <p className="muted small">
              Fake people, partners, and companies for trying the app. A banner shows while any sample row is loaded.
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
    </div>
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
    <div className="reports" aria-live="polite">
      {reports.map((r, i) => (
        <ReportView key={i} r={r} />
      ))}
      <button type="button" className="link" onClick={onClose}>
        Dismiss report
      </button>
    </div>
  );
}

function ReportView({ r }: { r: ImportReport }) {
  const failed = r.fileErrors.length > 0;
  const byRow = new Map<number, string[]>();
  for (const issue of r.rejected) byRow.set(issue.row, [...(byRow.get(issue.row) ?? []), issue.reason]);
  return (
    <article className={`report${failed ? ' failed' : r.rejectedRows ? ' partial' : ' ok'}`}>
      <h4>
        {r.fileName} <span className="muted">into {TABLE_LABELS[r.table]}</span>
      </h4>
      {failed ? (
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
      {byRow.size > 0 && (
        <table className="issues">
          <caption>Rejected rows</caption>
          <thead>
            <tr>
              <th>Row</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {[...byRow].map(([row, reasons]) => (
              <tr key={row}>
                <td className="num">{row}</td>
                <td>
                  {reasons.map((x) => (
                    <div key={x}>{x}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.warnings.length > 0 && (
        <table className="issues warn">
          <caption>Imported with a warning</caption>
          <thead>
            <tr>
              <th>Row</th>
              <th>Warning</th>
            </tr>
          </thead>
          <tbody>
            {r.warnings.map((w, i) => (
              <tr key={i}>
                <td className="num">{w.row}</td>
                <td>{w.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.ignoredColumns.length > 0 && <p className="muted small">Ignored columns: {r.ignoredColumns.join(', ')}.</p>}
    </article>
  );
}
