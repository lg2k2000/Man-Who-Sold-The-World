// Column definitions and row parsers for every import. README.md lists the
// same columns; tests/import.test.ts checks both stay in step. Each column
// lists the other header names it is recognized by, so a spreadsheet exported
// from somewhere else maps without anyone renaming its columns.

import type { TerritoryConfig } from '../config/territories';
import {
  BRIEF_SECTIONS,
  COMPANY_TYPES,
  CONFIDENCES,
  DECISION_ROLES,
  SEGMENTS,
  TIER_FITS,
  YES_NO_UNKNOWN,
  type Brief,
  type BriefItem,
  type BriefSection,
  type Company,
  type CompanyType,
  type Contact,
  type Coverage,
  type Dataset,
  type Deal,
  type Person,
  type Provenance,
  type Segment,
  type TableName,
} from '../data/types';
import * as f from './fields';
import type { Resolver } from './resolve';

export interface ColumnSpec {
  name: string;
  required: boolean;
  description: string;
  /** How the import screen names the column, when the name alone reads badly. */
  label?: string;
  /** Other header names that mean this column, such as "Opportunity ID" for op_id. */
  aliases?: string[];
}

const PROVENANCE_COLUMNS: ColumnSpec[] = [
  { name: 'source', required: false, description: 'Where the row came from, as text or a URL. Defaults to the file name.' },
  { name: 'verified_at', required: false, description: 'Date someone last checked the row.', aliases: ['verified', 'verified on'] },
  { name: 'updated_by', required: false, description: 'Who made the file. Defaults to "import".' },
];

const YES_NO_ALIASES = { y: 'yes', n: 'no', true: 'yes', false: 'no' } as const;

