import { useCallback, useMemo, useState } from 'react';
import { deletePerson, personDeleteImpact, savePerson, type FieldErrors } from '../data/edit';
import { ACCOUNT_COVERAGE_ROLES, ROLE_LABELS, ROLES, TERRITORY_TEAM_ROLES, type Person, type Role } from '../data/types';
import { useApp } from '../state/app';
import { describeStorageError } from '../data/idb';
import { SortableTable, type Column } from './SortableTable';
import { Drawer, Field, StatesPreview, statesText, today } from './forms';
import { askConfirm } from './dialogs';

export function PeopleView({ regionNames }: { regionNames: Map<string, string> }) {
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const config = useApp((s) => s.config);
  const editRecord = useApp((s) => s.editRecord);
  const editPerson = useApp((s) => s.editPerson);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [adding, setAdding] = useState(false);
  // Changes only when the viewer opens a different record, so saving keeps the form and its message.
  const [formKey, setFormKey] = useState(0);

  const editing = editRecord?.kind === 'person' ? (data.people.find((p) => p.email === editRecord.id) ?? null) : null;
  const territoryName = useCallback((id: string) => config.territories.find((t) => t.id === id)?.name ?? id, [config]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.people.filter((p) => (!q || p.name.toLowerCase().includes(q) || p.email.includes(q)) && (!role || p.roles.includes(role)));
  }, [data.people, query, role]);

  const columns: Column<Person>[] = useMemo(
    () => [
      {
        id: 'name',
        label: 'Name',
        sort: (p) => p.name,
        render: (p) => (
          <>
            <strong>{p.name}</strong>
            {p.is_sample && <span className="sample-tag">sample</span>}
          </>
        ),
      },
      {
        id: 'roles',
        label: 'Roles',
        sort: (p) => p.roles.map((r) => ROLE_LABELS[r]).join(', '),
        render: (p) => p.roles.map((r) => ROLE_LABELS[r]).join(', '),
      },
      { id: 'email', label: 'Email', sort: (p) => p.email, render: (p) => <span className="muted">{p.email}</span> },
      {
        id: 'teams',
        label: 'Territory teams',
        sort: (p) => p.territories.map(territoryName).join(', '),
        render: (p) => p.territories.map(territoryName).join(', ') || <span className="muted">None</span>,
      },
      {
        id: 'states',
        label: 'States',
        sort: (p) => p.states.length,
        render: (p) =>
          p.states.length ? (
            <span title={p.states.map((c) => regionNames.get(c) ?? c).join(', ')}>{abbreviate(p.states)}</span>
          ) : (
            <span className="muted">None</span>
          ),
      },
      {
        id: 'accounts',
        label: 'Accounts',
        sort: (p) => index.coverageByPerson.get(p.email)?.length ?? 0,
        render: (p) => index.coverageByPerson.get(p.email)?.length ?? 0,
        className: 'num',
      },
      {
        id: 'verified',
        label: 'Verified',
        sort: (p) => p.verified_at,
        render: (p) => p.verified_at ?? <span className="muted">never</span>,
      },
      { id: 'updated_by', label: 'Updated by', sort: (p) => p.updated_by, render: (p) => <span className="muted">{p.updated_by}</span> },
    ],
    [territoryName, regionNames, index],
  );

  const close = useCallback(() => {
    setAdding(false);
    editPerson(null);
  }, [editPerson]);

  return (
    <main className="page with-drawer" id="main" tabIndex={-1}>
      <div className="page-scroll">
        <div className="page-inner wide">
          <header className="page-head row">
            <div>
              <h2>People</h2>
              <p className="muted">
                {data.people.length === 0
                  ? 'No HPE people imported yet. Import a people CSV in Data, or add someone here.'
                  : `${rows.length === data.people.length ? data.people.length : `${rows.length} of ${data.people.length}`} HPE people. Click a row to edit.`}
              </p>
            </div>
            <div className="page-actions">
              <input
                type="search"
                className="text-input"
                placeholder="Filter by name or email"
                aria-label="Filter people by name or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className="text-input"
                aria-label="Filter people by role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role | '')}
              >
                <option value="">Any role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn solid"
                onClick={() => {
                  editPerson(null);
                  setAdding(true);
                  setFormKey((k) => k + 1);
                }}
              >
                Add person
              </button>
            </div>
          </header>
          <div className="card flush">
            <SortableTable
              caption="HPE people"
              columns={columns}
              rows={rows}
              rowKey={(p) => p.email}
              onOpen={(p) => {
                setAdding(false);
                editPerson(p.email);
                setFormKey((k) => k + 1);
              }}
              initialSort={{ id: 'name', dir: 'asc' }}
              selectedKey={editing?.email ?? null}
              empty={data.people.length === 0 ? 'Nobody here yet.' : 'Nobody matches the filter.'}
            />
          </div>
        </div>
      </div>
      {(adding || editing) && <PersonForm key={formKey} person={editing} regionNames={regionNames} onClose={close} />}
    </main>
  );
}

