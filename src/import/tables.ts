// Column definitions and row parsers for every import file. README.md lists
// the same columns; tests/import.test.ts checks both stay in step.

import type { TerritoryConfig } from '../config/territories';
import {
  BRIEF_SECTIONS,
  CONFIDENCES,
  DECISION_ROLES,
  SEGMENTS,
  TIER_FITS,
  YES_NO_UNKNOWN,
  type Brief,
  type BriefItem,
  type BriefSection,
  type Coverage,
  type Dataset,
  type Deal,
  type Partner,
  type PartnerContact,
  type Person,
  type Provenance,
  type TableName,
} from '../data/types';
import * as f from './fields';

export interface ColumnSpec {
  name: string;
  required: boolean;
  description: string;
}

const PROVENANCE_COLUMNS: ColumnSpec[] = [
  { name: 'source', required: false, description: 'Where the row came from, as text or a URL. Defaults to the file name.' },
  { name: 'verified_at', required: false, description: 'Date someone last checked the row, YYYY-MM-DD.' },
  { name: 'updated_by', required: false, description: 'Who made the file. Defaults to "import".' },
];

export const COLUMNS: Record<TableName, ColumnSpec[]> = {
  people: [
    { name: 'name', required: true, description: 'Full name.' },
    { name: 'email', required: true, description: 'Work email; the key for a person. Re-importing the same email updates the person.' },
    { name: 'role', required: true, description: 'One or more of morpheus, opsramp, eam, storage, compute, networking, greenlake, zerto, sled, other, separated by semicolons. Labels such as "Morpheus specialist" also work.' },
    { name: 'specialty', required: false, description: 'aruba or juniper, for networking specialists.' },
    { name: 'territories', required: false, description: 'Territory teams the person sits on, by id (pacnorthwest) or name (PacNorthwest), separated by semicolons.' },
    { name: 'states', required: false, description: 'States and provinces the person covers, such as WA; OR; BC or US-WA; US-OR; CA-BC.' },
    { name: 'notes', required: false, description: 'Free text.' },
    ...PROVENANCE_COLUMNS,
  ],
  coverage: [
    { name: 'person_email', required: true, description: 'Email of a person already imported.' },
    { name: 'prospect_id', required: true, description: 'Id of a prospect already imported.' },
    ...PROVENANCE_COLUMNS,
  ],
  partners: [
    { name: 'id', required: true, description: 'Your id for the partner, such as acme-it; lowercase letters, digits, and hyphens.' },
    { name: 'name', required: true, description: 'Partner company name.' },
    { name: 'states', required: false, description: 'States and provinces the partner works in, separated by semicolons.' },
    { name: 'has_done_vme', required: false, description: 'yes, no, or unknown (the default).' },
    { name: 'has_done_morpheus_enterprise', required: false, description: 'yes, no, or unknown (the default).' },
    { name: 'contacts', required: false, description: 'Name | Title | email, with contacts separated by semicolons.' },
    { name: 'notes', required: false, description: 'Free text.' },
    ...PROVENANCE_COLUMNS,
  ],
  prospects: [
    { name: 'id', required: true, description: 'Your id for the prospect, such as acme-seattle; the key every other file uses.' },
    { name: 'name', required: true, description: 'Company name.' },
    { name: 'hq_city', required: false, description: 'Headquarters city.' },
    { name: 'state', required: true, description: 'Headquarters state or province, such as WA or CA-BC.' },
    { name: 'lat', required: false, description: 'Headquarters latitude. Leave lat and lng empty to pin at the state center as "location unverified".' },
    { name: 'lng', required: false, description: 'Headquarters longitude, negative in North America.' },
    { name: 'industry', required: false, description: 'Free text.' },
    { name: 'description', required: false, description: 'One line about the company.' },
    { name: 'segment', required: true, description: 'enterprise, mid-market, or sled.' },
    { name: 'tier_fit', required: false, description: 'vme, advanced, enterprise, or unknown (the default).' },
    { name: 'primary_partner_id', required: false, description: 'Id of a partner.' },
    { name: 'hpe_owner_email', required: false, description: 'Email of the HPE owner.' },
    { name: 'notes', required: false, description: 'Free text.' },
    ...PROVENANCE_COLUMNS,
  ],
  deals: [
    { name: 'op_id', required: true, description: 'OPE- followed by ten digits. The only key for deals: a row with an existing op_id updates that deal.' },
    { name: 'prospect_id', required: true, description: 'Id of a prospect already imported.' },
    { name: 'stage', required: true, description: 'Sales stage. A stage starting with "Closed" counts as closed; anything else is open.' },
    { name: 'close_date', required: false, description: 'YYYY-MM-DD.' },
    { name: 'hpe_owner_email', required: false, description: 'Email of the HPE owner.' },
    { name: 'partner_id', required: false, description: 'Id of a partner.' },
    { name: 'as_of', required: true, description: 'Date the deal data was pulled, YYYY-MM-DD.' },
    ...PROVENANCE_COLUMNS,
  ],
  briefs: [
    { name: 'prospect_id', required: true, description: 'Id of a prospect already imported. One brief per prospect; a new brief replaces the old one.' },
    { name: 'sections', required: true, description: `Object with any of ${BRIEF_SECTIONS.join(', ')}. Each is a list of items with text, source_url, source_date (YYYY-MM-DD), and confidence (confirmed, reported, inferred).` },
    ...PROVENANCE_COLUMNS,
  ],
  stakeholders: [
    { name: 'id', required: true, description: 'Your id for the stakeholder, unique across all prospects.' },
    { name: 'prospect_id', required: true, description: 'Id of a prospect already imported.' },
    { name: 'name', required: true, description: 'Full name. Work facts only.' },
    { name: 'title', required: false, description: 'Job title.' },
    { name: 'reports_to', required: false, description: 'Id of the stakeholder this person reports to.' },
    { name: 'role_in_decision', required: false, description: `${DECISION_ROLES.join(', ')} (the default).` },
    { name: 'last_contact', required: false, description: 'YYYY-MM-DD.' },
    ...PROVENANCE_COLUMNS,
  ],
};

