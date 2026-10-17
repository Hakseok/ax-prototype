// P11 원인 분석형 (QUA-020): narrow by period, product, line and defect type; compare problem lots
// with normal lots; the engine's cause candidates (rank, effect size, confidence, samples),
// a scatter of the selected candidate, group findings, the lot table with one lot against the
// normal range, and the recommended condition with its expected effect — judged by people.
import { useMemo } from 'react';
import { Alert as Notice, Button, Empty, Skeleton } from 'antd';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { AiResultCard, confidenceLabel } from '../../components/AiResultCard';
import { ScatterChart } from '../../components/Chart';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { KpiCard, formatNumber } from '../../components/KpiCard';
import { MoneyCard } from '../../components/MoneyCard';
import { Panel } from '../../components/Panel';
import { company, terms } from '../../config';
import { decide, decisionStore, recommend, rootCause, type CauseQuery } from '../../data/aiEngine';
import { useLocalStore } from '../../data/localStore';
import { loadEquipment, loadMolds, loadProducts } from '../../data/loaders';
import { analysisLots, causeTarget, lotParams } from '../../data/qualityAnalysis';
import { NOW, formatDate } from '../../data/time';
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
import './P11.css';

interface P11Definition {
  badges?: string[];
  filters: FieldDef[];
  analysis: { problemRule: string; links?: { label: string; to: string }[] };
  actions: string[];
}

const SHIFT_NAMES = new Map([...company.shifts['3shift'], ...company.shifts['2shift']].map((s) => [s.id, s.name]));
const pct = (x: number, d = 2) => `${formatNumber(x * 100, d)}%`;

export function P11Cause({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P11Definition;
  const app = useApp();
  const link = useShellLink();
  const [params, setParams] = useSearchParams();
  const { values, apply } = useFilterState(def.filters);
  const { options, maps } = useRefs(def.filters, []);
  const decisions = useLocalStore(decisionStore);
  const p = toParams(def.filters, values);
  const [from, toRaw] = (p.period as [number, number]) ?? [NOW, NOW];
  const to = Math.min(toRaw, NOW);
  const productSel = values.productId ? String(values.productId) : null;
  const lineSel = values.lineId ? String(values.lineId) : null;
  const defectType = values.defectType ? String(values.defectType) : undefined;

  const { value: data, loading } = useAsync(async () => {
    const target = await causeTarget(app.selectedSiteIds, from, to, productSel, lineSel);
    if (!target) return { target: null };
    const q: CauseQuery = { siteIds: [target.siteId], productId: target.productId, lineId: target.lineId, from, to, ...(defectType ? { defectType } : {}) };
    const [cause, rec, lots, products, eqs, molds] = await Promise.all([rootCause(q), recommend(q), analysisLots(q.siteIds, from, to, target.productId, target.lineId), loadProducts(), loadEquipment(), loadMolds()]);
    return { target, q, cause, rec, lots, product: products.find((x) => x.id === target.productId)!, eqs, molds };
  }, `${app.selectedSiteIds}|${from}|${to}|${productSel}|${lineSel}|${defectType}|${JSON.stringify(decisions)}`);

  const set = (k: string, v: string | null) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      if (v === null) n.delete(k);
      else n.set(k, v);
      return n;
    }, { replace: true });

  const auto = data?.target && (!productSel || !lineSel);
  const lineName = (id: string) => maps.lines?.get(id) ?? options.lines?.find((o) => o.value === id)?.label ?? id;

  const toolbar = (
    <>
      {data?.target && (
        <span className="caption">
          {data.product.id} {data.product.name} · {lineName(data.target.lineId)}
          {defectType ? ` · ${defectType}` : ' · 전체 불량'} · {formatDate(from)}~{formatDate(to - 1)}
          {auto && ` · 직전 같은 기간보다 불량률이 가장 크게 오른 제품·라인을 자동으로 골랐습니다(+${formatNumber(data.target.rise * 100, 2)}%p)`}
        </span>
      )}
      <span className="toolbar__spacer" />
      <span className="caption">비교 기준: {def.analysis.problemRule}</span>
      {def.actions.includes('내보내기') && (
        <Button icon={<DownloadOutlined />} disabled={!data?.lots?.length} onClick={() => data?.lots && exportLots(entry.id, entry.name, data)}>
          내보내기
        </Button>
      )}
    </>
  );

  return (
    <ScreenLayout entry={entry} badges={[...badges, ...(def.badges ?? [])]} conditions={<FilterBar filters={def.filters} values={values} refOptions={options} onSubmit={apply} />} toolbar={toolbar}>
      {!data ? (
        <Skeleton active />
      ) : !data.target ? (
        <Empty description="기간 안에 생산 실적이 없습니다. 기간을 넓혀 다시 조회하세요." />
      ) : !data.cause ? (
        <Notice
          type="info"
          showIcon
          message="원인 후보를 만들지 않았습니다."
          description="문제 로트가 3개 미만이거나 비교할 로트가 10개 미만입니다(근거 부족). 기간을 넓히거나 다른 제품·라인을 고르세요."
        />
      ) : (
        <Analysis data={data as Data} selectedVar={params.get('var')} selectedLot={params.get('lot')} onVar={(v) => set('var', v)} onLot={(v) => set('lot', v)} loading={loading} link={link} />
      )}
    </ScreenLayout>
  );
}

