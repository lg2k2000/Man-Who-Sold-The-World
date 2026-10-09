import { useCallback, useMemo, useState } from 'react';
import { contactDeleteImpact, deleteContact, saveContact, type FieldErrors } from '../data/edit';
import { DECISION_ROLES, type Contact } from '../data/types';
import { useApp } from '../state/app';
import { describeStorageError } from '../data/idb';
import { SortableTable, type Column } from './SortableTable';
import { Drawer, FormFooter, plural, ProvenanceFields, SelectField, TextAreaField, TextField, today } from './forms';
import { askConfirm } from './dialogs';

export function ContactsView() {
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const editRecord = useApp((s) => s.editRecord);
  const editContact = useApp((s) => s.editContact);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const editing = editRecord?.kind === 'contact' ? (index.contactById.get(editRecord.id) ?? null) : null;
  const companyName = useCallback((id: string) => index.companyById.get(id)?.name ?? id, [index]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.contacts;
    return data.contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.includes(q) ||
        c.title.toLowerCase().includes(q) ||
        companyName(c.company_id).toLowerCase().includes(q),
    );
  }, [data.contacts, query, companyName]);

  const columns: Column<Contact>[] = useMemo(
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
      { id: 'title', label: 'Title', sort: (c) => c.title, render: (c) => c.title },
      { id: 'company', label: 'Company', sort: (c) => companyName(c.company_id), render: (c) => companyName(c.company_id) },
      { id: 'email', label: 'Email', sort: (c) => c.email, render: (c) => <span className="muted">{c.email}</span> },
      { id: 'phone', label: 'Phone', sort: (c) => c.phone, render: (c) => <span className="muted">{c.phone}</span> },
      {
        id: 'role',
        label: 'Role in decision',
        sort: (c) => (c.role_in_decision === 'unknown' ? null : c.role_in_decision),
        render: (c) =>
          c.role_in_decision === 'unknown' ? (
            ''
          ) : (
            <span className={`role-chip r-${c.role_in_decision.replace(/ /g, '-')}`}>{c.role_in_decision}</span>
          ),
      },
      { id: 'last', label: 'Last contact', sort: (c) => c.last_contact, render: (c) => c.last_contact ?? '' },
    ],
    [companyName],
  );

  const close = useCallback(() => {
    setAdding(false);
    editContact(null);
  }, [editContact]);

  return (
    <main className="page with-drawer" id="main" tabIndex={-1}>
      <div className="page-scroll">
        <div className="page-inner wide">
          <header className="page-head row">
            <div>
              <h2>Contacts</h2>
              <p className="muted">
                {data.contacts.length === 0
                  ? 'No contacts yet. Import a contacts spreadsheet in Data, or add someone here.'
                  : `${rows.length === data.contacts.length ? data.contacts.length : `${rows.length} of ${data.contacts.length}`} contacts at ${plural(new Set(data.contacts.map((c) => c.company_id)).size, 'company', 'companies')}. Click a row to edit.`}
              </p>
            </div>
            <div className="page-actions">
              <input
                type="search"
                className="text-input"
                placeholder="Filter by name, title, company"
                aria-label="Filter contacts by name, title, email, or company"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn solid"
                disabled={data.companies.length === 0}
                title={data.companies.length === 0 ? 'Add a company first' : undefined}
                onClick={() => {
                  editContact(null);
                  setAdding(true);
                  setFormKey((k) => k + 1);
                }}
              >
                Add contact
              </button>
            </div>
          </header>
          <div className="card flush">
            <SortableTable
              caption="Contacts"
              columns={columns}
              rows={rows}
              rowKey={(c) => c.id}
              onOpen={(c) => {
                setAdding(false);
                editContact(c.id);
                setFormKey((k) => k + 1);
              }}
              initialSort={{ id: 'company', dir: 'asc' }}
              selectedKey={editing?.id ?? null}
              empty={data.contacts.length === 0 ? 'No contacts yet.' : 'No contact matches the filter.'}
            />
          </div>
        </div>
      </div>
      {(adding || editing) && <ContactForm key={formKey} contact={editing} onClose={close} />}
    </main>
  );
}

