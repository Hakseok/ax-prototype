// Work orders (MNT-020) and claims (QUA-030) = mock records + changes made on screens
// (browser storage overlay, D-04). Every screen and the ROI ledger read them through here.
import { useEffect, useMemo, useState } from 'react';
import { alertActions, mergeAlerts } from './alertStore';
import { createLocalStore, useLocalStore } from './localStore';
import { loadAlerts, loadClaims, loadWorkOrders } from './loaders';
import { NOW, formatDateTime } from './time';
import type { Claim, WorkOrder, WorkOrderLog } from './types';

const stamp = () => formatDateTime(NOW).replace(' ', 'T');

interface Overlay<T> {
  added: T[];
  updated: Record<string, Partial<T> & { log?: WorkOrderLog[] }>;
}

const merge = <T extends { id: string; log: WorkOrderLog[] }>(base: T[], o: Overlay<T>): T[] =>
  [...base, ...o.added].map((r) => {
    const u = o.updated[r.id];
    return u ? { ...r, ...u, log: [...r.log, ...(u.log ?? [])] } : r;
  });

// ---------- work orders ----------
export const workOrderStore = createLocalStore<Overlay<WorkOrder>>('work-orders', { added: [], updated: {} });
export const allWorkOrders = async (): Promise<WorkOrder[]> => merge(await loadWorkOrders(), workOrderStore.get());

const updateWo = (wo: WorkOrder, patch: Partial<WorkOrder>, entry: WorkOrderLog) =>
  workOrderStore.set((o) => {
    const cur = o.updated[wo.id] ?? {};
    return { ...o, updated: { ...o.updated, [wo.id]: { ...cur, ...patch, log: [...(cur.log ?? []), entry] } } };
  });

export const workOrderActions = {
  /** New request, e.g. from an adopted AI result on MNT-011. Returns the new id. */
  request(input: Pick<WorkOrder, 'siteId' | 'lineId' | 'equipmentId' | 'type' | 'title' | 'failureMode' | 'aiResultId'>, userId: string, note: string): string {
    const at = stamp();
    const n = workOrderStore.get().added.length + 1;
    const id = `WO-${at.slice(2, 10).replace(/-/g, '')}-S${String(n).padStart(3, '0')}`;
    const wo: WorkOrder = {
      ...input, id, stage: '요청', requestedAt: at, requestedBy: userId, approvedAt: null, startedAt: null, completedAt: null,
      laborHours: 0, partsKrw: 0, avoidedDowntimeMin: null, log: [{ at, userId, action: '요청', note }]
    };
    workOrderStore.set((o) => ({ ...o, added: [...o.added, wo] }));
    return id;
  },
  approve: (wo: WorkOrder, userId: string, note = '') => updateWo(wo, { stage: '승인', approvedAt: stamp() }, { at: stamp(), userId, action: '승인', note }),
  reject: (wo: WorkOrder, userId: string, reason: string) => updateWo(wo, { stage: '완료', completedAt: stamp() }, { at: stamp(), userId, action: '반려', note: reason }),
  start: (wo: WorkOrder, userId: string) => updateWo(wo, { stage: '작업 중', startedAt: stamp() }, { at: stamp(), userId, action: '작업 시작', note: '' }),
  complete: (wo: WorkOrder, userId: string, laborHours: number, partsKrw: number, note: string) =>
    updateWo(wo, { stage: '완료', completedAt: stamp(), laborHours, partsKrw }, { at: stamp(), userId, action: '완료', note }),
  /** Effect check: records the downtime the order avoided (predictive orders). */
  confirmEffect: (wo: WorkOrder, userId: string, avoidedDowntimeMin: number | null, note: string) =>
    updateWo(wo, { stage: '효과 확인', avoidedDowntimeMin }, { at: stamp(), userId, action: '효과 확인', note }),
  reset: () => workOrderStore.reset()
};

export const useWorkOrders = () => {
  const overlay = useLocalStore(workOrderStore);
  const [base, setBase] = useState<WorkOrder[] | null>(null);
  useEffect(() => void loadWorkOrders().then(setBase), []);
  return useMemo(() => (base ? merge(base, overlay) : null), [base, overlay]);
};

// ---------- claims ----------
export const claimStore = createLocalStore<Overlay<Claim>>('claims', { added: [], updated: {} });
export const allClaims = async (): Promise<Claim[]> => merge(await loadClaims(), claimStore.get());

export const claimActions = {
  /** Move a claim to `stage`; the log records what was done (e.g. 원인 기록) and the note. */
  advance(c: Claim, userId: string, stage: Claim['stage'], action: string, note: string) {
    claimStore.set((o) => {
      const cur = o.updated[c.id] ?? {};
      return { ...o, updated: { ...o.updated, [c.id]: { ...cur, stage, log: [...(cur.log ?? []), { at: stamp(), userId, action, note }] } } };
    });
  },
  reset: () => claimStore.reset()
};

/**
 * Close the open alerts a finished order or claim answers: AI alerts of the same equipment for a
 * work order, alerts naming the claim id for a claim. The alert log records which record closed it.
 */
export const closeLinkedAlerts = async (record: WorkOrder | Claim, userId: string) => {
  const open = mergeAlerts(await loadAlerts()).filter((a) => a.state !== '조치 완료');
  const isOrder = 'equipmentId' in record;
  const linked = open.filter((a) => (isOrder ? a.equipmentId === record.equipmentId && a.source === 'AI' : a.detail.includes(record.id)));
  for (const a of linked) alertActions.recordAction(a, userId, `${record.id} ${isOrder ? '정비 완료' : '클레임 종결'}`, true);
  return linked.length;
};

export const useClaims = () => {
  const overlay = useLocalStore(claimStore);
  const [base, setBase] = useState<Claim[] | null>(null);
  useEffect(() => void loadClaims().then(setBase), []);
  return useMemo(() => (base ? merge(base, overlay) : null), [base, overlay]);
};
