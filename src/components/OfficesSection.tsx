/**
 * DPWH offices first, legislative districts under them: the hierarchy the
 * budget documents use. DPWH lists its money by district engineering office
 * (DEO); each office serves one or more legislative districts.
 *
 * Each office's figures are shown once, whole. A shared (Tier B) office's
 * districts are listed under it and its money is never split between them.
 * Figures are the API's office figures (named projects, NEP against House
 * bill on the same ledger); lines whose two versions name different offices
 * are held out of them, as the API holds them out.
 *
 * An office this portal holds only part of (one shared with a neighbour) also
 * gets its lines split by the place each title names, under the whole figures:
 * this portal's own in full, each `alsoServed` place summarised, and the lines
 * that name no single place listed. See lib/office-split.ts.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DistrictCard, DistrictOffice, Envelope, ProjectRow } from '../api/types';
import { BRIDGE_GROUPS } from '../api/types';
import { shortNameOf } from '../config';
import { count, php, phpDelta, phpFull, plural } from '../lib/format';
import { splitOffice, type SplitPart } from '../lib/office-split';
import { usePortal, type Async } from '../lib/portal-context';
import type { QueryReport, ScopedProject } from '../lib/scope';
import { Await, External } from './Bits';

interface DistrictRow {
  id: string;
  label: string;
  card: DistrictCard | null;
  /** Other offices that also build in this district. */
  alsoServedBy: string[];
}

interface OfficeView {
  office: DistrictOffice;
  /** The office as the documents publish it ("Bohol 1st District Engineering Office"). */
  printed: string;
  /** The portal's query for this office, when all of its lines are in the portal. */
  query: QueryReport | null;
  /** How many of the portal's lines the documents list under this office. */
  lines: number;
  districts: DistrictRow[];
}

export default function OfficesSection() {
  const { districts, scope, config } = usePortal();
  // Nothing to show for a scope with neither offices nor districts.
  if (!config.scope.offices?.length && !config.scope.districts?.length) return null;
  const queries = scope.status === 'ready' ? scope.value.queries.filter((q) => q.kind === 'office') : [];
  const projects = scope.status === 'ready' ? scope.value.projects : [];
  return (
    <section className="section" id="offices" aria-labelledby="offices-h">
      <Await state={districts} what="DPWH offices and districts">
        {(list) => <Offices list={list} queries={queries} projects={projects} />}
      </Await>
    </section>
  );
}

function buildOffices(cards: DistrictCard[], queries: QueryReport[], projects: ScopedProject[]): { offices: OfficeView[]; noOffice: DistrictCard[] } {
  const linesByOffice = new Map<string, number>();
  for (const p of projects) if (p.office) linesByOffice.set(p.office, (linesByOffice.get(p.office) ?? 0) + 1);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const queryByOffice = new Map<string, QueryReport>();
  for (const q of queries) for (const o of q.officeLens?.offices ?? []) queryByOffice.set(o.id, q);

  const officeById = new Map<string, DistrictOffice>();
  for (const c of cards) for (const o of c.offices) if (!officeById.has(o.id)) officeById.set(o.id, o);

  const offices = [...officeById.values()].map((office): OfficeView => {
    const query = queryByOffice.get(office.id) ?? null;
    const printed =
      query?.label ??
      office.years?.find((y) => y.fy === 2027 && y.stage === 'hgab3' && y.matched_label)?.matched_label ??
      office.name;
    const labels = new Map(office.co_served_districts.map((d) => [d.id, d.label]));
    const districts = office.district_ids.map((id): DistrictRow => {
      const card = cardById.get(id) ?? null;
      return {
        id,
        label: card?.label ?? labels.get(id) ?? id,
        card,
        alsoServedBy: card ? card.offices.filter((o) => o.id !== office.id).map((o) => o.name) : [],
      };
    });
    return { office, printed, query, lines: linesByOffice.get(printed) ?? 0, districts };
  });

  // The portal's own offices first, then any that only serve a district it names.
  offices.sort((a, b) => Number(!a.query) - Number(!b.query) || a.printed.localeCompare(b.printed, 'en', { numeric: true }));
  return { offices, noOffice: cards.filter((c) => !c.offices.length) };
}

