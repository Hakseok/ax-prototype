// Alerts = mock alerts + actions taken on screens (acknowledge, action record).
// One store so the alert center, COM-020 and every screen that lists alerts agree.
// AI results are judged (채택·기각) through the AI engine's decision store, not here.
import { useEffect, useMemo, useState } from 'react';
import { loadAlerts } from './loaders';
import { createLocalStore, useLocalStore } from './localStore';
import { NOW, formatDateTime } from './time';
import type { Alert, AlertLogEntry } from './types';

interface AlertChange {
  state?: Alert['state'];
  assignee?: string | null;
  ackAt?: string | null;
  closedAt?: string | null;
  log?: AlertLogEntry[];
}

const changes = createLocalStore<Record<string, AlertChange>>('alert-changes', {});

// Screen time is frozen at company "now".
const nowStamp = () => formatDateTime(NOW).replace(' ', 'T');

const merge = (a: Alert, c?: AlertChange): Alert => (c ? { ...a, ...c, log: [...a.log, ...(c.log ?? [])] } : a);

export const alertChangesStore = changes;
/** Base alerts with the current screen actions applied (non-hook form for datasets). */
export const mergeAlerts = (base: Alert[]): Alert[] => base.map((a) => merge(a, changes.get()[a.id]));

const update = (alert: Alert, patch: Omit<AlertChange, 'log'>, entry: AlertLogEntry) => {
  changes.set((prev) => {
    const cur = prev[alert.id] ?? {};
    return { ...prev, [alert.id]: { ...cur, ...patch, log: [...(cur.log ?? []), entry] } };
  });
};

export const alertActions = {
  acknowledge(alert: Alert, userId: string) {
    if (alert.state !== '미확인') return;
    const at = nowStamp();
    update(alert, { state: '확인', assignee: alert.assignee ?? userId, ackAt: at }, { at, userId, action: '확인', note: '' });
  },
  recordAction(alert: Alert, userId: string, note: string, close: boolean) {
    const at = nowStamp();
    const patch: Omit<AlertChange, 'log'> = { assignee: alert.assignee ?? userId };
    if (alert.state === '미확인') Object.assign(patch, { ackAt: at });
    patch.state = close ? '조치 완료' : '확인';
    if (close) patch.closedAt = at;
    update(alert, patch, { at, userId, action: '조치', note });
  },
  reset() {
    changes.reset();
  }
};

/** All alerts with screen actions applied, newest first. */
export const useAlerts = (): { alerts: Alert[]; loading: boolean } => {
  const [base, setBase] = useState<Alert[] | null>(null);
  const overlay = useLocalStore(changes);
  useEffect(() => {
    let alive = true;
    loadAlerts().then((a) => alive && setBase(a));
    return () => {
      alive = false;
    };
  }, []);
  const alerts = useMemo(
    () => (base ?? []).map((a) => merge(a, overlay[a.id])).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0)),
    [base, overlay]
  );
  return { alerts, loading: base === null };
};
