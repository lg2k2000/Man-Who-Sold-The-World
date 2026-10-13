// Saving and deleting records from the edit forms. Every save runs the same
// row checks as an import, so a form can never store what an import would
// reject. Deleting a record clears or removes what points at it, and the
// form says how much before it does.

import type { TerritoryConfig } from '../config/territories';
import { Resolver } from '../import/resolve';
import { PARSERS, RowReader, type Raw } from '../import/tables';
import { personMatchKey } from './names';
import type { Company, Contact, Dataset, Deal, Person } from './types';

export interface FieldErrors {
  [column: string]: string;
}

export type SaveResult<T> = { ok: true; data: Dataset; record: T; warnings: string[] } | { ok: false; errors: FieldErrors };

export interface EditContext {
  config: TerritoryConfig;
  /** Written to updated_by. */
  editor: string;
  /** YYYY-MM-DD. */
  today: string;
}

function parse<T extends 'people' | 'companies' | 'contacts' | 'deals'>(table: T, raw: Raw, data: Dataset, ctx: EditContext) {
  const source = typeof raw.source === 'string' && raw.source.trim() ? raw.source : 'edited in app';
  const reader = new RowReader({ ...raw, updated_by: ctx.editor || 'edited in app', source });
  const warnings: string[] = [];
  const resolver = new Resolver(data, { source, verified_at: null, updated_by: ctx.editor || 'edited in app' }, false);
  const record = PARSERS[table](reader, {
    current: data,
    config: ctx.config,
    fileName: 'edit form',
    today: ctx.today,
    resolver,
    warn: (_c, reason) => warnings.push(reason),
  }) as Dataset[T][number];
  const errors: FieldErrors = {};
  for (const p of reader.problems) if (!errors[p.column]) errors[p.column] = p.reason;
  return { record, errors, warnings };
}

function replaceOrAdd<T>(rows: T[], key: (r: T) => string, originalKey: string | null, record: T): T[] {
  return originalKey !== null && rows.some((r) => key(r) === originalKey)
    ? rows.map((r) => (key(r) === originalKey ? record : r))
    : [...rows, record];
}

/**
 * Saves a person. `originalId` is null for a new person, and a new person may
 * not have the name or email of someone already in the team. The id stays
 * the same when the email or name changes, so coverage and owners keep
 * pointing at them.
 */
export function savePerson(data: Dataset, originalId: string | null, raw: Raw, ctx: EditContext): SaveResult<Person> {
  const { record, errors, warnings } = parse('people', { ...raw, id: originalId ?? '' }, data, ctx);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!originalId && data.people.some((p) => p.id === record.id)) {
    const other = data.people.find((p) => p.id === record.id)!;
    return {
      ok: false,
      errors: {
        [record.email && other.email === record.email ? 'email' : 'name']: `${other.name} is already in the HPE team; open them to edit`,
      },
    };
  }
  const sameEmail = record.email ? data.people.find((p) => p.email === record.email && p.id !== record.id) : undefined;
  if (sameEmail) return { ok: false, errors: { email: `${record.email} already belongs to ${sameEmail.name}` } };
  const original = originalId ? data.people.find((p) => p.id === originalId) : undefined;
  // Editing a sample row keeps it a sample row.
  if (original?.is_sample) record.is_sample = true;
  const next = relinkOwners({ ...data, people: replaceOrAdd(data.people, (p) => p.id, originalId, record) });
  return { ok: true, data: next, record, warnings };
}

/**
 * Points owners and coverage at people who joined the team after them: an
 * owner kept as an email or as a name that now belongs to exactly one person
 * becomes a link to that person.
 */
