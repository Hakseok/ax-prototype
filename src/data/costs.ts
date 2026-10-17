// Virtual unit costs (master/unit-costs.json) with versions added on SET-020 (D-04 overlay).
import { useEffect, useState } from 'react';
import { loadFile } from './loaders';
import { useLocalStore } from './localStore';
import { NOW } from './time';
import { valueAt, versionStore, type ValueVersion } from './versions';

export interface CostItem {
  id: string;
  name: string;
  unit: string;
  group: string;
  value: number;
  versions: ValueVersion[];
}

let base: Promise<{ demoOnly: boolean; items: CostItem[] }> | null = null;
export const loadCostItems = async (): Promise<CostItem[]> => {
  const file = await (base ??= loadFile<{ demoOnly: boolean; items: CostItem[] }>('master/unit-costs.json'));
  const added = versionStore.get().unitCost ?? {};
  return file.items.map((i) => {
    const versions = [...i.versions, ...(added[i.id] ?? [])];
    return { ...i, versions, value: valueAt(versions, NOW) ?? i.value };
  });
};

/** Unit cost resolver for one calculation: cost(id, t) with the version valid at t. */
export const costResolver = async () => {
  const items = new Map((await loadCostItems()).map((i) => [i.id, i]));
  return (id: string, t = NOW): number => {
    const item = items.get(id);
    if (!item) throw new Error(`단가 항목이 없습니다: ${id}`);
    return valueAt(item.versions, t) ?? item.value;
  };
};
export type CostOf = Awaited<ReturnType<typeof costResolver>>;

/** Re-render when unit cost versions change (SET-020). Returns a counter to use as a dependency. */
export const useCostVersion = (): number => {
  const v = useLocalStore(versionStore);
  const [n, setN] = useState(0);
  useEffect(() => setN((x) => x + 1), [v]);
  return n;
};
