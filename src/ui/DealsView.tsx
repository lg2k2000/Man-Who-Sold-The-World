import { useCallback, useMemo, useState } from 'react';
import { deleteDeal, saveDeal, type FieldErrors } from '../data/edit';
import { dealLabel, isOpenDeal, money, moneyShort, ownerName, stageTotals } from '../data/derive';
import type { Deal } from '../data/types';
import { useApp } from '../state/app';
import { describeStorageError } from '../data/idb';
import { SortableTable, type Column } from './SortableTable';
import { Drawer, Field, FormFooter, plural, ProvenanceFields, SelectField, TextAreaField, TextField, today } from './forms';
import { askConfirm } from './dialogs';

type Status = 'open' | 'closed' | 'all';

export function DealsView({ regionNames }: { regionNames: Map<string, string> }) {
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const config = useApp((s) => s.config);
  const regionIndex = useApp((s) => s.regionIndex);
  const editRecord = useApp((s) => s.editRecord);
  const editDeal = useApp((s) => s.editDeal);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('open');
  const [stage, setStage] = useState('');
  const [territory, setTerritory] = useState('');
  const [owner, setOwner] = useState('');
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const editing = editRecord?.kind === 'deal' ? (data.deals.find((d) => d.id === editRecord.id) ?? null) : null;
  const companyOf = useCallback((d: Deal) => index.companyById.get(d.company_id), [index]);
  const territoryOf = useCallback(
    (d: Deal) => {
      const state = companyOf(d)?.state;
      return state ? (regionIndex.get(state)?.territory ?? null) : null;
    },
    [companyOf, regionIndex],
  );

  const owners = useMemo(() => [...new Set(data.deals.map((d) => ownerName(index, d)).filter(Boolean))].sort(), [data.deals, index]);

  // Everything but the stage filter, so the stage chips show what each stage holds.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.deals.filter((d) => {
      if (status === 'open' && !isOpenDeal(d)) return false;
      if (status === 'closed' && isOpenDeal(d)) return false;
      if (territory && territoryOf(d)?.id !== territory) return false;
      if (owner && ownerName(index, d) !== owner) return false;
      if (!q) return true;
      return [d.name, d.op_id ?? '', companyOf(d)?.name ?? '', d.next_step].some((x) => x.toLowerCase().includes(q));
    });
  }, [data.deals, query, status, territory, owner, territoryOf, companyOf, index]);
  const rows = useMemo(() => (stage ? base.filter((d) => (d.stage.trim() || 'No stage') === stage) : base), [base, stage]);
  const stages = useMemo(() => stageTotals(base), [base]);
  const total = rows.reduce((n, d) => n + (d.amount ?? 0), 0);
  const unpriced = rows.filter((d) => d.amount === null).length;

  const columns: Column<Deal>[] = useMemo(
    () => [
      {
        id: 'deal',
        label: 'Deal',
        sort: (d) => dealLabel(index, d),
        render: (d) => (
          <>
            <strong>{dealLabel(index, d)}</strong>
            {d.is_sample && <span className="sample-tag">sample</span>}
          </>
        ),
      },
      {
        id: 'company',
        label: 'Company',
        sort: (d) => companyOf(d)?.name ?? d.company_id,
        render: (d) => companyOf(d)?.name ?? d.company_id,
      },
      {
        id: 'stage',
        label: 'Stage',
        sort: (d) => d.stage,
        render: (d) => <span className={`stage-chip${isOpenDeal(d) ? '' : ' closed'}`}>{d.stage}</span>,
      },
      { id: 'amount', label: 'Amount', sort: (d) => d.amount, render: (d) => money(d.amount), className: 'num' },
      { id: 'close', label: 'Close', sort: (d) => d.close_date, render: (d) => d.close_date ?? '', className: 'nowrap' },
      { id: 'forecast', label: 'Forecast', sort: (d) => d.forecast_category, render: (d) => d.forecast_category },
      { id: 'owner', label: 'HPE owner', sort: (d) => ownerName(index, d) || null, render: (d) => ownerName(index, d) },
      {
        id: 'partner',
        label: 'Partner',
        sort: (d) => (d.partner_id ? (index.companyById.get(d.partner_id)?.name ?? null) : null),
        render: (d) => (d.partner_id ? (index.companyById.get(d.partner_id)?.name ?? '') : ''),
      },
      {
        id: 'territory',
        label: 'Territory',
        sort: (d) => territoryOf(d)?.name ?? null,
        render: (d) => {
          const c = companyOf(d);
          return territoryOf(d)?.name ?? (c && !c.state ? <span className="muted">No state</span> : '');
        },
      },
      {
        id: 'op',
        label: 'Op ID',
        sort: (d) => d.op_id,
        render: (d) => <span className="mono small">{d.op_id ?? ''}</span>,
        className: 'nowrap',
      },
    ],
    [index, companyOf, territoryOf],
  );

  const close = useCallback(() => {
    setAdding(false);
    editDeal(null);
  }, [editDeal]);

  return (
    <main className="page with-drawer" id="main" tabIndex={-1}>
      <div className="page-scroll">
        <div className="page-inner wide">
          <header className="page-head row">
            <div>
              <h2>Deals</h2>
              <p className="muted">
                {data.deals.length === 0
                  ? "No deals yet. Import your manager's pipeline spreadsheet in Data, or add a deal here."
                  : `${plural(rows.length, 'deal')} shown, ${money(total)}${unpriced ? ` (${unpriced} with no amount)` : ''}. Click a row to edit.`}
              </p>
            </div>
            <div className="page-actions">
              <input
                type="search"
                className="text-input"
                placeholder="Filter by deal, company, op ID"
                aria-label="Filter deals by name, company, op ID, or next step"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn solid"
                disabled={data.companies.length === 0}
                title={data.companies.length === 0 ? 'Add a company first' : undefined}
                onClick={() => {
                  editDeal(null);
                  setAdding(true);
                  setFormKey((k) => k + 1);
                }}
              >
                Add deal
              </button>
            </div>
          </header>
          {data.deals.length > 0 && (
            <>
              <div className="deal-filters">
                <div className="segmented" role="group" aria-label="Deal status">
                  {(['open', 'closed', 'all'] as Status[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={status === s ? 'on' : ''}
                      aria-pressed={status === s}
                      onClick={() => {
                        setStatus(s);
                        setStage('');
                      }}
                    >
                      {s === 'open' ? 'Open' : s === 'closed' ? 'Closed' : 'All'}
                    </button>
                  ))}
                </div>
                <select
                  className="text-input"
                  aria-label="Filter deals by territory"
                  value={territory}
                  onChange={(e) => setTerritory(e.target.value)}
                >
                  <option value="">Any territory</option>
                  {config.territories.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  className="text-input"
                  aria-label="Filter deals by HPE owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="">Any owner</option>
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="stage-bar" role="group" aria-label="Stages">
                {stages.map((t) => (
                  <button
                    key={t.stage}
                    type="button"
                    className={`stage-total${stage === t.stage ? ' on' : ''}${t.open ? '' : ' closed'}`}
                    aria-pressed={stage === t.stage}
                    onClick={() => setStage(stage === t.stage ? '' : t.stage)}
                  >
                    <span className="st-name">{t.stage}</span>
                    <span className="st-amount">{moneyShort(t.amount)}</span>
                    <span className="st-count">{plural(t.count, 'deal')}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="card flush">
            <SortableTable
              caption="Deals"
              columns={columns}
              rows={rows}
              rowKey={(d) => d.id}
              onOpen={(d) => {
                setAdding(false);
                editDeal(d.id);
                setFormKey((k) => k + 1);
              }}
              initialSort={{ id: 'close', dir: 'asc' }}
              selectedKey={editing?.id ?? null}
              empty={data.deals.length === 0 ? 'No deals yet.' : 'No deal matches the filters.'}
            />
          </div>
        </div>
      </div>
      {(adding || editing) && <DealForm key={formKey} deal={editing} regionNames={regionNames} onClose={close} />}
    </main>
  );
}

function DealForm({ deal, onClose }: { deal: Deal | null; regionNames: Map<string, string>; onClose(): void }) {
  const config = useApp((s) => s.config);
  const editor = useApp((s) => s.settings.editorName);
  const saveAll = useApp((s) => s.saveAll);
  const editDeal = useApp((s) => s.editDeal);
  const openCompany = useApp((s) => s.openCompany);
  const data = useApp((s) => s.data);

  const companies = useMemo(
    () => data.companies.filter((c) => c.type !== 'partner').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [data.companies],
  );
  const partners = useMemo(
    () => data.companies.filter((c) => c.type === 'partner').sort((a, b) => a.name.localeCompare(b.name)),
    [data.companies],
  );
  const people = useMemo(() => [...data.people].sort((a, b) => a.name.localeCompare(b.name)), [data.people]);
  const knownStages = useMemo(() => [...new Set(data.deals.map((d) => d.stage).filter(Boolean))].sort(), [data.deals]);
  const knownForecasts = useMemo(() => [...new Set(data.deals.map((d) => d.forecast_category).filter(Boolean))].sort(), [data.deals]);

  const [company, setCompany] = useState(deal?.company_id ?? companies[0]?.id ?? '');
  const [name, setName] = useState(deal?.name ?? '');
  const [opId, setOpId] = useState(deal?.op_id ?? '');
  const [stage, setStage] = useState(deal?.stage ?? '');
  const [amount, setAmount] = useState(deal?.amount?.toString() ?? '');
  const [closeDate, setCloseDate] = useState(deal?.close_date ?? '');
  const [forecast, setForecast] = useState(deal?.forecast_category ?? '');
  const [owner, setOwner] = useState(deal?.hpe_owner_email ?? deal?.owner_name ?? '');
  const [partner, setPartner] = useState(deal?.partner_id ?? '');
  const [contacts, setContacts] = useState<string[]>(deal?.contact_ids ?? []);
  const [nextStep, setNextStep] = useState(deal?.next_step ?? '');
  const [notes, setNotes] = useState(deal?.notes ?? '');
  const [asOf, setAsOf] = useState(deal?.as_of ?? today());
  const [source, setSource] = useState(deal?.source ?? '');
  const [verified, setVerified] = useState(deal?.verified_at ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string | null>(null);

  const atCompany = useMemo(
    () => data.contacts.filter((c) => c.company_id === company).sort((a, b) => a.name.localeCompare(b.name)),
    [data.contacts, company],
  );
  const ownerOptions = [
    { value: '', label: 'None' },
    ...people.map((p) => ({ value: p.email, label: p.name })),
    ...(deal?.owner_name ? [{ value: deal.owner_name, label: `${deal.owner_name} (not in the HPE team)` }] : []),
  ];

  const save = async () => {
    const result = saveDeal(
      useApp.getState().data,
      deal?.id ?? null,
      {
        company,
        name,
        op_id: opId,
        stage,
        amount,
        close_date: closeDate,
        forecast_category: forecast,
        hpe_owner: owner,
        partner,
        contacts: contacts.filter((id) => atCompany.some((c) => c.id === id)),
        next_step: nextStep,
        notes,
        as_of: asOf,
        source,
        verified_at: verified,
      },
      { config, editor, today: today() },
    );
    if (!result.ok) {
      setErrors(result.errors);
      setStatus('Fix the marked fields; nothing was saved.');
      return;
    }
    try {
      await saveAll(result.data);
      setErrors({});
      editDeal(result.record.id);
      setStatus('Saved.');
    } catch (e) {
      setStatus(`Saving failed: ${describeStorageError(e)}`);
    }
  };

  const remove = async () => {
    if (!deal) return;
    const ok = await askConfirm({
      title: `Delete ${deal.name || 'this deal'}?`,
      body: 'The deal is removed from this browser. Its company and contacts stay.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await saveAll(deleteDeal(useApp.getState().data, deal.id));
    onClose();
  };

  return (
    <Drawer
      title={deal ? `Edit ${deal.name || 'deal'}` : 'Add a deal'}
      onClose={onClose}
      footer={
        <FormFooter
          status={status}
          saveLabel={deal ? 'Save changes' : 'Add deal'}
          onSave={save}
          onClose={onClose}
          onDelete={deal ? remove : undefined}
        >
          {deal && (
            <button type="button" className="btn" onClick={() => openCompany(deal.company_id, 'Deals')}>
              Show company
            </button>
          )}
        </FormFooter>
      }
    >
      {deal?.is_sample && <p className="callout warn small">This is a sample row. Edits keep it marked as sample.</p>}
      <SelectField
        label="Company"
        value={company}
        onChange={(v) => {
          setCompany(v);
          setContacts([]);
        }}
        options={companies.map((c) => ({ value: c.id, label: c.name }))}
        error={errors.company}
      />
      <TextField label="Deal name" value={name} onChange={setName} error={errors.name} />
      <TextField
        label="Op ID"
        value={opId}
        onChange={setOpId}
        error={errors.op_id}
        placeholder="OPE-0000000000"
        mono
        hint="Optional. Imports match deals on it."
      />
      <div className="two-up">
        <Field label="Stage" error={errors.stage}>
          {(fid, d) => (
            <>
              <input
                id={fid}
                aria-describedby={d}
                className="text-input"
                list={`${fid}-stages`}
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              />
              <datalist id={`${fid}-stages`}>
                {knownStages.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <TextField label="Amount (USD)" value={amount} onChange={setAmount} error={errors.amount} placeholder="250000" />
      </div>
      <div className="two-up">
        <TextField label="Close date" type="date" value={closeDate} onChange={setCloseDate} error={errors.close_date} />
        <Field label="Forecast category" error={errors.forecast_category}>
          {(fid, d) => (
            <>
              <input
                id={fid}
                aria-describedby={d}
                className="text-input"
                list={`${fid}-fc`}
                value={forecast}
                onChange={(e) => setForecast(e.target.value)}
              />
              <datalist id={`${fid}-fc`}>
                {knownForecasts.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </div>
      <SelectField label="HPE owner" value={owner} onChange={setOwner} options={ownerOptions} error={errors.hpe_owner} />
      <SelectField
        label="Partner"
        value={partner}
        onChange={setPartner}
        options={[
          { value: '', label: partners.length ? 'None' : 'No partners yet' },
          ...partners.map((p) => ({ value: p.id, label: p.name })),
        ]}
        error={errors.partner}
      />
      <fieldset className={`ffield${errors.contacts ? ' has-error' : ''}`}>
        <legend>Contacts on the deal</legend>
        {atCompany.length === 0 ? (
          <p className="muted small">No contacts at this company yet.</p>
        ) : (
          <div className="check-list">
            {atCompany.map((c) => (
              <label key={c.id} className="check">
                <input
                  type="checkbox"
                  checked={contacts.includes(c.id)}
                  onChange={(e) => setContacts(e.target.checked ? [...contacts, c.id] : contacts.filter((x) => x !== c.id))}
                />
                {c.name}
                {c.title && <span className="muted">{c.title}</span>}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <TextField label="Next step" value={nextStep} onChange={setNextStep} error={errors.next_step} />
      <TextAreaField label="Notes" value={notes} onChange={setNotes} error={errors.notes} />
      <TextField
        label="As of"
        type="date"
        value={asOf}
        onChange={setAsOf}
        error={errors.as_of}
        hint="The date this deal's details were current."
      />
      <ProvenanceFields source={source} setSource={setSource} verified={verified} setVerified={setVerified} errors={errors} />
    </Drawer>
  );
}
