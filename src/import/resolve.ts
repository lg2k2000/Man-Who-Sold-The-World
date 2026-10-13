// Finds the company, partner, HPE person, contact, or deal a row means, by id
// or by name, and creates companies and contacts a row names for the first
// time. One Resolver serves one import, so a company created by row 2 is
// found again by row 9. Creations are tentative until the row is accepted.

import { companyMatchKey, fold, personMatchKey, slugify, uniqueId } from '../data/names';
import {
  blankCompany,
  blankContact,
  COMPANY_TYPE_LABELS,
  type Company,
  type CompanyType,
  type Contact,
  type Dataset,
  type Deal,
  type Person,
  type Provenance,
} from '../data/types';
import { FieldError, text } from './fields';

export interface Match {
  /** What the row said. */
  from: string;
  /** The stored name it matched. */
  to: string;
}

export interface Created {
  table: 'companies' | 'contacts';
  id: string;
  name: string;
  /** For contacts, the company's name. */
  at?: string;
}

class Index<T> {
  private map = new Map<string, T[]>();
  add(key: string, v: T) {
    if (!key) return;
    const list = this.map.get(key);
    if (list) list.push(v);
    else this.map.set(key, [v]);
  }
  remove(key: string, v: T) {
    const list = this.map.get(key);
    if (!list) return;
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
  }
  get(key: string): T[] {
    return this.map.get(key) ?? [];
  }
}

export class Resolver {
  private companyById = new Map<string, Company>();
  private companyByKey = new Index<Company>();
  private contactById = new Map<string, Contact>();
  private contactByName = new Index<Contact>();
  private contactByEmail = new Index<Contact>();
  private dealById = new Map<string, Deal>();
  private dealByOp = new Map<string, Deal>();
  private dealByName = new Index<Deal>();
  private personById = new Map<string, Person>();
  private personByEmail = new Map<string, Person>();
  private personByName = new Index<Person>();

  /** Rows registered or created since begin(), undone by rollback(). */
  private pending: { undo(): void; created?: Created; record?: Company | Contact }[] = [];

  readonly created: Created[] = [];
  /** Companies and contacts created for rows that were accepted, ready to save. */
  readonly newCompanies: Company[] = [];
  readonly newContacts: Contact[] = [];
  private matchSeen = new Set<string>();
  readonly matches: Match[] = [];

  constructor(
    current: Dataset,
    private provenance: Provenance,
    /** Whether a name with no match creates a company or contact. Imports do; restores and edit forms do not. */
    private allowCreate: boolean,
  ) {
    for (const c of current.companies) this.indexCompany(c);
    for (const c of current.contacts) this.indexContact(c);
    for (const d of current.deals) this.indexDeal(d);
    for (const p of current.people) this.indexPerson(p);
  }

  begin() {
    this.pending = [];
  }

  commit() {
    for (const p of this.pending) {
      if (p.created) this.created.push(p.created);
      if (p.record && 'type' in p.record) this.newCompanies.push(p.record);
      else if (p.record) this.newContacts.push(p.record);
    }
    this.pending = [];
  }

  rollback() {
    for (const p of this.pending.reverse()) p.undo();
    this.pending = [];
  }

  private indexCompany(c: Company) {
    this.companyById.set(c.id, c);
    this.companyByKey.add(companyMatchKey(c.name), c);
  }

  private unindexCompany(c: Company) {
    if (this.companyById.get(c.id) === c) this.companyById.delete(c.id);
    this.companyByKey.remove(companyMatchKey(c.name), c);
  }

  private indexContact(c: Contact) {
    this.contactById.set(c.id, c);
    this.contactByName.add(`${c.company_id} ${personMatchKey(c.name)}`, c);
    if (c.email) this.contactByEmail.add(`${c.company_id} ${c.email.toLowerCase()}`, c);
  }

  private unindexContact(c: Contact) {
    if (this.contactById.get(c.id) === c) this.contactById.delete(c.id);
    this.contactByName.remove(`${c.company_id} ${personMatchKey(c.name)}`, c);
    if (c.email) this.contactByEmail.remove(`${c.company_id} ${c.email.toLowerCase()}`, c);
  }

  private indexDeal(d: Deal) {
    this.dealById.set(d.id, d);
    if (d.op_id) this.dealByOp.set(d.op_id, d);
    if (d.name) this.dealByName.add(`${d.company_id} ${fold(d.name).trim()}`, d);
  }

  private unindexDeal(d: Deal) {
    if (this.dealById.get(d.id) === d) this.dealById.delete(d.id);
    if (d.op_id && this.dealByOp.get(d.op_id) === d) this.dealByOp.delete(d.op_id);
    if (d.name) this.dealByName.remove(`${d.company_id} ${fold(d.name).trim()}`, d);
  }

