import { useCallback, useMemo, useState } from 'react';
import { deletePartner, partnerDeleteImpact, savePartner, type FieldErrors } from '../data/edit';
import { YES_NO_UNKNOWN, type Partner, type PartnerContact, type YesNoUnknown } from '../data/types';
import { useApp } from '../state/app';
import { describeStorageError } from '../data/idb';
import { SortableTable, type Column } from './SortableTable';
import { Drawer, Field, StatesPreview, statesText, today } from './forms';

const FLAG_ORDER: Record<YesNoUnknown, number> = { yes: 0, unknown: 1, no: 2 };

export function PartnersView({ regionNames }: { regionNames: Map<string, string> }) {
  const data = useApp((s) => s.data);
  const editRecord = useApp((s) => s.editRecord);
  const editPartner = useApp((s) => s.editPartner);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const editing = editRecord?.kind === 'partner' ? (data.partners.find((p) => p.id === editRecord.id) ?? null) : null;

  const primaryCount = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of data.prospects) if (p.primary_partner_id) n.set(p.primary_partner_id, (n.get(p.primary_partner_id) ?? 0) + 1);
    return n;
  }, [data.prospects]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.partners.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q) || p.contacts.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [data.partners, query]);

  const columns: Column<Partner>[] = useMemo(
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
        id: 'states',
        label: 'States',
        sort: (p) => p.states.length,
        render: (p) =>
          p.states.length ? (
            <span title={p.states.map((c) => regionNames.get(c) ?? c).join(', ')}>
              {p.states.length > 6
                ? `${p.states
                    .slice(0, 6)
                    .map((c) => c.slice(3))
                    .join(', ')} +${p.states.length - 6}`
                : p.states.map((c) => c.slice(3)).join(', ')}
            </span>
          ) : (
            <span className="muted">None</span>
          ),
      },
      { id: 'vme', label: 'Has done VME', sort: (p) => FLAG_ORDER[p.has_done_vme], render: (p) => <Flag v={p.has_done_vme} /> },
      {
        id: 'enterprise',
        label: 'Morpheus Enterprise',
        sort: (p) => FLAG_ORDER[p.has_done_morpheus_enterprise],
        render: (p) => <Flag v={p.has_done_morpheus_enterprise} />,
      },
      {
        id: 'contacts',
        label: 'Contacts',
        sort: (p) => p.contacts.length,
        render: (p) => p.contacts.map((c) => c.name).join(', ') || <span className="muted">None</span>,
      },
      {
        id: 'primary',
        label: 'Primary for',
        sort: (p) => primaryCount.get(p.id) ?? 0,
        render: (p) => primaryCount.get(p.id) ?? 0,
        className: 'num',
      },
      {
        id: 'verified',
        label: 'Verified',
        sort: (p) => p.verified_at,
        render: (p) => p.verified_at ?? <span className="muted">never</span>,
      },
    ],
    [regionNames, primaryCount],
  );

  const close = useCallback(() => {
    setAdding(false);
    editPartner(null);
  }, [editPartner]);

  return (
    <main className="page with-drawer" id="main" tabIndex={-1}>
      <div className="page-scroll">
        <div className="page-inner wide">
          <header className="page-head row">
            <div>
              <h2>Partners</h2>
              <p className="muted">
                {data.partners.length === 0
                  ? 'No partners imported yet. Import a partners CSV in Data, or add one here.'
                  : `${rows.length === data.partners.length ? data.partners.length : `${rows.length} of ${data.partners.length}`} partners. Click a row to edit.`}
              </p>
            </div>
            <div className="page-actions">
              <input
                type="search"
                className="text-input"
                placeholder="Filter by name or contact"
                aria-label="Filter partners by name or contact"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn solid"
                onClick={() => {
                  editPartner(null);
                  setAdding(true);
                  setFormKey((k) => k + 1);
                }}
              >
                Add partner
              </button>
            </div>
          </header>
          <div className="card flush">
            <SortableTable
              caption="Partners"
              columns={columns}
              rows={rows}
              rowKey={(p) => p.id}
              onOpen={(p) => {
                setAdding(false);
                editPartner(p.id);
                setFormKey((k) => k + 1);
              }}
              initialSort={{ id: 'name', dir: 'asc' }}
              selectedKey={editing?.id ?? null}
              empty={data.partners.length === 0 ? 'No partners yet.' : 'No partner matches the filter.'}
            />
          </div>
        </div>
      </div>
      {(adding || editing) && <PartnerForm key={formKey} partner={editing} regionNames={regionNames} onClose={close} />}
    </main>
  );
}

function Flag({ v }: { v: YesNoUnknown }) {
  return <span className={`flag flag-${v}`}>{v}</span>;
}

