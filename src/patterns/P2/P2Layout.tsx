// P2 배치도형 (OPS-030): every line of the site as a band of machine tiles in line order, the
// state of each machine at "now" (가동·정지·계획 비가동·미수신, neutral marks — guide: 정상은 무채색),
// health from the engine as a status badge only when not normal, the selected machine's detail,
// and the line × day bottleneck heatmap below.
import { useMemo } from 'react';
import { Segmented, Skeleton } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HeatmapChart } from '../../components/Chart';
import { formatNumber } from '../../components/KpiCard';
import { Panel } from '../../components/Panel';
import { StatusBadge } from '../../components/StatusBadge';
import { terms } from '../../config';
import { bottleneckGrid, lineBoard, type GridMetric, type LineBand, type MachineState, type MachineTile } from '../../data/lineMonitor';
import { DAY, NOW, formatDate, formatDateTime, formatTime, parseTime, startOfDay } from '../../data/time';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import '../common/patterns.css';
import './P2.css';

interface P2Definition {
  badges?: string[];
  diagram: { source: 'lineBoard'; heatmap: { days: number; metrics: { id: GridMetric; label: string }[] } };
}

const STATES: MachineState[] = ['가동', '정지', '계획 비가동', '미수신'];
const STATE_CLASS: Record<MachineState, string> = { 가동: 'run', 정지: 'stop', '계획 비가동': 'idle', 미수신: 'missing' };
const CATEGORY: Record<string, string> = { breakdown: '고장', changeover: '금형·품번 교체' };
const pct = (v: number | null) => (v === null ? '-' : `${formatNumber(v * 100, 1)}%`);