type Data = {
  target: NonNullable<Awaited<ReturnType<typeof causeTarget>>>;
  q: CauseQuery;
  cause: NonNullable<Awaited<ReturnType<typeof rootCause>>>;
  rec: Awaited<ReturnType<typeof recommend>>;
  lots: Awaited<ReturnType<typeof analysisLots>>;
  product: { id: string; name: string };
  eqs: Awaited<ReturnType<typeof loadEquipment>>;
  molds: Awaited<ReturnType<typeof loadMolds>>;
};

const exportLots = (id: string, name: string, data: { cause: Data['cause'] | null; lots: Data['lots'] }) => {
  const problem = new Set(data.cause?.payload.problemLots ?? []);
  const cols: ColumnDef[] = [
    { field: 'id', label: '로트' },
    { field: 'date', label: '생산일' },
    { field: 'shift', label: '교대' },
    { field: 'equipmentId', label: '설비' },
    { field: 'moldId', label: '금형' },
    { field: 'materialLot', label: '자재 로트' },
    { field: 'qty', label: '수량', format: 'number' },
    { field: 'defectQty', label: '불량', format: 'number' },
    { field: 'group', label: '구분' }
  ];
  const rows = (data.lots ?? []).map((l) => ({ ...l, group: problem.has(l.id) ? '문제 로트' : '정상 로트' }));
  downloadCsv(`${id}_${name}_${formatDate(NOW)}.csv`, cols, rows, {});
};

