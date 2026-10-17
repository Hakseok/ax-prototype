// Panel types of the P1 dashboard. A screen definition picks panels by type; each type knows
// which data function to call (src/data/executive.ts) and how to draw it.
import { useMemo } from 'react';
import { Empty, Skeleton } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { Chart } from '../../components/Chart';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { formatNumber } from '../../components/KpiCard';
import { formatMoney } from '../../components/money';
import { StatusBadge } from '../../components/StatusBadge';
import { terms } from '../../config';
import { monthlyTrend, riskFeed, siteRows, type Risk } from '../../data/executive';
import { METRICS, displayValue, metric } from '../../data/metrics/catalog';
import type { Period } from '../../data/period';
import { formatDate, formatTime, NOW, parseTime } from '../../data/time';
import { useShellLink } from '../../shell/links';
import { useAsync } from '../common/useAsync';
import {
  CollectionPanel, DailyEnergyPanel, EnergyWastePanel, HealthAlertsPanel, HealthTablePanel, LineTablePanel, LossByLinePanel, OpenOrdersPanel
} from './P1PanelsOps';
import type { P1Panel } from './types';

export interface PanelProps {
  panel: P1Panel;
  siteIds: string[];
  period: Period;
  /** Changes whenever numbers on screen may change (unit costs, AI decisions, alerts, work orders). */
  version: string;
}

const headerOf = (id: string) => {
  const d = METRICS[id];
  return d.unit === '원' ? `${d.label} (백만 원)` : `${d.label} (${d.unit})`;
};
const cellOf = (id: string, v: number | null) => (v === null ? '' : METRICS[id].unit === '원' ? formatMoney(v) : formatNumber(displayValue(id, v)!, METRICS[id].digits));

export function SiteTablePanel({ panel, siteIds, period, version }: PanelProps) {
  const navigate = useNavigate();
  const link = useShellLink();
  const metrics = panel.metrics ?? ['oee'];
  const { value, loading } = useAsync(async () => {
    const rows = await siteRows(siteIds, period, metrics);
    const total: Record<string, unknown> = { id: 'ALL', name: siteIds.length > 1 ? `전사 (${siteIds.length}개 사업장)` : '합계', risks: rows.reduce((a, r) => a + r.risks, 0) };
    for (const id of metrics) total[id] = await metric(id, { siteIds, from: period.from, to: period.to });
    return { rows: rows.map((r) => ({ id: r.siteId, name: r.name, risks: r.risks, status: r.status, ...r.values })), total };
  }, `${siteIds}|${period.from}|${period.to}|${metrics}|${version}`);
  const columns = useMemo<GridColumn[]>(
    () => [
      { field: 'name', label: '사업장', flex: 1.3, pinned: true },
      ...metrics.map((id) => ({ field: id, label: headerOf(id), flex: 1, align: 'right' as const, formatter: (v: unknown) => cellOf(id, v as number | null) })),
      { field: 'risks', label: '리스크 (건)', flex: 0.8, format: 'number' as const },
      { field: 'status', label: '상태', flex: 0.8, render: 'status' as const }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metrics.join()]
  );
  if (!value) return <Skeleton active />;
  return (
    <DataGrid
      ariaLabel={panel.title}
      columns={columns}
      rows={value.rows}
      totalRow={value.total}
      onRowClick={(r) => navigate(link(panel.rowTo ?? 'OPS-010', { site: String((r as { id: string }).id) }))}
      emptyText={loading ? '불러오는 중입니다.' : '표시할 사업장이 없습니다.'}
    />
  );
}

