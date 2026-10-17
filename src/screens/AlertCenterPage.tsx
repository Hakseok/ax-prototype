// COM-010 알림 센터 as a page (direct link). The drawer is its usual form; both use the same list.
// Exception screen (structure rule 1): the page adds the alert history timeline next to the list —
// what happened, who acknowledged it and what was done — which no pattern template draws.
import { useState } from 'react';
import { Segmented, Skeleton, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { alertChangesStore } from '../data/alertStore';
import { alertHistory } from '../data/executive';
import { useLocalStore } from '../data/localStore';
import { periodOf, type PeriodKey } from '../data/period';
import { formatDateTime, parseTime } from '../data/time';
import { useAsync } from '../patterns/common/useAsync';
import { AlertList } from '../shell/AlertCenter';
import { useApp } from '../shell/AppContext';
import { useShellLink } from '../shell/links';
import { ScreenLayout } from '../shell/ScreenLayout';
import type { ScreenEntry } from '../shell/menu';
import './AlertCenterPage.css';

type Show = 'all' | 'critical' | 'closed';
const at = (s: string | null) => (s ? formatDateTime(parseTime(s)).slice(5) : '-');

export function AlertCenterPage({ entry }: { entry: ScreenEntry }) {
  const app = useApp();
  const link = useShellLink();
  const changes = useLocalStore(alertChangesStore);
  const [range, setRange] = useState<PeriodKey>('last30days');
  const [show, setShow] = useState<Show>('all');
  const p = periodOf(range);
  const { value: rows } = useAsync(() => alertHistory(app.selectedSiteIds, p.from, p.to), `${app.selectedSiteIds}|${range}|${JSON.stringify(changes)}`);
  const shown = (rows ?? []).filter((r) => show === 'all' || (show === 'critical' ? r.grade === 'critical' : r.state === '조치 완료'));
  const userName = (id: string | null) => (id ? app.users.find((u) => u.id === id)?.name ?? id : '');

  return (
    <ScreenLayout entry={entry} bodyMode="fit">
      <div className="alert-page">
        <Panel className="alert-page__open" title="처리 중인 알림" caption="상단 바 알림 아이콘의 드로어와 같은 목록">
          <div className="alert-page__list">
            <AlertList />
          </div>
        </Panel>
        <Panel
          className="alert-page__history"
          title="알림·조치 이력"
          caption={`${p.label} · ${rows ? `${rows.length}건` : ''}`}
          extra={
            <span className="alert-page__filters">
              <Segmented size="small" value={range} onChange={(v) => setRange(v as PeriodKey)} options={[{ value: 'last30days', label: '최근 30일' }, { value: 'thisMonth', label: '이번 달' }, { value: 'thisYear', label: '올해' }]} />
              <Segmented size="small" value={show} onChange={(v) => setShow(v as Show)} options={[{ value: 'all', label: '전체' }, { value: 'critical', label: '긴급' }, { value: 'closed', label: '조치 완료' }]} />
            </span>
          }
        >
          {!rows ? (
            <Skeleton active />
          ) : (
            <ol className="timeline alert-page__timeline">
              {shown.map((r) => (
                <li key={r.id} className="timeline__item alert-page__item">
                  <span className="caption num">{at(r.occurredAt)}</span>
                  <span className="alert-page__body">
                    <span className="alert-page__line">
                      <StatusBadge level={r.grade} />
                      <strong>{r.title}</strong>
                      <span className="caption">
                        {app.siteName(r.siteId)} · {r.target}
                      </span>
                      <Tag bordered>{r.state}</Tag>
                      <Link to={link('COM-020', { site: r.siteId, alertId: r.id })}>상세</Link>
                    </span>
                    <span className="caption">
                      확인 {at(r.ackAt)} · 조치 완료 {at(r.closedAt)}
                      {r.action && ` · ${userName(r.actor)} "${r.action}"`}
                    </span>
                  </span>
                </li>
              ))}
              {!shown.length && <li className="caption">조건에 맞는 알림이 없습니다.</li>}
            </ol>
          )}
        </Panel>
      </div>
    </ScreenLayout>
  );
}
