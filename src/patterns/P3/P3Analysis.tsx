// P3 분석형 (OPS-020): conditions, hierarchy path (company → site → line → equipment),
// summary of OEE and losses, child rows to drill into, the six-big-loss waterfall with time and
// money, and tabs for top causes, stop events, shift and product comparisons.
import { useMemo, useState } from 'react';
import { Alert as Notice, Button, Skeleton, Tabs } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Chart } from '../../components/Chart';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { KpiCard, formatNumber } from '../../components/KpiCard';
import { MoneyCard } from '../../components/MoneyCard';
import { formatMoney } from '../../components/money';
import { Panel } from '../../components/Panel';
import { terms } from '../../config';
import { useCostVersion } from '../../data/costs';
import { loadEquipment, loadLines } from '../../data/loaders';
import { lossAnalysis, type LossAnalysis, type OeeRow } from '../../data/lossAnalysis';
import { LOSS_LABELS, LOSS_ORDER } from '../../data/metrics/oee';
import { COMPANY } from '../../data';
import { NOW, formatDate, formatDateTime, parseTime } from '../../data/time';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { FilterBar } from '../common/FilterBar';
import { toParams, useFilterState } from '../common/filters';
import { downloadCsv } from '../common/format';
import { useRefs } from '../common/hooks';
import type { ColumnDef, FieldDef } from '../common/types';
import { useAsync } from '../common/useAsync';
import '../common/patterns.css';
import './P3.css';

interface P3Definition {
  badges?: string[];
  filters: FieldDef[];
  target: { levels: string[] };
  chart: { type: 'waterfall'; unit: string };
  tabs?: { id: 'causes' | 'events' | 'shifts' | 'products'; title: string }[];
  actions: string[];
  note?: string;
}

type Level = 'company' | 'site' | 'line' | 'equipment';
const pct = (v: number | null) => (v === null ? '' : formatNumber(v * 100, 1));
const hours = (min: number) => formatNumber(Math.max(0, min) / 60, 1);
// Short axis labels for the waterfall; the table beside it uses the full names.
const SHORT: Record<string, string> = { breakdown: '고장', changeover: '교체', minorStop: '소정지', speed: '속도', defect: '불량', startup: '초기불량' };
const thousand = (won: number) => formatNumber(Math.round(won / 1000), 0);

