// P1 panel types for the plant, maintenance and energy dashboards (OPS-010, MNT-010, ENG-010).
import { useMemo } from 'react';
import { Empty, Skeleton } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { AiResultCard } from '../../components/AiResultCard';
import { Chart } from '../../components/Chart';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { formatNumber } from '../../components/KpiCard';
import { formatMoney } from '../../components/money';
import { StatusBadge } from '../../components/StatusBadge';
import { terms } from '../../config';
import { decide, energyWaste, healthOverview } from '../../data/aiEngine';
import { getEnergy } from '../../data/energy';
import { loadCollection, loadLines } from '../../data/loaders';
import { lossAnalysis } from '../../data/lossAnalysis';
import { healthTable } from '../../data/maintenance';
import { LOSS_LABELS, LOSS_ORDER } from '../../data/metrics/oee';
import { DAY, NOW, formatDate, formatDateTime, parseTime, startOfDay } from '../../data/time';
import { useWorkOrders } from '../../data/workflows';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { useAsync } from '../common/useAsync';
import type { PanelProps } from './P1Panels';

const pct = (v: number | null) => (v === null ? '' : `${formatNumber(v * 100, 1)}`);
const LOSS_COLORS = ['color-series-1', 'color-series-2', 'color-series-3', 'color-series-4', 'color-series-5', 'color-series-6'];

/** Lines of one site: OEE, its factors, plan attainment, stop loss and missing data (OPS-010). */
export function LineTablePanel({ panel, siteIds, period, version }: PanelProps) {
  const navigate = useNavigate();
  const link = useShellLink();
  const { value } = useAsync(() => lossAnalysis({ siteIds, from: period.from, to: period.to }, siteIds.length > 1 ? 'company' : 'site', version), `${siteIds}|${period.from}|${period.to}|${version}`);
  const columns = useMemo<GridColumn[]>(
    () => [
      { field: 'name', label: siteIds.length > 1 ? '사업장' : '라인', flex: 1.4, pinned: true },
      { field: 'oee', label: 'OEE (%)', flex: 0.8, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'availability', label: '가용성 (%)', flex: 0.8, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'performance', label: '성능 (%)', flex: 0.8, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'quality', label: '품질 (%)', flex: 0.8, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'plan', label: '계획 달성률 (%)', flex: 0.9, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'stopKrw', label: '비가동 손실 (백만 원)', flex: 1, align: 'right', formatter: (v) => formatMoney(v as number) },
      {
        field: 'missingMin', label: '데이터', flex: 0.9,
        renderer: (v) => ((v as number) > 0 ? <StatusBadge level="info" label={`${terms.noData} ${formatNumber(v as number, 0)}분`} /> : <span className="caption">정상 수신</span>)
      }
    ],
    [siteIds.length]
  );
  if (!value) return <Skeleton active />;
  const rows = value.children.map((r) => ({ ...r, stopKrw: r.money.breakdown + r.money.changeover }));
  const total = { ...value.total, id: 'total', name: '합계', stopKrw: value.total.money.breakdown + value.total.money.changeover };
  return (
    <DataGrid
      ariaLabel={panel.title}
      columns={columns}
      rows={rows}
      totalRow={total}
      height="fill"
      onRowClick={(r) => navigate(link('OPS-020', siteIds.length > 1 ? { site: r.id, period: period.key } : { line: r.id, period: period.key }))}
    />
  );
}

/** Six big losses per line, in hours (OPS-010). */
export function LossByLinePanel({ panel, siteIds, period, version }: PanelProps) {
  const { value } = useAsync(() => lossAnalysis({ siteIds, from: period.from, to: period.to }, siteIds.length > 1 ? 'company' : 'site', version), `${siteIds}|${period.from}|${period.to}|${version}`);
  if (!value) return <Skeleton active />;
  const rows = value.children;
  return (
    <Chart
      ariaLabel={`${panel.title}. 라인별 6대 손실 시간을 쌓은 가로 막대`}
      unit="시간"
      fractionDigits={1}
      horizontal
      categories={rows.map((r) => r.name)}
      series={LOSS_ORDER.map((k, i) => ({ name: LOSS_LABELS[k], data: rows.map((r) => Math.max(0, r.loss[k]) / 60), kind: 'bar' as const, color: LOSS_COLORS[i], stack: 'loss' }))}
      fill
    />
  );
}

