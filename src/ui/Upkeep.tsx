import { useEffect, useMemo, useRef, useState } from 'react';
import { dealLabel, isOpenDeal, money, territoryCodes } from '../data/derive';
import { TOUCH_CHANNELS, type Company, type Deal, type TouchChannel } from '../data/types';
import {
  companyUpkeep,
  daysBetween,
  latestTouches,
  localToday,
  QUEST_KINDS,
  QUEST_LABELS,
  quests,
  UPKEEP_BAND_LABELS,
  upkeepBand,
  type Upkeep,
} from '../data/upkeep';
import { useApp } from '../state/app';
import { plural } from './forms';

const CHANNEL_LABELS: Record<TouchChannel, string> = { email: 'Email', call: 'Call', meeting: 'Meeting', other: 'Other' };

/** A short bar with its band in words, so the color never carries the meaning alone. */
export function UpkeepMeter({ upkeep, compact = false }: { upkeep: Upkeep; compact?: boolean }) {
  const band = upkeepBand(upkeep.level);
  const label = upkeep.pastDue ? 'Past due' : UPKEEP_BAND_LABELS[band];
  return (
    <span
      className={`meter ${band}${compact ? ' compact' : ''}`}
      title={`${label}, ${upkeep.level}%${upkeep.estimated ? ', estimated' : ''}`}
    >
      <span className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${Math.max(upkeep.level, 3)}%` }} />
      </span>
      <span className="meter-text">
        {label} {upkeep.level}%{upkeep.estimated ? '*' : ''}
      </span>
    </span>
  );
}

/** The meter for one deal, from the store. */
export function useDealUpkeep() {
  const data = useApp((s) => s.data);
  const days = useApp((s) => s.settings.upkeepDays);
  const latest = useMemo(() => latestTouches(data), [data]);
  const today = localToday();
  return { latest, today, days };
}

/** The company panel's upkeep line, the "Log touch" button, and its form. */
export function CompanyUpkeep({ company }: { company: Company }) {
  const index = useApp((s) => s.index);
  const { latest, today, days } = useDealUpkeep();
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const worst = companyUpkeep(index, latest, company.id, today, days);
  const openDeals = (index.dealsByCompany.get(company.id) ?? []).filter(isOpenDeal);

  return (
    <div className="upkeep-block">
      {worst ? (
        <p className="upkeep-line">
          <UpkeepMeter upkeep={worst} />
          <span className="muted small">
            {worst.pastDue
              ? `Close date ${worst.deal.close_date} has passed.`
              : worst.last
                ? `Last touch ${daysBetween(worst.since, today)} days ago${worst.last.who ? `, ${worst.last.who}` : ''} (${CHANNEL_LABELS[worst.last.channel].toLowerCase()}).`
                : `No touch logged; counting from the ${worst.since} review.`}
          </span>
        </p>
      ) : (
        <p className="muted small">No open deal, so no upkeep meter.</p>
      )}
      {done && (
        <p className="small upkeep-done" role="status">
          {done}
        </p>
      )}
      {logging ? (
        <TouchForm
          company={company}
          deals={openDeals}
          onDone={(msg) => {
            setLogging(false);
            setDone(msg);
          }}
          onCancel={() => setLogging(false)}
        />
      ) : (
        <button
          type="button"
          className="btn small solid"
          onClick={() => {
            setDone(null);
            setLogging(true);
          }}
        >
          Log touch
        </button>
      )}
    </div>
  );
}

function TouchForm({
  company,
  deals,
  onDone,
  onCancel,
}: {
  company: Company;
  deals: Deal[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const index = useApp((s) => s.index);
  const logTouch = useApp((s) => s.logTouch);
  const today = localToday();
  const [date, setDate] = useState(today);
  const [who, setWho] = useState('');
  const [channel, setChannel] = useState<TouchChannel>('email');
  const [deal, setDeal] = useState(deals.length === 1 ? deals[0]!.id : '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const whoRef = useRef<HTMLInputElement>(null);
  useEffect(() => whoRef.current?.focus(), []);

  // People to pick from: contacts at the account, its partner, and the HPE owners on its deals.
  const names = useMemo(() => {
    const out = new Set<string>();
    for (const c of index.contactsByCompany.get(company.id) ?? []) out.add(c.name);
    const partner = company.primary_partner_id ? index.companyById.get(company.primary_partner_id) : undefined;
    if (partner) out.add(partner.name);
    for (const d of deals) {
      const owner = d.hpe_owner_id ? index.personById.get(d.hpe_owner_id) : undefined;
      if (owner) out.add(owner.name);
      else if (d.owner_name) out.add(d.owner_name);
      else if (d.hpe_owner_id) out.add(d.hpe_owner_id);
      const p = d.partner_id ? index.companyById.get(d.partner_id) : undefined;
      if (p) out.add(p.name);
    }
    return [...out].sort();
  }, [index, company, deals]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = await logTouch({ company: company.id, deal, date, who, channel, note });
    if (errs) {
      setErrors(errs);
      return;
    }
    // A deal past its close date stays empty until the date moves, so say so rather than claim a refill.
    const affected = deal ? deals.filter((d) => d.id === deal) : deals;
    const late = affected.filter((d) => d.close_date !== null && d.close_date < today);
    const logged = `Logged ${CHANNEL_LABELS[channel].toLowerCase()}${who ? ` with ${who}` : ''} on ${date}.`;
    onDone(
      affected.length === 0
        ? `${logged} The account has no open deal, so there is no meter to refill.`
        : late.length === affected.length
          ? `${logged} The meter stays empty until the close date (${late[0]!.close_date}) moves; update it on the deal.`
          : late.length
            ? `${logged} Meter refilled, except on ${plural(late.length, 'deal')} past its close date.`
            : `${logged} Meter refilled.`,
    );
  };
  const listId = `touch-who-${company.id}`;

  return (
    <form className="touch-form" onSubmit={save} aria-label={`Log a touch at ${company.name}`}>
      <div className="touch-row">
        <label className="field">
          <span>With</span>
          <input
            ref={whoRef}
            className="text-input"
            list={listId}
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="Name"
          />
          <datalist id={listId}>
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Date</span>
          <input className="text-input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {errors.date && <p className="ferror">{errors.date}</p>}
      <fieldset className="field">
        <legend>How</legend>
        <div className="segmented">
          {TOUCH_CHANNELS.map((c) => (
            <label key={c} className={channel === c ? 'on' : ''}>
              <input type="radio" name={`channel-${company.id}`} value={c} checked={channel === c} onChange={() => setChannel(c)} />
              {CHANNEL_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>
      {deals.length > 0 && (
        <label className="field">
          <span>About</span>
          <select className="text-input" value={deal} onChange={(e) => setDeal(e.target.value)}>
            <option value="">The whole account (counts for every deal)</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {dealLabel(index, d)}
              </option>
            ))}
          </select>
        </label>
      )}
      {errors.deal && <p className="ferror">{errors.deal}</p>}
      <label className="field">
        <span>Note (optional)</span>
        <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {errors.company && <p className="ferror">{errors.company}</p>}
      <div className="touch-actions">
        <button type="submit" className="btn small solid">
          Save touch
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The latest touches at an account, newest first, each removable. */
export function TouchList({ companyId }: { companyId: string }) {
  const touches = useApp((s) => s.data.touches);
  const deals = useApp((s) => s.data.deals);
  const index = useApp((s) => s.index);
  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const removeTouch = useApp((s) => s.removeTouch);
  const list = touches
    .filter((t) => t.company_id === companyId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  if (!list.length) return null;
  return (
    <section className="touch-list">
      <h3>Touches</h3>
      <ul className="plain">
        {list.map((t) => {
          const deal = t.deal_id ? dealById.get(t.deal_id) : undefined;
          return (
            <li key={t.id}>
              <span>
                {t.date} · {CHANNEL_LABELS[t.channel]}
                {t.who ? ` with ${t.who}` : ''}
                <span className="muted"> · {deal ? dealLabel(index, deal) : 'whole account'}</span>
                {t.note && <span className="muted"> · {t.note}</span>}
              </span>
              <button
                type="button"
                className="tcard-close"
                aria-label={`Remove the touch on ${t.date}`}
                title="Remove"
                onClick={() => removeTouch(t.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The header's "Today" button: the five most urgent items in the current territory or area. */
export function QuestBoard() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const config = useApp((s) => s.config);
  const myArea = useApp((s) => s.settings.myArea);
  const days = useApp((s) => s.settings.upkeepDays);
  const focusId = useApp((s) => s.focusTerritoryId);
  const openCompany = useApp((s) => s.openCompany);

  const scope = useMemo(() => (focusId ? territoryCodes(config, focusId, myArea) : null), [config, focusId, myArea]);
  const scopeName = focusId
    ? focusId === 'my-area'
      ? 'My area'
      : (config.territories.find((t) => t.id === focusId)?.name ?? '')
    : 'all territories';
  const list = useMemo(() => quests(data, index, { today: localToday(), days, codes: scope }), [data, index, days, scope]);
  const byKind = QUEST_KINDS.map((k) => [k, list.filter((q) => q.kind === k).length] as const).filter(([, n]) => n > 0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        title="What needs attention today"
      >
        Today
        {list.length > 0 && <span className="quest-count">{list.length}</span>}
      </button>
      {open && (
        <div className="popover quest-board" role="dialog" aria-label="Today">
          <h2>Today in {scopeName}</h2>
          {list.length === 0 ? (
            <p className="muted small">
              Nothing needs attention: every open deal has an owner and a partner, a future close date, and a recent touch.
            </p>
          ) : (
            <>
              <ol className="quests">
                {list.slice(0, 5).map((q, i) => (
                  <li key={`${q.kind}-${q.deal?.id ?? q.company.id}-${i}`}>
                    <button
                      type="button"
                      className="quest"
                      onClick={() => {
                        setOpen(false);
                        openCompany(q.company.id, 'Deals');
                      }}
                    >
                      <span className={`quest-kind ${q.kind}`}>{QUEST_LABELS[q.kind]}</span>
                      <strong>{q.deal ? dealLabel(index, q.deal) : q.company.name}</strong>
                      <span className="muted small">
                        {q.deal && q.deal.name !== q.company.name ? `${q.company.name} · ` : ''}
                        {q.amount ? `${money(q.amount)} · ` : ''}
                        {q.why}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="muted small quest-totals">
                {plural(list.length, 'item')} in all: {byKind.map(([k, n]) => `${n} ${QUEST_LABELS[k].toLowerCase()}`).join(', ')}. Fixing
                the cause clears an item.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
