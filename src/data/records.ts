// Edits to master records made on P8/P6 screens (D-04). Each dataset keeps an overlay
// of added, updated and deleted records; every change also lands in the change log
// (P8 "변경 이력") and the audit log (SYS-090).
import { createLocalStore, type LocalStore } from './localStore';
import { NOW, formatDateTime } from './time';

export type Row = Record<string, unknown> & { id: string };

interface Overlay {
  added: Record<string, Row>;
  updated: Record<string, Partial<Row>>;
  deleted: string[];
}

export interface ChangeLogEntry {
  id: string;
  at: string;
  userId: string;
  dataSource: string;
  targetId: string;
  field: string;
  before: string;
  after: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  action: '신규' | '수정' | '삭제' | '로그인';
  screenId: string;
  target: string;
  detail: string;
}

const overlays = new Map<string, LocalStore<Overlay>>();
export const overlayStore = (dataset: string): LocalStore<Overlay> => {
  let s = overlays.get(dataset);
  if (!s) {
    s = createLocalStore<Overlay>(`records.${dataset}`, { added: {}, updated: {}, deleted: [] });
    overlays.set(dataset, s);
  }
  return s;
};
export const changeLogStore = createLocalStore<ChangeLogEntry[]>('change-log', []);
export const auditStore = createLocalStore<AuditEntry[]>('audit-log', []);

const stamp = () => formatDateTime(NOW).replace(' ', 'T');
const show = (v: unknown): string => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));

export const applyOverlay = (dataset: string, rows: Row[]): Row[] => {
  const o = overlayStore(dataset).get();
  const deleted = new Set(o.deleted);
  return [
    ...rows.filter((r) => !deleted.has(r.id)).map((r) => (o.updated[r.id] ? { ...r, ...o.updated[r.id] } : r)),
    ...Object.values(o.added).filter((r) => !deleted.has(r.id))
  ];
};

export interface SaveContext {
  dataset: string;
  screenId: string;
  userId: string;
  /** Field labels for the change log, e.g. { multiplier: '배율' }. */
  labels: Record<string, string>;
  /** Display text of the record for logs. */
  name: string;
}

/** Save a new or existing record. Returns the changed field names. */
export const saveRecord = (ctx: SaveContext, before: Row | null, values: Row): string[] => {
  const store = overlayStore(ctx.dataset);
  const at = stamp();
  const changed = Object.keys(values).filter((k) => show(values[k]) !== show(before?.[k]));
  if (before && changed.length === 0) return [];
  store.set((o) => {
    if (!before || o.added[values.id]) return { ...o, added: { ...o.added, [values.id]: { ...(o.added[values.id] ?? {}), ...values } } };
    return { ...o, updated: { ...o.updated, [values.id]: { ...(o.updated[values.id] ?? {}), ...values } } };
  });
  const entries: ChangeLogEntry[] = (before ? changed : ['id']).map((f, i) => ({
    id: `CLX-${Date.parse(at)}-${changeLogStore.get().length + i}`,
    at,
    userId: ctx.userId,
    dataSource: ctx.dataset,
    targetId: values.id,
    field: before ? ctx.labels[f] ?? f : '신규 등록',
    before: before ? show(before[f]) : '',
    after: before ? show(values[f]) : ctx.name
  }));
  changeLogStore.set((prev) => [...prev, ...entries]);
  auditStore.set((prev) => [
    ...prev,
    {
      id: `AUX-${prev.length + 1}`, at, userId: ctx.userId, action: before ? '수정' : '신규', screenId: ctx.screenId, target: ctx.name,
      detail: before ? changed.map((f) => ctx.labels[f] ?? f).join(', ') : '신규 등록'
    }
  ]);
  return changed;
};

export const deleteRecord = (ctx: SaveContext, row: Row) => {
  const at = stamp();
  overlayStore(ctx.dataset).set((o) => ({ ...o, deleted: [...o.deleted, row.id] }));
  changeLogStore.set((prev) => [
    ...prev,
    { id: `CLX-${Date.parse(at)}-${prev.length}`, at, userId: ctx.userId, dataSource: ctx.dataset, targetId: row.id, field: '삭제', before: ctx.name, after: '' }
  ]);
  auditStore.set((prev) => [...prev, { id: `AUX-${prev.length + 1}`, at, userId: ctx.userId, action: '삭제', screenId: ctx.screenId, target: ctx.name, detail: '' }]);
};
