/**
 * Splits a shared DPWH office's 2027 lines by the place each title names, for
 * an office this portal holds only part of (Las Piñas, whose office also
 * serves Muntinlupa).
 *
 * The documents give the money to the office, not to a city, so this is the
 * portal's own reading of the titles, and the card says so. Every line lands
 * in exactly one part:
 * - "portal": the line is in this portal (its scope brought it in);
 * - "place": its title names exactly one of `alsoServed`;
 * - "unplaced": its title names none of them, more than one, or the office
 *   itself (the office's own line). These are listed, never assigned.
 * Amounts are the API's, row for row; a part's sums are per version, never
 * added across versions.
 */
import type { PortalConfig } from '../config';
import type { BridgeGroup, ProjectRow } from '../api/types';
import { BRIDGE_GROUPS } from '../api/types';
import { projectKey } from './scope';

export interface SplitPart {
  kind: 'portal' | 'place' | 'unplaced';
  label: string;
  rows: ProjectRow[];
  nep: { rows: number; php: number };
  house: { rows: number; php: number };
  /** Rows per status, in the API's status order. */
  groups: { group: BridgeGroup; label: string; rows: number }[];
}

export interface OfficeSplit {
  parts: SplitPart[];
  total: Pick<SplitPart, 'nep' | 'house'> & { rows: number };
}

/** Lowercase, accents and punctuation dropped: "Las Piñas-Muntinlupa" → "las pinas muntinlupa". */
const fold = (s: string) =>
  ` ${s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Every word of `q` appears in the title, as whole words. */
const names = (title: string, q: string) => fold(q).trim().split(' ').every((w) => title.includes(` ${w} `));

export function splitOffice(
  rows: readonly ProjectRow[],
  portalKeys: ReadonlySet<string>,
  office: string,
  portalLabel: string,
  alsoServed: NonNullable<PortalConfig['scope']['alsoServed']>,
): OfficeSplit {
  const officeName = fold(office);
  const portal: ProjectRow[] = [];
  const byPlace = new Map<string, ProjectRow[]>(alsoServed.map((p) => [p.label, []]));
  const unplaced: ProjectRow[] = [];

  for (const row of rows) {
    if (portalKeys.has(projectKey(row.dataset, row.id))) {
      portal.push(row);
      continue;
    }
    const title = fold(row.title);
    const matched = title.includes(officeName) ? [] : alsoServed.filter((p) => names(title, p.q ?? p.label));
    if (matched.length === 1) byPlace.get(matched[0].label)!.push(row);
    else unplaced.push(row);
  }

  const parts = [
    part('portal', portalLabel, portal),
    ...alsoServed.map((p) => part('place', p.label, byPlace.get(p.label)!)),
    part('unplaced', 'Names none of these places', unplaced),
  ].filter((p) => p.kind === 'portal' || p.rows.length > 0);
  return {
    parts,
    total: {
      rows: rows.length,
      nep: sum(rows, 'nep_php'),
      house: sum(rows, 'house_php'),
    },
  };
}

function part(kind: SplitPart['kind'], label: string, rows: ProjectRow[]): SplitPart {
  const counts = new Map<BridgeGroup, { label: string; rows: number }>();
  for (const r of rows) {
    const c = counts.get(r.bridge_group) ?? { label: r.group_label, rows: 0 };
    c.rows++;
    counts.set(r.bridge_group, c);
  }
  return {
    kind,
    label,
    rows: [...rows].sort((a, b) => (b.house_php ?? b.nep_php ?? 0) - (a.house_php ?? a.nep_php ?? 0) || a.title.localeCompare(b.title)),
    nep: sum(rows, 'nep_php'),
    house: sum(rows, 'house_php'),
    groups: BRIDGE_GROUPS.flatMap((g) => {
      const c = counts.get(g);
      return c ? [{ group: g, ...c }] : [];
    }),
  };
}

function sum(rows: readonly ProjectRow[], field: 'nep_php' | 'house_php') {
  let n = 0;
  let php = 0;
  for (const r of rows) {
    const v = r[field];
    if (v != null) {
      n++;
      php += v;
    }
  }
  return { rows: n, php };
}