export function MonthlyTrendPanel({ panel, siteIds, version }: PanelProps) {
  const id = panel.metric ?? 'oee';
  const def = METRICS[id];
  const { value } = useAsync(() => monthlyTrend(id, siteIds), `${id}|${siteIds}|${version}`);
  if (!value) return <Skeleton active />;
  const show = (v: number | null) => (v === null ? null : displayValue(id, v));
  const cats = value.points.map((p) => `${Number(p.month.slice(5))}월${p.partial ? '*' : ''}`);
  return (
    <>
      <Chart
        ariaLabel={`${panel.title}. 기준선 평균과 AX 적용 후 평균`}
        unit={def.unit}
        fractionDigits={def.digits}
        categories={cats}
        series={[
          { name: '기준선 기간', data: value.points.map((p) => (p.inBaseline ? show(p.value) : null)), kind: 'bar', color: 'compare', stack: 'm' },
          // Months before go-live that a shortened baseline leaves out (SET-020).
          ...(value.points.some((p) => !p.afterGoLive && !p.inBaseline)
            ? [{ name: '적용 전 (기준선 밖)', data: value.points.map((p) => (!p.afterGoLive && !p.inBaseline ? show(p.value) : null)), kind: 'bar' as const, color: 'color-series-other', stack: 'm' }]
            : []),
          { name: 'AX 적용 후', data: value.points.map((p) => (p.afterGoLive ? show(p.value) : null)), kind: 'bar', color: 'color-effect', stack: 'm' }
        ]}
        thresholds={[{ name: '기준선 평균', value: show(value.baseline) ?? 0, level: 'reference' }]}
        markers={[{ category: cats[value.points.findIndex((p) => p.afterGoLive)], label: 'AX 적용' }]}
        fill
      />
      <p className="caption p1__note">
        기준선 평균 {formatNumber(show(value.baseline) ?? 0, def.digits)} {def.unit} → 적용 후 평균 {formatNumber(show(value.after) ?? 0, def.digits)} {def.unit}
        {value.points.some((p) => p.partial) && ' · * 진행 중인 달'}
      </p>
    </>
  );
}

const when = (at: string) => {
  const t = parseTime(at);
  return formatDate(t) === formatDate(NOW) ? formatTime(t) : formatDate(t).slice(5);
};

export function RisksPanel({ panel, siteIds, version }: PanelProps) {
  const { value } = useAsync(() => riskFeed(siteIds), `${siteIds}|${version}`);
  if (!value) return <Skeleton active />;
  if (!value.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="처리 중인 리스크가 없습니다." />;
  const priced = value.filter((r) => r.impactKrw).reduce((a, r) => a + r.impactKrw![1], 0);
  return (
    <div className="risk-list" aria-label={panel.title}>
      <p className="caption">
        {value.length}건 · 예상 영향 최대 {formatMoney(priced)} 백만 원 ({terms.badges.demoOnly})
      </p>
      {value.map((r) => (
        <RiskItem key={r.id} r={r} />
      ))}
    </div>
  );
}

function RiskItem({ r }: { r: Risk }) {
  return (
    <article className="risk-item">
      <div className="risk-item__head">
        <StatusBadge level={r.level} />
        <span className="caption">{r.kind}</span>
        <span className="caption">{r.source === 'AI' ? 'AI 탐지' : r.source}</span>
        <span className="risk-item__spacer" />
        <span className="caption num">{when(r.occurredAt)}</span>
      </div>
      <div className="risk-item__title">{r.title}</div>
      <div className="risk-item__detail">{r.detail}</div>
      <div className="risk-item__foot">
        {r.impactKrw ? (
          <span className="caption">
            예상 영향 <span className="num risk-item__amount">{formatMoney(r.impactKrw[0])}~{formatMoney(r.impactKrw[1])}</span> 백만 원{r.impactNote && ` · ${r.impactNote}`}
          </span>
        ) : (
          <span className="caption">{r.impactNote || '금액 환산 대상 아님'}</span>
        )}
        <span className="risk-item__spacer" />
        <Link to={r.link.to}>{r.link.label}</Link>
      </div>
    </article>
  );
}

export const PANELS = {
  siteTable: SiteTablePanel, monthlyTrend: MonthlyTrendPanel, risks: RisksPanel,
  lineTable: LineTablePanel, lossByLine: LossByLinePanel, healthTable: HealthTablePanel, openOrders: OpenOrdersPanel,
  healthAlerts: HealthAlertsPanel, collection: CollectionPanel, energyWaste: EnergyWastePanel, dailyEnergy: DailyEnergyPanel
};