export const COLUMNS: Record<TableName, ColumnSpec[]> = {
  companies: [
    {
      name: 'name',
      required: true,
      description: 'Company name.',
      aliases: ['company', 'company name', 'account', 'account name', 'customer'],
    },
    {
      name: 'id',
      required: false,
      description:
        'Your id for the company, such as acme-seattle. Leave it empty and the row matches an existing company by name, or gets an id made from the name.',
      aliases: ['company id', 'prospect id', 'partner id'],
    },
    {
      name: 'type',
      required: false,
      description: 'prospect (the default), customer, partner, or other.',
      aliases: ['company type', 'account type', 'relationship'],
    },
    { name: 'website', required: false, description: 'Web address.', aliases: ['url', 'web', 'domain'] },
    {
      name: 'hq_city',
      required: false,
      description: 'Headquarters city.',
      aliases: ['city', 'hq city', 'billing city', 'headquarters city'],
    },
    {
      name: 'state',
      required: false,
      description: 'Headquarters state or province: WA, US-WA, or Washington. A company without one has no pin on the map.',
      aliases: ['province', 'state province', 'hq state', 'billing state', 'billing state province', 'headquarters state'],
    },
    {
      name: 'lat',
      required: false,
      description: 'Headquarters latitude. Leave lat and lng empty to pin at the state center as "location unverified".',
      aliases: ['latitude'],
    },
    {
      name: 'lng',
      required: false,
      description: 'Headquarters longitude, negative in North America.',
      aliases: ['lon', 'long', 'longitude'],
    },
    { name: 'industry', required: false, description: 'Free text.', aliases: ['vertical', 'sector'] },
    { name: 'description', required: false, description: 'One line about the company.', aliases: ['about', 'summary'] },
    { name: 'segment', required: false, description: 'enterprise, mid-market, or sled.' },
    { name: 'tier_fit', required: false, description: 'vme, advanced, enterprise, or unknown (the default).', aliases: ['tier', 'fit'] },
    {
      name: 'primary_partner',
      required: false,
      description: 'Partner company by name or id. A partner not in Companies yet is added as one.',
      aliases: ['primary partner id', 'partner', 'partner account', 'reseller'],
    },
    {
      name: 'hpe_owner',
      required: false,
      description: 'HPE owner, by email or by name as it appears in the HPE team.',
      aliases: ['hpe owner email', 'owner', 'account owner', 'eam'],
    },
    {
      name: 'states',
      required: false,
      description: 'Partners: the states and provinces they work in, separated by semicolons.',
      aliases: ['coverage states', 'states covered', 'territory states'],
    },
    { name: 'has_done_vme', required: false, description: 'Partners: yes, no, or unknown (the default).', aliases: ['done vme', 'vme'] },
    {
      name: 'has_done_morpheus_enterprise',
      required: false,
      description: 'Partners: yes, no, or unknown (the default).',
      aliases: ['done morpheus enterprise', 'morpheus enterprise'],
    },
    { name: 'notes', required: false, description: 'Free text.', aliases: ['note', 'comments'] },
    ...PROVENANCE_COLUMNS,
  ],
  contacts: [
    { name: 'name', required: true, description: 'Full name. Work facts only.', aliases: ['contact', 'contact name', 'full name'] },
    {
      name: 'company',
      required: true,
      description: 'The company they work at, by name or id. A company not in Companies yet is added as a prospect.',
      aliases: ['company id', 'prospect id', 'account', 'account name', 'company name', 'organization'],
    },
    { name: 'title', required: false, description: 'Job title.', aliases: ['job title', 'role', 'position'] },
    { name: 'email', required: false, description: 'Work email.', aliases: ['email address', 'e mail'] },
    { name: 'phone', required: false, description: 'Phone number.', aliases: ['phone number', 'mobile', 'cell', 'direct'] },
    {
      name: 'id',
      required: false,
      description:
        'Your id for the contact. Leave it empty and the row matches the contact with the same email or name at the same company.',
      aliases: ['contact id'],
    },
    {
      name: 'reports_to',
      required: false,
      description: 'Who they report to: a contact id or a name at the same company. The Contacts tab draws the org chart from it.',
      aliases: ['manager', 'reports to'],
    },
    {
      name: 'role_in_decision',
      required: false,
      description: `${DECISION_ROLES.join(', ')} (the default).`,
      aliases: ['decision role', 'buying role'],
    },
    { name: 'last_contact', required: false, description: 'Date of the last conversation.', aliases: ['last contacted', 'last touch'] },
    { name: 'notes', required: false, description: 'Free text.', aliases: ['note', 'comments'] },
    ...PROVENANCE_COLUMNS,
  ],
  deals: [
    {
      name: 'op_id',
      required: false,
      description:
        'OPE- followed by ten digits. A row with a known op ID updates that deal. A row without one matches the deal with the same name at the same company, or adds a new deal.',
      aliases: ['op id', 'opportunity id', 'opp id', 'opportunity number', 'ope', 'ope id', 'ope number'],
    },
    {
      name: 'name',
      required: false,
      description: 'Deal name. A row needs an op ID or a deal name.',
      aliases: ['deal', 'deal name', 'opportunity', 'opportunity name', 'opp name', 'title'],
    },
    {
      name: 'company',
      required: true,
      description: 'The customer or prospect, by name or id. A company not in Companies yet is added as a prospect.',
      aliases: [
        'account',
        'account name',
        'customer',
        'customer name',
        'company name',
        'end user',
        'end customer',
        'prospect',
        'prospect id',
        'company id',
        'client',
      ],
    },
    {
      name: 'stage',
      required: true,
      description: 'Sales stage. A stage starting with "Closed" counts as closed; anything else is open.',
      aliases: ['sales stage', 'deal stage', 'opportunity stage', 'status'],
    },
    {
      name: 'amount',
      required: false,
      description: 'Deal value in US dollars: 1250000, $1,250,000, or 1.25M.',
      aliases: [
        'value',
        'deal value',
        'total',
        'total value',
        'tcv',
        'acv',
        'revenue',
        'amount usd',
        'opportunity amount',
        'deal size',
        'price',
        'total amount',
      ],
    },
    {
      name: 'close_date',
      required: false,
      description: 'Expected or actual close: 2026-10-15, 10/15/2026, or a spreadsheet date.',
      aliases: ['close', 'close date', 'expected close', 'expected close date', 'closing date', 'est close date', 'estimated close date'],
    },
    {
      name: 'forecast_category',
      required: false,
      description: 'Free text, such as Pipeline, Upside, or Commit.',
      aliases: ['forecast', 'forecast category', 'category'],
    },
    {
      name: 'hpe_owner',
      required: false,
      description: 'HPE owner, by email or by name as it appears in the HPE team. A name not in the team is kept as text.',
      aliases: [
        'hpe owner email',
        'owner',
        'opportunity owner',
        'deal owner',
        'account owner',
        'rep',
        'sales rep',
        'account manager',
        'am',
      ],
    },
    {
      name: 'partner',
      required: false,
      description: 'Partner company by name or id. A partner not in Companies yet is added as one.',
      aliases: ['partner id', 'partner name', 'partner account', 'primary partner', 'reseller', 'channel partner', 'var', 'distributor'],
    },
    {
      name: 'contacts',
      required: false,
      description: 'Contacts on the deal at its company, by name or email, separated by semicolons. New names are added to Contacts.',
      aliases: ['contact', 'primary contact', 'contact name'],
    },
    { name: 'next_step', required: false, description: 'Free text.', aliases: ['next step', 'next steps'] },
    { name: 'notes', required: false, description: 'Free text.', aliases: ['note', 'comments', 'comment', 'description'] },
    {
      name: 'as_of',
      required: false,
      description: 'Date the deal data was current. Defaults to the day of the import.',
      aliases: ['as of', 'as of date', 'last modified', 'last modified date', 'snapshot date', 'updated'],
    },
    {
      name: 'state',
      required: false,
      description: "The company's state or province. Used when the deal adds a new company, so it gets a pin.",
      aliases: ['account state', 'billing state', 'billing state province', 'province', 'customer state'],
    },
    {
      name: 'city',
      required: false,
      description: "The company's city, for a new company.",
      aliases: ['account city', 'billing city', 'customer city'],
    },
    { name: 'id', required: false, description: "The app's own key for the deal, in backups. Leave it empty." },
    ...PROVENANCE_COLUMNS,
  ],
  people: [
    { name: 'name', required: true, description: 'Full name.', aliases: ['full name'] },
    {
      name: 'email',
      required: true,
      description: 'Work email; the key for a person. Re-importing the same email updates the person.',
      aliases: ['email address'],
    },
    {
      name: 'role',
      required: true,
      description:
        'One or more of morpheus, opsramp, eam, storage, compute, networking, greenlake, zerto, sled, other, separated by semicolons. Labels such as "Morpheus specialist" also work.',
      aliases: ['roles', 'title'],
    },
    { name: 'specialty', required: false, description: 'aruba or juniper, for networking specialists.' },
    {
      name: 'territories',
      required: false,
      description: 'Territory teams the person sits on, by id (pacnorthwest) or name (PacNorthwest), separated by semicolons.',
      aliases: ['territory'],
    },
    {
      name: 'states',
      required: false,
      description: 'States and provinces the person covers, such as WA; OR; BC or US-WA; US-OR; CA-BC.',
      aliases: ['coverage states'],
    },
    { name: 'notes', required: false, description: 'Free text.' },
    ...PROVENANCE_COLUMNS,
  ],
  coverage: [
    { name: 'person_email', required: true, description: 'Email of someone in the HPE team.', aliases: ['email', 'person'] },
    {
      name: 'company',
      required: true,
      description: 'A company already in Companies, by name or id.',
      aliases: ['company id', 'prospect id', 'account', 'account name'],
    },
    ...PROVENANCE_COLUMNS,
  ],
  briefs: [
    {
      name: 'company',
      required: true,
      description: 'A company already in Companies, by name or id. One brief per company; a new brief replaces the old one.',
      aliases: ['company id', 'prospect id'],
    },
    {
      name: 'sections',
      required: true,
      description: `Object with any of ${BRIEF_SECTIONS.join(', ')}. Each is a list of items with text, source_url, source_date (YYYY-MM-DD), and confidence (confirmed, reported, inferred).`,
    },
    ...PROVENANCE_COLUMNS,
  ],
};

