// Record types for everything the app stores. Every table except territories
// carries source, verified_at, and updated_by. `is_sample` marks fixture rows.
//
// The model is a small CRM: companies (prospects, customers, and partners),
// the contacts who work at them, and the deals with them, plus the HPE team
// and which HPE people cover which company.

export const TERRITORY_TEAM_ROLES = ['morpheus', 'opsramp'] as const;
export const ACCOUNT_COVERAGE_ROLES = ['eam', 'storage', 'compute', 'networking', 'greenlake', 'zerto', 'sled', 'other'] as const;
export const ROLES = [...TERRITORY_TEAM_ROLES, ...ACCOUNT_COVERAGE_ROLES] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  morpheus: 'Morpheus specialist',
  opsramp: 'OpsRamp specialist',
  eam: 'EAM',
  storage: 'Storage specialist',
  compute: 'Compute specialist',
  networking: 'Networking specialist',
  greenlake: 'GreenLake specialist',
  zerto: 'Zerto specialist',
  sled: 'SLED overlay',
  other: 'Other',
};

export const YES_NO_UNKNOWN = ['yes', 'no', 'unknown'] as const;
export type YesNoUnknown = (typeof YES_NO_UNKNOWN)[number];

export const SEGMENTS = ['enterprise', 'mid-market', 'sled'] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABELS: Record<Segment, string> = { enterprise: 'Enterprise', 'mid-market': 'Mid-market', sled: 'SLED' };

export const TIER_FITS = ['vme', 'advanced', 'enterprise', 'unknown'] as const;
export type TierFit = (typeof TIER_FITS)[number];
export const TIER_FIT_LABELS: Record<TierFit, string> = {
  vme: 'VME',
  advanced: 'Advanced',
  enterprise: 'Enterprise',
  unknown: 'Unknown',
};

export const COMPANY_TYPES = ['prospect', 'customer', 'partner', 'other'] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];
export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  prospect: 'Prospect',
  customer: 'Customer',
  partner: 'Partner',
  other: 'Other',
};

export const CONFIDENCES = ['confirmed', 'reported', 'inferred'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const DECISION_ROLES = ['economic buyer', 'technical decision maker', 'champion', 'influencer', 'blocker', 'unknown'] as const;
export type DecisionRole = (typeof DECISION_ROLES)[number];

export interface Provenance {
  source: string;
  verified_at: string | null;
  updated_by: string;
  is_sample?: boolean;
}

/** Someone at HPE: a territory team member or an account coverage specialist. */
export interface Person extends Provenance {
  /**
   * The key every other table uses for a person: the lowercased email when the
   * person arrived with one, otherwise made from the name. It stays the same
   * when the email or name changes later.
   */
  id: string;
  /** Lowercased work email, or empty when nobody has it yet. */
  email: string;
  name: string;
  roles: Role[];
  specialty: 'aruba' | 'juniper' | null;
  /** Territory ids from config/territories.json. */
  territories: string[];
  /** Region codes such as US-WA. */
  states: string[];
  notes: string;
}

/** An HPE person who covers a company. The overlap highlight is computed from these. */
export interface Coverage extends Provenance {
  person_id: string;
  company_id: string;
}

export interface Company extends Provenance {
  id: string;
  name: string;
  type: CompanyType;
  website: string;
  hq_city: string;
  /** Headquarters region code such as US-WA; null until someone knows it, and then the company has no pin. */
  state: string | null;
  lat: number | null;
  lng: number | null;
  industry: string;
  description: string;
  segment: Segment | null;
  tier_fit: TierFit;
  /** A company of type partner. */
  primary_partner_id: string | null;
  /** A person in the HPE team. */
  hpe_owner_id: string | null;
  /** Partners: the states and provinces they work in. */
  states: string[];
  /** Partners: whether they have delivered VME and Morpheus Enterprise. */
  has_done_vme: YesNoUnknown;
  has_done_morpheus_enterprise: YesNoUnknown;
  notes: string;
}

/** Someone who works at a company. Work facts only. */
export interface Contact extends Provenance {
  id: string;
  company_id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  /** Another contact at the same company; the org tree is built from it. */
  reports_to: string | null;
  role_in_decision: DecisionRole;
  last_contact: string | null;
  notes: string;
}

export interface BriefItem {
  text: string;
  source_url: string;
  source_date: string;
  confidence: Confidence;
}

export const BRIEF_SECTIONS = [
  'what_they_do',
  'virtualization_signals',
  'filings',
  'recent_it_news',
  'tech_stack',
  'broader_trends',
] as const;
export type BriefSection = (typeof BRIEF_SECTIONS)[number];
export const BRIEF_SECTION_LABELS: Record<BriefSection, string> = {
  what_they_do: 'What they do',
  virtualization_signals: 'Virtualization signals',
  filings: 'Filings and public records',
  recent_it_news: 'Recent IT news',
  tech_stack: 'Tech stack',
  broader_trends: 'Broader trends',
};

export interface Brief extends Provenance {
  company_id: string;
  sections: Record<BriefSection, BriefItem[]>;
}

export interface Deal extends Provenance {
  /** The deal's key. The op ID when the deal arrived with one, otherwise made from the company and deal name. */
  id: string;
  /** OPE- followed by ten digits. Unique; an import row with a known op ID updates that deal. */
  op_id: string | null;
  name: string;
  company_id: string;
  stage: string;
  /** US dollars. */
  amount: number | null;
  close_date: string | null;
  forecast_category: string;
  /** A person in the HPE team. */
  hpe_owner_id: string | null;
  /** The owner as the source named them, kept when they are not in the HPE team. */
  owner_name: string;
  /** A company of type partner. */
  partner_id: string | null;
  contact_ids: string[];
  next_step: string;
  notes: string;
  /** Date the deal data was current. */
  as_of: string;
}

export interface Dataset {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  people: Person[];
  coverage: Coverage[];
  briefs: Brief[];
}

export type TableName = keyof Dataset;
export const TABLES: TableName[] = ['companies', 'contacts', 'deals', 'people', 'coverage', 'briefs'];

export function emptyDataset(): Dataset {
  return { companies: [], contacts: [], deals: [], people: [], coverage: [], briefs: [] };
}

export function hasSampleRows(d: Dataset): boolean {
  return TABLES.some((t) => (d[t] as Provenance[]).some((r) => r.is_sample));
}

/** A company's defaults, for rows that create one from a name alone. */
export function blankCompany(id: string, name: string, type: CompanyType, provenance: Provenance): Company {
  return {
    id,
    name,
    type,
    website: '',
    hq_city: '',
    state: null,
    lat: null,
    lng: null,
    industry: '',
    description: '',
    segment: null,
    tier_fit: 'unknown',
    primary_partner_id: null,
    hpe_owner_id: null,
    states: [],
    has_done_vme: 'unknown',
    has_done_morpheus_enterprise: 'unknown',
    notes: '',
    ...provenance,
  };
}

export function blankContact(id: string, companyId: string, name: string, provenance: Provenance): Contact {
  return {
    id,
    company_id: companyId,
    name,
    title: '',
    email: '',
    phone: '',
    reports_to: null,
    role_in_decision: 'unknown',
    last_contact: null,
    notes: '',
    ...provenance,
  };
}
