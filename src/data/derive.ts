// Pure functions that answer questions about the dataset. No storage, no UI.

import type { TerritoryConfig } from '../config/territories';
import { fold } from './names';
import {
  ACCOUNT_COVERAGE_ROLES,
  COMPANY_TYPE_LABELS,
  ROLE_LABELS,
  type Company,
  type Contact,
  type Dataset,
  type Deal,
  type Person,
  type Role,
  type TierFit,
} from './types';

/** A deal is open unless its stage starts with "Closed" (Closed Won, Closed Lost) or says Won or Lost outright. */
export function isOpenDeal(d: Deal): boolean {
  return !/^\s*(closed\b|won\b|lost\b)/i.test(d.stage);
}

export function isWonDeal(d: Deal): boolean {
  return /^\s*(closed\s*[-:]?\s*won|won)\b/i.test(d.stage);
}

/** Companies that get a pin: anything but a partner, with a state to put it in. */
export function isPinned(c: Company): boolean {
  return c.type !== 'partner' && c.state !== null;
}

/** Indexes built once per dataset so lookups stay cheap with thousands of rows. */
export interface DataIndex {
  personById: Map<string, Person>;
  companyById: Map<string, Company>;
  contactById: Map<string, Contact>;
  contactsByCompany: Map<string, Contact[]>;
  coverageByCompany: Map<string, Person[]>;
  coverageByPerson: Map<string, Company[]>;
  dealsByCompany: Map<string, Deal[]>;
  dealsByPartner: Map<string, Deal[]>;
  overlapRoles: Map<string, Role[]>;
  openDealCompanies: Set<string>;
  /** Sum of open deal amounts per company. */
  openPipeline: Map<string, number>;
}

export function indexDataset(d: Dataset): DataIndex {
  const personById = new Map(d.people.map((p) => [p.id, p]));
  const companyById = new Map(d.companies.map((c) => [c.id, c]));
  const contactById = new Map(d.contacts.map((c) => [c.id, c]));
  const contactsByCompany = new Map<string, Contact[]>();
  for (const c of d.contacts) push(contactsByCompany, c.company_id, c);
  const coverageByCompany = new Map<string, Person[]>();
  const coverageByPerson = new Map<string, Company[]>();
  for (const c of d.coverage) {
    const person = personById.get(c.person_id);
    const company = companyById.get(c.company_id);
    if (!person || !company) continue;
    push(coverageByCompany, company.id, person);
    push(coverageByPerson, person.id, company);
  }
  const dealsByCompany = new Map<string, Deal[]>();
  const dealsByPartner = new Map<string, Deal[]>();
  const openDealCompanies = new Set<string>();
  const openPipeline = new Map<string, number>();
  for (const deal of d.deals) {
    push(dealsByCompany, deal.company_id, deal);
    if (deal.partner_id) push(dealsByPartner, deal.partner_id, deal);
    if (isOpenDeal(deal)) {
      openDealCompanies.add(deal.company_id);
      openPipeline.set(deal.company_id, (openPipeline.get(deal.company_id) ?? 0) + (deal.amount ?? 0));
    }
  }
  const overlapRoles = new Map<string, Role[]>();
  for (const [id, people] of coverageByCompany) overlapRoles.set(id, coverageRoles(people));
  return {
    personById,
    companyById,
    contactById,
    contactsByCompany,
    coverageByCompany,
    coverageByPerson,
    dealsByCompany,
    dealsByPartner,
    overlapRoles,
    openDealCompanies,
    openPipeline,
  };
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) {
    if (!list.includes(v)) list.push(v);
  } else m.set(k, [v]);
}

const COUNTED_ROLES = new Set<Role>(ACCOUNT_COVERAGE_ROLES.filter((r) => r !== 'eam'));

/**
 * Distinct account coverage roles held by the people covering an account,
 * not counting EAM. Territory team roles do not count. "Other" counts once.
 */
export function coverageRoles(people: Person[]): Role[] {
  const roles = new Set<Role>();
  for (const p of people) for (const r of p.roles) if (COUNTED_ROLES.has(r)) roles.add(r);
  return ACCOUNT_COVERAGE_ROLES.filter((r) => roles.has(r));
}

export const OVERLAP_THRESHOLD = 3;

export function hasOverlap(index: DataIndex, companyId: string): boolean {
  return (index.overlapRoles.get(companyId)?.length ?? 0) >= OVERLAP_THRESHOLD;
}

/** The deal owner's name: the HPE person, or the name the source gave. */
export function ownerName(index: DataIndex, d: { hpe_owner_id: string | null; owner_name?: string }): string {
  if (d.hpe_owner_id) return index.personById.get(d.hpe_owner_id)?.name ?? d.owner_name ?? d.hpe_owner_id;
  return d.owner_name ?? '';
}

