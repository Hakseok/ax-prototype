// P3 분석형, energy form (ENG-020): conditions (period, energy source), summary cards with the
// peak demand against contract power, the 15-minute demand of the last seven days split by
// production and non-production time with the contract and caution lines, daily peaks, and
// usage and intensity per line.
import { useMemo } from 'react';
import { Button, Skeleton } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { Chart } from '../../components/Chart';
import { DataGrid } from '../../components/DataGrid';
import { KpiCard, formatNumber } from '../../components/KpiCard';
import { MoneyCard } from '../../components/MoneyCard';
import { Panel } from '../../components/Panel';
import { company, terms } from '../../config';
import { useCostVersion } from '../../data/costs';
import { demandProfile, energySummary, lineEnergy, type AnalysisSource, type DemandProfile } from '../../data/energyAnalysis';
import { NOW, formatDate, formatDateTime, formatTime } from '../../data/time';
import { useApp } from '../../shell/AppContext';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { FilterBar } from '../common/FilterBar';
import { toParams, useFilterState } from '../common/filters';
import { toGridColumns } from '../common/columns';
import { downloadCsv } from '../common/format';
import { useRefs } from '../common/hooks';
import type { ColumnDef, FieldDef } from '../common/types';
import { useAsync } from '../common/useAsync';
import '../common/patterns.css';
import './P3.css';

interface P3EnergyDefinition {
  badges?: string[];
  filters: FieldDef[];
  analysis: { cautionRatio: number; demandDays: number };
}

/** Lines drawn in the bar chart; the table lists all. */
const TOP = 8;

const UNIT: Record<AnalysisSource, { usage: string; per: string; name: string; color: string }> = {
  electricity: { usage: 'kWh', per: 'kWh/개', name: '전력', color: 'color-energy-electricity' },
  compressedAir: { usage: 'Nm³', per: 'Nm³/개', name: '압축공기', color: 'color-energy-compressed-air' }
};

