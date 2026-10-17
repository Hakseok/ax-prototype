// P7 상세 랜딩형. MNT-011 (this file): one equipment from a link (?id=). One column: summary, AI diagnosis
// with its evidence and decision, signal trend against the normal range, health trend,
// a past case of the same failure, maintenance and stop history, and the next action.
import { useMemo } from 'react';
import { Alert as Notice, Empty, Segmented, Skeleton } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AiResultCard } from '../../components/AiResultCard';
import { Chart } from '../../components/Chart';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { formatNumber } from '../../components/KpiCard';
import { formatMoney } from '../../components/money';
import { Panel } from '../../components/Panel';
import { StatusBadge } from '../../components/StatusBadge';
import { terms } from '../../config';
import { decide, decisionStore, health } from '../../data/aiEngine';
import { useLocalStore } from '../../data/localStore';
import { equipmentDetail, signalSeries, stopCostPerHour } from '../../data/maintenance';
import { formatDateTime, NOW, parseTime } from '../../data/time';
import type { WorkOrder } from '../../data/types';
import { workOrderStore } from '../../data/workflows';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import '../common/patterns.css';
import { P7Alert } from './P7Alert';
import './P7.css';

interface P7Definition {
  badges?: string[];
  param: string;
  links?: { label: string; to: string }[];
}

/** P7 draws one record from a link: an alert (COM-020, dataSource alerts) or an equipment (MNT-011). */
export function P7Detail(props: TemplateProps) {
  const [params] = useSearchParams();
  const def = props.def as unknown as P7Definition & { dataSource?: string };
  if (def.dataSource === 'alerts') return <P7Alert {...props} alertId={params.get(def.param)} />;
  return <P7Equipment {...props} />;
}

