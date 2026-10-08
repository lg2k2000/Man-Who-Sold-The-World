import { useCallback, useMemo, useState } from 'react';
import { companyDeleteImpact, deleteCompany, saveCompany, type FieldErrors } from '../data/edit';
import { isOpenDeal, money } from '../data/derive';
import {
  COMPANY_TYPES,
  COMPANY_TYPE_LABELS,
  SEGMENTS,
  SEGMENT_LABELS,
  TIER_FITS,
  TIER_FIT_LABELS,
  YES_NO_UNKNOWN,
  type Company,
  type CompanyType,
  type YesNoUnknown,
} from '../data/types';
import { useApp } from '../state/app';
import { describeStorageError } from '../data/idb';
import { SortableTable, type Column } from './SortableTable';
import {
  Drawer,
  Field,
  FormFooter,
  plural,
  ProvenanceFields,
  SelectField,
  StatesPreview,
  statesText,
  TextAreaField,
  TextField,
  today,
} from './forms';
import { askConfirm } from './dialogs';

const FLAG_ORDER: Record<YesNoUnknown, number> = { yes: 0, unknown: 1, no: 2 };

export function CompaniesView({ regionNames }: { regionNames: Map<string, string> }) {
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const regionIndex = useApp((s) => s.regionIndex);
  const editRecord = useApp((s) => s.editRecord);
  const editCompany = useApp((s) => s.editCompany);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<CompanyType | ''>('');
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const editing = editRecord?.kind === 'company' ? (index.companyById.get(editRecord.id) ?? null) : null;

  const counts = useMemo(() => {
    const n = new Map<CompanyType, number>();
    for (const c of data.companies) n.set(c.type, (n.get(c.type) ?? 0) + 1);
    return n;
  }, [data.companies]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.companies.filter(
      (c) => (!type || c.type === type) && (!q || c.name.toLowerCase().includes(q) || c.hq_city.toLowerCase().includes(q)),
    );
  }, [data.companies, query, type]);

  const columns: Column<Company>[] = useMemo(
    () => [
      {
        id: 'name',
        label: 'Name',
        sort: (c) => c.name,
        render: (c) => (
          <>
            <strong>{c.name}</strong>
            {c.is_sample && <span className="sample-tag">sample</span>}
          </>
        ),
      },
      {
        id: 'type',
        label: 'Type',
        sort: (c) => c.type,
        render: (c) => <span className={`type-chip t-${c.type}`}>{COMPANY_TYPE_LABELS[c.type]}</span>,
      },
      {
        id: 'where',
        label: 'Location',
        sort: (c) => (c.state ? `${c.state} ${c.hq_city}` : null),
        render: (c) =>
          c.type === 'partner' ? (
            c.states.length ? (
              <span title={c.states.map((s) => regionNames.get(s) ?? s).join(', ')}>{plural(c.states.length, 'state')}</span>
            ) : (
              <span className="muted">No states</span>
            )
          ) : c.state ? (
            [c.hq_city, c.state.slice(3)].filter(Boolean).join(', ')
          ) : (
            <span className="muted">No state</span>
          ),
      },
      {
        id: 'territory',
        label: 'Territory',
        sort: (c) => (c.state ? (regionIndex.get(c.state)?.territory.name ?? null) : null),
        render: (c) => (c.state ? (regionIndex.get(c.state)?.territory.name ?? <span className="muted">Unassigned</span>) : ''),
      },
      {
        id: 'deals',
        label: 'Open deals',
        sort: (c) => (c.type === 'partner' ? (index.dealsByPartner.get(c.id)?.length ?? 0) : (index.dealsByCompany.get(c.id) ?? []).length),
        render: (c) => {
          const open = (index.dealsByCompany.get(c.id) ?? []).filter(isOpenDeal).length;
          return c.type === 'partner' ? (
            <span className="muted" title="Deals that name this company as partner">
              {index.dealsByPartner.get(c.id)?.filter(isOpenDeal).length ?? 0}
            </span>
          ) : (
            open
          );
        },
        className: 'num',
      },
      {
        id: 'pipeline',
        label: 'Open pipeline',
        sort: (c) => index.openPipeline.get(c.id) ?? 0,
        render: (c) => (index.openPipeline.get(c.id) ? money(index.openPipeline.get(c.id)) : ''),
        className: 'num',
      },
      {
        id: 'contacts',
        label: 'Contacts',
        sort: (c) => index.contactsByCompany.get(c.id)?.length ?? 0,
        render: (c) => index.contactsByCompany.get(c.id)?.length ?? 0,
        className: 'num',
      },
      {
        id: 'partner',
        label: 'Partner',
        sort: (c) =>
          c.type === 'partner' ? FLAG_ORDER[c.has_done_vme] : (index.companyById.get(c.primary_partner_id ?? '')?.name ?? null),
        render: (c) =>
          c.type === 'partner' ? (
            <span>
              VME <Flag v={c.has_done_vme} />
            </span>
          ) : (
            (index.companyById.get(c.primary_partner_id ?? '')?.name ?? '')
          ),
      },
      {
        id: 'owner',
        label: 'HPE owner',
        sort: (c) => (c.hpe_owner_email ? (index.personByEmail.get(c.hpe_owner_email)?.name ?? c.hpe_owner_email) : null),
        render: (c) => (c.hpe_owner_email ? (index.personByEmail.get(c.hpe_owner_email)?.name ?? c.hpe_owner_email) : ''),
      },
    ],
    [regionNames, regionIndex, index],
  );

  const close = useCallback(() => {
    setAdding(false);
    editCompany(null);
  }, [editCompany]);

  return (
    <main className="page with-drawer" id="main" tabIndex={-1}>
      <div className="page-scroll">
        <div className="page-inner wide">
          <header className="page-head row">
            <div>
              <h2>Companies</h2>
              <p className="muted">
                {data.companies.length === 0
                  ? 'No companies yet. Import a deal or company spreadsheet in Data, or add one here.'
                  : `${rows.length === data.companies.length ? data.companies.length : `${rows.length} of ${data.companies.length}`} companies. Click a row to edit.`}
              </p>
            </div>
            <div className="page-actions">
              <input
                type="search"
                className="text-input"
                placeholder="Filter by name or city"
                aria-label="Filter companies by name or city"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn solid"
                onClick={() => {
                  editCompany(null);
                  setAdding(true);
                  setFormKey((k) => k + 1);
                }}
              >
                Add company
              </button>
            </div>
          </header>
          <div className="segmented type-tabs" role="group" aria-label="Company type">
            {(['', ...COMPANY_TYPES] as const).map((t) => (
              <button
                key={t || 'all'}
                type="button"
                className={type === t ? 'on' : ''}
                aria-pressed={type === t}
                onClick={() => setType(t)}
              >
                {t ? `${COMPANY_TYPE_LABELS[t]}s` : 'All'}{' '}
                <span className="tab-count">{t ? (counts.get(t) ?? 0) : data.companies.length}</span>
              </button>
            ))}
          </div>
          <div className="card flush">
            <SortableTable
              caption="Companies"
              columns={columns}
              rows={rows}
              rowKey={(c) => c.id}
              onOpen={(c) => {
                setAdding(false);
                editCompany(c.id);
                setFormKey((k) => k + 1);
              }}
              initialSort={{ id: 'name', dir: 'asc' }}
              selectedKey={editing?.id ?? null}
              empty={data.companies.length === 0 ? 'No companies yet.' : 'No company matches the filter.'}
            />
          </div>
        </div>
      </div>
      {(adding || editing) && <CompanyForm key={formKey} company={editing} regionNames={regionNames} onClose={close} />}
    </main>
  );
}