function Offices({ list, queries, projects }: { list: Envelope<DistrictCard>[]; queries: QueryReport[]; projects: ScopedProject[] }) {
  const { overview } = usePortal();
  const cards = list.map((e) => e.data);
  const { offices, noOffice } = buildOffices(cards, queries, projects);
  const portalKeys = new Set(projects.map((p) => p.key));
  const districtCount = new Set(offices.flatMap((o) => o.districts.map((d) => d.id)).concat(noOffice.map((c) => c.id))).size;
  const note = list[0]?.meta.representatives_note as string | undefined;
  const residualTerm = overview.status === 'ready' ? overview.value.data.terms.residual : undefined;
  const credits = [...new Set(cards.flatMap((c) => (c.representative?.portrait ? [`${c.representative.portrait.attribution} · ${c.representative.portrait.license}`] : [])))];

  return (
    <>
      <h2 id="offices-h" className="section-h">
        {plural(offices.length, 'DPWH district engineering office')}, serving {plural(districtCount, 'legislative district')}
      </h2>
      <p className="section-lede">
        DPWH lists its money by the district engineering office that does the work. Each office serves one or more legislative
        districts, and DPWH never splits a shared office’s money between them. Representatives shown hold the seat in the 20th
        Congress.{note && <> {note}</>}
      </p>

      <div className={`ogrid${offices.length === 1 ? ' one' : ''}`}>
        {offices.map((o) => <Office key={o.office.id} view={o} portalKeys={portalKeys} />)}
      </div>

      {noOffice.length > 0 && (
        <p className="fine">
          No DPWH district office is listed for {noOffice.map((c) => c.label).join('; ')}.
        </p>
      )}
      <p className="fine">
        Office figures are its named projects in the 2027 NEP and the House bill, compared, never added.
        {residualTerm && <> {residualTerm.term}: {residualTerm.meaning.charAt(0).toLowerCase() + residualTerm.meaning.slice(1)}</>}
        {credits.length > 0 && <> Portraits: {credits.join('; ')}.</>}
      </p>
    </>
  );
}

