// Small builders for test records. Every name is fake.

import {
  blankCompany,
  blankContact,
  emptyDataset,
  type Company,
  type Contact,
  type Dataset,
  type Deal,
  type Person,
  type Role,
} from '../src/data/types';

export const prov = { source: 'test', verified_at: null, updated_by: 'test' };

export function person(tag: string, roles: Role[], states: string[] = ['US-WA'], territories: string[] = []): Person {
  return { email: `p.${tag}@example.com`, name: `Sample Person ${tag}`, roles, specialty: null, territories, states, notes: '', ...prov };
}

export function company(n: number, state: string | null = 'US-WA', extra: Partial<Company> = {}): Company {
  return {
    ...blankCompany(`co-${n}`, `Sample Co ${n}`, 'prospect', prov),
    hq_city: 'Seattle',
    state,
    lat: 47.6,
    lng: -122.3,
    segment: 'enterprise',
    tier_fit: 'vme',
    ...extra,
  };
}

export function partner(n: number, states: string[], vme: Company['has_done_vme'] = 'unknown'): Company {
  return { ...blankCompany(`partner-${n}`, `Sample Partner ${n}`, 'partner', prov), states, has_done_vme: vme };
}

export function contact(id: string, companyId: string, name: string, reportsTo: string | null = null): Contact {
  return { ...blankContact(id, companyId, name, prov), reports_to: reportsTo };
}

export function deal(n: number, companyId: string, stage: string, extra: Partial<Deal> = {}): Deal {
  const op = `OPE-${String(n).padStart(10, '0')}`;
  return {
    id: op,
    op_id: op,
    name: `Sample deal ${n}`,
    company_id: companyId,
    stage,
    amount: null,
    close_date: null,
    forecast_category: '',
    hpe_owner_email: null,
    owner_name: '',
    partner_id: null,
    contact_ids: [],
    next_step: '',
    notes: '',
    as_of: '2026-10-01',
    ...prov,
    ...extra,
  };
}

export function dataset(patch: Partial<Dataset>): Dataset {
  return { ...emptyDataset(), ...patch };
}