function abbreviate(codes: string[]): string {
  const short = codes.map((c) => c.slice(3));
  return short.length > 6 ? `${short.slice(0, 6).join(', ')} +${short.length - 6}` : short.join(', ');
}

function PersonForm({ person, regionNames, onClose }: { person: Person | null; regionNames: Map<string, string>; onClose(): void }) {
  const config = useApp((s) => s.config);
  const editor = useApp((s) => s.settings.editorName);
  const saveAll = useApp((s) => s.saveAll);
  const editPerson = useApp((s) => s.editPerson);
  const openPerson = useApp((s) => s.openPerson);

  const [name, setName] = useState(person?.name ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [roles, setRoles] = useState<Role[]>(person?.roles ?? []);
  const [specialty, setSpecialty] = useState(person?.specialty ?? '');
  const [teams, setTeams] = useState<string[]>(person?.territories ?? []);
  const [states, setStates] = useState(statesText(person?.states ?? []));
  const [notes, setNotes] = useState(person?.notes ?? '');
  const [source, setSource] = useState(person?.source ?? '');
  const [verified, setVerified] = useState(person?.verified_at ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string | null>(null);

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const save = async () => {
    const data = useApp.getState().data;
    const result = savePerson(
      data,
      person?.email ?? null,
      {
        name,
        email,
        role: roles,
        specialty: roles.includes('networking') ? specialty : '',
        territories: teams,
        states,
        notes,
        source,
        verified_at: verified,
      },
      { config, editor },
    );
    if (!result.ok) {
      setErrors(result.errors);
      setStatus('Fix the marked fields; nothing was saved.');
      return;
    }
    try {
      await saveAll(result.data);
      setErrors({});
      editPerson(result.record.email);
      setStatus(result.warnings.length ? `Saved, with a note: ${result.warnings.join(' ')}` : 'Saved.');
    } catch (e) {
      setStatus(`Saving failed: ${describeStorageError(e)}`);
    }
  };

  const remove = async () => {
    if (!person) return;
    const data = useApp.getState().data;
    const impact = personDeleteImpact(data, person.email);
    const extra = [
      impact.coverage && `${impact.coverage} coverage link${impact.coverage > 1 ? 's' : ''}`,
      impact.prospects && `owner on ${impact.prospects} prospect${impact.prospects > 1 ? 's' : ''}`,
      impact.deals && `owner on ${impact.deals} deal${impact.deals > 1 ? 's' : ''}`,
    ].filter(Boolean);
    const ok = await askConfirm({
      title: `Delete ${person.name}?`,
      body: extra.length ? `This also removes them as ${extra.join(', ')}.` : 'Nothing else points at this person.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await saveAll(deletePerson(data, person.email));
    onClose();
  };

  return (
    <Drawer
      title={person ? `Edit ${person.name}` : 'Add a person'}
      onClose={onClose}
      footer={
        <>
          {status && (
            <p className="form-status" role="status">
              {status}
            </p>
          )}
          <div className="btn-row">
            <button type="button" className="btn solid" onClick={save}>
              {person ? 'Save changes' : 'Add person'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            {person && (
              <>
                <button type="button" className="btn" onClick={() => openPerson(person.email)}>
                  Show on map
                </button>
                <span className="fb-spacer" />
                <button type="button" className="btn danger" onClick={remove}>
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      }
    >
      {person?.is_sample && <p className="callout warn small">This is a sample row. Edits keep it marked as sample.</p>}
      <Field label="Name" error={errors.name}>
        {(id, d) => <input id={id} aria-describedby={d} className="text-input" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field
        label="Email"
        error={errors.email}
        hint={person ? 'Changing the email updates their coverage and owner links.' : 'The key for this person; imports match on it.'}
      >
        {(id, d) => (
          <input
            id={id}
            aria-describedby={d}
            className="text-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <fieldset className={`ffield${errors.role ? ' has-error' : ''}`}>
        <legend>Roles</legend>
        <div className="check-grid">
          <span className="group-label">Territory team</span>
          {TERRITORY_TEAM_ROLES.map((r) => (
            <label key={r} className="check">
              <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles(toggle(roles, r))} />
              {ROLE_LABELS[r]}
            </label>
          ))}
          <span className="group-label">Account coverage</span>
          {ACCOUNT_COVERAGE_ROLES.map((r) => (
            <label key={r} className="check">
              <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles(toggle(roles, r))} />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        {errors.role && (
          <div className="ferror" role="alert">
            {errors.role}
          </div>
        )}
      </fieldset>
      {roles.includes('networking') && (
        <Field label="Networking specialty" error={errors.specialty}>
          {(id, d) => (
            <select id={id} aria-describedby={d} className="text-input" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">Not set</option>
              <option value="aruba">Aruba</option>
              <option value="juniper">Juniper</option>
            </select>
          )}
        </Field>
      )}
      <fieldset className={`ffield${errors.territories ? ' has-error' : ''}`}>
        <legend>Territory teams</legend>
        <div className="check-grid three">
          {config.territories.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={teams.includes(t.id)} onChange={() => setTeams(toggle(teams, t.id))} />
              <span className="swatch" style={{ background: t.color }} aria-hidden="true" />
              {t.name}
            </label>
          ))}
        </div>
        <p className="fhint">Only matters for Morpheus and OpsRamp specialists; it puts them in the legend and on the territory card.</p>
      </fieldset>
      <Field label="States and provinces covered" error={errors.states} hint={<StatesPreview value={states} regionNames={regionNames} />}>
        {(id, d) => (
          <input
            id={id}
            aria-describedby={d}
            className="text-input"
            placeholder="WA; OR; BC"
            value={states}
            onChange={(e) => setStates(e.target.value)}
          />
        )}
      </Field>
      <Field label="Notes" error={errors.notes}>
        {(id, d) => (
          <textarea id={id} aria-describedby={d} className="text-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
      <Field label="Source" error={errors.source} hint="Where this came from, as text or a URL.">
        {(id, d) => (
          <input id={id} aria-describedby={d} className="text-input" value={source} onChange={(e) => setSource(e.target.value)} />
        )}
      </Field>
      <Field label="Verified on" error={errors.verified_at}>
        {(id, d) => (
          <div className="inline">
            <input
              id={id}
              aria-describedby={d}
              className="text-input"
              type="date"
              value={verified}
              onChange={(e) => setVerified(e.target.value)}
            />
            <button type="button" className="btn small" onClick={() => setVerified(today())}>
              Today
            </button>
          </div>
        )}
      </Field>
      <p className="muted small">
        Saves as updated by <strong>{editor || 'edited in app'}</strong>. Set your name in Settings.
        {person && ` Last updated by ${person.updated_by}.`}
      </p>
    </Drawer>
  );
}