export function P2Layout({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P2Definition;
  const app = useApp();
  const link = useShellLink();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const siteId = app.siteSelection;
  const selected = params.get('eq');
  const metricId = (params.get('metric') as GridMetric | null) ?? def.diagram.heatmap.metrics[0].id;
  const { value: board } = useAsync(() => lineBoard(siteId), siteId);
  const { value: grid } = useAsync(() => bottleneckGrid(siteId, metricId, def.diagram.heatmap.days), `${siteId}|${metricId}`);
  const set = (k: string, v: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v === null) n.delete(k);
      else n.set(k, v);
      return n;
    });

  const counts = useMemo(() => {
    const c = new Map<MachineState, number>();
    for (const b of board ?? []) for (const m of b.machines) c.set(m.state, (c.get(m.state) ?? 0) + 1);
    return c;
  }, [board]);
  const pick = board?.flatMap((b) => b.machines.map((m) => ({ band: b, m }))).find((x) => x.m.id === selected) ?? null;
  const metricLabel = def.diagram.heatmap.metrics.find((m) => m.id === metricId)?.label ?? metricId;

  const heat = useMemo(() => {
    if (!grid) return null;
    const cells: [number, number, number | null][] = [];
    grid.values.forEach((row, y) => row.forEach((v, x) => cells.push([x, y, v === null ? null : Math.round(v * 1000) / 10])));
    const marked = new Set(grid.bottleneck.flatMap((y, x) => (y === null ? [] : [`${x}|${y}`])));
    const vals = cells.map((c) => c[2]).filter((v): v is number => v !== null);
    const range: [number, number] = vals.length ? [Math.floor(Math.min(...vals) / 10) * 10, Math.min(100, Math.ceil(Math.max(...vals) / 10) * 10)] : [0, 100];
    // How often each line was the day's bottleneck.
    const tally = grid.lines.map((l, i) => ({ name: l.name, n: grid.bottleneck.filter((b) => b === i).length })).sort((a, b) => b.n - a.n);
    return { cells, marked, range, tally };
  }, [grid]);

  const openCell = (x: number, y: number) => {
    if (!grid) return;
    const day = startOfDay(NOW) - (grid.days.length - 1 - x) * DAY;
    const d = formatDate(day);
    navigate(link('OPS-020', { line: grid.lines[y].id, 'f.period': `${d}~${d}` }));
  };

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      toolbar={
        <>
          <span className="caption num">{formatDateTime(NOW)} 기준</span>
          <span className="p2__legend">
            {STATES.map((s) => (
              <span key={s} className="p2__legend-item">
                <i className={`p2__mark p2__mark--${STATE_CLASS[s]}`} aria-hidden="true" />
                {s} <span className="num">{counts.get(s) ?? 0}</span>
              </span>
            ))}
          </span>
          <span className="toolbar__spacer" />
          <span className="caption">설비를 누르면 오른쪽에 상세가 보입니다. 배치는 라인 순서대로 그린 도식입니다.</span>
        </>
      }
      bodyMode="fit"
    >
      <div className="p2">
        <div className="p2__top">
          <Panel title="라인 배치와 설비 상태" className="p2__board">
            {!board ? <Skeleton active /> : <div className="p2__bands">{board.map((b) => <Band key={b.id} band={b} selected={selected} onPick={(id) => set('eq', id === selected ? null : id)} />)}</div>}
          </Panel>
          <Panel title="선택 설비" className="p2__detail">
            {pick ? <Detail band={pick.band} m={pick.m} /> : <p className="caption">배치도에서 설비를 고르세요. 상태, 오늘 정지, 건전성, 관련 화면 링크가 보입니다.</p>}
          </Panel>
        </div>
        <Panel
          title={`병목 히트맵 · ${metricLabel}`}
          caption={`최근 ${def.diagram.heatmap.days}일 · 라인 × 일자 · 굵은 테두리 = 그날 가장 낮은 라인(병목) · 빈 칸 = 생산 없는 날(휴무) · 칸을 누르면 그날의 OEE·손실 분석`}
          className="p2__heat"
          extra={
            <Segmented size="small" value={metricId} onChange={(v) => set('metric', String(v))} options={def.diagram.heatmap.metrics.map((m) => ({ value: m.id, label: m.label }))} />
          }
        >
          {!grid || !heat ? (
            <Skeleton active />
          ) : (
            <div className="p2__heat-body">
              <HeatmapChart
                xCategories={grid.days}
                yCategories={grid.lines.map((l) => l.name)}
                cells={heat.cells}
                unit="%"
                digits={1}
                range={heat.range}
                lowIsIntense
                marked={heat.marked}
                markLabel="병목"
                ariaLabel={`라인별 일별 ${metricLabel} 히트맵`}
                fill
                onPick={openCell}
              />
              <div className="p2__tally">
                <h3 className="p2__h">병목이 된 날</h3>
                <table className="data-table">
                  <tbody>
                    {heat.tally.map((t) => (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td className="num num-col">{t.n}일</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="caption">교대 실적이 라인 단위라 일자 단위로 봅니다(D-48). 시간대 병목은 공정별 실적 연계 후 제공합니다.</p>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </ScreenLayout>
  );
}

function Band({ band, selected, onPick }: { band: LineBand; selected: string | null; onPick: (id: string) => void }) {
  const c = band.current;
  return (
    <section className="p2__band" aria-label={band.name}>
      <header className="p2__band-head">
        <strong>{band.name}</strong>
        <span className="caption">{band.process}</span>
        <span className="p2__spacer" />
        {band.utility ? (
          <span className="caption">상시 가동</span>
        ) : c ? (
          <span className="caption num">
            {band.shiftName} · OEE {pct(c.oee)} · 생산 {formatNumber(c.produced, 0)} / 계획 {formatNumber(c.planned, 0)}
          </span>
        ) : (
          <span className="caption">교대 없음</span>
        )}
      </header>
      <div className="p2__tiles">
        {band.machines.map((m) => (
          <button key={m.id} type="button" className={`p2__tile p2__tile--${STATE_CLASS[m.state]}${selected === m.id ? ' p2__tile--selected' : ''}`} onClick={() => onPick(m.id)} aria-pressed={selected === m.id}>
            <span className="p2__tile-name">{m.name}</span>
            <span className="p2__tile-state">
              <i className={`p2__mark p2__mark--${STATE_CLASS[m.state]}`} aria-hidden="true" />
              {m.state}
              {m.stopsToday > 0 && <span className="caption num"> · 오늘 정지 {m.stopsToday}회</span>}
            </span>
            {m.health && m.health.level && m.health.level !== 'normal' && (
              <span className="p2__tile-health">
                <StatusBadge level={m.health.level} /> <span className="caption num">건전성 {m.health.index}</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function Detail({ band, m }: { band: LineBand; m: MachineTile }) {
  const link = useShellLink();
  const today = formatDate(NOW);
  const h = m.health;
  return (
    <div className="p2__facts">
      <h3 className="p2__title">{m.name}</h3>
      <dl className="facts">
        <dt>설비</dt>
        <dd className="num">{m.id}</dd>
        <dt>라인</dt>
        <dd>{band.name}</dd>
        <dt>상태</dt>
        <dd>
          <i className={`p2__mark p2__mark--${STATE_CLASS[m.state]}`} aria-hidden="true" /> {m.state}
          {m.state === '미수신' && <span className="caption"> · 값은 0이 아니라 미수신으로 표시합니다</span>}
        </dd>
        <dt>오늘 정지</dt>
        <dd className="num">
          {m.stopsToday}회 · {formatNumber(m.stopMinToday, 0)}분
        </dd>
        <dt>최근 정지</dt>
        <dd>{m.stop ? `${CATEGORY[m.stop.category] ?? m.stop.category} · ${m.stop.cause} · ${formatTime(parseTime(m.stop.start))}~${formatTime(parseTime(m.stop.end))}` : '없음'}</dd>
        <dt>건전성</dt>
        <dd>{h ? (h.index === null ? terms.noData : `${h.index} / 100 · ${h.failureMode}${h.rul ? ` · 잔여수명 ${h.rul}` : ''}`) : '감시 대상 아님'}</dd>
        <dt>수집 장치</dt>
        <dd>{m.collector}</dd>
      </dl>
      <div className="p2__links">
        {h && <Link to={link('MNT-011', { id: m.id })}>설비 진단 상세</Link>}
        {!band.utility && <Link to={link('OPS-020', { line: band.id, eq: m.id, 'f.period': `${today}~${today}` })}>오늘 손실 분석</Link>}
        <Link to={link('OPS-050', { 'f.lineId': band.id, 'f.cause': m.name })}>비가동 이력</Link>
      </div>
    </div>
  );
}