function Office({ view, portalKeys }: { view: OfficeView; portalKeys: ReadonlySet<string> }) {
  const { office, printed, query, lines, districts } = view;
  const f = office.fy2027;
  const wholeNep = office.years?.find((y) => y.fy === 2027 && y.stage === 'nep')?.php ?? null;
  const change = f && f.nep_php != null && f.hgab3_php != null ? f.hgab3_php - f.nep_php : null;
  // The project list, narrowed to this office's lines (and a status).
  const filter = (status?: string) => `/?office=${encodeURIComponent(printed)}${status ? `&status=${status}` : ''}#projects`;
  const groups = f ? BRIDGE_GROUPS.map((g) => f.bridge.groups[g]).filter((c) => c && c.rows > 0) : [];
  const unconfirmed = f?.annotations?.unconfirmed_rows ?? 0;
  const held = f?.office_change?.rows ?? 0;

  return (
    <article className="ocard">
      <header className="ocard-head">
        <div>
          <p className="label">DPWH {office.kind_label.replace(/ \(DEO\)$/, '')}{office.region && <> · {office.region}</>}</p>
          <h3>{printed}</h3>
        </div>
        <span className={`tag tier tier-${office.tier}`}>{office.tier_text}</span>
      </header>

      <dl className="ocard-figs">
        <div>
          <dt className="label">In this portal</dt>
          <dd>{lines ? <Link to={filter()} className="ocard-lines">{plural(lines, 'line')} →</Link> : <span className="muted">none</span>}</dd>
        </div>
        <div>
          <dt className="label">NEP</dt>
          <dd className="num">{php(f?.nep_php)}</dd>
        </div>
        <div>
          <dt className="label">House bill</dt>
          <dd className="num stat-accent">{php(f?.hgab3_php)}</dd>
        </div>
        <div>
          <dt className="label">Change</dt>
          <dd className="num">{phpDelta(change)}</dd>
        </div>
      </dl>

      {groups.length > 0 && (
        <p className="ocard-groups">
          {groups.map((c) => {
            const text = <><span className={`status-dot g-${c.group}`} aria-hidden="true" />{count(c.rows)} {c.label.charAt(0).toLowerCase() + c.label.slice(1)}</>;
            // These counts are the whole office's: link them only when all of its lines are in the portal.
            return query ? <Link key={c.group} to={filter(c.group)}>{text}</Link> : <span key={c.group}>{text}</span>;
          })}
        </p>
      )}
      <p className="ocard-note">
        Named projects{f ? <>: {count(f.nep_records)} in the NEP, {count(f.hgab3_records)} in the House bill</> : null}.
        {wholeNep != null && <> The whole office in the NEP: {php(wholeNep)}.</>}
        {unconfirmed > 0 && <> Includes {plural(unconfirmed, 'unconfirmed match', 'unconfirmed matches')} ({php(f?.annotations?.unconfirmed_php)}).</>}
        {held > 0 && <> {plural(held, 'line')} whose two versions name different offices {held === 1 ? 'is' : 'are'} not in these figures.</>}{' '}
        <Link to={`/gaa#${office.id}`}>Its budget each year since 2020 →</Link>
      </p>

      {!query && lines > 0 && (
        <Split printed={printed} portalKeys={portalKeys} nep={f?.nep_php ?? null} house={f?.hgab3_php ?? null} portalLink={filter()} />
      )}

      <div className="ocard-districts">
        <p className="label">
          {districts.length === 1 ? 'Legislative district it serves' : `${districts.length} legislative districts it serves`}
          {office.tier === 'B' && <> · shared, not split</>}
        </p>
        <ul>
          {districts.map((d) => <District key={d.id} row={d} />)}
        </ul>
      </div>

      {!query && office.projects_url && (
        <p className="small">
          This portal lists only this office’s lines that name its place. <External href={office.projects_url}>All of them</External>
        </p>
      )}
    </article>
  );
}

interface SplitProps {
  printed: string;
  portalKeys: ReadonlySet<string>;
  /** The office figures above, to check the parts against. */
  nep: number | null;
  house: number | null;
  /** The project list, narrowed to this office's lines in the portal. */
  portalLink: string;
}

function Split({ printed, portalKeys, nep, house, portalLink }: SplitProps) {
  const { client, config } = usePortal();
  const [state, setState] = useState<Async<{ rows: ProjectRow[]; truncated: boolean }>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    client.allProjects('dpwh', { office: printed }).then(
      ({ rows, truncated }) => live && setState({ status: 'ready', value: { rows, truncated } }),
      (error) => live && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      live = false;
    };
  }, [client, printed]);

  const api = client.href('/datasets/dpwh/projects', { office: printed });
  if (state.status === 'loading') return <p className="ocard-note">Splitting this office’s lines by place…</p>;
  if (state.status === 'error') {
    return <p className="ocard-note">This office’s lines could not be loaded to split them by place: {state.error.message}. <External href={api}>The API request</External></p>;
  }

  const alsoServed = config.scope.alsoServed ?? [];
  const name = shortNameOf(config);
  const { parts, total } = splitOffice(state.value.rows, portalKeys, printed, name, alsoServed);
  const unplacedLabel =
    alsoServed.length === 1 ? `Names neither ${name} nor ${alsoServed[0].label}` : alsoServed.length ? 'Names none of these places' : `Does not name ${name}`;
  const reconciled = total.nep.php === nep && total.house.php === house;

  return (
    <div className="osplit">
      <p className="label">This office’s lines, by the place each title names</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Place</th>
            <th scope="col" className="num">NEP</th>
            <th scope="col" className="num">House bill</th>
            <th scope="col" className="num">Change</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <PartRow key={p.kind + p.label} part={p} label={p.kind === 'unplaced' ? unplacedLabel : p.label} portalLink={portalLink} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">
              <span className="osplit-name">Whole office</span>
              <span className="small muted">{plural(total.rows, 'line')}</span>
            </th>
            <Amounts nep={total.nep} house={total.house} />
          </tr>
        </tfoot>
      </table>
      <p className="ocard-note">
        DPWH gives this money to the office, not to a city: this split is this portal’s reading of each project’s title.{' '}
        {name}’s lines are the ones in this portal{alsoServed.length > 0 && <>; a line is counted for {alsoServed.map((p) => p.label).join(' or ')} when its title names it and no other place</>}.
        Lines that name no single place, such as roads and bridges listed by road name or the office’s own line, are listed, not assigned.
        NEP and House bill are compared, never added.{' '}
        {reconciled ? (
          <>The parts add up to the office figures above ({phpFull(nep)} NEP, {phpFull(house)} House bill).</>
        ) : (
          <>The lines listed under this office add up to {phpFull(total.nep.php)} NEP and {phpFull(total.house.php)} House bill, not the office figures above, which hold some lines out.</>
        )}
        {state.value.truncated && <> The API returned only part of this office’s lines, so the split is incomplete.</>}{' '}
        <External href={api}>The API request</External>
      </p>
    </div>
  );
}