/** Monitored equipment, worst health first (MNT-010). */
export function HealthTablePanel({ panel, siteIds, version }: PanelProps) {
  const navigate = useNavigate();
  const link = useShellLink();
  const { value } = useAsync(() => healthTable(siteIds), `${siteIds}|${version}`);
  const columns = useMemo<GridColumn[]>(
    () => [
      { field: 'name', label: '설비', flex: 2.1, pinned: true, formatter: (v, r) => `${String(r.id).split('-').slice(1).join('-')} ${v}` },
      { field: 'lineName', label: '라인', flex: 1.1 },
      { field: 'index', label: '건전성 지수', flex: 0.8, align: 'right', formatter: (v) => (v === null ? terms.noData : String(v)) },
      { field: 'level', label: '상태', flex: 0.7, renderer: (v) => (v ? <StatusBadge level={v as 'critical'} /> : <StatusBadge level="info" label={terms.noData} />) },
      { field: 'failureMode', label: 'AI 진단', flex: 1 },
      { field: 'rul', label: '잔여수명 (예상 고장 시점)', flex: 1.4, align: 'right' },
      { field: 'openOrder', label: '진행 중 정비', flex: 1, formatter: (v) => (v ? String(v) : '') }
    ],
    []
  );
  if (!value) return <Skeleton active />;
  return <DataGrid ariaLabel={panel.title} columns={columns} rows={value} height="fill" onRowClick={(r) => navigate(link('MNT-011', { id: r.id }))} />;
}

/** Work orders not finished yet (MNT-010), read from the CMMS (D-66). */
export function OpenOrdersPanel({ panel, siteIds }: PanelProps) {
  const orders = useWorkOrders();
  const { value: lines } = useAsync(() => loadLines(), 'lines');
  const lineName = useMemo(() => new Map((lines ?? []).map((l) => [l.id, l.name])), [lines]);
  const columns = useMemo<GridColumn[]>(
    () => [
      { field: 'id', label: '오더', flex: 1.1, pinned: true },
      { field: 'stage', label: '단계', flex: 0.7 },
      { field: 'type', label: '유형', flex: 0.55 },
      { field: 'title', label: '내용', flex: 2 },
      { field: 'lineId', label: '라인', flex: 1, formatter: (v) => lineName.get(String(v)) ?? '유틸리티' },
      { field: 'requestedAt', label: '요청', flex: 1, formatter: (v) => formatDateTime(parseTime(String(v))) }
    ],
    [lineName]
  );
  if (!orders) return <Skeleton active />;
  const open = orders.filter((o) => siteIds.includes(o.siteId) && !['완료', '효과 확인'].includes(o.stage)).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  return (
    <DataGrid
      ariaLabel={panel.title}
      columns={columns}
      rows={open}
      height="fill"
      emptyText="진행 중인 정비가 없습니다."
    />
  );
}