function P7Equipment({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P7Definition;
  const app = useApp();
  const link = useShellLink();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get(def.param);
  const signal = params.get('signal');
  const decisions = useLocalStore(decisionStore);
  const orders = useLocalStore(workOrderStore);
  const key = `${id}|${JSON.stringify(decisions)}|${JSON.stringify(orders)}`;
  const { value, loading } = useAsync(async () => {
    if (!id) return null;
    const [detail, h, series] = await Promise.all([equipmentDetail(id), health(id), signalSeries(id)]);
    const perHour = detail ? await stopCostPerHour(detail.eq.lineId) : 0;
    return { detail, h, series, perHour };
  }, key);
  const userName = (uid: string | null) => (uid ? app.users.find((u) => u.id === uid)?.name ?? uid : '시스템');
  const canEdit = app.hasPermission('편집');

  const back = <Link to={link('MNT-010')}>설비 건전성으로</Link>;
  if (!id) {
    return (
      <ScreenLayout entry={entry} badges={[...badges, ...(def.badges ?? [])]} secondary={back}>
        <Empty description="설비 건전성(MNT-010)이나 알림에서 설비를 골라 여세요." />
      </ScreenLayout>
    );
  }
  if (!value) return <ScreenLayout entry={entry} badges={[...badges, ...(def.badges ?? [])]}><Skeleton active /></ScreenLayout>;
  const { detail, h, series, perHour } = value;
  if (!detail) {
    return (
      <ScreenLayout entry={entry} badges={[...badges, ...(def.badges ?? [])]} secondary={back}>
        <Empty description={`설비 ${id}를 찾지 못했습니다. 주소의 설비 ID를 확인하세요.`} />
      </ScreenLayout>
    );
  }
  if (!app.selectedSiteIds.includes(detail.eq.siteId)) {
    return (
      <ScreenLayout entry={entry} badges={[...badges, ...(def.badges ?? [])]} secondary={back}>
        <Empty description={`이 설비는 ${app.siteName(detail.eq.siteId)} 소속입니다. 사업장 선택을 바꾸거나 권한을 요청하세요.`} />
      </ScreenLayout>
    );
  }
  const open = detail.orders.find((o) => !['완료', '효과 확인'].includes(o.stage));
  const adopted = h?.decision?.value === '채택';
  const shown = series.find((s) => s.signal === signal) ?? series[0];
  const title = `${detail.lineName} · ${detail.eq.name}`;
  const action = open ? (
    <Link to={link('MNT-020', { id: open.id, stage: open.stage })}>진행 중인 정비 {open.id} ({open.stage})</Link>
  ) : h && h.level ? (
    <Link to={link('MNT-020', { new: '1', eq: detail.eq.id, ai: h.id })}>정비 요청</Link>
  ) : null;

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      secondary={
        <>
          {back}
          <Link to={link('OPS-020', { line: detail.eq.lineId, eq: detail.eq.id, period: 'last30days' })}>손실 분석</Link>
        </>
      }
    >
      <div className={`p7${loading ? ' p7--loading' : ''}`}>
        <section className="p7__summary panel">
          <div className="p7__heading">
            <h2 className="p7__title">{title}</h2>
            <span className="caption num">{detail.eq.id}</span>
            {h ? <StatusBadge level={h.level ?? 'normal'} /> : <StatusBadge level="info" label={terms.noData} />}
            <span className="p7__spacer" />
            {action}
          </div>
          <dl className="p7__facts">
            <Fact label="사업장" value={app.siteName(detail.eq.siteId)} />
            <Fact label="설비 종류" value={detail.eq.type} />
            <Fact label="설치" value={detail.eq.installedOn} />
            <Fact label="건전성 지수" value={h ? `${h.payload.index} / 100` : terms.noData} strong />
            <Fact label="AI 진단" value={h ? h.payload.failureMode : '-'} />
            <Fact label="잔여수명" value={h?.payload.rul ? `${h.payload.rul.p10}~${h.payload.rul.p90}일 (중앙값 ${h.payload.rul.p50}일)` : '예측하지 않음'} strong />
            <Fact label="정지 단가" value={`${formatNumber(perHour, 0)} 원/시간`} />
            <Fact label="기준 시각" value={formatDateTime(NOW)} />
          </dl>
          {detail.collectionStopped && <Notice type="warning" showIcon message="이 설비의 수집 장치가 중단되어 최근 값은 미수신입니다. 진단은 마지막 수신 값까지입니다." />}
        </section>

        {h ? (
          <div className="p7__ai">
            <AiResultCard
              result={h}
              userName={userName}
              onDecide={canEdit ? (v, reason) => decide(h.id, v, reason, app.user.id) : undefined}
            />
            {adopted && !open && (
              <Notice
                type="info"
                showIcon
                message="채택한 진단입니다. 정비 요청으로 이어 가세요."
                action={<Link to={link('MNT-020', { new: '1', eq: detail.eq.id, ai: h.id })}>정비 요청</Link>}
              />
            )}
            {h.impact?.costKrw && (
              <p className="caption p7__impact">
                예상 영향은 고장 시 정지 {h.impact.downtimeHours?.[0]}~{h.impact.downtimeHours?.[1]}시간 × 정지 단가 {formatNumber(perHour, 0)}원/시간 = {formatMoney(h.impact.costKrw[0])}~{formatMoney(h.impact.costKrw[1])} 백만 원 ({terms.badges.demoOnly}). 정지 단가는 비가동 손실과 같은 기준입니다.
              </p>
            )}
          </div>
        ) : (
          <Notice type="info" showIcon message="감시 센서가 없거나 최근 값이 없어 AI 진단을 하지 않는 설비입니다. 정비·정지 이력만 보입니다." />
        )}

        {shown && (
          <Panel
            title="근거 신호 추이"
            caption={`최근 21일 · 1시간 평균 · 정상 범위는 진단 기준 기간(30~44일 전) 평균 ± 2σ`}
            extra={
              <Segmented
                size="small"
                value={shown.signal}
                onChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set('signal', String(v)); return n; }, { replace: true })}
                options={series.map((s) => ({ value: s.signal, label: s.name }))}
              />
            }
            className="p7__chart"
          >
            <Chart
              ariaLabel={`${shown.name} 시간별 추이와 정상 범위`}
              unit={shown.unit}
              fractionDigits={1}
              categories={shown.times.map((t) => t.slice(5))}
              series={[{ name: shown.name, data: shown.values, color: 'actual' }]}
              thresholds={[
                { name: '정상 상한', value: shown.normal[1], level: 'warning' },
                { name: '정상 하한', value: shown.normal[0], level: 'reference' }
              ]}
              zoom
              fill
            />
            <p className="caption">비가동·휴무 시간은 설비가 멈춰 값이 낮습니다. 빈 구간은 {terms.noData}입니다.</p>
          </Panel>
        )}

        {h && (
          <Panel title="건전성 지수 추이" caption="최근 30일 · 하루 단위 · 40 이하를 고장 임박으로 봄" className="p7__chart p7__chart--short">
            <Chart
              ariaLabel="건전성 지수 일별 추이"
              unit=""
              categories={h.payload.trend.map((t) => t.date.slice(5))}
              series={[{ name: '건전성 지수', data: h.payload.trend.map((t) => t.index), color: 'color-ai' }]}
              thresholds={[{ name: '고장 임박 기준', value: 40, level: 'critical' }, { name: '주의 기준', value: 70, level: 'warning' }]}
              fill
            />
          </Panel>
        )}

        {detail.precedent && (
          <Panel title="같은 고장 유형의 과거 사례" caption="예지 정비로 고장 전에 조치한 기록" className="p7__precedent">
            <dl className="facts">
              <dt>정비 오더</dt>
              <dd>
                <Link to={link('MNT-020', { id: detail.precedent.id, stage: '효과 확인', 'f.requestedAt': `${detail.precedent.requestedAt.slice(0, 10)}~${detail.precedent.requestedAt.slice(0, 10)}` })}>{detail.precedent.id}</Link> {detail.precedent.title}
              </dd>
              <dt>요청 → 완료</dt>
              <dd className="num">
                {formatDateTime(parseTime(detail.precedent.requestedAt))} → {formatDateTime(parseTime(detail.precedent.completedAt!))}
              </dd>
              <dt>작업·부품비</dt>
              <dd>
                {detail.precedent.laborHours}시간 · {formatNumber(detail.precedent.partsKrw / 1000, 0)}천 원
              </dd>
              <dt>피한 정지</dt>
              <dd>{detail.precedent.avoidedDowntimeMin}분 (효과 확인 기록)</dd>
              <dt>결과</dt>
              <dd>{detail.precedent.log.slice(-1)[0]?.note}</dd>
            </dl>
          </Panel>
        )}

        <div className="p7__row">
          <Panel title="정비 이력" caption={`${detail.orders.length}건`} className="p7__history">
            <OrderGrid orders={detail.orders} onPick={(o) => navigate(link('MNT-020', { id: o.id, stage: o.stage, 'f.requestedAt': `${o.requestedAt.slice(0, 10)}~${o.requestedAt.slice(0, 10)}` }))} />
          </Panel>
          <Panel title="고장 정지 (최근 90일)" caption={`${detail.breakdowns.length}건`} className="p7__history">
            <ul className="timeline">
              {detail.breakdowns.slice(0, 12).map((b) => (
                <li key={b.id} className="timeline__item">
                  <span className="caption num">{formatDateTime(parseTime(b.start))}</span>
                  <span className="num">{formatNumber(b.durationMin, 0)}분</span>
                  <span>{b.cause}</span>
                </li>
              ))}
              {!detail.breakdowns.length && <li className="caption">최근 90일 고장 정지가 없습니다.</li>}
            </ul>
          </Panel>
          <Panel title="AI 결과·판정 이력" caption="이 설비" className="p7__history">
            <ul className="timeline">
              {detail.history.map((r) => (
                <li key={r.id} className="timeline__item">
                  <span className="caption num">{formatDateTime(parseTime(r.generatedAt))}</span>
                  <span className="timeline__action">{r.decision ? r.decision.value : '판정 전'}</span>
                  <span>
                    {r.conclusion}
                    {r.decision?.reason && <span className="caption"> · {r.decision.reason}</span>}
                  </span>
                </li>
              ))}
              {!detail.history.length && <li className="caption">기록된 AI 결과가 없습니다.</li>}
            </ul>
            <Link to={link('AIX-020')}>AI 결과·판정 이력 전체</Link>
          </Panel>
        </div>
      </div>
    </ScreenLayout>
  );
}

export function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="p7__fact">
      <dt className="caption">{label}</dt>
      <dd className={strong ? 'p7__fact-strong' : undefined}>{value}</dd>
    </div>
  );
}

function OrderGrid({ orders, onPick }: { orders: WorkOrder[]; onPick: (o: WorkOrder) => void }) {
  const columns = useMemo<GridColumn[]>(
    () => [
      { field: 'requestedAt', label: '요청일', flex: 0.8, formatter: (v) => String(v).slice(0, 10) },
      { field: 'stage', label: '단계', flex: 0.6 },
      { field: 'title', label: '내용', flex: 2.6 }
    ],
    []
  );
  return <DataGrid ariaLabel="정비 이력" columns={columns} rows={orders.slice(0, 50)} height="fill" onRowClick={onPick} emptyText="정비 이력이 없습니다." />;
}