/** Briefs are nested, so they come only as JSON; every other table also reads CSV, Excel, and pasted rows. */
export const JSON_ONLY: ReadonlySet<TableName> = new Set(['briefs']);

export const TABLE_LABELS: Record<TableName, string> = {
  companies: 'Companies',
  contacts: 'Contacts',
  deals: 'Deals',
  people: 'HPE team',
  coverage: 'Coverage',
  briefs: 'Briefs',
};

/** The key that identifies a row: re-importing a row with the same key updates it. */
export function keyOf<T extends TableName>(table: T, row: Dataset[T][number]): string {
  switch (table) {
    case 'people':
      return (row as Person).email;
    case 'coverage':
      return `${(row as Coverage).person_email} ${(row as Coverage).company_id}`;
    case 'briefs':
      return (row as Brief).company_id;
    default:
      return (row as Company | Contact | Deal).id;
  }
}

/** How a duplicate row is named in the report. */
export function describeKey(table: TableName, row: Dataset[TableName][number], companyName: (id: string) => string): string {
  switch (table) {
    case 'people':
      return `email ${(row as Person).email}`;
    case 'coverage':
      return `${(row as Coverage).person_email} on ${companyName((row as Coverage).company_id)}`;
    case 'briefs':
      return `a brief for ${companyName((row as Brief).company_id)}`;
    case 'companies':
      return `company ${(row as Company).name}`;
    case 'contacts':
      return `${(row as Contact).name} at ${companyName((row as Contact).company_id)}`;
    case 'deals': {
      const d = row as Deal;
      return d.op_id ? `op ID ${d.op_id}` : `deal "${d.name}" at ${companyName(d.company_id)}`;
    }
  }
}