export function relinkOwners(d: Dataset): Dataset {
  const ids = new Set(d.people.map((p) => p.id));
  const byEmail = new Map(d.people.filter((p) => p.email).map((p) => [p.email, p.id]));
  const byName = new Map<string, string | null>();
  for (const p of d.people) {
    const key = personMatchKey(p.name);
    byName.set(key, byName.has(key) ? null : p.id);
  }
  const find = (ref: string): string | null =>
    ids.has(ref) ? ref : (byEmail.get(ref.toLowerCase()) ?? (ref.includes('@') ? null : (byName.get(personMatchKey(ref)) ?? null)));
  let changed = false;
  const companies = d.companies.map((c) => {
    if (!c.hpe_owner_id || ids.has(c.hpe_owner_id)) return c;
    const id = find(c.hpe_owner_id);
    if (!id) return c;
    changed = true;
    return { ...c, hpe_owner_id: id };
  });
  const deals = d.deals.map((x) => {
    const ref = x.hpe_owner_id ?? x.owner_name;
    if (!ref || (x.hpe_owner_id && ids.has(x.hpe_owner_id))) return x;
    const id = find(ref);
    if (!id) return x;
    changed = true;
    return { ...x, hpe_owner_id: id, owner_name: '' };
  });
  const coverage = d.coverage.map((c) => {
    if (ids.has(c.person_id)) return c;
    const id = find(c.person_id);
    if (!id) return c;
    changed = true;
    return { ...c, person_id: id };
  });
  return changed ? { ...d, companies, deals, coverage } : d;
}

export interface PersonImpact {
  coverage: number;
  companies: number;
  deals: number;
}

export function personDeleteImpact(d: Dataset, id: string): PersonImpact {
  return {
    coverage: d.coverage.filter((c) => c.person_id === id).length,
    companies: d.companies.filter((c) => c.hpe_owner_id === id).length,
    deals: d.deals.filter((x) => x.hpe_owner_id === id).length,
  };
}

/** Removes a person, their coverage links, and their name as owner on companies and deals. */
export function deletePerson(d: Dataset, id: string): Dataset {
  const name = d.people.find((p) => p.id === id)?.name ?? '';
  return {
    ...d,
    people: d.people.filter((p) => p.id !== id),
    coverage: d.coverage.filter((c) => c.person_id !== id),
    companies: d.companies.map((c) => (c.hpe_owner_id === id ? { ...c, hpe_owner_id: null } : c)),
    // A deal keeps the owner's name as text, as an import would have.
    deals: d.deals.map((x) => (x.hpe_owner_id === id ? { ...x, hpe_owner_id: null, owner_name: name } : x)),
  };
}

/** Saves a company. `originalId` is null for a new one, and a new one may not reuse another's name. */
export function saveCompany(data: Dataset, originalId: string | null, raw: Raw, ctx: EditContext): SaveResult<Company> {
  const { record, errors, warnings } = parse('companies', { ...raw, id: originalId ?? raw.id }, data, ctx);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!originalId && data.companies.some((c) => c.id === record.id)) {
    const other = data.companies.find((c) => c.id === record.id)!;
    return { ok: false, errors: { name: `${other.name} is already in Companies; open it to edit it` } };
  }
  const original = originalId ? data.companies.find((c) => c.id === originalId) : undefined;
  if (original?.is_sample) record.is_sample = true;
  return { ok: true, data: { ...data, companies: replaceOrAdd(data.companies, (c) => c.id, originalId, record) }, record, warnings };
}

export interface CompanyImpact {
  contacts: number;
  deals: number;
  coverage: number;
  briefs: number;
  /** Companies that name it as primary partner, and deals that name it as partner. */
  partnerOf: number;
  partnerOnDeals: number;
}

export function companyDeleteImpact(d: Dataset, id: string): CompanyImpact {
  return {
    contacts: d.contacts.filter((c) => c.company_id === id).length,
    deals: d.deals.filter((x) => x.company_id === id).length,
    coverage: d.coverage.filter((c) => c.company_id === id).length,
    briefs: d.briefs.filter((b) => b.company_id === id).length,
    partnerOf: d.companies.filter((c) => c.primary_partner_id === id).length,
    partnerOnDeals: d.deals.filter((x) => x.partner_id === id).length,
  };
}