function PartRow({ part, label, portalLink }: { part: SplitPart; label: string; portalLink: string }) {
  const n = part.rows.length;
  return (
    <tr className={`osplit-${part.kind}`}>
      <th scope="row">
        <span className="osplit-name">
          {label}
          {part.kind === 'portal' && <span className="tag">In this portal</span>}
        </span>
        <span className="small">
          {part.kind === 'portal' ? <Link to={portalLink}>{plural(n, 'line')} →</Link> : plural(n, 'line')}
          {part.groups.length > 0 && (
            <span className="muted">
              {' · '}
              {part.groups.map((g) => `${count(g.rows)} ${g.label.charAt(0).toLowerCase() + g.label.slice(1)}`).join(' · ')}
            </span>
          )}
        </span>
        {part.kind !== 'portal' && n > 0 && (
          <details className="osplit-list">
            <summary>{part.kind === 'place' ? `List the ${plural(n, 'line')}` : `Which ${n === 1 ? 'line' : `${count(n)} lines`}`}</summary>
            <ul>
              {part.rows.map((r) => (
                <li key={r.id}>
                  <External href={r.url}>{r.title}</External>
                  <span className="small muted">
                    NEP {php(r.nep_php)} · House bill {php(r.house_php)} · {r.group_label.charAt(0).toLowerCase() + r.group_label.slice(1)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </th>
      <Amounts nep={part.nep} house={part.house} />
    </tr>
  );
}

function Amounts({ nep, house }: Pick<SplitPart, 'nep' | 'house'>) {
  const n = nep.rows ? nep.php : null;
  const h = house.rows ? house.php : null;
  return (
    <>
      <td className="num" data-label="NEP">{php(n)}</td>
      <td className="num stat-accent" data-label="House bill">{php(h)}</td>
      <td className="num" data-label="Change">{phpDelta((h ?? 0) - (n ?? 0))}</td>
    </>
  );
}

function District({ row }: { row: DistrictRow }) {
  const rep = row.card?.representative ?? null;
  const portrait = rep?.portrait ?? null;
  return (
    <li className="odistrict">
      {portrait ? (
        <img
          className="odistrict-photo"
          src={portrait.url}
          alt={`Portrait of ${rep?.name ?? row.label}`}
          title={`${portrait.attribution} · ${portrait.license} · ${portrait.source_url}`}
          width="40"
          height="50"
          loading="lazy"
        />
      ) : (
        <span className="odistrict-photo" aria-hidden="true" />
      )}
      <div>
        <p className="odistrict-label">{row.label}</p>
        <p className="small">
          {rep ? rep.name : <span className="muted">No representative listed</span>}
        </p>
        <p className="odistrict-links small">
          {rep?.bills_url && <External href={rep.bills_url}>Bills</External>}
          {row.card && <External href={row.card.url}>District page</External>}
          {row.alsoServedBy.length > 0 && <span className="muted">also served by {row.alsoServedBy.join(', ')}</span>}
        </p>
      </div>
    </li>
  );
}