/** A deal's name as shown: its own, or the company's with "deal" after it. */
export function dealLabel(index: DataIndex, d: Deal): string {
  return d.name || `${index.companyById.get(d.company_id)?.name ?? d.company_id} deal`;
}

export interface Filters {
  territoryId: string | null;
  tierFit: TierFit | null;
  partnerId: string | null;
  openDeal: 'any' | 'yes' | 'no';
  overlapOnly: boolean;
}

export const NO_FILTERS: Filters = { territoryId: null, tierFit: null, partnerId: null, openDeal: 'any', overlapOnly: false };

export function activeFilterCount(f: Filters): number {
  return [f.tierFit, f.partnerId, f.openDeal !== 'any' ? 1 : null, f.overlapOnly || null].filter((x) => x !== null).length;
}

export function territoryCodes(config: TerritoryConfig, territoryId: string): Set<string> {
  return new Set(config.territories.find((t) => t.id === territoryId)?.members.map((m) => m.code) ?? []);
}

/** The companies the map pins, narrowed by the filter bar. */
export function filterCompanies(d: Dataset, index: DataIndex, config: TerritoryConfig, f: Filters): Company[] {
  const codes = f.territoryId ? territoryCodes(config, f.territoryId) : null;
  return d.companies.filter((c) => {
    if (!isPinned(c)) return false;
    if (codes && !codes.has(c.state!)) return false;
    if (f.tierFit && c.tier_fit !== f.tierFit) return false;
    if (f.partnerId && c.primary_partner_id !== f.partnerId && !(index.dealsByCompany.get(c.id) ?? []).some((x) => x.partner_id === f.partnerId))
      return false;
    if (f.openDeal === 'yes' && !index.openDealCompanies.has(c.id)) return false;
    if (f.openDeal === 'no' && index.openDealCompanies.has(c.id)) return false;
    if (f.overlapOnly && !hasOverlap(index, c.id)) return false;
    return true;
  });
}

export interface RoleGroup {
  role: Role;
  label: string;
  people: Person[];
}

export interface PartnerSummary {
  partner: Company;
  companies: number;
}

export interface TerritorySummary {
  morpheus: Person[];
  opsramp: Person[];
  otherCoverage: RoleGroup[];
  topPartners: PartnerSummary[];
  companies: number;
  openDeals: number;
  /** Sum of open deal amounts. */
  pipeline: number;
}

/**
 * What the territory card shows. "Other HPE people" are those with an account
 * coverage role who cover any state in the territory. Top partners work in
 * the territory, ranked by how many of its companies name them as primary
 * partner, then by VME experience.
 */
export function territorySummary(d: Dataset, config: TerritoryConfig, territoryId: string, topN = 3): TerritorySummary {
  const codes = territoryCodes(config, territoryId);
  const team = d.people.filter((p) => p.territories.includes(territoryId));
  const morpheus = team.filter((p) => p.roles.includes('morpheus')).sort(byName);
  const opsramp = team.filter((p) => p.roles.includes('opsramp')).sort(byName);

  const otherCoverage: RoleGroup[] = [];
  for (const role of ACCOUNT_COVERAGE_ROLES) {
    const people = d.people.filter((p) => p.roles.includes(role) && p.states.some((s) => codes.has(s))).sort(byName);
    if (people.length) otherCoverage.push({ role, label: ROLE_LABELS[role], people });
  }

  const here = d.companies.filter((c) => isPinned(c) && codes.has(c.state!));
  const primaryCount = new Map<string, number>();
  for (const c of here) if (c.primary_partner_id) primaryCount.set(c.primary_partner_id, (primaryCount.get(c.primary_partner_id) ?? 0) + 1);
  const vmeRank = { yes: 0, unknown: 1, no: 2 } as const;
  const topPartners = d.companies
    .filter((c) => c.type === 'partner' && c.states.some((s) => codes.has(s)))
    .map((partner) => ({ partner, companies: primaryCount.get(partner.id) ?? 0 }))
    .sort(
      (a, b) =>
        b.companies - a.companies ||
        vmeRank[a.partner.has_done_vme] - vmeRank[b.partner.has_done_vme] ||
        a.partner.name.localeCompare(b.partner.name),
    )
    .slice(0, topN);

  const ids = new Set(here.map((c) => c.id));
  const open = d.deals.filter((x) => ids.has(x.company_id) && isOpenDeal(x));
  return {
    morpheus,
    opsramp,
    otherCoverage,
    topPartners,
    companies: here.length,
    openDeals: open.length,
    pipeline: open.reduce((n, x) => n + (x.amount ?? 0), 0),
  };
}

export interface StageTotal {
  stage: string;
  count: number;
  amount: number;
  open: boolean;
}

