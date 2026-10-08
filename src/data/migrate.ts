// Moves data saved by earlier versions of the app into the current model. The
// browser database runs these once on upgrade, and restoring an old backup
// runs them too.
//
// Version 1 kept prospects, partners, and stakeholders as separate tables.
// Version 2 was the CRM model with people keyed by email. Version 3 keys
// people by an id, so a team member can be added before anyone knows their
// email.

import { slugify, uniqueId } from './names';
import {
  blankCompany,
  type Brief,
  type Company,
  type Contact,
  type Dataset,
  type Deal,
  type Person,
  type Provenance,
} from './types';

/** A person as versions 1 and 2 stored them, keyed by email. */
type EmailKeyedPerson = Omit<Person, 'id'>;

/** The version 1 tables, as they were stored. */
export interface V1Dataset {
  people?: EmailKeyedPerson[];
  coverage?: (Provenance & { person_email: string; prospect_id: string })[];
  partners?: (Provenance & {
    id: string;
    name: string;
    states: string[];
    has_done_vme: Company['has_done_vme'];
    has_done_morpheus_enterprise: Company['has_done_morpheus_enterprise'];
    contacts: { name: string; title: string; email: string }[];
    notes: string;
  })[];
  prospects?: (Provenance & {
    id: string;
    name: string;
    hq_city: string;
    state: string;
    lat: number | null;
    lng: number | null;
    industry: string;
    description: string;
    segment: NonNullable<Company['segment']>;
    tier_fit: Company['tier_fit'];
    primary_partner_id: string | null;
    hpe_owner_email: string | null;
    notes: string;
  })[];
  briefs?: (Provenance & { prospect_id: string; sections: Dataset['briefs'][number]['sections'] })[];
  stakeholders?: (Provenance & {
    id: string;
    prospect_id: string;
    name: string;
    title: string;
    reports_to: string | null;
    role_in_decision: Contact['role_in_decision'];
    last_contact: string | null;
  })[];
  deals?: (Provenance & {
    op_id: string;
    prospect_id: string;
    stage: string;
    close_date: string | null;
    hpe_owner_email: string | null;
    partner_id: string | null;
    as_of: string;
  })[];
}

function provenanceOf(r: Provenance): Provenance {
  const p: Provenance = { source: r.source, verified_at: r.verified_at, updated_by: r.updated_by };
  if (r.is_sample) p.is_sample = true;
  return p;
}

export function migrateV1(old: V1Dataset): Dataset {
  const prospects = old.prospects ?? [];
  const partners = old.partners ?? [];
  const companyIds = new Set(prospects.map((p) => p.id));

  // A partner keeps its id unless a prospect already has it.
  const partnerId = new Map<string, string>();
  for (const p of partners) {
    const id = uniqueId(p.id, (x) => companyIds.has(x));
    companyIds.add(id);
    partnerId.set(p.id, id);
  }
  const partnerRef = (id: string | null) => (id ? (partnerId.get(id) ?? null) : null);

  const companies: Company[] = [
    ...prospects.map(
      (p): Company => ({
        ...blankCompany(p.id, p.name, 'prospect', provenanceOf(p)),
        hq_city: p.hq_city,
        state: p.state,
        lat: p.lat,
        lng: p.lng,
        industry: p.industry,
        description: p.description,
        segment: p.segment,
        tier_fit: p.tier_fit,
        primary_partner_id: partnerRef(p.primary_partner_id),
        hpe_owner_id: p.hpe_owner_email,
        notes: p.notes,
      }),
    ),
    ...partners.map(
      (p): Company => ({
        ...blankCompany(partnerId.get(p.id)!, p.name, 'partner', provenanceOf(p)),
        states: p.states,
        has_done_vme: p.has_done_vme,
        has_done_morpheus_enterprise: p.has_done_morpheus_enterprise,
        notes: p.notes,
      }),
    ),
  ];

  const contactIds = new Set((old.stakeholders ?? []).map((s) => s.id));
  const contacts: Contact[] = (old.stakeholders ?? []).map((s) => ({
    id: s.id,
    company_id: s.prospect_id,
    name: s.name,
    title: s.title,
    email: '',
    phone: '',
    reports_to: s.reports_to,
    role_in_decision: s.role_in_decision,
    last_contact: s.last_contact,
    notes: '',
    ...provenanceOf(s),
  }));
  for (const p of partners) {
    const companyId = partnerId.get(p.id)!;
    for (const c of p.contacts ?? []) {
      const id = uniqueId(`${companyId}-${slugify(c.name)}`, (x) => contactIds.has(x));
      contactIds.add(id);
      contacts.push({
        id,
        company_id: companyId,
        name: c.name,
        title: c.title,
        email: c.email,
        phone: '',
        reports_to: null,
        role_in_decision: 'unknown',
        last_contact: null,
        notes: '',
        ...provenanceOf(p),
      });
    }
  }

  const deals: Deal[] = (old.deals ?? []).map((d) => ({
    id: d.op_id,
    op_id: d.op_id,
    name: '',
    company_id: d.prospect_id,
    stage: d.stage,
    amount: null,
    close_date: d.close_date,
    forecast_category: '',
    hpe_owner_id: d.hpe_owner_email,
    owner_name: '',
    partner_id: partnerRef(d.partner_id),
    contact_ids: [],
    next_step: '',
    notes: '',
    as_of: d.as_of,
    ...provenanceOf(d),
  }));

  return {
    companies,
    contacts,
    deals,
    people: (old.people ?? []).map(keyByEmail),
    coverage: (old.coverage ?? []).map((c) => ({ person_id: c.person_email, company_id: c.prospect_id, ...provenanceOf(c) })),
    briefs: (old.briefs ?? []).map((b) => ({ company_id: b.prospect_id, sections: b.sections, ...provenanceOf(b) })),
  };
}

/** The version 2 tables, as they were stored. */
export interface V2Dataset {
  companies?: (Omit<Company, 'hpe_owner_id'> & { hpe_owner_email: string | null })[];
  contacts?: Contact[];
  deals?: (Omit<Deal, 'hpe_owner_id'> & { hpe_owner_email: string | null })[];
  people?: EmailKeyedPerson[];
  coverage?: (Provenance & { person_email: string; company_id: string })[];
  briefs?: Brief[];
}

/** Every version 2 person had an email, so the email becomes the id and every reference stays valid. */
function keyByEmail(p: EmailKeyedPerson): Person {
  return { id: p.email, ...p };
}

export function migrateV2(old: V2Dataset): Dataset {
  return {
    companies: (old.companies ?? []).map(({ hpe_owner_email, ...c }) => ({ ...c, hpe_owner_id: hpe_owner_email })),
    contacts: old.contacts ?? [],
    deals: (old.deals ?? []).map(({ hpe_owner_email, ...d }) => ({ ...d, hpe_owner_id: hpe_owner_email })),
    people: (old.people ?? []).map(keyByEmail),
    coverage: (old.coverage ?? []).map(({ person_email, ...c }) => ({ ...c, person_id: person_email })),
    briefs: old.briefs ?? [],
  };
}