export const FILE_FORMAT: Record<TableName, 'csv' | 'json'> = {
  people: 'csv',
  coverage: 'csv',
  partners: 'csv',
  prospects: 'csv',
  deals: 'csv',
  briefs: 'json',
  stakeholders: 'json',
};

export const TABLE_LABELS: Record<TableName, string> = {
  people: 'People',
  coverage: 'Coverage',
  partners: 'Partners',
  prospects: 'Prospects',
  deals: 'Deals',
  briefs: 'Briefs',
  stakeholders: 'Stakeholders',
};

/** The key that identifies a row: re-importing a row with the same key updates it. */
export function keyOf<T extends TableName>(table: T, row: Dataset[T][number]): string {
  switch (table) {
    case 'people':
      return (row as Person).email;
    case 'coverage':
      return `${(row as Coverage).person_email} ${(row as Coverage).prospect_id}`;
    case 'partners':
    case 'prospects':
    case 'stakeholders':
      return (row as Partner).id;
    case 'deals':
      return (row as Deal).op_id;
    case 'briefs':
      return (row as Brief).prospect_id;
  }
  return '';
}

export interface Issue {
  /** Spreadsheet row number for CSV (header is row 1), item number for JSON. */
  row: number;
  column: string;
  reason: string;
}

/** Everything a row parser can look at besides the row itself. */
export interface ParseContext {
  current: Dataset;
  config: TerritoryConfig;
  fileName: string;
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
}

function provenance(r: RowReader, ctx: ParseContext): Provenance {
  const p: Provenance = {
    source: r.get('source', f.text) || `import: ${ctx.fileName}`,
    verified_at: r.get('verified_at', f.optionalDate),
    updated_by: r.get('updated_by', f.text) || 'import',
  };
  // Only a JSON boolean marks a sample row (backups of sample data keep it); CSV text never does.
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

/** "Name | Title | email" entries separated by semicolons, or a list of contact objects. */
function contacts(v: unknown): PartnerContact[] {
  if (Array.isArray(v)) {
    return v.map((c, i) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const name = f.text(o.name);
      if (!name) throw new f.FieldError(`contact ${i + 1} has no name`);
      const mail = f.text(o.email);
      return { name, title: f.text(o.title), email: mail ? f.email(mail) : '' };
    });
  }
  return f
    .text(v)
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name = '', title = '', mail = ''] = entry.split('|').map((x) => x.trim());
      if (!name) throw new f.FieldError(`entry "${entry}" has no name; use Name | Title | email`);
      return { name, title, email: mail ? f.email(mail) : '' };
    });
}