function ContactForm({ contact, onClose }: { contact: Contact | null; onClose(): void }) {
  const config = useApp((s) => s.config);
  const editor = useApp((s) => s.settings.editorName);
  const saveAll = useApp((s) => s.saveAll);
  const editContact = useApp((s) => s.editContact);
  const openCompany = useApp((s) => s.openCompany);
  const data = useApp((s) => s.data);

  const companies = useMemo(
    () => [...data.companies].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [data.companies],
  );
  const [company, setCompany] = useState(contact?.company_id ?? companies[0]?.id ?? '');
  const [name, setName] = useState(contact?.name ?? '');
  const [title, setTitle] = useState(contact?.title ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [reportsTo, setReportsTo] = useState(contact?.reports_to ?? '');
  const [role, setRole] = useState<string>(contact?.role_in_decision ?? 'unknown');
  const [last, setLast] = useState(contact?.last_contact ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [source, setSource] = useState(contact?.source ?? '');
  const [verified, setVerified] = useState(contact?.verified_at ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string | null>(null);

  const colleagues = useMemo(
    () => data.contacts.filter((c) => c.company_id === company && c.id !== contact?.id).sort((a, b) => a.name.localeCompare(b.name)),
    [data.contacts, company, contact],
  );

  const save = async () => {
    const result = saveContact(
      useApp.getState().data,
      contact?.id ?? null,
      {
        company,
        name,
        title,
        email,
        phone,
        reports_to: colleagues.some((c) => c.id === reportsTo) ? reportsTo : '',
        role_in_decision: role,
        last_contact: last,
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
      editContact(result.record.id);
      setStatus('Saved.');
    } catch (e) {
      setStatus(`Saving failed: ${describeStorageError(e)}`);
    }
  };

  const remove = async () => {
    if (!contact) return;
    const d = useApp.getState().data;
    const impact = contactDeleteImpact(d, contact.id);
    const parts = [
      impact.reports && `${plural(impact.reports, 'person', 'people')} who report to them move to the top of the org chart`,
      impact.deals && `they come off ${plural(impact.deals, 'deal')}`,
    ].filter(Boolean);
    const ok = await askConfirm({
      title: `Delete ${contact.name}?`,
      body: parts.length ? `If you do, ${parts.join(', and ')}.` : 'Nothing else points at this contact.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await saveAll(deleteContact(d, contact.id));
    onClose();
  };

  return (
    <Drawer
      title={contact ? `Edit ${contact.name}` : 'Add a contact'}
      onClose={onClose}
      footer={
        <FormFooter
          status={status}
          saveLabel={contact ? 'Save changes' : 'Add contact'}
          onSave={save}
          onClose={onClose}
          onDelete={contact ? remove : undefined}
        >
          {contact && (
            <button type="button" className="btn" onClick={() => openCompany(contact.company_id, 'Contacts')}>
              Show company
            </button>
          )}
        </FormFooter>
      }
    >
      {contact?.is_sample && <p className="callout warn small">This is a sample row. Edits keep it marked as sample.</p>}
      <SelectField
        label="Company"
        value={company}
        onChange={(v) => {
          setCompany(v);
          setReportsTo('');
        }}
        options={companies.map((c) => ({ value: c.id, label: c.name }))}
        error={errors.company}
      />
      <TextField label="Name" value={name} onChange={setName} error={errors.name} />
      <TextField label="Title" value={title} onChange={setTitle} error={errors.title} />
      <div className="two-up">
        <TextField label="Email" type="email" value={email} onChange={setEmail} error={errors.email} />
        <TextField label="Phone" type="tel" value={phone} onChange={setPhone} error={errors.phone} />
      </div>
      <SelectField
        label="Reports to"
        value={reportsTo}
        onChange={setReportsTo}
        options={[
          { value: '', label: colleagues.length ? 'Nobody (top of the org chart)' : 'No one else at this company yet' },
          ...colleagues.map((c) => ({ value: c.id, label: `${c.name}${c.title ? `, ${c.title}` : ''}` })),
        ]}
        error={errors.reports_to}
      />
      <div className="two-up">
        <SelectField
          label="Role in decision"
          value={role}
          onChange={setRole}
          options={DECISION_ROLES.map((r) => ({ value: r, label: r }))}
          error={errors.role_in_decision}
        />
        <TextField label="Last contact" type="date" value={last} onChange={setLast} error={errors.last_contact} />
      </div>
      <TextAreaField label="Notes" value={notes} onChange={setNotes} error={errors.notes} />
      <ProvenanceFields source={source} setSource={setSource} verified={verified} setVerified={setVerified} errors={errors} />
      <p className="muted small">Work facts only.</p>
    </Drawer>
  );
}
