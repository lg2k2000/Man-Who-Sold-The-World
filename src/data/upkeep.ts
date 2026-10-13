// Daily upkeep: how fresh each open deal is, and the short list of what needs
// attention today. Pure functions over the dataset, so the map, the panel, and
// the quest board agree, and tests run without a browser.

import { isOpenDeal, type DataIndex } from './derive';
import type { Company, Dataset, Deal, Touch } from './types';

/** Days for a full meter to run empty. A setting; this is the default. */
export const UPKEEP_DAYS = 30;
/** Below this level a deal counts as going stale. */
export const LOW_UPKEEP = 25;

export interface Upkeep {
  /** 0 to 100. */
  level: number;
  /** The touch the level counts from, or null when it counts from the deal's review date. */
  last: Touch | null;
  /** The date the level counts from. */
  since: string;
  /** No touch is logged, so the level counts from the date the deal was last reviewed. */
  estimated: boolean;
  /** The close date has passed, which empties the meter. */
  pastDue: boolean;
}

export type UpkeepBand = 'good' | 'fading' | 'low';

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function upkeepBand(level: number): UpkeepBand {
  return level >= 50 ? 'good' : level >= LOW_UPKEEP ? 'fading' : 'low';
}

export const UPKEEP_BAND_LABELS: Record<UpkeepBand, string> = {
  good: 'Fresh',
  fading: 'Fading',
  low: 'Going stale',
};

/**
 * The latest touch for each deal. A touch on the account as a whole (no deal)
 * counts for every deal at that company.
 */
export function latestTouches(d: Dataset): Map<string, Touch> {
  const byCompany = new Map<string, Touch>();
  const byDeal = new Map<string, Touch>();
  const later = (a: Touch | undefined, b: Touch) => (!a || b.date > a.date ? b : a);
  for (const t of d.touches) {
    if (t.deal_id) byDeal.set(t.deal_id, later(byDeal.get(t.deal_id), t));
    else byCompany.set(t.company_id, later(byCompany.get(t.company_id), t));
  }
  const out = new Map<string, Touch>();
  for (const deal of d.deals) {
    const own = byDeal.get(deal.id);
    const account = byCompany.get(deal.company_id);
    const best = own && account ? (account.date > own.date ? account : own) : (own ?? account);
    if (best) out.set(deal.id, best);
  }
  return out;
}

/** A deal's meter, or null for a closed deal. */
export function dealUpkeep(deal: Deal, last: Touch | undefined, today: string, days = UPKEEP_DAYS): Upkeep | null {
  if (!isOpenDeal(deal)) return null;
  const since = last?.date ?? deal.as_of;
  const pastDue = deal.close_date !== null && deal.close_date < today;
  const age = Math.max(0, daysBetween(since, today));
  const level = pastDue ? 0 : Math.max(0, Math.min(100, Math.round(100 * (1 - age / days))));
  return { level, last: last ?? null, since, estimated: !last, pastDue };
}

/** A company's meter is its most neglected open deal's, or null when it has no open deal. */
export function companyUpkeep(index: DataIndex, latest: Map<string, Touch>, companyId: string, today: string, days = UPKEEP_DAYS) {
  let worst: (Upkeep & { deal: Deal }) | null = null;
  for (const deal of index.dealsByCompany.get(companyId) ?? []) {
    const u = dealUpkeep(deal, latest.get(deal.id), today, days);
    if (u && (!worst || u.level < worst.level)) worst = { ...u, deal };
  }
  return worst;
}

export type QuestKind = 'past-due' | 'no-owner' | 'no-partner' | 'several-op-ids' | 'going-stale';

/** In the order they rank, which follows the owner's deal-ownership notes. */
export const QUEST_KINDS: QuestKind[] = ['past-due', 'no-owner', 'no-partner', 'several-op-ids', 'going-stale'];

export const QUEST_LABELS: Record<QuestKind, string> = {
  'past-due': 'Close date passed',
  'no-owner': 'No primary pipeline owner',
  'no-partner': 'No partner',
  'several-op-ids': 'Several op IDs on one account',
  'going-stale': 'Going stale',
};

export interface Quest {
  kind: QuestKind;
  company: Company;
  /** Null for an account-level quest (several op IDs). */
  deal: Deal | null;
  /** One line saying what is wrong. */
  why: string;
  /** Open pipeline at stake, for ranking within a kind. */
  amount: number;
}

/**
 * Everything that needs attention among open deals in the given states (all
 * states when `codes` is null), ranked by kind, then by dollars at stake.
 * Nothing is marked done by hand: fixing the cause removes the quest.
 */
export function quests(d: Dataset, index: DataIndex, opts: { today: string; days?: number; codes: Set<string> | null }): Quest[] {
  const latest = latestTouches(d);
  const out: Quest[] = [];
  const inScope = (c: Company | undefined): c is Company =>
    !!c && c.type !== 'partner' && (opts.codes === null || (c.state !== null && opts.codes.has(c.state)));
  const openByCompany = new Map<string, Deal[]>();
  for (const deal of d.deals) {
    if (!isOpenDeal(deal)) continue;
    const company = index.companyById.get(deal.company_id);
    if (!inScope(company)) continue;
    const list = openByCompany.get(company.id) ?? [];
    list.push(deal);
    openByCompany.set(company.id, list);
    const amount = deal.amount ?? 0;
    const op = deal.op_id ? ` (${deal.op_id})` : '';
    if (deal.close_date && deal.close_date < opts.today) {
      const late = daysBetween(deal.close_date, opts.today);
      out.push({
        kind: 'past-due',
        company,
        deal,
        amount,
        why: `Close date ${deal.close_date} passed ${late} day${late === 1 ? '' : 's'} ago${op}.`,
      });
    }
    if (!deal.hpe_owner_id && !deal.owner_name) {
      out.push({ kind: 'no-owner', company, deal, amount, why: `No primary pipeline owner on the deal${op}.` });
    }
    if (!deal.partner_id)
      out.push({ kind: 'no-partner', company, deal, amount, why: `No partner on the deal${op}; VME cannot be quoted without one.` });
    const u = dealUpkeep(deal, latest.get(deal.id), opts.today, opts.days);
    if (u && !u.pastDue && u.level < LOW_UPKEEP) {
      const age = daysBetween(u.since, opts.today);
      out.push({
        kind: 'going-stale',
        company,
        deal,
        amount,
        why: u.estimated
          ? `No touch logged; last reviewed ${age} days ago${op}.`
          : `Last touch ${age} days ago, with ${u.last!.who || 'someone'}${op}.`,
      });
    }
  }
  for (const [companyId, deals] of openByCompany) {
    const ops = [...new Set(deals.map((x) => x.op_id).filter(Boolean))];
    if (ops.length > 1) {
      out.push({
        kind: 'several-op-ids',
        company: index.companyById.get(companyId)!,
        deal: null,
        amount: deals.reduce((a, x) => a + (x.amount ?? 0), 0),
        why: `${ops.length} open op IDs: ${ops.join(', ')}. Ask which one is live.`,
      });
    }
  }
  const rank = new Map(QUEST_KINDS.map((k, i) => [k, i]));
  return out.sort((a, b) => rank.get(a.kind)! - rank.get(b.kind)! || b.amount - a.amount || a.company.name.localeCompare(b.company.name));
}

/** Today's date as YYYY-MM-DD in the viewer's time zone. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