export function P3Analysis({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P3Definition;
  const app = useApp();
  const link = useShellLink();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // A link may carry ?period= (today, thisWeek, thisMonth …) to open with the caller's period.
  const periodKey = params.get('period');
  const filters = useMemo(() => def.filters.map((f) => (f.control === 'dateRange' && periodKey ? { ...f, default: periodKey } : f)), [def.filters, periodKey]);
  const { values, apply } = useFilterState(filters);
  const { options } = useRefs(filters, []);
  const costVersion = useCostVersion();
  const lineId = params.get('line');
  const eqId = params.get('eq');
  const level: Level = eqId ? 'equipment' : lineId ? 'line' : app.siteSelection === COMPANY ? 'company' : 'site';
  const p = toParams(filters, values);
  const [from, to] = (p.period as [number, number]) ?? [NOW, NOW];
  const query = useMemo(
    () => ({
      siteIds: app.selectedSiteIds,
      from,
      to: Math.min(to, NOW),
      lineIds: lineId ? [lineId] : undefined,
      shifts: values.shift ? [String(values.shift)] : undefined,
      productIds: values.productId ? [String(values.productId)] : undefined,
      equipmentId: eqId ?? undefined
    }),
    [app.selectedSiteIds, from, to, lineId, eqId, values.shift, values.productId]
  );
  const { value: data, loading, error } = useAsync(() => lossAnalysis(query, level, costVersion), `${JSON.stringify(query)}|${level}|${costVersion}`);
  const { value: names } = useAsync(async () => ({ lines: await loadLines(), eqs: await loadEquipment() }), 'names');
  const [tab, setTab] = useState<string>(def.tabs?.[0]?.id ?? 'causes');

  const drill = (row: OeeRow) => {
    if (row.level === 'site') navigate(link(entry.id, { ...Object.fromEntries(params), site: row.id }));
    else if (row.level === 'line') navigate(link(entry.id, { ...withoutKeys(params, ['eq']), line: row.id }));
    else navigate(link(entry.id, { ...Object.fromEntries(params), eq: row.id }));
  };
  const lineName = names?.lines.find((l) => l.id === lineId)?.name;
  const eqName = names?.eqs.find((e) => e.id === eqId)?.name;

  const crumbs = (
    <nav className="crumbs" aria-label="분석 계층">
      {app.canCompany && <CrumbLink current={level === 'company'} to={link(entry.id, { ...withoutKeys(params, ['line', 'eq']), site: COMPANY })} label="전사" />}
      {app.siteSelection !== COMPANY && (
        <>
          {app.canCompany && <span className="crumbs__sep">›</span>}
          <CrumbLink current={level === 'site'} to={link(entry.id, withoutKeys(params, ['line', 'eq']))} label={app.siteName(app.siteSelection)} />
        </>
      )}
      {lineId && (
        <>
          <span className="crumbs__sep">›</span>
          <CrumbLink current={level === 'line'} to={link(entry.id, withoutKeys(params, ['eq']))} label={lineName ?? lineId} />
        </>
      )}
      {eqId && (
        <>
          <span className="crumbs__sep">›</span>
          <span className="crumbs__current">{eqId} {eqName}</span>
        </>
      )}
    </nav>
  );

  const childColumns: ColumnDef[] = [
    { field: 'name', label: level === 'company' ? '사업장' : level === 'site' ? '라인' : '설비' },
    { field: 'oee', label: 'OEE (%)', format: 'percent' },
    { field: 'availability', label: '가용성 (%)', format: 'percent' },
    { field: 'performance', label: '성능 (%)', format: 'percent' },
    { field: 'quality', label: '품질 (%)', format: 'percent' },
    { field: 'lossHours', label: '6대 손실 (시간)', format: 'number', fractionDigits: 1 },
    { field: 'lossKrwK', label: '손실 금액 (천 원)', format: 'number' }
  ];
  const exportCsv = () => {
    if (!data) return;
    const rows = data.children.map((r) => ({ ...r, lossHours: r.lossMin / 60, lossKrwK: Math.round(r.lossKrw / 1000) }));
    downloadCsv(`${entry.id}_${entry.name}_${formatDate(from)}_${formatDate(Math.min(to, NOW) - 1)}.csv`, childColumns, rows, {}, { ...data.total, id: 'total', name: '합계', lossHours: data.total.lossMin / 60, lossKrwK: Math.round(data.total.lossKrw / 1000) });
  };

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      conditions={<FilterBar filters={filters} values={values} refOptions={options} onSubmit={apply} />}
      toolbar={
        <>
          {crumbs}
          <span className="caption">
            {formatDateTime(from)} ~ {formatDateTime(Math.min(to, NOW))}
            {level === 'company' && ` · ${app.selectedSiteIds.length}개 사업장 합산`}
          </span>
          <span className="toolbar__spacer" />
          {eqId && (
            <>
              <Link to={link('MNT-011', { id: eqId })}>설비 진단 상세</Link>
              <Link to={link('MNT-020', { new: '1', eq: eqId })}>정비 요청</Link>
            </>
          )}
          {def.actions.includes('내보내기') && (
            <Button icon={<DownloadOutlined />} title="현재 계층의 표를 CSV 파일로 내려받습니다" disabled={!data?.children.length} onClick={exportCsv}>
              내보내기
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <Notice type="error" showIcon message="분석하지 못했습니다." description={error} />
      ) : !data ? (
        <Skeleton active />
      ) : (
        <div className={`p3${loading ? ' p3--loading' : ''}`}>
          <Summary data={data} level={level} />
          {level === 'equipment' && <p className="caption p3__note">설비 단위 OEE·성능·품질은 수집하지 않습니다(교대 실적이 라인 단위). 위 값은 라인 기준이며, 원인·사건 표는 이 설비만 보입니다. 병렬 라인은 설비 정지를 라인의 1/설비 수로 환산합니다.</p>}
          <div className="p3__row">
            <Panel title={level === 'company' ? '사업장별' : level === 'site' ? '라인별' : '설비별 정지 손실'} caption="행을 누르면 한 단계 아래로" className="p3__children">
              <ChildGrid rows={data.children} level={level} selectedId={eqId} onPick={drill} />
            </Panel>
            <Panel title="6대 손실 폭포" caption={`계획 가동 시간 → 완전 가동 시간 (${def.chart.unit}) · ${terms.badges.demoOnly}`} className="p3__waterfall">
              <Waterfall row={data.total} />
              <LossTable row={data.total} />
            </Panel>
          </div>
          <Panel className="p3__tabs">
            <Tabs
              activeKey={tab}
              onChange={setTab}
              size="small"
              items={(def.tabs ?? []).map((t) => ({ key: t.id, label: t.title, children: <TabBody id={t.id} data={data} level={level} /> }))}
            />
          </Panel>
        </div>
      )}
    </ScreenLayout>
  );
}

const withoutKeys = (params: URLSearchParams, keys: string[]) => Object.fromEntries([...params.entries()].filter(([k]) => !keys.includes(k)));

function CrumbLink({ current, to, label }: { current: boolean; to: string; label: string }) {
  return current ? <span className="crumbs__current">{label}</span> : <Link to={to}>{label}</Link>;
}

function Summary({ data, level }: { data: LossAnalysis; level: Level }) {
  const t = data.total;
  const stop = t.money.breakdown + t.money.changeover;
  const perf = t.money.minorStop + t.money.speed;
  const qual = t.money.defect + t.money.startup;
  const scope = level === 'equipment' ? '라인 기준' : undefined;
  return (
    <div className="p3__summary">
      <KpiCard label="OEE" value={t.oee === null ? null : t.oee * 100} unit="%" fractionDigits={1} footnote={scope ?? `가용성 × 성능 × 품질`} />
      <KpiCard label="가용성" value={t.availability === null ? null : t.availability * 100} unit="%" fractionDigits={1} footnote={`고장·교체 ${hours(t.loss.breakdown + t.loss.changeover)}시간`} />
      <KpiCard label="성능" value={t.performance === null ? null : t.performance * 100} unit="%" fractionDigits={1} footnote={`소정지 ${formatNumber(data.minorStops.count, 0)}회 · 속도 저하 ${hours(t.loss.speed)}시간`} />
      <KpiCard label="품질 (시간 기준)" value={t.quality === null ? null : t.quality * 100} unit="%" fractionDigits={1} footnote={`불량·초기 불량 ${hours(t.loss.defect + t.loss.startup)}시간`} />
      <MoneyCard label="비가동 손실 금액 (고장 + 교체)" amount={stop} footnote="경영 현황의 비가동 손실과 같은 계산 (D-18)" />
      <MoneyCard label="성능·품질 손실 금액" amount={perf + qual} footnote={`성능 ${formatMoney(perf)} · 품질 ${formatMoney(qual)} 백만 원`} />
    </div>
  );
}

function ChildGrid({ rows, level, selectedId, onPick }: { rows: OeeRow[]; level: Level; selectedId: string | null; onPick: (r: OeeRow) => void }) {
  const equipment = level === 'line' || level === 'equipment';
  const columns = useMemo<GridColumn[]>(
    () =>
      equipment
        ? [
            { field: 'name', label: '설비', flex: 1.6, pinned: true },
            { field: 'events', label: '정지 (건)', flex: 0.7, format: 'number' },
            { field: 'brk', label: '고장 (시간)', flex: 0.8, align: 'right', formatter: (v) => hours(v as number) },
            { field: 'chg', label: '교체 (시간)', flex: 0.8, align: 'right', formatter: (v) => hours(v as number) },
            { field: 'lossKrw', label: '정지 손실 (천 원)', flex: 1, align: 'right', formatter: (v) => thousand(v as number) }
          ]
        : [
            { field: 'name', label: level === 'company' ? '사업장' : '라인', flex: 1.5, pinned: true },
            { field: 'oee', label: 'OEE (%)', flex: 0.7, align: 'right', formatter: (v) => pct(v as number | null) },
            { field: 'availability', label: '가용성 (%)', flex: 0.75, align: 'right', formatter: (v) => pct(v as number | null) },
            { field: 'performance', label: '성능 (%)', flex: 0.7, align: 'right', formatter: (v) => pct(v as number | null) },
            { field: 'quality', label: '품질 (%)', flex: 0.7, align: 'right', formatter: (v) => pct(v as number | null) },
            { field: 'lossMin', label: '6대 손실 (시간)', flex: 0.9, align: 'right', formatter: (v) => hours(v as number) },
            { field: 'lossKrw', label: '손실 금액 (천 원)', flex: 1, align: 'right', formatter: (v) => thousand(v as number) }
          ],
    [equipment, level]
  );
  return (
    <DataGrid
      ariaLabel="하위 계층"
      columns={columns}
      rows={equipment ? rows.map((r) => ({ ...r, brk: r.loss.breakdown, chg: r.loss.changeover })) : rows}
      height="fill"
      selectedId={selectedId}
      onRowClick={onPick}
      emptyText={equipment ? '이 라인에 등록된 설비가 없습니다.' : '조건에 맞는 실적이 없습니다.'}
    />
  );
}

function Waterfall({ row }: { row: OeeRow }) {
  const steps = LOSS_ORDER.map((k) => ({ k, h: Math.max(0, row.loss[k]) / 60 }));
  const start = row.pptMin / 60;
  let level = start;
  const base: (number | null)[] = [null];
  const loss: (number | null)[] = [null];
  for (const s of steps) {
    level -= s.h;
    base.push(level);
    loss.push(s.h);
  }
  const end = Math.max(0, level);
  return (
    <Chart
      ariaLabel={`6대 손실 폭포형 차트. 계획 가동 ${formatNumber(start, 1)}시간에서 손실을 빼 완전 가동 ${formatNumber(end, 1)}시간`}
      unit="시간"
      fractionDigits={1}
      categories={['계획', ...steps.map((s) => SHORT[s.k]), '완전가동']}
      series={[
        { name: '기준', data: [...base, null], kind: 'bar', color: 'actual', stack: 'w', invisible: true },
        { name: '손실', data: [...loss, null], kind: 'bar', color: 'color-series-1', stack: 'w' },
        { name: '가동 시간', data: [start, ...steps.map(() => null), end], kind: 'bar', color: 'actual', stack: 'w' }
      ]}
      fill
    />
  );
}

function LossTable({ row }: { row: OeeRow }) {
  const stop = row.money.breakdown + row.money.changeover;
  return (
    <table className="data-table p3__loss-table">
      <thead>
        <tr>
          <th>손실</th>
          <th className="num-col">시간</th>
          <th className="num-col">금액 (천 원)</th>
        </tr>
      </thead>
      <tbody>
        {LOSS_ORDER.map((k) => (
          <tr key={k}>
            <td>{LOSS_LABELS[k]}</td>
            <td className="num num-col">{hours(row.loss[k])}</td>
            <td className="num num-col">{thousand(row.money[k])}</td>
          </tr>
        ))}
        <tr className="data-table__total">
          <td>합계</td>
          <td className="num num-col">{hours(row.lossMin)}</td>
          <td className="num num-col">{thousand(row.lossKrw)}</td>
        </tr>
      </tbody>
      <caption className="caption p3__loss-caption">
        비가동(고장 + 교체) {formatMoney(stop)} 백만 원. 금액 환산: 고장·교체는 납기 제약 라인 공헌이익, 그 밖 라인 투입 인원 × 잔업 단가 · 소정지·속도 저하는 투입 인원 × 잔업 단가 · 불량은 폐기(재료비 + 가공비)·재작업 단가 ({terms.badges.demoOnly} 가상 단가)
      </caption>
    </table>
  );
}

function TabBody({ id, data, level }: { id: string; data: LossAnalysis; level: Level }) {
  const navigate = useNavigate();
  const link = useShellLink();
  const [params] = useSearchParams();
  const period = params.get('f.period');
  const compareColumns = useMemo<GridColumn[]>(
    () => [
      { field: 'name', label: id === 'shifts' ? '교대' : '제품', flex: 1.6, pinned: true },
      { field: 'oee', label: 'OEE (%)', flex: 0.7, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'availability', label: '가용성 (%)', flex: 0.7, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'performance', label: '성능 (%)', flex: 0.7, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'quality', label: '품질 (%)', flex: 0.7, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'plan', label: '계획 달성률 (%)', flex: 0.8, align: 'right', formatter: (v) => pct(v as number | null) },
      { field: 'lossMin', label: '6대 손실 (시간)', flex: 0.8, align: 'right', formatter: (v) => hours(v as number) },
      { field: 'lossKrw', label: '손실 금액 (천 원)', flex: 0.9, align: 'right', formatter: (v) => thousand(v as number) }
    ],
    [id]
  );
  const causeColumns = useMemo<GridColumn[]>(
    () => [
      { field: 'cause', label: '원인', flex: 1.6, pinned: true },
      { field: 'category', label: '손실 분류', flex: 0.8, formatter: (v) => LOSS_LABELS[v as 'breakdown'] },
      { field: 'events', label: '사건 (건)', flex: 0.6, format: 'number' },
      { field: 'lineMin', label: '라인 환산 정지 (시간)', flex: 0.9, align: 'right', formatter: (v) => hours(v as number) },
      { field: 'share', label: '정지 중 비중 (%)', flex: 0.8, align: 'right', formatter: (v) => formatNumber((v as number) * 100, 1) }
    ],
    []
  );
  const eventColumns = useMemo<GridColumn[]>(
    () => [
      { field: 'start', label: '시작', flex: 1, pinned: true, formatter: (v) => formatDateTime(parseTime(String(v))) },
      { field: 'lineName', label: '라인', flex: 1 },
      { field: 'equipmentName', label: '설비', flex: 1.2, formatter: (v, r) => `${String(r.equipmentId).split('-').pop()} ${v}` },
      { field: 'category', label: '손실 분류', flex: 0.8, formatter: (v) => LOSS_LABELS[v as 'breakdown'] },
      { field: 'cause', label: '원인', flex: 1.2 },
      { field: 'durationMin', label: '정지 (분)', flex: 0.6, format: 'number' },
      { field: 'lineMin', label: '라인 환산 (분)', flex: 0.7, format: 'number' }
    ],
    []
  );
  if (id === 'causes') {
    const total = data.causes.reduce((a, c) => a + c.lineMin, 0);
    const rows = data.causes.slice(0, 30).map((c) => ({ ...c, id: c.causeCode, share: total ? c.lineMin / total : 0 }));
    return (
      <div className="p3__tab">
        <p className="caption p3__tab-note">
          고장·교체 사건의 원인별 합계입니다. 소정지 {formatNumber(data.minorStops.count, 0)}회({hours(data.minorStops.minutes)}시간)는 사건으로 기록하지 않아 원인별로 나누지 않습니다. 행을 누르면 비가동 이력에서 해당 사건을 봅니다.
        </p>
        <DataGrid
          ariaLabel="손실 상위 원인"
          columns={causeColumns}
          rows={rows}
          height="fill"
          emptyText="기간 안에 고장·교체 사건이 없습니다."
          onRowClick={(r) => navigate(link('OPS-050', { 'f.cause': String(r.cause), ...(period ? { 'f.start': period } : {}) }))}
        />
      </div>
    );
  }
  if (id === 'events') {
    return (
      <div className="p3__tab">
        <DataGrid
          ariaLabel="비가동 사건"
          columns={eventColumns}
          rows={data.events.slice(0, 500)}
          height="fill"
          emptyText="기간 안에 고장·교체 사건이 없습니다."
          onRowClick={(r) => navigate(link('MNT-011', { id: String(r.equipmentId) }))}
        />
        {data.events.length > 500 && <span className="caption">최근 500건만 보입니다. 전체는 비가동 이력에서 조회하세요.</span>}
      </div>
    );
  }
  const rows = id === 'shifts' ? data.byShift : data.byProduct;
  return (
    <div className="p3__tab">
      <DataGrid
        ariaLabel={id === 'shifts' ? '교대 비교' : '제품 비교'}
        columns={compareColumns}
        rows={rows}
        height="fill"
        onRowClick={id === 'products' ? (r) => navigate(link('QUA-020', { 'f.productId': r.id })) : undefined}
      />
      {id === 'products' && <span className="caption">제품 행을 누르면 품질 원인 분석으로 갑니다.{level === 'company' && ' 전사에서는 사업장마다 제품이 다릅니다.'}</span>}
    </div>
  );
}