export function P3Energy({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P3EnergyDefinition;
  const app = useApp();
  const costVersion = useCostVersion();
  const { values, apply } = useFilterState(def.filters);
  const { options } = useRefs(def.filters, []);
  const p = toParams(def.filters, values);
  const [from, toRaw] = (p.period as [number, number]) ?? [NOW, NOW];
  const to = Math.min(toRaw, NOW);
  const source = (String(values.source ?? 'electricity') as AnalysisSource) in UNIT ? (String(values.source ?? 'electricity') as AnalysisSource) : 'electricity';
  const u = UNIT[source];
  const sites = app.selectedSiteIds;
  const key = `${sites.join(',')}|${source}|${from}|${to}|${costVersion}`;
  const { value: summary } = useAsync(() => energySummary(sites, source, from, to), key);
  const { value: rows } = useAsync(() => lineEnergy(sites, source, from, to), key);
  const { value: demand } = useAsync(async () => {
    const all = await Promise.all(sites.map((s) => demandProfile(s, def.analysis.cautionRatio)));
    // For several sites the chart shows the one closest to its contract power.
    return { all, shown: all.reduce((a, b) => ((b.peak?.ratio ?? 0) > (a.peak?.ratio ?? 0) ? b : a)) };
  }, sites.join(','));
  const isCompany = sites.length > 1;
  const siteName = (id: string) => company.sites.find((s) => s.id === id)?.name ?? id;

  const columns: ColumnDef[] = [
    ...(isCompany ? [{ field: 'siteId', label: '사업장', ref: 'sites', flex: 1 } as ColumnDef] : []),
    { field: 'lineName', label: '라인', flex: 2 },
    { field: 'usage', label: `${u.name} (${u.usage})`, format: 'number' },
    { field: 'idleShare', label: '비생산 시간 비중 (%)', format: 'percent' },
    { field: 'good', label: '양품 (개)', format: 'number' },
    { field: 'perUnit', label: `원단위 (${u.per})`, format: 'number', fractionDigits: 3 },
    ...(source === 'electricity' ? [{ field: 'costM', label: '전력 비용 (백만 원)', format: 'number', fractionDigits: 1 } as ColumnDef] : [])
  ];
  const { maps } = useRefs([], columns);
  const gridRows = useMemo(() => (rows ?? []).map((r) => ({ ...r, costM: r.cost === null ? null : r.cost / 1e6 })), [rows]);

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      conditions={<FilterBar filters={def.filters} values={values} refOptions={options} onSubmit={apply} />}
      toolbar={
        <>
          <span className="caption num">
            {formatDate(from)} ~ {formatDateTime(to)} · {isCompany ? `전사 ${sites.length}개 사업장` : siteName(sites[0])}
          </span>
          <span className="toolbar__spacer" />
          <Button icon={<DownloadOutlined />} disabled={!rows?.length} onClick={() => downloadCsv(`${entry.id}_${entry.name}_${u.name}_${formatDate(from)}.csv`, columns, gridRows, maps)}>
            내보내기
          </Button>
        </>
      }
    >
      <div className="p3e">
        <div className="p3e__kpis">
          <KpiCard label={`${u.name} 사용량`} value={summary?.usage ?? null} unit={u.usage} emptyLabel="계산 중" />
          <KpiCard label={`${u.name} 원단위`} value={summary?.perUnit ?? null} unit={u.per} fractionDigits={3} emptyLabel="계산 중" />
          <KpiCard label="비생산 시간 사용 비중" value={summary?.idleShare === null || summary?.idleShare === undefined ? null : summary.idleShare * 100} unit="%" fractionDigits={1} emptyLabel="계산 중" />
          {summary?.cost !== null && summary?.cost !== undefined ? <MoneyCard label="에너지 비용 (전력 + LNG)" amount={summary.cost} /> : <KpiCard label="에너지 비용 (전력 + LNG)" value={null} unit="백만 원" emptyLabel="계산 중" />}
          <PeakCard demand={demand?.shown ?? null} isCompany={isCompany} siteName={siteName} caution={def.analysis.cautionRatio} />
        </div>
        <div className="p3e__mid">
          <Panel
            title="피크 전력 관제"
            caption={demand ? `${siteName(demand.shown.siteId)} · 최근 ${def.analysis.demandDays}일 · 15분 평균 수요전력${isCompany ? ' · 계약전력 대비 가장 높은 사업장' : ''}` : ''}
            className="p3e__demand"
          >
            {!demand ? <Skeleton active /> : <DemandChart d={demand.shown} caution={def.analysis.cautionRatio} />}
          </Panel>
          <Panel title={isCompany ? '사업장별 최대 수요' : '일별 최대 수요'} caption="최근 7일" className="p3e__peaks">
            {!demand ? <Skeleton active /> : isCompany ? <SitePeaks all={demand.all} siteName={siteName} /> : <DayPeaks d={demand.shown} />}
          </Panel>
        </div>
        <div className="p3e__bottom">
          <Panel title={`라인별 ${u.name} 사용`} caption={`생산 시간 · 비생산 시간${rows && rows.length > TOP ? ` · 사용량 상위 ${TOP}개` : ''}`} className="p3e__bars">
            {!rows ? (
              <Skeleton active />
            ) : (
              <Chart
                categories={rows.slice(0, TOP).map((r) => (isCompany ? `${siteName(r.siteId).replace('공장', '')} ${r.lineName}` : r.lineName))}
                series={[
                  { name: '생산 시간', data: rows.slice(0, TOP).map((r) => r.usage - r.idle), kind: 'bar', color: u.color, stack: 'u' },
                  { name: '비생산 시간', data: rows.slice(0, TOP).map((r) => r.idle), kind: 'bar', color: 'compare', stack: 'u' }
                ]}
                unit={u.usage}
                horizontal
                fill
                ariaLabel={`라인별 ${u.name} 사용량`}
              />
            )}
          </Panel>
          <Panel title="라인별 사용량과 원단위" caption={`${terms.badges.demoOnly} 단가 · 유틸리티는 양품이 없어 원단위를 계산하지 않습니다`} className="p3e__table">
            {!rows ? <Skeleton active /> : <DataGrid ariaLabel="라인별 에너지" columns={toGridColumns(columns, maps)} rows={gridRows} height="fill" />}
          </Panel>
        </div>
      </div>
    </ScreenLayout>
  );
}