function Flag({ v }: { v: YesNoUnknown }) {
  return <span className={`flag flag-${v}`}>{v}</span>;
}

function CompanyForm({ company, regionNames, onClose }: { company: Company | null; regionNames: Map<string, string>; onClose(): void }) {
  const config = useApp((s) => s.config);
  const editor = useApp((s) => s.settings.editorName);
  const saveAll = useApp((s) => s.saveAll);
  const editCompany = useApp((s) => s.editCompany);
  const openCompany = useApp((s) => s.openCompany);
  const data = useApp((s) => s.data);

  const [name, setName] = useState(company?.name ?? '');
  const [type, setType] = useState<CompanyType>(company?.type ?? 'prospect');
  const [website, setWebsite] = useState(company?.website ?? '');
  const [city, setCity] = useState(company?.hq_city ?? '');
  const [state, setState] = useState(company?.state?.slice(3) ?? '');
  const [lat, setLat] = useState(company?.lat?.toString() ?? '');
  const [lng, setLng] = useState(company?.lng?.toString() ?? '');
  const [industry, setIndustry] = useState(company?.industry ?? '');
  const [description, setDescription] = useState(company?.description ?? '');
  const [segment, setSegment] = useState<string>(company?.segment ?? '');
  const [tier, setTier] = useState<string>(company?.tier_fit ?? 'unknown');
  const [partner, setPartner] = useState(company?.primary_partner_id ?? '');
  const [owner, setOwner] = useState(company?.hpe_owner_email ?? '');
  const [states, setStates] = useState(statesText(company?.states ?? []));
  const [vme, setVme] = useState<string>(company?.has_done_vme ?? 'unknown');
  const [enterprise, setEnterprise] = useState<string>(company?.has_done_morpheus_enterprise ?? 'unknown');
  const [notes, setNotes] = useState(company?.notes ?? '');
  const [source, setSource] = useState(company?.source ?? '');
  const [verified, setVerified] = useState(company?.verified_at ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string | null>(null);

  const partners = useMemo(
    () => data.companies.filter((c) => c.type === 'partner' && c.id !== company?.id).sort((a, b) => a.name.localeCompare(b.name)),
    [data.companies, company],
  );
  const people = useMemo(() => [...data.people].sort((a, b) => a.name.localeCompare(b.name)), [data.people]);

  const save = async () => {
    const result = saveCompany(
      useApp.getState().data,
      company?.id ?? null,
      {
        name,
        type,
        website,
        hq_city: city,
        state,
        lat,
        lng,
        industry,
        description,
        segment,
        tier_fit: tier,
        primary_partner: partner,
        hpe_owner: owner,
        states: type === 'partner' ? states : '',
        has_done_vme: vme,
        has_done_morpheus_enterprise: enterprise,
        notes,
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
      editCompany(result.record.id);
      setStatus(result.warnings.length ? `Saved, with a note: ${result.warnings.join(' ')}` : 'Saved.');
    } catch (e) {
      setStatus(`Saving failed: ${describeStorageError(e)}`);
    }
  };

  const remove = async () => {
    if (!company) return;
    const d = useApp.getState().data;
    const impact = companyDeleteImpact(d, company.id);
    const removes = [
      impact.contacts && plural(impact.contacts, 'contact'),
      impact.deals && plural(impact.deals, 'deal'),
      impact.coverage && plural(impact.coverage, 'coverage link'),
      impact.briefs && 'its brief',
    ].filter(Boolean);
    const clears = [
      impact.partnerOf && `primary partner on ${plural(impact.partnerOf, 'company', 'companies')}`,
      impact.partnerOnDeals && `partner on ${plural(impact.partnerOnDeals, 'deal')}`,
    ].filter(Boolean);
    const body = [
      removes.length ? `This also deletes ${removes.join(', ')}.` : '',
      clears.length ? `It is cleared as ${clears.join(' and ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const ok = await askConfirm({
      title: `Delete ${company.name}?`,
      body: body || 'Nothing else points at this company.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await saveAll(deleteCompany(d, company.id));
    onClose();
  };

  const yesNo = YES_NO_UNKNOWN.map((v) => ({ value: v, label: v }));
  return (
    <Drawer
      title={company ? `Edit ${company.name}` : 'Add a company'}
      onClose={onClose}
      footer={
        <FormFooter
          status={status}
          saveLabel={company ? 'Save changes' : 'Add company'}
          onSave={save}
          onClose={onClose}
          onDelete={company ? remove : undefined}
        >
          {company && (company.state || company.states.length > 0) && (
            <button type="button" className="btn" onClick={() => openCompany(company.id)}>
              Show on map
            </button>
          )}
        </FormFooter>
      }
    >
      {company?.is_sample && <p className="callout warn small">This is a sample row. Edits keep it marked as sample.</p>}
      <TextField label="Name" value={name} onChange={setName} error={errors.name} />
      <SelectField
        label="Type"
        value={type}
        onChange={(v) => setType(v as CompanyType)}
        options={COMPANY_TYPES.map((t) => ({ value: t, label: COMPANY_TYPE_LABELS[t] }))}
        error={errors.type}
      />
      <TextField label="Website" value={website} onChange={setWebsite} error={errors.website} placeholder="example.com" />
      <div className="two-up">
        <TextField label="HQ city" value={city} onChange={setCity} error={errors.hq_city} />
        <Field
          label="State or province"
          error={errors.state}
          hint={state.trim() ? <StatesPreview value={state} regionNames={regionNames} /> : 'No state, no pin on the map.'}
        >
          {(fid, d) => (
            <input
              id={fid}
              aria-describedby={d}
              className="text-input"
              placeholder="WA"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="two-up">
        <TextField label="Latitude" value={lat} onChange={setLat} error={errors.lat} placeholder="47.61" />
        <TextField label="Longitude" value={lng} onChange={setLng} error={errors.lng} placeholder="-122.33" />
      </div>
      {type === 'partner' ? (
        <>
          <Field
            label="States and provinces they work in"
            error={errors.states}
            hint={<StatesPreview value={states} regionNames={regionNames} />}
          >
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
            <SelectField label="Has done VME" value={vme} onChange={setVme} options={yesNo} error={errors.has_done_vme} />
            <SelectField
              label="Has done Morpheus Enterprise"
              value={enterprise}
              onChange={setEnterprise}
              options={yesNo}
              error={errors.has_done_morpheus_enterprise}
            />
          </div>
        </>
      ) : (
        <>
          <div className="two-up">
            <SelectField
              label="Segment"
              value={segment}
              onChange={setSegment}
              options={[{ value: '', label: 'Not set' }, ...SEGMENTS.map((s) => ({ value: s, label: SEGMENT_LABELS[s] }))]}
              error={errors.segment}
            />
            <SelectField
              label="Tier fit"
              value={tier}
              onChange={setTier}
              options={TIER_FITS.map((t) => ({ value: t, label: TIER_FIT_LABELS[t] }))}
              error={errors.tier_fit}
            />
          </div>
          <SelectField
            label="Primary partner"
            value={partner}
            onChange={setPartner}
            options={[
              { value: '', label: partners.length ? 'None' : 'No partners yet' },
              ...partners.map((p) => ({ value: p.id, label: p.name })),
            ]}
            error={errors.primary_partner}
          />
        </>
      )}
      <SelectField
        label="HPE owner"
        value={owner}
        onChange={setOwner}
        options={[{ value: '', label: 'None' }, ...people.map((p) => ({ value: p.email, label: p.name }))]}
        error={errors.hpe_owner}
      />
      <TextField label="Industry" value={industry} onChange={setIndustry} error={errors.industry} />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
        error={errors.description}
        hint="One line about the company."
      />
      <TextAreaField label="Notes" value={notes} onChange={setNotes} error={errors.notes} />
      <ProvenanceFields source={source} setSource={setSource} verified={verified} setVerified={setVerified} errors={errors} />
      <p className="muted small">
        Saves as updated by <strong>{editor || 'edited in app'}</strong>. Set your name in Settings.
        {company && ` Last updated by ${company.updated_by}.`}
      </p>
    </Drawer>
  );
}
