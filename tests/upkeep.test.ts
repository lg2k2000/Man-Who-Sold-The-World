import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import { indexDataset } from '../src/data/derive';
import { deleteDeal, saveTouch } from '../src/data/edit';
import type { Touch } from '../src/data/types';
import { companyUpkeep, daysBetween, dealUpkeep, latestTouches, quests, upkeepBand } from '../src/data/upkeep';
import { importText } from '../src/import/importer';
import { company, dataset, deal, partner, prov } from './build';

const config = parseTerritoryConfig(rawConfig);
const today = '2026-10-31';

function touch(companyId: string, dealId: string | null, date: string, who = 'Sample Person A'): Touch {
  return { id: `t-${companyId}-${dealId}-${date}`, company_id: companyId, deal_id: dealId, date, who, channel: 'call', note: '', ...prov };
}

describe('upkeep meter', () => {
  it('is full on the day of a touch and empties in a straight line over 30 days', () => {
    const d = deal(1, 'co-1', 'Discovery');
    expect(dealUpkeep(d, touch('co-1', d.id, '2026-10-31'), today)!.level).toBe(100);
    expect(dealUpkeep(d, touch('co-1', d.id, '2026-10-16'), today)!.level).toBe(50);
    expect(dealUpkeep(d, touch('co-1', d.id, '2026-09-01'), today)!.level).toBe(0);
    expect(dealUpkeep(d, touch('co-1', d.id, '2026-10-16'), today, 15)!.level).toBe(0);
  });

  it('counts from the review date, marked estimated, until a touch is logged', () => {
    const u = dealUpkeep(deal(1, 'co-1', 'Discovery', { as_of: '2026-10-21' }), undefined, today)!;
    expect(u.estimated).toBe(true);
    expect(u.level).toBe(67);
  });

  it('is empty once the close date has passed, and absent for closed deals', () => {
    const late = deal(1, 'co-1', 'Proposal', { close_date: '2026-10-30' });
    expect(dealUpkeep(late, touch('co-1', late.id, today), today)).toMatchObject({ level: 0, pastDue: true });
    expect(dealUpkeep(deal(2, 'co-1', 'Closed Won'), undefined, today)).toBeNull();
  });

  it('lets an account-level touch count for every deal there, and keeps the later of the two', () => {
    const a = deal(1, 'co-1', 'Discovery');
    const b = deal(2, 'co-1', 'Discovery');
    const d = dataset({ deals: [a, b], touches: [touch('co-1', null, '2026-10-20'), touch('co-1', a.id, '2026-10-25')] });
    const latest = latestTouches(d);
    expect(latest.get(a.id)!.date).toBe('2026-10-25');
    expect(latest.get(b.id)!.date).toBe('2026-10-20');
  });

  it("gives a company its most neglected open deal's level", () => {
    const a = deal(1, 'co-1', 'Discovery');
    const b = deal(2, 'co-1', 'Proposal');
    const d = dataset({ companies: [company(1, 'US-CA')], deals: [a, b], touches: [touch('co-1', a.id, '2026-10-30')] });
    const worst = companyUpkeep(indexDataset(d), latestTouches(d), 'co-1', today)!;
    expect(worst.deal.id).toBe(b.id);
    // Never touched, and reviewed 30 days ago, so empty.
    expect(upkeepBand(worst.level)).toBe('low');
    expect(daysBetween('2026-10-01', today)).toBe(30);
  });
});

describe('quest board', () => {
  const d = dataset({
    companies: [company(1, 'US-CA'), company(2, 'US-WA'), company(3, 'US-TX'), partner(1, ['US-CA'])],
    deals: [
      deal(1, 'co-1', 'Proposal', { close_date: '2026-10-01', amount: 50_000, hpe_owner_id: 'p', partner_id: 'partner-1' }),
      deal(2, 'co-1', 'Discovery', { amount: 10_000, hpe_owner_id: 'p', partner_id: 'partner-1' }),
      deal(3, 'co-2', 'Discovery', { amount: 90_000, owner_name: 'Someone', partner_id: 'partner-1', as_of: '2026-08-01' }),
      deal(4, 'co-3', 'Discovery', { amount: 5_000 }),
      deal(5, 'co-2', 'Closed Lost', { close_date: '2026-01-01' }),
    ],
    touches: [touch('co-1', null, '2026-10-30')],
  });
  const index = indexDataset(d);

  it('ranks by the deal-ownership rules, then by dollars, within the chosen states', () => {
    const list = quests(d, index, { today, codes: new Set(['US-CA', 'US-WA']) });
    expect(list.map((q) => [q.kind, q.deal?.id ?? q.company.id])).toEqual([
      ['past-due', 'OPE-0000000001'],
      ['several-op-ids', 'co-1'],
      ['going-stale', 'OPE-0000000003'],
    ]);
  });

  it('covers every state when no area is picked, and ignores closed deals', () => {
    const list = quests(d, index, { today, codes: null });
    expect(list.filter((q) => q.company.id === 'co-3').map((q) => q.kind)).toEqual(['no-owner', 'no-partner', 'going-stale']);
    expect(list.some((q) => q.deal?.id === 'OPE-0000000005')).toBe(false);
  });

  it('drops a quest once its cause is fixed', () => {
    const fixed = { ...d, deals: d.deals.map((x) => (x.id === 'OPE-0000000001' ? { ...x, close_date: '2026-12-15' } : x)) };
    expect(quests(fixed, indexDataset(fixed), { today, codes: null }).some((q) => q.kind === 'past-due')).toBe(false);
  });
});

describe('touches', () => {
  const base = dataset({ companies: [company(1, 'US-CA')], deals: [deal(1, 'co-1', 'Discovery')] });
  const ctx = { config, editor: 'Sample Person A', today };

  it('logs a touch through the import checks, once even when saved twice', () => {
    const raw = { company: 'co-1', deal: 'OPE-0000000001', date: '2026-10-30', who: 'Sample Contact', channel: 'Phone' };
    const first = saveTouch(base, raw, ctx);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.record).toMatchObject({ deal_id: 'OPE-0000000001', channel: 'call', updated_by: 'Sample Person A' });
    const again = saveTouch(first.data, raw, ctx);
    expect(again.ok && again.data.touches).toHaveLength(1);
  });

  it('refuses a future date, an unknown deal, and a missing company', () => {
    const r = saveTouch(base, { company: 'nobody', deal: 'OPE-9', date: '2026-11-30' }, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['company', 'date']);
    const unknownDeal = saveTouch(base, { company: 'co-1', deal: 'OPE-0000000009', date: '2026-10-30' }, ctx);
    expect(!unknownDeal.ok && unknownDeal.errors.deal).toMatch(/not a deal/);
  });

  it('imports from a spreadsheet by op ID or deal name', () => {
    const csv =
      'Account,Opportunity,Date,With,Type\nco-1,OPE-0000000001,2026-10-29,Sample Contact,meeting\nco-1,Sample deal 1,2026-10-28,Sample Rep,email\nco-1,,2026-10-27,Sample Rep,call\n';
    const r = importText('touches', csv, 'touches.csv', base, config, { today });
    expect(r.report.rejectedRows).toBe(0);
    expect(r.data!.touches.map((t) => t.deal_id)).toEqual(['OPE-0000000001', 'OPE-0000000001', null]);
  });

  it("keeps a deleted deal's touches on its account", () => {
    const d = dataset({ ...base, touches: [touch('co-1', 'OPE-0000000001', '2026-10-30')] });
    expect(deleteDeal(d, 'OPE-0000000001').touches[0]!.deal_id).toBeNull();
  });
});