  private indexPerson(p: Person) {
    this.personById.set(p.id, p);
    if (p.email) this.personByEmail.set(p.email, p);
    this.personByName.add(personMatchKey(p.name), p);
  }

  private unindexPerson(p: Person) {
    if (this.personById.get(p.id) === p) this.personById.delete(p.id);
    if (p.email && this.personByEmail.get(p.email) === p) this.personByEmail.delete(p.email);
    this.personByName.remove(personMatchKey(p.name), p);
  }

  private noteMatch(from: string, to: string) {
    if (fold(from).trim() === fold(to).trim()) return;
    const key = `${from}\u0000${to}`;
    if (this.matchSeen.has(key)) return;
    this.matchSeen.add(key);
    this.matches.push({ from, to });
  }

  companyName(id: string): string {
    return this.companyById.get(id)?.name ?? id;
  }

  getCompany(id: string): Company | undefined {
    return this.companyById.get(id);
  }

  /** The company a name or id means, or null when none does. Throws when a name fits more than one. */
  findCompany(value: string, prefer?: CompanyType): Company | null {
    const byId = this.companyById.get(value.toLowerCase()) ?? this.companyById.get(value);
    if (byId) return byId;
    const hits = this.companyByKey.get(companyMatchKey(value));
    if (hits.length === 0) return null;
    if (hits.length === 1) return hits[0]!;
    const exact = hits.filter((c) => fold(c.name).trim() === fold(value).trim());
    if (exact.length === 1) return exact[0]!;
    const typed = prefer ? hits.filter((c) => c.type === prefer) : [];
    if (typed.length === 1) return typed[0]!;
    throw new FieldError(`"${value}" matches ${hits.length} companies (${hits.map((c) => c.name).join(', ')}); use the company id instead`);
  }

  /**
   * The id of the company a cell names. A name with no match creates a
   * company of `type` when creating is allowed, with the location the row gives.
   */
  company(v: unknown, type: CompanyType = 'prospect', location: { state?: string | null; city?: string } = {}): string {
    const value = text(v);
    if (!value) throw new FieldError('is empty; it needs a company name');
    const found = this.findCompany(value, type);
    if (found) {
      this.noteMatch(value, found.name);
      return found.id;
    }
    if (!this.allowCreate) throw new FieldError(`"${value}" is not a known company`);
    const company: Company = {
      ...blankCompany(
        uniqueId(slugify(value), (id) => this.companyById.has(id)),
        value,
        type,
        this.provenance,
      ),
      state: location.state ?? null,
      hq_city: location.city ?? '',
    };
    this.indexCompany(company);
    this.pending.push({
      undo: () => this.unindexCompany(company),
      created: { table: 'companies', id: company.id, name: `${value} (${COMPANY_TYPE_LABELS[type].toLowerCase()})` },
      record: company,
    });
    return company.id;
  }

  /** A row in the companies file: its own id if it gave one, the id of the company with its name, or a new id. */
  companyRowId(id: string | null, name: string): string {
    if (id) return id;
    const found = this.findCompany(name);
    if (found) return found.id;
    return uniqueId(slugify(name), (x) => this.companyById.has(x));
  }

  /** Makes an accepted companies-file row findable by later rows. */
  registerCompany(c: Company) {
    const previous = this.companyById.get(c.id);
    if (previous) this.unindexCompany(previous);
    this.indexCompany(c);
    this.pending.push({
      undo: () => {
        this.unindexCompany(c);
        if (previous) this.indexCompany(previous);
      },
    });
  }

  /**
   * An HPE person by id, email, or name. An email with no match comes back as
   * the id a person with that email would get; a name with no match comes
   * back as a name only.
   */
  person(v: unknown): { id: string | null; name: string; known: boolean } {
    const value = text(v);
    if (!value) return { id: null, name: '', known: false };
    const byId = this.personById.get(value) ?? this.personById.get(value.toLowerCase());
    if (byId) return { id: byId.id, name: byId.name, known: true };
    if (value.includes('@')) {
      const email = value.toLowerCase();
      const p = this.personByEmail.get(email);
      return p ? { id: p.id, name: p.name, known: true } : { id: email, name: '', known: false };
    }
    const hits = this.personByName.get(personMatchKey(value));
    if (hits.length === 1) return { id: hits[0]!.id, name: hits[0]!.name, known: true };
    if (hits.length > 1) throw new FieldError(`"${value}" matches ${hits.length} people in the HPE team; use an email address`);
    return { id: null, name: value, known: false };
  }

