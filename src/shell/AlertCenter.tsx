import { useMemo, useState } from 'react';
import { Button, Drawer, Empty, Segmented } from 'antd';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { alertActions, useAlerts } from '../data/alertStore';
import { NOW, formatDate, formatDateTime, formatTime, parseTime, type Alert, type Grade } from '../data';
import { useApp } from './AppContext';
import { useShellLink } from './links';
import './AlertCenter.css';

type Filter = 'all' | Grade;

/** Time only for today, date and time otherwise. */
const shortTime = (at: string) => {
  const t = parseTime(at);
  return formatDate(t) === formatDate(NOW) ? formatTime(t) : formatDateTime(t);
};
const TABS: [Filter, string][] = [['all', '전체'], ['critical', '긴급'], ['warning', '주의'], ['info', '참고']];

/** Active alerts (not yet closed) of the selected sites, newest first. */
export const useActiveAlerts = () => {
  const app = useApp();
  const { alerts } = useAlerts();
  return useMemo(
    () => alerts.filter((a) => a.state !== '조치 완료' && app.selectedSiteIds.includes(a.siteId)),
    [alerts, app.selectedSiteIds]
  );
};

export function AlertList({ compact = false }: { compact?: boolean }) {
  const link = useShellLink();
  const active = useActiveAlerts();
  const [filter, setFilter] = useState<Filter>('all');
  const count = (f: Filter) => active.filter((a) => f === 'all' || a.grade === f).length;
  const shown = active.filter((a) => filter === 'all' || a.grade === filter);
  const unread = active.filter((a) => a.state === '미확인').length;

  return (
    <div className={`alert-list${compact ? ' alert-list--compact' : ''}`}>
      <div className="alert-list__summary caption">
        미확인 <span className="num alert-list__count">{unread}</span>건 · 처리 중 <span className="num">{active.length - unread}</span>건 · <Link to={link('COM-010')}>알림·조치 이력</Link>
      </div>
      <Segmented
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        options={TABS.map(([value, label]) => ({ value, label: `${label} ${count(value)}` }))}
      />
      <div className="alert-list__items">
        {shown.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<>처리할 알림이 없습니다. 지난 알림은 <Link to={link('COM-010')}>알림·조치 이력</Link>에서 봅니다.</>} />}
        {shown.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const app = useApp();
  const link = useShellLink();
  const canEdit = app.hasPermission('편집');
  const acked = alert.state !== '미확인';
  const lastLog = alert.log[alert.log.length - 1];

  return (
    <article className={`alert-card${acked ? ' alert-card--acked' : ''}`}>
      <div className="alert-card__head">
        <StatusBadge level={alert.grade} />
        <span className="caption">{alert.source}</span>
        <span className="caption">{app.siteName(alert.siteId)}</span>
        <span className="alert-card__spacer" />
        <span className="caption num">{shortTime(alert.occurredAt)}</span>
      </div>
      <div className="alert-card__title">{alert.title}</div>
      <div className="alert-card__detail">{alert.detail}</div>
      <div className="alert-card__actions">
        <Link className="alert-card__link" to={link('COM-020', { alertId: alert.id })}>
          상세 보기
        </Link>
        <span className="alert-card__spacer" />
        {canEdit && !acked && (
          <Button size="small" onClick={() => alertActions.acknowledge(alert, app.user.id)}>
            확인
          </Button>
        )}
      </div>
      {acked && lastLog && lastLog.action !== '발생' && (
        <div className="caption">
          {lastLog.action} · {lastLog.userId ? app.users.find((u) => u.id === lastLog.userId)?.name : ''}{' '}
          <span className="num">{shortTime(lastLog.at)}</span>
        </div>
      )}
    </article>
  );
}

export function AlertCenterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer title="알림 센터" placement="right" width="var(--shell-drawer-w)" open={open} onClose={onClose} destroyOnHidden={false}>
      <AlertList />
    </Drawer>
  );
}