export const PARSERS: { [T in TableName]: (r: RowReader, ctx: ParseContext) => Dataset[T][number] } = {
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
    const prospect_id = r.get('prospect_id', (v) => f.id(v, 'a prospect id'));
    if (person_email && !ctx.current.people.some((p) => p.email === person_email)) {
      r.fail('person_email', `person_email ${person_email} is not in People; import people first`);
    }
    if (prospect_id && !ctx.current.prospects.some((p) => p.id === prospect_id)) {
      r.fail('prospect_id', `prospect_id ${prospect_id} is not in Prospects; import prospects first`);
    }
    return { person_email, prospect_id, ...provenance(r, ctx) };
  },

  partners(r, ctx) {
    return {
      id: r.get('id', (v) => f.id(v, 'a partner id')),
      name: r.get('name', (v) => f.required(v, 'a name')),
      states: r.get('states', f.regions),
      has_done_vme: r.get('has_done_vme', (v) => f.oneOf(v, YES_NO_UNKNOWN, 'unknown', { y: 'yes', n: 'no', true: 'yes', false: 'no' })),
      has_done_morpheus_enterprise: r.get('has_done_morpheus_enterprise', (v) =>
        f.oneOf(v, YES_NO_UNKNOWN, 'unknown', { y: 'yes', n: 'no', true: 'yes', false: 'no' }),
      ),
      contacts: r.get('contacts', contacts),
      notes: r.get('notes', f.text),
      ...provenance(r, ctx),
    };
  },

  prospects(r, ctx) {
    const lat = r.get('lat', (v) => f.number(v, -90, 90, 'latitude'));
    const lng = r.get('lng', (v) => f.number(v, -180, 180, 'longitude'));
    if ((lat === null) !== (lng === null) && lat !== undefined && lng !== undefined) {
      r.fail(lat === null ? 'lat' : 'lng', 'lat and lng go together; give both or leave both empty');
    }
    if (typeof lat === 'number' && typeof lng === 'number' && (lat < 15 || lat > 84 || lng < -180 || lng > -50)) {
      ctx.warn('lat', `${lat}, ${lng} is outside North America; check the sign of lng`);
    }
    const primary_partner_id = r.get('primary_partner_id', f.optionalId);
    if (primary_partner_id && !ctx.current.partners.some((p) => p.id === primary_partner_id)) {
      ctx.warn('primary_partner_id', `partner ${primary_partner_id} is not in Partners yet`);
    }
    const hpe_owner_email = r.get('hpe_owner_email', f.optionalEmail);
    if (hpe_owner_email && !ctx.current.people.some((p) => p.email === hpe_owner_email)) {
      ctx.warn('hpe_owner_email', `${hpe_owner_email} is not in People yet`);
    }
    return {
      id: r.get('id', (v) => f.id(v, 'a prospect id')),
      name: r.get('name', (v) => f.required(v, 'a name')),
      hq_city: r.get('hq_city', f.text),
      state: r.get('state', f.region),
      lat: lat ?? null,
      lng: lng ?? null,
      industry: r.get('industry', f.text),
      description: r.get('description', f.text),
      segment: r.get('segment', (v) => f.oneOf(v, SEGMENTS, undefined, { 'mid market': 'mid-market', midmarket: 'mid-market' })),
      tier_fit: r.get('tier_fit', (v) => f.oneOf(v, TIER_FITS, 'unknown', { 'vm essentials': 'vme' })),
      primary_partner_id,
      hpe_owner_email,
      notes: r.get('notes', f.text),
      ...provenance(r, ctx),
    };
  },

  deals(r, ctx) {
    const prospect_id = r.get('prospect_id', (v) => f.id(v, 'a prospect id'));
    if (prospect_id && !ctx.current.prospects.some((p) => p.id === prospect_id)) {
      r.fail('prospect_id', `prospect_id ${prospect_id} is not in Prospects; deals join to prospects by id only`);
    }
    const partner_id = r.get('partner_id', f.optionalId);
    if (partner_id && !ctx.current.partners.some((p) => p.id === partner_id)) {
      ctx.warn('partner_id', `partner ${partner_id} is not in Partners yet`);
    }
    const hpe_owner_email = r.get('hpe_owner_email', f.optionalEmail);
    if (hpe_owner_email && !ctx.current.people.some((p) => p.email === hpe_owner_email)) {
      ctx.warn('hpe_owner_email', `${hpe_owner_email} is not in People yet`);
    }
    return {
      op_id: r.get('op_id', f.opId),
      prospect_id,
      stage: r.get('stage', (v) => f.required(v, 'a stage')),
      close_date: r.get('close_date', f.optionalDate),
      hpe_owner_email,
      partner_id,
      as_of: r.get('as_of', (v) => f.date(v, 'the as-of date')),
      ...provenance(r, ctx),
    };
  },

  briefs(r, ctx) {
    const prospect_id = r.get('prospect_id', (v) => f.id(v, 'a prospect id'));
    if (prospect_id && !ctx.current.prospects.some((p) => p.id === prospect_id)) {
      r.fail('prospect_id', `prospect_id ${prospect_id} is not in Prospects; import prospects first`);
    }
    const sections = r.get('sections', (v) => briefSections(v, ctx));
    return { prospect_id, sections, ...provenance(r, ctx) };
  },

  stakeholders(r, ctx) {
    const prospect_id = r.get('prospect_id', (v) => f.id(v, 'a prospect id'));
    if (prospect_id && !ctx.current.prospects.some((p) => p.id === prospect_id)) {
      r.fail('prospect_id', `prospect_id ${prospect_id} is not in Prospects; import prospects first`);
    }
    return {
      id: r.get('id', (v) => f.id(v, 'a stakeholder id')),
      prospect_id,
      name: r.get('name', (v) => f.required(v, 'a name')),
      title: r.get('title', f.text),
      reports_to: r.get('reports_to', f.optionalId),
      role_in_decision: r.get('role_in_decision', (v) => f.oneOf(v, DECISION_ROLES, 'unknown')),
      last_contact: r.get('last_contact', f.optionalDate),
      ...provenance(r, ctx),
    };
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