/** Removes a company with its contacts, deals, coverage, and brief, and clears it as anyone's partner. */
export function deleteCompany(d: Dataset, id: string): Dataset {
  const gone = new Set(d.contacts.filter((c) => c.company_id === id).map((c) => c.id));
  return {
    ...d,
    companies: d.companies.filter((c) => c.id !== id).map((c) => (c.primary_partner_id === id ? { ...c, primary_partner_id: null } : c)),
    contacts: d.contacts.filter((c) => c.company_id !== id),
    deals: d.deals
      .filter((x) => x.company_id !== id)
      .map((x) => ({
        ...x,
        partner_id: x.partner_id === id ? null : x.partner_id,
        contact_ids: x.contact_ids.filter((c) => !gone.has(c)),
      })),
    coverage: d.coverage.filter((c) => c.company_id !== id),
    briefs: d.briefs.filter((b) => b.company_id !== id),
  };
}

/** Saves a contact. A new one may not repeat a name or email already at the same company. */
export function saveContact(data: Dataset, originalId: string | null, raw: Raw, ctx: EditContext): SaveResult<Contact> {
  const { record, errors, warnings } = parse('contacts', { ...raw, id: originalId ?? raw.id }, data, ctx);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!originalId && data.contacts.some((c) => c.id === record.id)) {
    return { ok: false, errors: { name: `${record.name} is already a contact at this company` } };
  }
  if (record.reports_to && !data.contacts.some((c) => c.id === record.reports_to)) {
    return { ok: false, errors: { reports_to: 'reports_to is not a known contact' } };
  }
  const original = originalId ? data.contacts.find((c) => c.id === originalId) : undefined;
  if (original?.is_sample) record.is_sample = true;
  return { ok: true, data: { ...data, contacts: replaceOrAdd(data.contacts, (c) => c.id, originalId, record) }, record, warnings };
}

export function contactDeleteImpact(d: Dataset, id: string): { reports: number; deals: number } {
  return {
    reports: d.contacts.filter((c) => c.reports_to === id).length,
    deals: d.deals.filter((x) => x.contact_ids.includes(id)).length,
  };
}

/** Removes a contact; whoever reported to them moves to the top of the org chart. */
export function deleteContact(d: Dataset, id: string): Dataset {
  return {
    ...d,
    contacts: d.contacts.filter((c) => c.id !== id).map((c) => (c.reports_to === id ? { ...c, reports_to: null } : c)),
    deals: d.deals.map((x) => (x.contact_ids.includes(id) ? { ...x, contact_ids: x.contact_ids.filter((c) => c !== id) } : x)),
  };
}

/** Saves a deal. An op ID another deal already has is refused. */
export function saveDeal(data: Dataset, originalId: string | null, raw: Raw, ctx: EditContext): SaveResult<Deal> {
  const { record, errors, warnings } = parse('deals', { ...raw, id: originalId ?? raw.id }, data, ctx);
  if (Object.keys(errors).length) return { ok: false, errors };
  const sameOp = record.op_id ? data.deals.find((x) => x.op_id === record.op_id && x.id !== originalId) : undefined;
  if (sameOp) return { ok: false, errors: { op_id: `${record.op_id} already belongs to another deal` } };
  if (!originalId && data.deals.some((x) => x.id === record.id)) {
    return { ok: false, errors: { name: 'A deal with this name is already at this company; open it to edit it' } };
  }
  const original = originalId ? data.deals.find((x) => x.id === originalId) : undefined;
  if (original?.is_sample) record.is_sample = true;
  return { ok: true, data: { ...data, deals: replaceOrAdd(data.deals, (x) => x.id, originalId, record) }, record, warnings };
}

export function deleteDeal(d: Dataset, id: string): Dataset {
  return { ...d, deals: d.deals.filter((x) => x.id !== id) };
}

export type SortDir = 'asc' | 'desc';

/**
 * Sorts rows by a value function. Text compares case-insensitively with
 * numbers in natural order ("Co 2" before "Co 10"); empty values go last in
 * either direction.
 */
export function sortRows<T>(rows: T[], value: (row: T) => string | number | null, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const xe = x === null || x === '';
    const ye = y === null || y === '';
    if (xe || ye) return xe === ye ? 0 : xe ? 1 : -1;
    if (typeof x === 'number' && typeof y === 'number') return sign * (x - y);
    return sign * String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
  });
}