/** AI health results with a level, as compact cards that link to the diagnosis (MNT-010). */
export function HealthAlertsPanel({ siteIds, version }: PanelProps) {
  const link = useShellLink();
  const app = useApp();
  const { value } = useAsync(async () => (await healthOverview(siteIds)).filter((h) => h.level), `${siteIds}|${version}`);
  if (!value) return <Skeleton active />;
  if (!value.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="이상 징후가 있는 설비가 없습니다." />;
  return (
    <div className="p1-cards">
      {value.map((h) => (
        <div key={h.id} className="p1-cards__item">
          <AiResultCard result={h} compact userName={(id) => app.users.find((u) => u.id === id)?.name ?? id} />
          <Link to={link('MNT-011', { id: h.target.equipmentId! })}>설비 진단 상세</Link>
        </div>
      ))}
    </div>
  );
}

/** Data collectors that stopped (SC-07). */
export function CollectionPanel({ siteIds }: PanelProps) {
  const { value } = useAsync(() => loadCollection(), 'collection');
  const { value: lines } = useAsync(() => loadLines(), 'lines');
  if (!value || !lines) return <Skeleton active />;
  const mine = value.filter((c) => siteIds.includes(c.siteId));
  const stopped = mine.filter((c) => c.status === '중단');
  return (
    <div className="p1-collection">
      <p className="caption">
        수집 장치 {mine.length}대 중 {stopped.length ? `${stopped.length}대 중단` : '모두 정상 수신'}
      </p>
      {stopped.map((c) => (
        <div key={c.collectorId} className="p1-collection__row">
          <StatusBadge level="critical" label="수집 중단" />
          <span>{lines.find((l) => l.id === c.lineId)?.name ?? c.lineId}</span>
          <span className="caption num">{c.collectorId}</span>
          <span className="risk-item__spacer" />
          <span className="caption num">{formatDateTime(parseTime(c.missingFrom!))}부터 {terms.noData}</span>
        </div>
      ))}
    </div>
  );
}

/** Energy waste found by the engine, with the daily idle-time trend (ENG-010). */
export function EnergyWastePanel({ siteIds, version }: PanelProps) {
  const app = useApp();
  const { value } = useAsync(async () => (await Promise.all(siteIds.map((s) => energyWaste(s)))).filter((x) => !!x), `${siteIds}|${version}`);
  if (!value) return <Skeleton active />;
  if (!value.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="비생산 시간 낭비가 탐지되지 않았습니다." />;
  const first = value[0]!;
  return (
    <div className="p1-cards">
      {value.map((w) => (
        <AiResultCard key={w!.id} result={w!} compact onDecide={app.hasPermission('편집') ? (v, reason) => decide(w!.id, v, reason, app.user.id) : undefined} userName={(id) => app.users.find((u) => u.id === id)?.name ?? id} />
      ))}
      <div className="p1-cards__chart">
        <Chart
          ariaLabel={`${first.target.label} 비생산 시간 시간당 사용량, 일별`}
          unit="Nm³/h"
          categories={first.payload.daily.map((d) => d.date.slice(5))}
          series={[{ name: '비생산 시간 압축공기', data: first.payload.daily.map((d) => d.idlePerHour), color: 'color-energy-compressed-air' }]}
          thresholds={[{ name: '기준 기간 평균', value: first.payload.idlePerHourBefore, level: 'reference' }]}
          fill
        />
      </div>
    </div>
  );
}

/** Daily electricity in the period, split into production and non-production hours (ENG-010). */
export function DailyEnergyPanel({ panel, siteIds, period }: PanelProps) {
  // Show at least the last 14 days so "today" still has a trend.
  const from = Math.min(period.from, startOfDay(NOW) - 13 * DAY);
  const { value } = useAsync(async () => {
    const days: string[] = [];
    for (let d = from; d < NOW; d += DAY) days.push(formatDate(d));
    const per = await Promise.all(days.map(async (d) => getEnergy({ siteIds, from: parseTime(d), to: Math.min(parseTime(d) + DAY, NOW), source: 'electricity' })));
    return { days, per };
  }, `${siteIds}|${from}`);
  if (!value) return <Skeleton active />;
  return (
    <Chart
      ariaLabel={`${panel.title}. 생산 시간과 비생산 시간 전력을 쌓은 일별 막대`}
      unit="MWh"
      fractionDigits={1}
      categories={value.days.map((d, i) => `${d.slice(5)}${i === value.days.length - 1 ? '*' : ''}`)}
      series={[
        { name: '생산 시간', data: value.per.map((e) => (e.total - e.idle) / 1000), kind: 'bar', color: 'color-energy-electricity', stack: 'e' },
        { name: '비생산 시간', data: value.per.map((e) => e.idle / 1000), kind: 'bar', color: 'compare', stack: 'e' }
      ]}
      fill
    />
  );
}
