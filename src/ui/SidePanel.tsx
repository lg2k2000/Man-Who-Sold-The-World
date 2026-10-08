import { useEffect, useMemo, useState } from 'react';
import { coverageRoles, isOpenDeal, orgTree, OVERLAP_THRESHOLD, type OrgNode } from '../data/derive';
import {
  BRIEF_SECTIONS,
  BRIEF_SECTION_LABELS,
  ROLE_LABELS,
  TIER_FIT_LABELS,
  type Brief,
  type BriefItem,
  type Partner,
  type Person,
  type Prospect,
  type Stakeholder,
} from '../data/types';
import { useApp } from '../state/app';

interface Props {
  regionNames: Map<string, string>;
}

/** The panel that slides in from the right for a prospect, person, or partner. */
export function SidePanel({ regionNames }: Props) {
  const panel = useApp((s) => s.panel);
  const index = useApp((s) => s.index);
  const closePanel = useApp((s) => s.closePanel);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.search')) closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel, closePanel]);

  let body: React.ReactNode = null;
  let title = '';
  if (panel?.kind === 'prospect') {
    const p = index.prospectById.get(panel.id);
    if (p) {
      title = p.name;
      body = <ProspectBody prospect={p} regionNames={regionNames} />;
    }
  } else if (panel?.kind === 'person') {
    const p = index.personByEmail.get(panel.id);
    if (p) {
      title = p.name;
      body = <PersonBody person={p} regionNames={regionNames} />;
    }
  } else if (panel?.kind === 'partner') {
    const p = index.partnerById.get(panel.id);
    if (p) {
      title = p.name;
      body = <PartnerBody partner={p} regionNames={regionNames} />;
    }
  }

  return (
    <aside className={`panel${body ? ' open' : ''}`} aria-label={title || 'Details'} aria-hidden={!body}>
      {body && (
        <>
          <div className="panel-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={closePanel} aria-label="Close panel">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4Z" />
              </svg>
            </button>
          </div>
          {body}
        </>
      )}
    </aside>
  );
}

const TABS = ['Brief', 'Stakeholders', 'Coverage', 'Deals'] as const;
type Tab = (typeof TABS)[number];

function ProspectBody({ prospect, regionNames }: { prospect: Prospect; regionNames: Map<string, string> }) {
  const [tab, setTab] = useState<Tab>('Brief');
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const openPerson = useApp((s) => s.openPerson);
  const openPartner = useApp((s) => s.openPartner);

  const brief = useMemo(() => data.briefs.find((b) => b.prospect_id === prospect.id) ?? null, [data.briefs, prospect.id]);
  const stakeholders = useMemo(() => data.stakeholders.filter((s) => s.prospect_id === prospect.id), [data.stakeholders, prospect.id]);
  const deals = index.dealsByProspect.get(prospect.id) ?? [];
  const covering = index.coverageByProspect.get(prospect.id) ?? [];
  const roles = coverageRoles(covering);
  const partner = prospect.primary_partner_id ? index.partnerById.get(prospect.primary_partner_id) : undefined;
  const owner = prospect.hpe_owner_email ? index.personByEmail.get(prospect.hpe_owner_email) : undefined;
  const regionIndex = useApp((s) => s.regionIndex);
  const territory = regionIndex.get(prospect.state)?.territory;
  const counts: Record<Tab, number> = {
    Brief: brief ? BRIEF_SECTIONS.reduce((n, s) => n + brief.sections[s].length, 0) : 0,
    Stakeholders: stakeholders.length,
    Coverage: covering.length,
    Deals: deals.length,
  };

  return (
    <div className="panel-body">
      <div className="facts">
        <p className="lede">{prospect.description || <span className="muted">No description imported.</span>}</p>
        <div className="tags">
          <span className="tag">{TIER_FIT_LABELS[prospect.tier_fit]} fit</span>
          <span className="tag">{segmentLabel(prospect.segment)}</span>
          {prospect.industry && <span className="tag">{prospect.industry}</span>}
          {roles.length >= OVERLAP_THRESHOLD && <span className="tag overlap">{roles.length} coverage roles</span>}
          {deals.some(isOpenDeal) && <span className="tag deal">Open deal</span>}
        </div>
        <dl className="kv">
          <dt>HQ</dt>
          <dd>
            {prospect.hq_city}, {regionNames.get(prospect.state) ?? prospect.state}
            {(prospect.lat === null || prospect.lng === null) && <span className="unverified-note"> Location unverified</span>}
          </dd>
          <dt>Territory</dt>
          <dd>{territory ? territory.name : <span className="muted">Unassigned</span>}</dd>
          <dt>HPE owner</dt>
          <dd>
            {owner ? (
              <button type="button" className="link" onClick={() => openPerson(owner.email)}>
                {owner.name}
              </button>
            ) : (
              (prospect.hpe_owner_email ?? <span className="muted">None imported</span>)
            )}
          </dd>
          <dt>Primary partner</dt>
          <dd>
            {partner ? (
              <button type="button" className="link" onClick={() => openPartner(partner.id)}>
                {partner.name}
              </button>
            ) : (
              <span className="muted">None imported</span>
            )}
          </dd>
        </dl>
      </div>
      <div className="tabs" role="tablist" aria-label={`${prospect.name} details`}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`tabpanel-${t}`}
            className={tab === t ? 'on' : ''}
            onClick={() => setTab(t)}
          >
            {t}
            <span className="tab-count">{counts[t]}</span>
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'Brief' && <BriefTab brief={brief} />}
        {tab === 'Stakeholders' && <StakeholdersTab stakeholders={stakeholders} />}
        {tab === 'Coverage' && <CoverageTab people={covering} partner={partner} />}
        {tab === 'Deals' && <DealsTab prospect={prospect} />}
      </div>
    </div>
  );
}