/** Deals grouped by stage, open stages first in the order they first appear, then closed ones. */
export function stageTotals(deals: Deal[]): StageTotal[] {
  const byStage = new Map<string, StageTotal>();
  for (const d of deals) {
    const key = d.stage.trim() || 'No stage';
    const t = byStage.get(key) ?? { stage: key, count: 0, amount: 0, open: isOpenDeal(d) };
    t.count++;
    t.amount += d.amount ?? 0;
    byStage.set(key, t);
  }
  const all = [...byStage.values()];
  return [...all.filter((t) => t.open), ...all.filter((t) => !t.open)];
}

export type SearchHit =
  | { kind: 'company'; id: string; label: string; detail: string }
  | { kind: 'contact'; id: string; label: string; detail: string }
  | { kind: 'person'; id: string; label: string; detail: string }
  | { kind: 'deal'; id: string; label: string; detail: string };

/**
 * Search across companies, contacts, the HPE team, and deals (by name or op
 * ID). Names that start with the query rank first, then names with a word
 * that starts with it, then any other match. Case and accents are ignored.
 */
export function search(d: Dataset, query: string, limit = 12): SearchHit[] {
  const q = fold(query.trim());
  if (!q) return [];
  const companyName = new Map(d.companies.map((c) => [c.id, c.name]));
  const scored: { hit: SearchHit; score: number }[] = [];
  const consider = (name: string, hit: SearchHit, bonus = 0) => {
    const n = fold(name);
    let score = -1;
    if (n.startsWith(q)) score = 0;
    else if (n.split(/[\s\-/(),.]+/).some((w) => w.startsWith(q))) score = 1;
    else if (n.includes(q)) score = 2;
    if (score >= 0) scored.push({ hit, score: score + bonus });
  };
  for (const c of d.companies) {
    const where = c.hq_city || c.state ? `${[c.hq_city, c.state?.slice(3)].filter(Boolean).join(', ')}` : 'no location';
    consider(c.name, { kind: 'company', id: c.id, label: c.name, detail: `${COMPANY_TYPE_LABELS[c.type]}, ${where}` });
  }
  for (const p of d.people) {
    consider(p.name, { kind: 'person', id: p.id, label: p.name, detail: `HPE, ${p.roles.map((r) => ROLE_LABELS[r]).join(', ')}` });
  }
  for (const c of d.contacts) {
    const at = companyName.get(c.company_id) ?? c.company_id;
    consider(c.name, { kind: 'contact', id: c.id, label: c.name, detail: [c.title, at].filter(Boolean).join(', ') }, 0.5);
  }
  for (const x of d.deals) {
    const at = companyName.get(x.company_id) ?? x.company_id;
    const label = x.name || `${at} deal`;
    const hit: SearchHit = { kind: 'deal', id: x.id, label, detail: `Deal, ${at}, ${x.stage}` };
    if (x.op_id && fold(x.op_id).includes(q)) scored.push({ hit: { ...hit, detail: `${x.op_id}, ${at}` }, score: 0 });
    else if (x.name) consider(x.name, hit, 0.5);
  }
  return scored
    .sort((a, b) => a.score - b.score || a.hit.label.localeCompare(b.hit.label, undefined, { numeric: true }))
    .slice(0, limit)
    .map((s) => s.hit);
}

function byName(a: Person, b: Person) {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

export interface OrgNode<T> {
  item: T;
  children: OrgNode<T>[];
}

/**
 * Builds the contacts org tree from reports_to. A contact whose manager is
 * missing, or who sits in a reporting loop, becomes a root so nobody is lost.
 */
export function orgTree<T extends { id: string; reports_to: string | null; name: string }>(items: T[]): OrgNode<T>[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const nodes = new Map(items.map((i) => [i.id, { item: i, children: [] as OrgNode<T>[] }]));
  const roots: OrgNode<T>[] = [];
  for (const item of items) {
    const node = nodes.get(item.id)!;
    const parentId = item.reports_to;
    if (parentId && byId.has(parentId) && parentId !== item.id && !inLoop(item.id, byId)) {
      nodes.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (list: OrgNode<T>[]) => {
    list.sort((a, b) => a.item.name.localeCompare(b.item.name, undefined, { numeric: true }));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** True when following reports_to from `start` leads back to `start`. */
function inLoop<T extends { id: string; reports_to: string | null }>(start: string, byId: Map<string, T>): boolean {
  const seen = new Set<string>();
  let cur: string | null = byId.get(start)?.reports_to ?? null;
  while (cur) {
    if (cur === start) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur)?.reports_to ?? null;
  }
  return false;
}

/** Whole dollars with separators: $1,250,000. Null shows as an empty string. */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Short dollars for tight spaces: $1.3M, $450K, $900. */
export function moneyShort(n: number): string {
  if (n >= 1e9) return `$${trim(n / 1e9)}B`;
  if (n >= 1e6) return `$${trim(n / 1e6)}M`;
  if (n >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function trim(x: number): string {
  return x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, '');
}