function Analysis({ data, selectedVar, selectedLot, onVar, onLot, loading, link }: { data: Data; selectedVar: string | null; selectedLot: string | null; onVar: (v: string) => void; onLot: (v: string | null) => void; loading: boolean; link: ReturnType<typeof useShellLink> }) {
  const app = useApp();
  const { cause, rec } = data;
  const pay = cause.payload;
  const problem = useMemo(() => new Set(pay.problemLots), [pay.problemLots]);
  const cand = pay.candidates.find((c) => c.variable === selectedVar) ?? pay.candidates[0];
  const canEdit = app.hasPermission('편집');
  const userName = (id: string) => app.users.find((u) => u.id === id)?.name ?? id;
  const lotRate = (l: { qty: number; defectQty: number; defects: Record<string, number> }) => (l.qty ? (data.q.defectType ? l.defects[data.q.defectType] ?? 0 : l.defectQty) / l.qty : 0);
  const varValue = (l: Data['lots'][number], v: string) => {
    const [base, kind] = v.split(':');
    const x = l.params[base];
    return x ? (kind ? x[2] - x[1] : x[0]) : null;
  };
  const points = useMemo(() => {
    const out = { problem: [] as { x: number; y: number; id: string }[], normal: [] as { x: number; y: number; id: string }[] };
    for (const l of data.lots) {
      const x = varValue(l, cand.variable);
      if (x === null) continue;
      (problem.has(l.id) ? out.problem : out.normal).push({ x, y: Math.round(lotRate(l) * 10000) / 100, id: l.id });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.lots, cand.variable, problem]);
  const band = rec?.payload.conditions.find((c) => c.variable === cand.variable);
  const lot = data.lots.find((l) => l.id === selectedLot) ?? null;
  const normalLots = useMemo(() => data.lots.filter((l) => !problem.has(l.id)), [data.lots, problem]);
  const groupLabel = (field: string, v: string) => (field === 'equipmentId' ? `${v} ${data.eqs.find((e) => e.id === v)?.name ?? ''}` : field === 'moldId' ? data.molds.find((m) => m.id === v)?.name ?? v : field === 'shift' ? SHIFT_NAMES.get(v) ?? v : v);

  const lotColumns = useMemo<GridColumn[]>(
    () => [
      { field: 'id', label: '로트', flex: 2, pinned: true },
      { field: 'group', label: '구분', flex: 0.6 },
      { field: 'date', label: '생산', flex: 0.8, formatter: (v, r) => `${String(v).slice(5)} ${r.shift}` },
      { field: 'equipmentId', label: '설비', flex: 0.6, formatter: (v) => String(v).split('-').pop() ?? '' },
      { field: 'qty', label: '수량', flex: 0.6, format: 'number' },
      { field: 'rate', label: '불량률 (%)', flex: 0.7, align: 'right', formatter: (v) => formatNumber((v as number) * 100, 2) },
      { field: 'var', label: `후보 값 (${cand.unit})`, flex: 0.9, align: 'right', formatter: (v) => (v === null ? '' : formatNumber(v as number, 1)) }
    ],
    [cand.label, cand.unit]
  );
  const lotRows = useMemo(
    () =>
      data.lots
        .map((l) => ({ ...l, group: problem.has(l.id) ? '문제' : '정상', rate: lotRate(l), var: varValue(l, cand.variable) }))
        .sort((a, b) => b.rate - a.rate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.lots, problem, cand.variable]
  );
  const problemQty = data.lots.filter((l) => problem.has(l.id)).reduce((a, l) => a + l.qty, 0);
  const adopted = rec?.decision?.value === '채택';
  const groupEq = pay.groups.find((g) => g.field === 'equipmentId');

  return (
    <div className={`p11${loading ? ' p11--loading' : ''}`}>
      <div className="p11__summary">
        <KpiCard label="비교 로트" value={data.lots.length} unit="개" footnote={`문제 ${pay.problemLots.length} · 정상 ${pay.normalLots}`} />
        <KpiCard label="문제 로트 불량률" value={pay.problemRate * 100} unit="%" fractionDigits={2} footnote={`문제 로트 ${formatNumber(problemQty, 0)}개 생산`} />
        <KpiCard label="기간 중앙값 불량률" value={pay.medianRate * 100} unit="%" fractionDigits={2} footnote={`문제 로트 기준 ${pct(Math.max(pay.medianRate * 1.6, 0.005))} 이상`} />
        <KpiCard label="원인 후보" value={pay.candidates.length} unit="개" footnote={`1순위 ${pay.candidates[0].label} · 신뢰도 ${confidenceLabel(pay.candidates[0].confidence)}`} />
        {rec ? (
          <MoneyCard label="월 불량 손실 (권장 조건 미적용 시)" amount={rec.payload.monthlySavingKrw} footnote={`불량률 ${pct(rec.payload.currentRate, 1)} → ${pct(rec.payload.expectedRate, 1)} 예상 · 월 ${formatNumber(rec.payload.monthlyDefectReduction, 0)}개`} />
        ) : (
          <KpiCard label="권장 조건" value={null} unit="" footnote="권장 범위 안 로트가 부족해 만들지 않음" />
        )}
      </div>

      <div className="p11__row">
        <Panel title="원인 후보" caption="불량 로트 대 정상 로트 · 영향 크기 순" className="p11__candidates">
          <table className="data-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>변수</th>
                <th className="num-col">불량 로트</th>
                <th className="num-col">정상 로트</th>
                <th className="num-col">영향 크기</th>
                <th className="num-col">신뢰도</th>
              </tr>
            </thead>
            <tbody>
              {pay.candidates.map((c, i) => (
                <tr key={c.variable} className={c.variable === cand.variable ? 'data-table__selected p11__pick' : 'p11__pick'} onClick={() => onVar(c.variable)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onVar(c.variable)} aria-selected={c.variable === cand.variable}>
                  <td className="num">{i + 1}</td>
                  <td>
                    {c.label} <span className="caption">({c.unit}, {c.direction})</span>
                  </td>
                  <td className="num num-col">
                    {formatNumber(c.problemRange[0], 1)}~{formatNumber(c.problemRange[1], 1)}
                  </td>
                  <td className="num num-col">
                    {formatNumber(c.normalRange[0], 1)}~{formatNumber(c.normalRange[1], 1)}
                  </td>
                  <td className="num num-col">{formatNumber(Math.abs(c.effect), 2)}</td>
                  <td className="num num-col">
                    {confidenceLabel(c.confidence)} {Math.round(c.confidence * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="caption p11__note">
            범위는 로트 평균의 10~90%. 영향 크기 = (불량 로트 평균 − 정상 로트 평균) ÷ 정상 로트 표준편차(하한: 정상 평균의 5%). 표본: 불량 {pay.problemLots.length} · 정상 {pay.normalLots} 로트. 상관에 근거한 후보이며 인과는 현장 확인이 필요합니다.
          </p>
        </Panel>
        <Panel title={`${cand.label}과 불량률`} caption={`로트별 · ${band ? '띠 = 권장 조건' : '권장 조건 대상 아님'}`} className="p11__scatter">
          <ScatterChart
            ariaLabel={`${cand.label}과 로트 불량률 산점도. 불량 로트는 채운 점, 정상 로트는 속 빈 점`}
            xName={`${cand.label} (${cand.unit})`}
            yName="불량률 (%)"
            groups={[
              { name: '불량 로트', points: points.problem, color: 'color-series-1' },
              { name: '정상 로트', points: points.normal, color: 'compare', hollow: true }
            ]}
            band={band ? { from: band.range[0], to: band.range[1], label: '권장' } : undefined}
            onPick={(id) => onLot(id)}
            fill
          />
        </Panel>
        <div className="p11__ai">
          <AiResultCard result={cause} userName={userName} onDecide={canEdit ? (v, reason) => decide(cause.id, v, reason, app.user.id) : undefined} />
          {rec && <AiResultCard result={rec} userName={userName} onDecide={canEdit ? (v, reason) => decide(rec.id, v, reason, app.user.id) : undefined} />}
          {adopted && (
            <Notice
              type="info"
              showIcon
              message="권장 조건을 채택했습니다."
              description={
                <>
                  공정 조건 관리 기준에 반영한 뒤 개선분은 <Link to={link('EXE-020', { item: 'fx.defect' })}>공정 불량 감소(확정)</Link>로 측정됩니다. 측정 전까지 예상 효과는{' '}
                  <Link to={link('EXE-020', { item: `fx.potential.defect.${data.target.lineId}` })}>잠재</Link>로 남고 합계에 넣지 않습니다.
                </>
              }
            />
          )}
        </div>
      </div>

      <div className="p11__row p11__row--bottom">
        <Panel title="집단 비교" caption="불량 로트에 몰린 설비·금형·자재 로트·교대" className="p11__groups">
          {pay.groups.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>값</th>
                  <th className="num-col">불량 로트 중</th>
                  <th className="num-col">정상 로트 중</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pay.groups.map((g) => (
                  <tr key={g.field + g.value}>
                    <td>{g.label}</td>
                    <td>{groupLabel(g.field, g.value)}</td>
                    <td className="num num-col">{Math.round(g.problemShare * 100)}%</td>
                    <td className="num num-col">{Math.round(g.normalShare * 100)}%</td>
                    <td>{g.field === 'equipmentId' && <Link to={link('MNT-011', { id: g.value })}>설비 진단</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="caption">불량 로트에 특별히 몰린 설비·금형·자재 로트가 없습니다.</p>
          )}
          <div className="p11__actions">
            <span className="caption">조치로 연결</span>
            {groupEq && <Link to={link('MNT-020', { new: '1', eq: groupEq.value })}>{groupEq.value} 정비 요청</Link>}
            <Link to={link('OPS-020', { line: data.target.lineId, 'f.productId': data.target.productId })}>라인 손실 분석</Link>
            <Link to={link('QUA-030', { 'f.productId': data.target.productId })}>이 제품의 클레임</Link>
          </div>
        </Panel>
        <Panel title="로트" caption={`후보 값 = ${cand.label} · 행이나 산점도의 점을 누르면 그 로트의 공정 조건을 정상 로트와 비교`} className="p11__lots">
          <div className="p11__lots-body">
            <DataGrid ariaLabel="분석 로트" columns={lotColumns} rows={lotRows} height="fill" selectedId={selectedLot} onRowClick={(r) => onLot(r.id)} />
            <LotCompare lot={lot} normalLots={normalLots} problem={lot ? problem.has(lot.id) : false} groupLabel={groupLabel} onClose={() => onLot(null)} />
          </div>
        </Panel>
      </div>
      <p className="caption">원인 후보와 권장 조건은 {terms.badges.virtualEngine}이 로트 데이터에서 계산했습니다. 금액은 {terms.badges.demoOnly} 가상 단가입니다.</p>
    </div>
  );
}

function LotCompare({ lot, normalLots, problem, groupLabel, onClose }: { lot: Data['lots'][number] | null; normalLots: Data['lots']; problem: boolean; groupLabel: (f: string, v: string) => string; onClose: () => void }) {
  if (!lot) return <div className="p11__lot p11__lot--empty caption">로트를 고르세요.</div>;
  const rows = lotParams(lot, normalLots);
  return (
    <div className="p11__lot">
      <div className="p11__lot-head">
        <strong className="num">{lot.id}</strong>
        <span className="caption">{problem ? '불량 로트' : '정상 로트'}</span>
        <span className="p11__spacer" />
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="로트 비교 닫기" title="로트 비교 닫기" />
      </div>
      <dl className="facts">
        <dt>설비</dt>
        <dd>{groupLabel('equipmentId', lot.equipmentId)}</dd>
        <dt>금형</dt>
        <dd>{lot.moldId ? groupLabel('moldId', lot.moldId) : '-'}</dd>
        <dt>자재 로트</dt>
        <dd className="num">{lot.materialLot}</dd>
        <dt>불량</dt>
        <dd>{Object.entries(lot.defects).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'}</dd>
      </dl>
      <table className="data-table">
        <thead>
          <tr>
            <th>공정 조건</th>
            <th className="num-col">이 로트 (평균·최소~최대)</th>
            <th className="num-col">정상 로트 범위</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.outside ? 'data-table__selected' : undefined}>
              <td>
                {r.name} <span className="caption">({r.unit})</span>
              </td>
              <td className="num num-col">
                {formatNumber(r.value[0], r.digits)} · {formatNumber(r.value[1], r.digits)}~{formatNumber(r.value[2], r.digits)}
                {r.outside && ' · 범위 밖'}
              </td>
              <td className="num num-col">
                {formatNumber(r.normal[0], r.digits)}~{formatNumber(r.normal[1], r.digits)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
