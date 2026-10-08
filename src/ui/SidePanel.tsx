import { useEffect, useMemo, useRef, useState } from 'react';
import { coverageRoles, dealLabel, isOpenDeal, money, orgTree, ownerName, OVERLAP_THRESHOLD, type OrgNode } from '../data/derive';
import {
  BRIEF_SECTIONS,
  BRIEF_SECTION_LABELS,
  COMPANY_TYPE_LABELS,
  ROLE_LABELS,
  SEGMENT_LABELS,
  TIER_FIT_LABELS,
  type Brief,
  type BriefItem,
  type Company,
  type Contact,
  type Deal,
  type Person,
} from '../data/types';
import { useApp, type CompanyTab } from '../state/app';
import { plural } from './forms';

interface Props {
  regionNames: Map<string, string>;
}

/** The panel that slides in from the right for a company or an HPE person. */
export function SidePanel({ regionNames }: Props) {
  const panel = useApp((s) => s.panel);
  const index = useApp((s) => s.index);
  const closePanel = useApp((s) => s.closePanel);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const panelKey = panel ? `${panel.kind}:${panel.id}` : null;

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.search')) closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel, closePanel]);

  // Move focus into the panel when it opens or changes, and back where it came from when it closes.
  useEffect(() => {
    if (panelKey) {
      const active = document.activeElement as HTMLElement | null;
      if (active && !active.closest('.panel')) returnTo.current = active;
      headingRef.current?.focus();
    } else if (returnTo.current) {
      if (document.contains(returnTo.current)) returnTo.current.focus();
      returnTo.current = null;
    }
  }, [panelKey]);

  let body: React.ReactNode = null;
  let title = '';
  if (panel?.kind === 'company') {
    const c = index.companyById.get(panel.id);
    if (c) {
      title = c.name;
      body =
        c.type === 'partner' ? (
          <PartnerBody partner={c} regionNames={regionNames} />
        ) : (
          <CompanyBody key={`${c.id}:${panel.tab ?? ''}`} company={c} regionNames={regionNames} initialTab={panel.tab} />
        );
    }
  } else if (panel?.kind === 'person') {
    const p = index.personById.get(panel.id);
    if (p) {
      title = p.name;
      body = <PersonBody person={p} regionNames={regionNames} />;
    }
  }

  return (
    <aside className={`panel${body ? ' open' : ''}`} aria-label={title || 'Details'} aria-hidden={!body}>
      {body && (
        <>
          <div className="panel-head">
            <h2 ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
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

const TABS: CompanyTab[] = ['Brief', 'Contacts', 'Coverage', 'Deals'];
type Tab = CompanyTab;

function CompanyBody({ company, regionNames, initialTab }: { company: Company; regionNames: Map<string, string>; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'Brief');
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const openPerson = useApp((s) => s.openPerson);
  const openCompany = useApp((s) => s.openCompany);
  const editCompany = useApp((s) => s.editCompany);

  const brief = useMemo(() => data.briefs.find((b) => b.company_id === company.id) ?? null, [data.briefs, company.id]);
  const contacts = index.contactsByCompany.get(company.id) ?? [];
  const deals = index.dealsByCompany.get(company.id) ?? [];
  const covering = index.coverageByCompany.get(company.id) ?? [];
  const roles = coverageRoles(covering);
  const partner = company.primary_partner_id ? index.companyById.get(company.primary_partner_id) : undefined;
  const owner = company.hpe_owner_id ? index.personById.get(company.hpe_owner_id) : undefined;
  const regionIndex = useApp((s) => s.regionIndex);
  const territory = company.state ? regionIndex.get(company.state)?.territory : undefined;
  const pipeline = index.openPipeline.get(company.id) ?? 0;
  const counts: Record<Tab, number> = {
    Brief: brief ? BRIEF_SECTIONS.reduce((n, s) => n + brief.sections[s].length, 0) : 0,
    Contacts: contacts.length,
    Coverage: covering.length,
    Deals: deals.length,
  };

  return (
    <div className="panel-body">
      <div className="facts">
        <p className="lede">{company.description || <span className="muted">No description yet.</span>}</p>
        <div className="tags">
          <span className="tag">{COMPANY_TYPE_LABELS[company.type]}</span>
          {company.tier_fit !== 'unknown' && <span className="tag">{TIER_FIT_LABELS[company.tier_fit]} fit</span>}
          {company.segment && <span className="tag">{SEGMENT_LABELS[company.segment]}</span>}
          {company.industry && <span className="tag">{company.industry}</span>}
          {roles.length >= OVERLAP_THRESHOLD && <span className="tag overlap">{roles.length} coverage roles</span>}
          {deals.some(isOpenDeal) && <span className="tag deal">Open pipeline {money(pipeline)}</span>}
        </div>
        <dl className="kv">
          <dt>HQ</dt>
          <dd>
            {[company.hq_city, company.state ? (regionNames.get(company.state) ?? company.state) : null].filter(Boolean).join(', ') || (
              <span className="muted">No location yet</span>
            )}
            {company.state && (company.lat === null || company.lng === null) && (
              <span className="unverified-note"> Location unverified</span>
            )}
          </dd>
          <dt>Territory</dt>
          <dd>
            {territory ? territory.name : <span className="muted">{company.state ? 'Unassigned' : 'None until it has a state'}</span>}
          </dd>
          <dt>HPE owner</dt>
          <dd>
            {owner ? (
              <button type="button" className="link" onClick={() => openPerson(owner.id)}>
                {owner.name}
              </button>
            ) : (
              (company.hpe_owner_id ?? <span className="muted">None</span>)
            )}
          </dd>
          <dt>Primary partner</dt>
          <dd>
            {partner ? (
              <button type="button" className="link" onClick={() => openCompany(partner.id)}>
                {partner.name}
              </button>
            ) : (
              <span className="muted">None</span>
            )}
          </dd>
          {company.website && (
            <>
              <dt>Website</dt>
              <dd>
                <a
                  href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {company.website.replace(/^https?:\/\//, '')}
                </a>
              </dd>
            </>
          )}
        </dl>
        <p>
          <button type="button" className="btn small" onClick={() => editCompany(company.id)}>
            Edit in Companies
          </button>
        </p>
      </div>
      <div className="tabs" role="tablist" aria-label={`${company.name} details`}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`tabpanel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            className={tab === t ? 'on' : ''}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              const i = TABS.indexOf(t);
              const next =
                e.key === 'ArrowRight'
                  ? TABS[(i + 1) % TABS.length]
                  : e.key === 'ArrowLeft'
                    ? TABS[(i - 1 + TABS.length) % TABS.length]
                    : e.key === 'Home'
                      ? TABS[0]
                      : e.key === 'End'
                        ? TABS[TABS.length - 1]
                        : null;
              if (!next) return;
              e.preventDefault();
              setTab(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
          >
            {t}
            <span className="tab-count">{counts[t]}</span>
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {tab === 'Brief' && <BriefTab brief={brief} />}
        {tab === 'Contacts' && <ContactsTab contacts={contacts} />}
        {tab === 'Coverage' && <CoverageTab people={covering} partner={partner} />}
        {tab === 'Deals' && <DealsTab deals={deals} />}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty-note">{children}</p>;
}

function BriefTab({ brief }: { brief: Brief | null }) {
  if (!brief) return <Empty>No brief for this company yet. Briefs arrive as a JSON import.</Empty>;
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

function ContactsTab({ contacts }: { contacts: Contact[] }) {
  const tree = useMemo(() => orgTree(contacts), [contacts]);
  if (!contacts.length) return <Empty>No contacts at this company yet. Add them in Contacts or import a contacts sheet.</Empty>;
  return (
    <ul className="org">
      {tree.map((n) => (
        <OrgRow key={n.item.id} node={n} />
      ))}
    </ul>
  );
}

function OrgRow({ node }: { node: OrgNode<Contact> }) {
  const s = node.item;
  const editContact = useApp((st) => st.editContact);
  return (
    <li>
      <div className="org-card">
        <button type="button" className="link org-name" onClick={() => editContact(s.id)}>
          {s.name}
        </button>
        <div className="org-title">{s.title}</div>
        <div className="org-meta">
          {s.role_in_decision !== 'unknown' && (
            <span className={`role-chip r-${s.role_in_decision.replace(/ /g, '-')}`}>{s.role_in_decision}</span>
          )}
          <span className="muted">{s.last_contact ? `Last contact ${s.last_contact}` : 'No contact logged'}</span>
        </div>
        {(s.email || s.phone) && (
          <div className="org-meta">
            {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
            {s.phone && <span className="muted">{s.phone}</span>}
          </div>
        )}
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

function CoverageTab({ people, partner }: { people: Person[]; partner: Company | undefined }) {
  const openPerson = useApp((s) => s.openPerson);
  const openCompany = useApp((s) => s.openCompany);
  const index = useApp((s) => s.index);
  const partnerContacts = partner ? (index.contactsByCompany.get(partner.id) ?? []) : [];
  return (
    <div className="coverage">
      <h3>HPE people</h3>
      {people.length === 0 ? (
        <Empty>No HPE coverage recorded for this company.</Empty>
      ) : (
        <ul className="people">
          {[...people]
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map((p) => (
              <li key={p.id}>
                <button type="button" className="link" onClick={() => openPerson(p.id)}>
                  {p.name}
                </button>
                <span className="muted">
                  {p.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                  {p.specialty ? ` (${p.specialty === 'aruba' ? 'Aruba' : 'Juniper'})` : ''}
                </span>
                {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
              </li>
            ))}
        </ul>
      )}
      <h3>Primary partner</h3>
      {!partner ? (
        <Empty>No primary partner set.</Empty>
      ) : (
        <div>
          <button type="button" className="link" onClick={() => openCompany(partner.id)}>
            {partner.name}
          </button>
          <ContactList contacts={partnerContacts} />
        </div>
      )}
    </div>
  );
}

function ContactList({ contacts }: { contacts: Contact[] }) {
  if (!contacts.length) return null;
  return (
    <ul className="people">
      {contacts.map((c) => (
        <li key={c.id}>
          <span>{c.name}</span>
          <span className="muted">{c.title}</span>
          {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
        </li>
      ))}
    </ul>
  );
}

function DealsTab({ deals: list, showCompany = false }: { deals: Deal[]; showCompany?: boolean }) {
  const index = useApp((s) => s.index);
  const editDeal = useApp((s) => s.editDeal);
  const deals = [...list].sort(
    (a, b) => Number(isOpenDeal(b)) - Number(isOpenDeal(a)) || (a.close_date ?? '').localeCompare(b.close_date ?? ''),
  );
  if (!deals.length) return <Empty>No deals yet.</Empty>;
  const open = deals.filter(isOpenDeal);
  return (
    <table className="deals">
      <thead>
        <tr>
          <th>Deal</th>
          <th>Stage</th>
          <th className="num">Amount</th>
          <th>Close</th>
        </tr>
      </thead>
      <tbody>
        {deals.map((d) => (
          <tr key={d.id} className={isOpenDeal(d) ? '' : 'closed'}>
            <td>
              <button type="button" className="link" onClick={() => editDeal(d.id)}>
                {dealLabel(index, d)}
              </button>
              <div className="muted small">
                {[showCompany ? index.companyById.get(d.company_id)?.name : null, ownerName(index, d), d.op_id].filter(Boolean).join(' · ')}
              </div>
            </td>
            <td>{d.stage}</td>
            <td className="num">{money(d.amount)}</td>
            <td>{d.close_date ?? ''}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="muted small">
            {plural(open.length, 'open deal')}, {money(open.reduce((n, d) => n + (d.amount ?? 0), 0))}. As of{' '}
            {deals
              .map((d) => d.as_of)
              .sort()
              .at(-1)}
            .
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function PersonBody({ person, regionNames }: { person: Person; regionNames: Map<string, string> }) {
  const index = useApp((s) => s.index);
  const data = useApp((s) => s.data);
  const config = useApp((s) => s.config);
  const openCompany = useApp((s) => s.openCompany);
  const editPerson = useApp((s) => s.editPerson);
  const accounts = index.coverageByPerson.get(person.id) ?? [];
  const owned = data.deals.filter((d) => d.hpe_owner_id === person.id);
  return (
    <div className="panel-body">
      <p>
        <button type="button" className="btn small" onClick={() => editPerson(person.id)}>
          Edit in HPE team
        </button>
      </p>
      <dl className="kv">
        <dt>Roles</dt>
        <dd>
          {person.roles.map((r) => ROLE_LABELS[r]).join(', ')}
          {person.specialty ? ` (${person.specialty === 'aruba' ? 'Aruba' : 'Juniper'})` : ''}
        </dd>
        <dt>Email</dt>
        <dd>{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : <span className="muted">Not known yet</span>}</dd>
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
        <Empty>No coverage recorded for this person.</Empty>
      ) : (
        <ul className="people">
          {accounts.map((c) => (
            <li key={c.id}>
              <button type="button" className="link" onClick={() => openCompany(c.id)}>
                {c.name}
              </button>
              <span className="muted">{[c.hq_city, c.state?.slice(3)].filter(Boolean).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      <h3>Deals they own ({owned.length})</h3>
      <DealsTab deals={owned} showCompany />
    </div>
  );
}

function PartnerBody({ partner, regionNames }: { partner: Company; regionNames: Map<string, string> }) {
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const openCompany = useApp((s) => s.openCompany);
  const editCompany = useApp((s) => s.editCompany);
  const primaryFor = data.companies.filter((c) => c.primary_partner_id === partner.id);
  const contacts = index.contactsByCompany.get(partner.id) ?? [];
  const deals = index.dealsByPartner.get(partner.id) ?? [];
  return (
    <div className="panel-body">
      <p>
        <button type="button" className="btn small" onClick={() => editCompany(partner.id)}>
          Edit in Companies
        </button>
      </p>
      <dl className="kv">
        <dt>Has done VME</dt>
        <dd>{partner.has_done_vme}</dd>
        <dt>Has done Morpheus Enterprise</dt>
        <dd>{partner.has_done_morpheus_enterprise}</dd>
        <dt>Works in</dt>
        <dd>{partner.states.map((c) => regionNames.get(c) ?? c).join(', ') || <span className="muted">No states set</span>}</dd>
        {partner.notes && (
          <>
            <dt>Notes</dt>
            <dd>{partner.notes}</dd>
          </>
        )}
      </dl>
      <h3>Contacts</h3>
      {contacts.length === 0 ? <Empty>No contacts at this partner yet.</Empty> : <ContactList contacts={contacts} />}
      <h3>Deals as partner ({deals.length})</h3>
      <DealsTab deals={deals} showCompany />
      <h3>Primary partner for ({primaryFor.length})</h3>
      {primaryFor.length === 0 ? (
        <Empty>No company names this partner as primary.</Empty>
      ) : (
        <ul className="people">
          {primaryFor.map((c) => (
            <li key={c.id}>
              <button type="button" className="link" onClick={() => openCompany(c.id)}>
                {c.name}
              </button>
              <span className="muted">{[c.hq_city, c.state?.slice(3)].filter(Boolean).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
