// Filter values: defaults, URL encoding (link sharing) and conversion to dataset params.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DAY, NOW, addMonths, formatDate, monthOf, parseTime, startOfDay, startOfMonth } from '../../data/time';
import type { Row } from '../../data/records';
import type { FieldDef } from './types';

export type FilterValue = string | string[] | number | null;
export type FilterValues = Record<string, FilterValue>;

const today = formatDate(NOW);

export const defaultValue = (f: FieldDef): FilterValue => {
  const d = f.default;
  if (f.control === 'dateRange') {
    const from = {
      today,
      thisWeek: formatDate(startOfDay(NOW) - ((new Date(NOW).getUTCDay() + 6) % 7) * DAY),
      last7days: formatDate(startOfDay(NOW) - 6 * DAY),
      last14days: formatDate(startOfDay(NOW) - 13 * DAY),
      last30days: formatDate(startOfDay(NOW) - 29 * DAY),
      thisMonth: formatDate(startOfMonth(NOW)),
      thisYear: `${today.slice(0, 4)}-01-01`
    }[String(d ?? 'today')] ?? today;
    return [from, today];
  }
  if (f.control === 'date') return d === undefined || d === 'today' ? today : String(d);
  if (f.control === 'month') return d === undefined || d === 'thisMonth' ? monthOf(NOW) : String(d);
  if (f.control === 'year') return d === undefined || d === 'thisYear' ? Number(today.slice(0, 4)) : Number(d);
  if (f.control === 'multiSelect') return Array.isArray(d) ? (d as string[]) : [];
  return d === undefined ? null : (d as FilterValue);
};

const encode = (f: FieldDef, v: FilterValue): string | null => {
  if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return null;
  if (f.control === 'dateRange' && Array.isArray(v)) return `${v[0]}~${v[1]}`;
  return Array.isArray(v) ? v.join(',') : String(v);
};

const decode = (f: FieldDef, s: string): FilterValue => {
  if (f.control === 'dateRange') {
    const [a, b] = s.split('~');
    return [a, b ?? a];
  }
  if (f.control === 'multiSelect') return s.split(',').filter(Boolean);
  if (f.control === 'year' || f.control === 'number') return Number(s);
  return s;
};

/** Applied filter values, kept in the URL as f.<field> so a copied link reproduces the query. */
export const useFilterState = (filters: FieldDef[]) => {
  const [params, setParams] = useSearchParams();
  const values = useMemo<FilterValues>(() => {
    const out: FilterValues = {};
    for (const f of filters) {
      const raw = params.get(`f.${f.field}`);
      out[f.field] = raw === null ? defaultValue(f) : decode(f, raw);
    }
    return out;
  }, [filters, params]);

  const apply = useCallback(
    (next: FilterValues) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        for (const f of filters) {
          const enc = encode(f, next[f.field] ?? null);
          const def = encode(f, defaultValue(f));
          if (enc === null || enc === def) p.delete(`f.${f.field}`);
          else p.set(`f.${f.field}`, enc);
        }
        return p;
      });
    },
    [filters, setParams]
  );
  return { values, apply };
};

/** Dataset params: periods become [from, toExclusive) in ms. */
export const toParams = (filters: FieldDef[], values: FilterValues): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const f of filters) {
    const v = values[f.field];
    if (v === null || v === undefined) continue;
    if (f.control === 'dateRange' && Array.isArray(v)) out[f.field] = [parseTime(v[0]), parseTime(v[1]) + DAY];
    else if (f.control === 'date') out[f.field] = [parseTime(String(v)), parseTime(String(v)) + DAY];
    else if (f.control === 'month') out[f.field] = [parseTime(String(v)), addMonths(parseTime(String(v)), 1)];
    else out[f.field] = v;
  }
  return out;
};

/** Client-side filtering for every filter the dataset does not handle itself. */
export const applyFilters = (rows: Row[], filters: FieldDef[], values: FilterValues, handled: string[] = []): Row[] => {
  let out = rows;
  for (const f of filters) {
    if (handled.includes(f.field)) continue;
    const v = values[f.field];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (f.control === 'dateRange' && Array.isArray(v)) {
      const from = parseTime(v[0]);
      const to = parseTime(v[1]) + DAY;
      out = out.filter((r) => {
        const t = r[f.field] ? parseTime(String(r[f.field])) : NaN;
        return t >= from && t < to;
      });
    } else if (f.control === 'text') {
      const q = String(v).toLowerCase();
      const fields = f.fields ?? Object.keys(out[0] ?? {});
      out = out.filter((r) => fields.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    } else if (f.control === 'multiSelect' && Array.isArray(v)) {
      out = out.filter((r) => {
        const cell = r[f.field];
        return Array.isArray(cell) ? cell.some((c) => v.includes(String(c))) : v.includes(String(cell));
      });
    } else {
      out = out.filter((r) => {
        const cell = r[f.field];
        return Array.isArray(cell) ? cell.map(String).includes(String(v)) : String(cell) === String(v);
      });
    }
  }
  return out;
};

export { today as TODAY };
