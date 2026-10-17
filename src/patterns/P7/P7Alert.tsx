// P7 상세 랜딩형, alert form (COM-020): one alert from a link (?alertId=). One column that also
// reads at phone width (D-08): what happened and where, the value against its limit or the
// collector that stopped, the engine result behind it, the action taken here, and the log.
import { useState } from 'react';
import { Alert as Notice, Button, Checkbox, Empty, Input, Skeleton, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { AiResultCard } from '../../components/AiResultCard';
import { formatNumber } from '../../components/KpiCard';
import { formatMoney } from '../../components/money';
import { Panel } from '../../components/Panel';
import { StatusBadge } from '../../components/StatusBadge';
import { button, terms } from '../../config';
import { energyWaste, health } from '../../data/aiEngine';
import { alertActions, useAlerts } from '../../data/alertStore';
import { alertLink, riskFeed } from '../../data/executive';
import { loadCollection, loadCollectors, loadEquipment } from '../../data/loaders';
import { formatDateTime, parseTime } from '../../data/time';
import { allClaims } from '../../data/workflows';
import type { Alert } from '../../data/types';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import { Fact } from './P7Detail';
import '../common/patterns.css';
import './P7.css';

interface P7AlertDefinition {
  badges?: string[];
  param: string;
}

const at = (s: string | null) => (s ? formatDateTime(parseTime(s)) : '-');

export function P7Alert({ entry, def: rawDef, badges, alertId }: TemplateProps & { alertId: string | null }) {
  const def = rawDef as unknown as P7AlertDefinition;
  const app = useApp();
  const link = useShellLink();
  const { alerts, loading } = useAlerts();
  const alert = alerts.find((a) => a.id === alertId);
  const allBadges = [...badges, ...(def.badges ?? [])];
  const back = <Link to={link('COM-010')}>알림 센터</Link>;

  if (!alertId) {
    return (
      <ScreenLayout entry={entry} badges={allBadges} secondary={back}>
        <Empty description="알림 센터나 경영 현황의 리스크에서 알림을 골라 여세요." />
      </ScreenLayout>
    );
  }
  if (loading) return <ScreenLayout entry={entry} badges={allBadges}><Skeleton active /></ScreenLayout>;
  if (!alert) {
    return (
      <ScreenLayout entry={entry} badges={allBadges} secondary={back}>
        <Empty description={`알림 ${alertId}를 찾지 못했습니다. 주소의 알림 번호를 확인하세요.`} />
      </ScreenLayout>
    );
  }
  if (!app.selectedSiteIds.includes(alert.siteId)) {
    return (
      <ScreenLayout entry={entry} badges={allBadges} secondary={back}>
        <Empty description={`이 알림은 ${app.siteName(alert.siteId)} 소속입니다. 사업장 선택을 바꾸거나 권한을 요청하세요.`} />
      </ScreenLayout>
    );
  }
  return (
    <ScreenLayout entry={entry} badges={allBadges} secondary={back}>
      <AlertBody alert={alert} />
    </ScreenLayout>
  );
}

function AlertBody({ alert }: { alert: Alert }) {
  const app = useApp();
  const link = useShellLink();
  const userName = (uid: string | null) => (uid ? app.users.find((u) => u.id === uid)?.name ?? uid : '시스템');
  const { value: ctx } = useAsync(async () => {
    const [risks, claims] = await Promise.all([riskFeed([alert.siteId]), allClaims()]);
    const risk = risks.find((r) => r.id === alert.id);
    const ai = alert.equipmentId && alert.source === 'AI' ? await health(alert.equipmentId) : /압축공기|에너지/.test(alert.title) ? await energyWaste(alert.siteId) : null;
    let collector: { name: string; lastSeen: string; missingFrom: string | null; equipment: string[] } | null = null;
    if (alert.source === '시스템') {
      const [collectors, status, eqs] = await Promise.all([loadCollectors(), loadCollection(), loadEquipment()]);
      const st = status.find((x) => x.status === '중단' && x.siteId === alert.siteId && x.lineId === alert.lineId);
      const c = st && collectors.find((x) => x.id === st.collectorId);
      if (st && c) collector = { name: c.name, lastSeen: st.lastSeen, missingFrom: st.missingFrom, equipment: c.equipmentIds.map((id) => eqs.find((e) => e.id === id)?.name ?? id) };
    }
    return { risk, link: alertLink(alert, claims), ai, collector };
  }, `${alert.id}|${alert.state}`);

  // A system alert points at itself; the place to see 미수신 is the factory status screen.
  const origin = !ctx ? null : ctx.link.to.startsWith('/COM-020') ? { label: '공장 현황에서 미수신 보기', to: link('OPS-010', { site: alert.siteId }) } : { label: `${ctx.link.label}에서 보기`, to: ctx.link.to };
  const impact = ctx?.risk?.impactKrw ? `${formatMoney(ctx.risk.impactKrw[0])}~${formatMoney(ctx.risk.impactKrw[1])} 백만 원 (${terms.badges.demoOnly})` : ctx?.risk ? '금액 환산 대상 아님' : '-';

  return (
    <div className="p7 p7--alert">
      <section className="p7__summary panel">
        <div className="p7__heading">
          <StatusBadge level={alert.grade} />
          <h2 className="p7__title">{alert.title}</h2>
          <Tag bordered className="p7__state">{alert.state}</Tag>
          <span className="p7__spacer" />
          {origin && <Link to={origin.to}>{origin.label}</Link>}
        </div>
        <p className="p7__lead">
          {alert.target} · {alert.detail}
        </p>
        <dl className="p7__facts">
          <Fact label="사업장" value={app.siteName(alert.siteId)} />
          <Fact label="발생" value={at(alert.occurredAt)} />
          <Fact label="출처" value={alert.source === 'AI' ? `AI 탐지 (${terms.badges.virtualEngine})` : alert.source} />
          <Fact label="담당" value={alert.assignee ? userName(alert.assignee) : '지정 전'} />
          {alert.value !== null && <Fact label="값 / 기준" value={`${formatNumber(alert.value, 0)} / ${formatNumber(alert.threshold ?? 0, 0)} ${alert.unit}`} strong />}
          <Fact label="예상 영향" value={impact} strong />
          <Fact label="확인 시각" value={at(alert.ackAt)} />
          <Fact label="조치 완료 시각" value={at(alert.closedAt)} />
        </dl>
      </section>

      {ctx?.collector && (
        <Panel title="수집 상태" caption="이 구간의 값은 0이 아니라 미수신으로 표시합니다">
          <dl className="p7__facts">
            <Fact label="수집 장치" value={ctx.collector.name} />
            <Fact label="마지막 수신" value={at(ctx.collector.lastSeen)} />
            <Fact label="미수신 시작" value={at(ctx.collector.missingFrom)} strong />
            <Fact label="영향 설비" value={`${ctx.collector.equipment.length}대`} />
          </dl>
          <p className="caption p7__list">{ctx.collector.equipment.join(', ')}</p>
        </Panel>
      )}

      {ctx?.ai && (
        <div className="p7__ai">
          <AiResultCard result={ctx.ai} userName={userName} />
          <p className="caption p7__impact">채택·기각은 {ctx.link.label} 화면에서 합니다.</p>
        </div>
      )}

      <ActionPanel alert={alert} />

      <Panel title="처리 기록">
        <table className="data-table">
          <thead>
            <tr>
              <th>시각</th>
              <th>처리</th>
              <th>처리자</th>
              <th>내용</th>
            </tr>
          </thead>
          <tbody>
            {alert.log.map((l, i) => (
              <tr key={`${l.at}-${i}`}>
                <td className="num">{at(l.at)}</td>
                <td>{l.action}</td>
                <td>{userName(l.userId)}</td>
                <td>{l.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ActionPanel({ alert }: { alert: Alert }) {
  const app = useApp();
  const [note, setNote] = useState('');
  const [close, setClose] = useState(false);
  const canEdit = app.hasPermission('편집');
  if (alert.state === '조치 완료') return <Notice type="success" showIcon message={`조치 완료로 닫힌 알림입니다 (${at(alert.closedAt)}).`} />;
  if (!canEdit) return <p className="caption">조회 권한으로 열었습니다. 확인·조치 기록은 편집 권한에서 할 수 있습니다.</p>;
  return (
    <Panel title="처리" caption={alert.state === '미확인' ? '확인하면 담당자로 지정됩니다' : '조치 내용을 남기고, 끝났으면 닫습니다'}>
      <div className="p7__action">
        {alert.state === '미확인' && (
          <Button type="primary" onClick={() => alertActions.acknowledge(alert, app.user.id)}>
            {button('확인')}
          </Button>
        )}
        <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="조치 내용. 예: 현장 확인 결과와 조치한 내용" aria-label="조치 내용" />
        <div className="p7__action-row">
          <Checkbox checked={close} onChange={(e) => setClose(e.target.checked)}>
            조치 완료로 닫기
          </Checkbox>
          <span className="p7__spacer" />
          <Button
            disabled={!note.trim()}
            onClick={() => {
              alertActions.recordAction(alert, app.user.id, note.trim(), close);
              setNote('');
              setClose(false);
            }}
          >
            {button('저장')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