export interface Issue {
  /** Spreadsheet row number (header is row 1, or wherever the header sits), item number for JSON. */
  row: number;
  column: string;
  reason: string;
}

/** Everything a row parser can look at besides the row itself. */
export interface ParseContext {
  current: Dataset;
  config: TerritoryConfig;
  fileName: string;
  /** Today's date, YYYY-MM-DD, for defaults such as a deal's as_of. */
  today: string;
  resolver: Resolver;
  /** Records a problem that does not stop the row from importing. */
  warn(column: string, reason: string): void;
}

export type Raw = Record<string, unknown>;

/**
 * Reads one field and records a problem instead of throwing, so a row reports
 * every bad column at once.
 */
export class RowReader {
  readonly problems: { column: string; reason: string }[] = [];
  constructor(private raw_: Raw) {}

  get<T>(column: string, parse: (v: unknown) => T): T {
    try {
      return parse(this.raw_[column]);
    } catch (e) {
      const reason = e instanceof f.FieldError ? e.message : e instanceof Error ? e.message : String(e);
      this.problems.push({ column, reason: `${column} ${reason}` });
      return undefined as T;
    }
  }

  fail(column: string, reason: string) {
    this.problems.push({ column, reason });
  }

  raw(column: string): unknown {
    return this.raw_[column];
  }

  has(column: string): boolean {
    return this.raw_[column] !== undefined;
  }
}

function provenance(r: RowReader, ctx: ParseContext): Provenance {
  const p: Provenance = {
    source: r.get('source', f.text) || `import: ${ctx.fileName}`,
    verified_at: r.get('verified_at', f.optionalDate),
    updated_by: r.get('updated_by', f.text) || 'import',
  };
  // Only a JSON boolean marks a sample row (backups of sample data keep it); spreadsheet text never does.
  if (r.raw('is_sample') === true) p.is_sample = true;
  return p;
}

