// Values that change over time with a start date (unit costs, AX baseline). Each change adds a
// version and a change-log entry; calculations pick the version valid at the time they cover.
import { createLocalStore } from './localStore';
import { changeLogStore } from './records';
import { NOW, formatDateTime, parseTime } from './time';

export interface ValueVersion {
  validFrom: string;
  value: number;
  changedAt: string;
  changedBy: string;
  note: string;
}

/** kind -> item id -> versions added on screens (on top of the mock file). */
export const versionStore = createLocalStore<Record<string, Record<string, ValueVersion[]>>>('versions', {});

export const addVersion = (kind: string, id: string, v: { validFrom: string; value: number; userId: string; note: string }) => {
  const at = formatDateTime(NOW).replace(' ', 'T');
  const entry: ValueVersion = { validFrom: v.validFrom, value: v.value, changedAt: at, changedBy: v.userId, note: v.note };
  versionStore.set((prev) => ({ ...prev, [kind]: { ...(prev[kind] ?? {}), [id]: [...(prev[kind]?.[id] ?? []), entry] } }));
  changeLogStore.set((prev) => [
    ...prev,
    { id: `CLX-${Date.parse(at)}-${prev.length}`, at, userId: v.userId, dataSource: kind, targetId: id, field: `적용 시작일 ${v.validFrom}`, before: '', after: String(v.value) }
  ]);
};

/** The value valid at time t: the latest version whose start is not after t. */
export const valueAt = (versions: { validFrom: string; value: number }[], t: number): number | null => {
  const sorted = [...versions].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  let out: number | null = null;
  for (const v of sorted) if (parseTime(v.validFrom) <= t) out = v.value;
  return out;
};
