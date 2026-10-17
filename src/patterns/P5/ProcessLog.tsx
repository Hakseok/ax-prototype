import { formatDateTime, parseTime } from '../../data/time';
import type { WorkOrderLog } from '../../data/types';
import { useApp } from '../../shell/AppContext';

/** Process log of a record: when, who, what, note (guide 3, P5). Newest last, as it happened. */
export function ProcessLog({ log }: { log: WorkOrderLog[] }) {
  const app = useApp();
  const user = (id: string | null) => (id ? app.users.find((u) => u.id === id)?.name ?? id : '시스템');
  return (
    <section className="p5__log">
      <h3 className="p5__h">처리 기록</h3>
      <ol className="timeline">
        {log.map((l, i) => (
          <li key={`${l.at}-${i}`} className="timeline__item">
            <span className="caption num">{formatDateTime(parseTime(l.at))}</span>
            <span className="timeline__action">{l.action}</span>
            <span>
              {user(l.userId)}
              {l.note && <span className="caption"> · {l.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