function territoryRefs(ctx: ParseContext) {
  const byKey = new Map<string, string>();
  for (const t of ctx.config.territories) {
    byKey.set(t.id.toLowerCase(), t.id);
    byKey.set(t.name.toLowerCase(), t.id);
  }
  return (v: unknown) =>
    f.list(v).map((item) => {
      const found = byKey.get(item.toLowerCase());
      if (!found) throw new f.FieldError(`"${item}" is not a territory; use one of ${ctx.config.territories.map((t) => t.id).join(', ')}`);
      return found;
    });
}

/** The HPE owner cell: an email or a name. An owner not in the team is kept and warned about. */
function owner(r: RowReader, ctx: ParseContext) {
  const who = r.get('hpe_owner', (v) => ctx.resolver.person(v));
  if (!who || (!who.email && !who.name)) return { email: null, name: '' };
  if (!who.known) {
    ctx.warn(
      'hpe_owner',
      who.email ? `${who.email} is not in the HPE team yet` : `owner "${who.name}" is not in the HPE team; kept as text`,
    );
  }
  if (who.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email)) {
    r.fail('hpe_owner', `hpe_owner "${who.email}" is not an email address`);
  }
  return { email: who.email, name: who.known ? '' : who.name };
}

export const PARSERS: { [T in TableName]: (r: RowReader, ctx: ParseContext) => Dataset[T][number] } = {
  companies(r, ctx) {
    const name = r.get('name', (v) => f.required(v, 'a company name'));
    const explicitId = r.get('id', f.optionalId);
    const type = r.get('type', (v) =>
      f.oneOf<CompanyType>(v, COMPANY_TYPES, 'prospect', {
        customers: 'customer',
        prospects: 'prospect',
        partners: 'partner',
        reseller: 'partner',
        var: 'partner',
      }),
    );
    const state = r.get('state', f.optionalRegion);
    const lat = r.get('lat', (v) => f.number(v, -90, 90, 'latitude'));
    const lng = r.get('lng', (v) => f.number(v, -180, 180, 'longitude'));
    if ((lat === null) !== (lng === null) && lat !== undefined && lng !== undefined) {
      r.fail(lat === null ? 'lat' : 'lng', 'lat and lng go together; give both or leave both empty');
    }
    if (typeof lat === 'number' && typeof lng === 'number' && (lat < 15 || lat > 84 || lng < -180 || lng > -50)) {
      ctx.warn('lat', `${lat}, ${lng} is outside North America; check the sign of lng`);
    }
    const primary_partner_id = r.get('primary_partner', (v) => (f.text(v) ? ctx.resolver.company(v, 'partner') : null));
    const hpeOwner = owner(r, ctx);
    if (hpeOwner.name) ctx.warn('hpe_owner', `a company's owner needs to be in the HPE team; "${hpeOwner.name}" was left off`);
    let id = '';
    try {
      if (name) id = ctx.resolver.companyRowId(explicitId ?? null, name);
    } catch (e) {
      r.fail('name', `name ${e instanceof Error ? e.message : String(e)}`);
    }
    const company: Company = {
      id,
      name,
      type,
      website: r.get('website', f.text),
      hq_city: r.get('hq_city', f.text),
      state,
      lat: lat ?? null,
      lng: lng ?? null,
      industry: r.get('industry', f.text),
      description: r.get('description', f.text),
      segment: r.get('segment', (v) =>
        f.text(v)
          ? f.oneOf<Segment>(v, SEGMENTS, undefined, { 'mid market': 'mid-market', midmarket: 'mid-market', mid: 'mid-market' })
          : null,
      ),
      tier_fit: r.get('tier_fit', (v) => f.oneOf(v, TIER_FITS, 'unknown', { 'vm essentials': 'vme' })),
      primary_partner_id,
      hpe_owner_email: hpeOwner.email,
      states: r.get('states', f.regions),
      has_done_vme: r.get('has_done_vme', (v) => f.oneOf(v, YES_NO_UNKNOWN, 'unknown', YES_NO_ALIASES)),
      has_done_morpheus_enterprise: r.get('has_done_morpheus_enterprise', (v) => f.oneOf(v, YES_NO_UNKNOWN, 'unknown', YES_NO_ALIASES)),
      notes: r.get('notes', f.text),
      ...provenance(r, ctx),
    };
    if (primary_partner_id && primary_partner_id === id) r.fail('primary_partner', 'primary_partner is the company itself');
    if (id) ctx.resolver.registerCompany(company);
    return company;
  },

  contacts(r, ctx) {
    const name = r.get('name', (v) => f.required(v, 'a name'));
    const company_id = r.get('company', (v) => ctx.resolver.company(v, 'prospect'));
    const email = r.get('email', (v) => f.optionalEmail(v) ?? '');
    const explicitId = r.get('id', f.optionalId);
    const id = name && company_id ? ctx.resolver.contactRowId(explicitId ?? null, company_id, name, email ?? '') : '';
    const contact: Contact = {
      id,
      company_id,
      name,
      title: r.get('title', f.text),
      email: email ?? '',
      phone: r.get('phone', f.text),
      reports_to: company_id ? r.get('reports_to', (v) => ctx.resolver.reportsTo(company_id, v)) : null,
      role_in_decision: r.get('role_in_decision', (v) => f.oneOf(v, DECISION_ROLES, 'unknown')),
      last_contact: r.get('last_contact', f.optionalDate),
      notes: r.get('notes', f.text),
      ...provenance(r, ctx),
    };
    if (contact.reports_to === id && id) r.fail('reports_to', 'reports_to is the contact themself');
    if (id) ctx.resolver.registerContact(contact);
    return contact;
  },

  deals(r, ctx) {
    const op_id = r.get('op_id', f.optionalOpId);
    const name = r.get('name', f.text);
    const state = r.get('state', f.optionalRegion);
    const city = r.get('city', f.text);
    const company_id = r.get('company', (v) => ctx.resolver.company(v, 'prospect', { state, city }));
    if (op_id === null && !name) r.fail('op_id', 'The row needs an op ID or a deal name, so a later import can find the deal again');
    const partner_id = r.get('partner', (v) => (f.text(v) ? ctx.resolver.company(v, 'partner') : null));
    if (partner_id) {
      const p = ctx.resolver.getCompany(partner_id);
      if (p && p.type !== 'partner') ctx.warn('partner', `${p.name} is listed as a ${p.type}, not a partner`);
    }
    const hpeOwner = owner(r, ctx);
    const contact_ids = company_id ? r.get('contacts', (v) => [...new Set(f.list(v).map((c) => ctx.resolver.contact(company_id, c)))]) : [];
    const explicitId = r.get('id', f.text) || null;
    const id = company_id && (op_id || name) ? ctx.resolver.dealId(explicitId, op_id ?? null, company_id, name ?? '') : '';
    const deal: Deal = {
      id,
      op_id: op_id ?? null,
      name: name ?? '',
      company_id,
      stage: r.get('stage', (v) => f.required(v, 'a stage')),
      amount: r.get('amount', f.amount),
      close_date: r.get('close_date', f.optionalDate),
      forecast_category: r.get('forecast_category', f.text),
      hpe_owner_email: hpeOwner.email,
      owner_name: hpeOwner.name,
      partner_id,
      contact_ids: contact_ids ?? [],
      next_step: r.get('next_step', f.text),
      notes: r.get('notes', f.text),
      as_of: r.get('as_of', (v) => (f.text(v) ? f.date(v, 'the as-of date') : ctx.today)),
      ...provenance(r, ctx),
    };
    if (id) ctx.resolver.registerDeal(deal);
    return deal;
  },

  people(r, ctx) {
    const roles = r.get('role', f.roles);
    const specialty = r.get('specialty', (v) => {
      const s = f.text(v).toLowerCase();
      if (!s) return null;
      if (s !== 'aruba' && s !== 'juniper') throw new f.FieldError(`"${f.text(v)}" is not aruba or juniper`);
      return s;
    });
    return {
      name: r.get('name', (v) => f.required(v, 'a name')),
      email: r.get('email', f.email),
      roles,
      specialty,
      territories: r.get('territories', territoryRefs(ctx)),
      states: r.get('states', f.regions),
      notes: r.get('notes', f.text),
      ...provenance(r, ctx),
    };
  },

  coverage(r, ctx) {
    const person_email = r.get('person_email', f.email);
    const company_id = r.get('company', (v) => {
      const found = ctx.resolver.findCompany(f.required(v, 'a company'));
      if (!found) throw new f.FieldError(`"${f.text(v)}" is not in Companies; import companies first`);
      return found.id;
    });
    if (person_email && !ctx.current.people.some((p) => p.email === person_email)) {
      r.fail('person_email', `person_email ${person_email} is not in the HPE team; import the team first`);
    }
    return { person_email, company_id, ...provenance(r, ctx) };
  },

  briefs(r, ctx) {
    const company_id = r.get('company', (v) => {
      const found = ctx.resolver.findCompany(f.required(v, 'a company'));
      if (!found) throw new f.FieldError(`"${f.text(v)}" is not in Companies; import companies first`);
      return found.id;
    });
    const sections = r.get('sections', (v) => briefSections(v, ctx));
    return { company_id, sections, ...provenance(r, ctx) };
  },
};

