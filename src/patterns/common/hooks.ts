import { useEffect, useMemo, useState } from 'react';
import { datasets, refs as refLoaders, type DatasetContext, type RefOption } from '../../data/registry';
import type { Row } from '../../data/records';
import { useApp } from '../../shell/AppContext';
import type { RefMaps } from './format';
import type { ColumnDef, FieldDef } from './types';

/** Load a dataset for the current site selection; reloads when its overlay stores change. */
export const useDataset = (name: string, params: Record<string, unknown> | null) => {
  const app = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const ds = datasets[name];
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!ds) return;
    const unsubs = (ds.stores ?? []).map((s) => s.subscribe(() => setVersion((v) => v + 1)));
    return () => unsubs.forEach((u) => u());
  }, [ds]);

  useEffect(() => {
    if (!ds) {
      setError(`데이터 정의가 없습니다: ${name}`);
      return;
    }
    if (params === null) return;
    let alive = true;
    const ctx: DatasetContext = { siteIds: app.selectedSiteIds, params, user: app.user };
    ds.load(ctx)
      .then((r) => alive && (setRows(r), setError(null)))
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, name, key, version, app.selectedSiteIds, app.user]);

  return { rows, error, loading: rows === null && !error, dataset: ds };
};

const refName = (spec: unknown): string | null => (typeof spec === 'string' ? spec : null);

/** Options and id -> label maps for every reference used by the given fields and columns. */
export const useRefs = (fields: FieldDef[], columns: ColumnDef[]) => {
  const app = useApp();
  // Key by the joined names: callers pass new arrays on every render.
  const namesKey = [...new Set([...fields.map((f) => refName(f.options)), ...columns.map((c) => c.ref ?? null)].filter((x): x is string => !!x))]
    .sort()
    .join(',');
  const names = useMemo(() => (namesKey ? namesKey.split(',') : []), [namesKey]);
  const [options, setOptions] = useState<Record<string, RefOption[]>>({});
  useEffect(() => {
    let alive = true;
    const ctx: DatasetContext = { siteIds: app.selectedSiteIds, params: {}, user: app.user };
    Promise.all(names.map(async (n) => [n, refLoaders[n] ? await refLoaders[n](ctx) : []] as const)).then((pairs) => {
      if (alive) setOptions(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [names, app.selectedSiteIds, app.user]);
  const maps = useMemo<RefMaps>(() => Object.fromEntries(Object.entries(options).map(([k, v]) => [k, new Map(v.map((o) => [o.value, o.label]))])), [options]);
  return { options, maps, ready: names.every((n) => n in options) };
};

/** Options of one field: a reference name, a list of strings, or value/label pairs. */
export const fieldOptions = (f: FieldDef, refOptions: Record<string, RefOption[]>): RefOption[] => {
  if (!f.options) return [];
  if (typeof f.options === 'string') return refOptions[f.options] ?? [];
  return f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
};