  /**
   * A row in the HPE team file: its own id if it gave one, the person with its
   * email, the person with its name (when that person has no other email), or
   * a new id: the email, or one made from the name.
   */
  personRowId(id: string | null, name: string, email: string): string {
    if (id) return id;
    const byEmail = email ? this.personByEmail.get(email) : undefined;
    if (byEmail) return byEmail.id;
    const byName = this.personByName.get(personMatchKey(name)).filter((p) => !email || !p.email || p.email === email);
    if (byName.length === 1) return byName[0]!.id;
    if (byName.length > 1)
      throw new FieldError(`"${name}" matches ${byName.length} people in the HPE team; add an email to tell them apart`);
    return uniqueId(email || `person-${slugify(name)}`, (x) => this.personById.has(x));
  }

  /** Makes an accepted HPE team row findable by later rows. */
  registerPerson(p: Person) {
    const previous = this.personById.get(p.id);
    if (previous) this.unindexPerson(previous);
    this.indexPerson(p);
    this.pending.push({
      undo: () => {
        this.unindexPerson(p);
        if (previous) this.indexPerson(previous);
      },
    });
  }

  /** A contact at a company, by id, email, or name; created when new and creating is allowed. */
  contact(companyId: string, v: unknown): string {
    const value = text(v);
    if (!value) throw new FieldError('has an empty contact name');
    const byId = this.contactById.get(value.toLowerCase());
    if (byId) return byId.id;
    const found = value.includes('@')
      ? this.contactByEmail.get(`${companyId} ${value.toLowerCase()}`)
      : this.contactByName.get(`${companyId} ${personMatchKey(value)}`);
    if (found.length) return found[0]!.id;
    if (!this.allowCreate) throw new FieldError(`"${value}" is not a known contact at ${this.companyName(companyId)}`);
    const contact = blankContact(
      uniqueId(`${companyId}-${slugify(value)}`, (id) => this.contactById.has(id)),
      companyId,
      value,
      this.provenance,
    );
    if (value.includes('@')) contact.email = value.toLowerCase();
    this.indexContact(contact);
    this.pending.push({
      undo: () => this.unindexContact(contact),
      created: { table: 'contacts', id: contact.id, name: value, at: this.companyName(companyId) },
      record: contact,
    });
    return contact.id;
  }

  /** A row in the contacts file: its own id, the contact at that company with the same email or name, or a new id. */
  contactRowId(id: string | null, companyId: string, name: string, email: string): string {
    if (id) return id;
    const byEmail = email ? this.contactByEmail.get(`${companyId} ${email.toLowerCase()}`) : [];
    if (byEmail.length) return byEmail[0]!.id;
    const byName = this.contactByName.get(`${companyId} ${personMatchKey(name)}`);
    if (byName.length) return byName[0]!.id;
    return uniqueId(`${companyId}-${slugify(name)}`, (x) => this.contactById.has(x));
  }

  registerContact(c: Contact) {
    const previous = this.contactById.get(c.id);
    if (previous) this.unindexContact(previous);
    this.indexContact(c);
    this.pending.push({
      undo: () => {
        this.unindexContact(c);
        if (previous) this.indexContact(previous);
      },
    });
  }

  /** The id of the contact a reports_to cell means: an id, or a name at the same company. */
  reportsTo(companyId: string, v: unknown): string | null {
    const value = text(v);
    if (!value) return null;
    const byId = this.contactById.get(value.toLowerCase());
    if (byId) return byId.id;
    const byName = this.contactByName.get(`${companyId} ${personMatchKey(value)}`);
    return byName.length ? byName[0]!.id : value.toLowerCase();
  }

  /**
   * A deal's key. A known op ID finds its deal; otherwise a deal at the same
   * company with the same name and no conflicting op ID; otherwise a new key,
   * the op ID itself or one made from the company and deal name.
   */
  dealId(explicit: string | null, opId: string | null, companyId: string, name: string): string {
    if (explicit) return explicit;
    if (opId) {
      const byOp = this.dealByOp.get(opId);
      if (byOp) return byOp.id;
    }
    if (name) {
      const byName = this.dealByName.get(`${companyId} ${fold(name).trim()}`).filter((d) => !opId || !d.op_id);
      if (byName.length) return byName[0]!.id;
    }
    if (opId && !this.dealById.has(opId)) return opId;
    return uniqueId(`${companyId}--${slugify(name || 'deal')}`, (x) => this.dealById.has(x));
  }

  registerDeal(d: Deal) {
    const previous = this.dealById.get(d.id);
    if (previous) this.unindexDeal(previous);
    this.indexDeal(d);
    this.pending.push({
      undo: () => {
        this.unindexDeal(d);
        if (previous) this.indexDeal(previous);
      },
    });
  }
}