function briefSections(v: unknown, ctx: ParseContext): Record<BriefSection, BriefItem[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new f.FieldError('must be an object of section lists');
  const out = Object.fromEntries(BRIEF_SECTIONS.map((s) => [s, [] as BriefItem[]])) as Record<BriefSection, BriefItem[]>;
  for (const [key, items] of Object.entries(v as Record<string, unknown>)) {
    if (!(BRIEF_SECTIONS as readonly string[]).includes(key)) {
      ctx.warn('sections', `section "${key}" is not one of ${BRIEF_SECTIONS.join(', ')} and was skipped`);
      continue;
    }
    if (!Array.isArray(items)) throw new f.FieldError(`.${key} must be a list of items`);
    out[key as BriefSection] = items.map((item, i) => {
      const at = `.${key}[${i + 1}]`;
      if (!item || typeof item !== 'object') throw new f.FieldError(`${at} must be an object`);
      const it = item as Record<string, unknown>;
      try {
        return {
          text: f.required(it.text, 'text'),
          source_url: f.url(it.source_url),
          source_date: f.date(it.source_date, 'a source date'),
          confidence: f.oneOf(it.confidence, CONFIDENCES),
        };
      } catch (e) {
        throw new f.FieldError(`${at} ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }
  return out;
}

const LABELS: Record<string, string> = {
  op_id: 'Op ID',
  hpe_owner: 'HPE owner',
  hq_city: 'HQ city',
  tier_fit: 'Tier fit',
  has_done_vme: 'Has done VME',
  has_done_morpheus_enterprise: 'Has done Morpheus Enterprise',
  person_email: 'HPE person email',
  verified_at: 'Verified on',
  as_of: 'As of',
  id: 'Id',
};
const TABLE_NAME_LABEL: Partial<Record<TableName, string>> = {
  companies: 'Company name',
  contacts: 'Contact name',
  deals: 'Deal name',
  people: 'Name',
};
const DEAL_LABELS: Record<string, string> = { state: "Company's state", city: "Company's city", contacts: 'Contacts on the deal' };

/** The import screen's name for a column: "Op ID", "Deal name", "Company's state". */
export function columnLabel(table: TableName, name: string): string {
  if (name === 'name' && TABLE_NAME_LABEL[table]) return TABLE_NAME_LABEL[table]!;
  if (table === 'deals' && DEAL_LABELS[name]) return DEAL_LABELS[name]!;
  if (LABELS[name]) return LABELS[name]!;
  const words = name.replace(/_/g, ' ');
  return words[0]!.toUpperCase() + words.slice(1);
}