function segmentLabel(s: Prospect['segment']) {
  return s === 'sled' ? 'SLED' : s === 'mid-market' ? 'Mid-market' : 'Enterprise';
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty-note">{children}</p>;
}

function BriefTab({ brief }: { brief: Brief | null }) {
  if (!brief) return <Empty>No brief imported for this prospect. Briefs arrive as a JSON import.</Empty>;
  return (
    <div className="brief">
      <p className="legend-inline">
        <span className="conf confirmed">confirmed</span>
        <span className="conf reported">reported</span>
        <span className="conf inferred">inferred</span>
      </p>
      {BRIEF_SECTIONS.map((s) => (
        <section key={s}>
          <h3>{BRIEF_SECTION_LABELS[s]}</h3>
          {brief.sections[s].length === 0 ? (
            <p className="muted small">Nothing in the brief.</p>
          ) : (
            <ul className="items">
              {brief.sections[s].map((item, i) => (
                <BriefRow key={i} item={item} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function BriefRow({ item }: { item: BriefItem }) {
  return (
    <li className={`item ${item.confidence}`}>
      <p>{item.text}</p>
      <p className="item-meta">
        <span className={`conf ${item.confidence}`}>{item.confidence}</span>
        <a href={item.source_url} target="_blank" rel="noreferrer noopener">
          {hostOf(item.source_url)}
        </a>
        <span>{item.source_date}</span>
      </p>
    </li>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function StakeholdersTab({ stakeholders }: { stakeholders: Stakeholder[] }) {
  const tree = useMemo(() => orgTree(stakeholders), [stakeholders]);
  if (!stakeholders.length) return <Empty>No stakeholders imported for this prospect. They arrive as a JSON import.</Empty>;
  return (
    <ul className="org">
      {tree.map((n) => (
        <OrgRow key={n.item.id} node={n} />
      ))}
    </ul>
  );
}

function OrgRow({ node }: { node: OrgNode<Stakeholder> }) {
  const s = node.item;
  return (
    <li>
      <div className="org-card">
        <div className="org-name">{s.name}</div>
        <div className="org-title">{s.title}</div>
        <div className="org-meta">
          <span className={`role-chip r-${s.role_in_decision.replace(/ /g, '-')}`}>{s.role_in_decision}</span>
          <span className="muted">{s.last_contact ? `Last contact ${s.last_contact}` : 'No contact logged'}</span>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <OrgRow key={c.item.id} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CoverageTab({ people, partner }: { people: Person[]; partner: Partner | undefined }) {
  const openPerson = useApp((s) => s.openPerson);
  const openPartner = useApp((s) => s.openPartner);
  return (
    <div className="coverage">
      <h3>HPE people</h3>
      {people.length === 0 ? (
        <Empty>No coverage imported for this prospect.</Empty>
      ) : (
        <ul className="people">
          {[...people]
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map((p) => (
              <li key={p.email}>
                <button type="button" className="link" onClick={() => openPerson(p.email)}>
                  {p.name}
                </button>
                <span className="muted">
                  {p.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                  {p.specialty ? ` (${p.specialty === 'aruba' ? 'Aruba' : 'Juniper'})` : ''}
                </span>
                <a href={`mailto:${p.email}`}>{p.email}</a>
              </li>
            ))}
        </ul>
      )}
      <h3>Primary partner</h3>
      {!partner ? (
        <Empty>No primary partner imported.</Empty>
      ) : (
        <div>
          <button type="button" className="link" onClick={() => openPartner(partner.id)}>
            {partner.name}
          </button>
          <ul className="people">
            {partner.contacts.map((c) => (
              <li key={c.email || c.name}>
                <span>{c.name}</span>
                <span className="muted">{c.title}</span>
                {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DealsTab({ prospect }: { prospect: Prospect }) {
  const index = useApp((s) => s.index);
  const deals = [...(index.dealsByProspect.get(prospect.id) ?? [])].sort((a, b) => (a.close_date ?? '').localeCompare(b.close_date ?? ''));
  if (!deals.length) return <Empty>No deals imported for this prospect.</Empty>;
  return (
    <table className="deals">
      <thead>
        <tr>
          <th>OP ID</th>
          <th>Stage</th>
          <th>Close</th>
          <th>Partner</th>
        </tr>
      </thead>
      <tbody>
        {deals.map((d) => (
          <tr key={d.op_id} className={isOpenDeal(d) ? '' : 'closed'}>
            <td className="mono">{d.op_id}</td>
            <td>{d.stage}</td>
            <td>{d.close_date ?? 'none'}</td>
            <td>{(d.partner_id && index.partnerById.get(d.partner_id)?.name) || <span className="muted">none</span>}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="muted small">
            As of{' '}
            {deals
              .map((d) => d.as_of)
              .sort()
              .at(-1)}
            . HPE owner:{' '}
            {deals[0]?.hpe_owner_email ? (index.personByEmail.get(deals[0].hpe_owner_email)?.name ?? deals[0].hpe_owner_email) : 'none'}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function PersonBody({ person, regionNames }: { person: Person; regionNames: Map<string, string> }) {
  const index = useApp((s) => s.index);
  const config = useApp((s) => s.config);
  const openProspect = useApp((s) => s.openProspect);
  const editPerson = useApp((s) => s.editPerson);
  const accounts = index.coverageByPerson.get(person.email) ?? [];
  return (
    <div className="panel-body">
      <p>
        <button type="button" className="btn small" onClick={() => editPerson(person.email)}>
          Edit in People
        </button>
      </p>
      <dl className="kv">
        <dt>Roles</dt>
        <dd>
          {person.roles.map((r) => ROLE_LABELS[r]).join(', ')}
          {person.specialty ? ` (${person.specialty === 'aruba' ? 'Aruba' : 'Juniper'})` : ''}
        </dd>
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${person.email}`}>{person.email}</a>
        </dd>
        <dt>Territory teams</dt>
        <dd>
          {person.territories.length ? (
            person.territories.map((id) => config.territories.find((t) => t.id === id)?.name ?? id).join(', ')
          ) : (
            <span className="muted">None</span>
          )}
        </dd>
        <dt>States</dt>
        <dd>{person.states.length ? person.states.map((c) => regionNames.get(c) ?? c).join(', ') : <span className="muted">None</span>}</dd>
        {person.notes && (
          <>
            <dt>Notes</dt>
            <dd>{person.notes}</dd>
          </>
        )}
      </dl>
      <h3>Accounts covered ({accounts.length})</h3>
      {accounts.length === 0 ? (
        <Empty>No coverage imported for this person.</Empty>
      ) : (
        <ul className="people">
          {accounts.map((p) => (
            <li key={p.id}>
              <button type="button" className="link" onClick={() => openProspect(p.id)}>
                {p.name}
              </button>
              <span className="muted">
                {p.hq_city}, {p.state.slice(3)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PartnerBody({ partner, regionNames }: { partner: Partner; regionNames: Map<string, string> }) {
  const data = useApp((s) => s.data);
  const openProspect = useApp((s) => s.openProspect);
  const editPartner = useApp((s) => s.editPartner);
  const primaryFor = data.prospects.filter((p) => p.primary_partner_id === partner.id);
  return (
    <div className="panel-body">
      <p>
        <button type="button" className="btn small" onClick={() => editPartner(partner.id)}>
          Edit in Partners
        </button>
      </p>
      <dl className="kv">
        <dt>Has done VME</dt>
        <dd>{partner.has_done_vme}</dd>
        <dt>Has done Morpheus Enterprise</dt>
        <dd>{partner.has_done_morpheus_enterprise}</dd>
        <dt>States</dt>
        <dd>{partner.states.map((c) => regionNames.get(c) ?? c).join(', ') || <span className="muted">None</span>}</dd>
        {partner.notes && (
          <>
            <dt>Notes</dt>
            <dd>{partner.notes}</dd>
          </>
        )}
      </dl>
      <h3>Contacts</h3>
      {partner.contacts.length === 0 ? (
        <Empty>No contacts imported.</Empty>
      ) : (
        <ul className="people">
          {partner.contacts.map((c) => (
            <li key={c.email || c.name}>
              <span>{c.name}</span>
              <span className="muted">{c.title}</span>
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            </li>
          ))}
        </ul>
      )}
      <h3>Primary partner for ({primaryFor.length})</h3>
      {primaryFor.length === 0 ? (
        <Empty>No prospects name this partner as primary.</Empty>
      ) : (
        <ul className="people">
          {primaryFor.map((p) => (
            <li key={p.id}>
              <button type="button" className="link" onClick={() => openProspect(p.id)}>
                {p.name}
              </button>
              <span className="muted">
                {p.hq_city}, {p.state.slice(3)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