function PartnerForm({ partner, regionNames, onClose }: { partner: Partner | null; regionNames: Map<string, string>; onClose(): void }) {
  const config = useApp((s) => s.config);
  const editor = useApp((s) => s.settings.editorName);
  const saveAll = useApp((s) => s.saveAll);
  const editPartner = useApp((s) => s.editPartner);
  const openPartner = useApp((s) => s.openPartner);

  const [id, setId] = useState(partner?.id ?? '');
  const [name, setName] = useState(partner?.name ?? '');
  const [states, setStates] = useState(statesText(partner?.states ?? []));
  const [vme, setVme] = useState<YesNoUnknown>(partner?.has_done_vme ?? 'unknown');
  const [enterprise, setEnterprise] = useState<YesNoUnknown>(partner?.has_done_morpheus_enterprise ?? 'unknown');
  const [contacts, setContacts] = useState<PartnerContact[]>(partner?.contacts ?? []);
  const [notes, setNotes] = useState(partner?.notes ?? '');
  const [source, setSource] = useState(partner?.source ?? '');
  const [verified, setVerified] = useState(partner?.verified_at ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string | null>(null);

  const setContact = (i: number, patch: Partial<PartnerContact>) => setContacts(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = async () => {
    const data = useApp.getState().data;
    const result = savePartner(
      data,
      partner?.id ?? null,
      {
        id,
        name,
        states,
        has_done_vme: vme,
        has_done_morpheus_enterprise: enterprise,
        // Blank rows are dropped rather than rejected.
        contacts: contacts.filter((c) => c.name.trim() || c.title.trim() || c.email.trim()),
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
      editPartner(result.record.id);
      setStatus('Saved.');
    } catch (e) {
      setStatus(`Saving failed: ${describeStorageError(e)}`);
    }
  };

  const remove = async () => {
    if (!partner) return;
    const data = useApp.getState().data;
    const impact = partnerDeleteImpact(data, partner.id);
    const extra = [
      impact.prospects && `primary partner on ${impact.prospects} prospect${impact.prospects > 1 ? 's' : ''}`,
      impact.deals && `partner on ${impact.deals} deal${impact.deals > 1 ? 's' : ''}`,
    ].filter(Boolean);
    if (!window.confirm(`Delete ${partner.name}?${extra.length ? ` This also clears it as ${extra.join(' and ')}.` : ''}`)) return;
    await saveAll(deletePartner(data, partner.id));
    onClose();
  };

  return (
    <Drawer
      title={partner ? `Edit ${partner.name}` : 'Add a partner'}
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
              {partner ? 'Save changes' : 'Add partner'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            {partner && (
              <>
                <button type="button" className="btn" onClick={() => openPartner(partner.id)}>
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
      {partner?.is_sample && <p className="callout warn small">This is a sample row. Edits keep it marked as sample.</p>}
      <Field label="Name" error={errors.name}>
        {(fid, d) => <input id={fid} aria-describedby={d} className="text-input" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field
        label="Id"
        error={errors.id}
        hint={
          partner
            ? 'Changing the id updates the prospects and deals that name this partner.'
            : 'Lowercase letters, digits, and hyphens, such as acme-it. Imports match on it.'
        }
      >
        {(fid, d) => <input id={fid} aria-describedby={d} className="text-input mono" value={id} onChange={(e) => setId(e.target.value)} />}
      </Field>
      <Field label="States and provinces" error={errors.states} hint={<StatesPreview value={states} regionNames={regionNames} />}>
        {(fid, d) => (
          <input
            id={fid}
            aria-describedby={d}
            className="text-input"
            placeholder="WA; OR; BC"
            value={states}
            onChange={(e) => setStates(e.target.value)}
          />
        )}
      </Field>
      <div className="two-up">
        <Field label="Has done VME" error={errors.has_done_vme}>
          {(fid, d) => (
            <select
              id={fid}
              aria-describedby={d}
              className="text-input"
              value={vme}
              onChange={(e) => setVme(e.target.value as YesNoUnknown)}
            >
              {YES_NO_UNKNOWN.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Has done Morpheus Enterprise" error={errors.has_done_morpheus_enterprise}>
          {(fid, d) => (
            <select
              id={fid}
              aria-describedby={d}
              className="text-input"
              value={enterprise}
              onChange={(e) => setEnterprise(e.target.value as YesNoUnknown)}
            >
              {YES_NO_UNKNOWN.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <fieldset className={`ffield${errors.contacts ? ' has-error' : ''}`}>
        <legend>Contacts</legend>
        {contacts.length === 0 && <p className="muted small">No contacts yet.</p>}
        {contacts.map((c, i) => (
          <div key={i} className="contact-row">
            <input
              className="text-input"
              aria-label={`Contact ${i + 1} name`}
              placeholder="Name"
              value={c.name}
              onChange={(e) => setContact(i, { name: e.target.value })}
            />
            <input
              className="text-input"
              aria-label={`Contact ${i + 1} title`}
              placeholder="Title"
              value={c.title}
              onChange={(e) => setContact(i, { title: e.target.value })}
            />
            <input
              className="text-input"
              aria-label={`Contact ${i + 1} email`}
              placeholder="Email"
              value={c.email}
              onChange={(e) => setContact(i, { email: e.target.value })}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove contact ${i + 1}`}
              onClick={() => setContacts(contacts.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => setContacts([...contacts, { name: '', title: '', email: '' }])}>
          Add contact
        </button>
        {errors.contacts && (
          <div className="ferror" role="alert">
            {errors.contacts}
          </div>
        )}
      </fieldset>
      <Field label="Notes" error={errors.notes}>
        {(fid, d) => (
          <textarea
            id={fid}
            aria-describedby={d}
            className="text-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </Field>
      <Field label="Source" error={errors.source} hint="Where this came from, as text or a URL.">
        {(fid, d) => (
          <input id={fid} aria-describedby={d} className="text-input" value={source} onChange={(e) => setSource(e.target.value)} />
        )}
      </Field>
      <Field label="Verified on" error={errors.verified_at}>
        {(fid, d) => (
          <div className="inline">
            <input
              id={fid}
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
        {partner && ` Last updated by ${partner.updated_by}.`}
      </p>
    </Drawer>
  );
}