function PeakCard({ demand, isCompany, siteName, caution }: { demand: DemandProfile | null; isCompany: boolean; siteName: (id: string) => string; caution: number }) {
  const peak = demand?.peak ?? null;
  return (
    <KpiCard
      label="최대 수요전력 (최근 7일)"
      value={peak ? Math.round(peak.kw) : null}
      unit="kW"
      emptyLabel="계산 중"
      status={peak && peak.ratio >= caution ? 'warning' : undefined}
      statusLabel={peak && peak.ratio >= caution ? '관리 기준 초과' : undefined}
      meter={peak && demand ? { ratio: peak.ratio, tick: caution, label: `계약전력 ${formatNumber(demand.contractKw, 0)} kW의 ${formatNumber(peak.ratio * 100, 0)}%` } : undefined}
      footnote={peak && demand ? `${isCompany ? `${siteName(demand.siteId)} · ` : ''}${formatDate(peak.t).slice(5)} ${formatTime(peak.t)} · ${peak.production ? '생산 시간' : '비생산 시간'}` : undefined}
    />
  );
}

function DemandChart({ d, caution }: { d: DemandProfile; caution: number }) {
  const data = useMemo(() => {
    const categories = d.slots.map((s) => `${formatDate(s.t).slice(5)} ${formatTime(s.t)}`);
    return {
      categories,
      series: [
        { name: '생산 시간', data: d.slots.map((s) => (s.production ? s.kw : null)), color: 'color-energy-electricity' },
        { name: '비생산 시간', data: d.slots.map((s) => (s.production ? null : s.kw)), color: 'compare' }
      ],
      thresholds: [
        { name: '계약전력', value: d.contractKw, level: 'critical' as const },
        { name: `관리 기준 ${Math.round(caution * 100)}%`, value: d.cautionKw, level: 'warning' as const }
      ]
    };
  }, [d, caution]);
  return <Chart categories={data.categories} series={data.series} thresholds={data.thresholds} unit="kW" zoom fill ariaLabel="15분 수요전력 추이" />;
}

function DayPeaks({ d }: { d: DemandProfile }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>일자</th>
          <th>시각</th>
          <th className="num-col">최대 (kW)</th>
          <th className="num-col">계약 대비</th>
          <th>시간</th>
        </tr>
      </thead>
      <tbody>
        {d.days.map((p) => (
          <tr key={p.day}>
            <td className="num">{p.day.slice(5)}</td>
            <td className="num">{formatTime(p.t)}</td>
            <td className="num num-col">{formatNumber(p.kw, 0)}</td>
            <td className="num num-col">{formatNumber(p.ratio * 100, 0)}%</td>
            <td>{p.production ? '생산' : '비생산'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SitePeaks({ all, siteName }: { all: DemandProfile[]; siteName: (id: string) => string }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>사업장</th>
          <th className="num-col">최대 (kW)</th>
          <th className="num-col">계약 (kW)</th>
          <th className="num-col">계약 대비</th>
          <th className="num-col">기준 초과 (15분)</th>
        </tr>
      </thead>
      <tbody>
        {all.map((d) => (
          <tr key={d.siteId}>
            <td>{siteName(d.siteId)}</td>
            <td className="num num-col">{d.peak ? formatNumber(d.peak.kw, 0) : terms.noData}</td>
            <td className="num num-col">{formatNumber(d.contractKw, 0)}</td>
            <td className="num num-col">{d.peak ? `${formatNumber(d.peak.ratio * 100, 0)}%` : '-'}</td>
            <td className="num num-col">{d.overCaution}회</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
