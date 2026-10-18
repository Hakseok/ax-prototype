// P13 공정도형 · viewer (OPS-060 설비 가동 화면): a published process view of the selected site.
// 공정 shows equipment state, health badges and sensor values; 에너지 shows line demand and
// compressed air on the zones. A time slider steps through today in 15-minute steps (the energy
// granularity) so the view can be replayed without generating data on screen. 대형 화면 opens the
// same view as a dark full-screen wallboard for a control room. Read only: no control commands.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Empty, Segmented, Skeleton, Slider, Tooltip } from 'antd';
import { CaretRightOutlined, FullscreenOutlined, PauseOutlined, StepForwardOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { formatNumber } from '../../components/KpiCard';
import { Panel } from '../../components/Panel';
import { StatusBadge } from '../../components/StatusBadge';
import { button, terms } from '../../config';
import { riskFeed, type Risk } from '../../data/executive';
import { hmiSnapshot, hmiStore, playbackTimes, publishedScreens, type HmiScreen, type HmiSnapshot } from '../../data/hmi';
import type { MachineState } from '../../data/lineMonitor';
import { useLocalStore } from '../../data/localStore';
import { NOW, formatDate, formatDateTime, formatTime, parseTime } from '../../data/time';
import { useTheme } from '../../theme/ThemeProvider';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import { HmiDefs, HmiDrawing, STATE_CLASS, type HmiView } from './HmiDrawing';
import { HmiIso, IsoDefs, isoBox, type IsoLook } from './HmiIso';
import '../common/patterns.css';
import '../P2/P2.css';
import './P13.css';

export interface P13Definition {
  hmi: { mode: 'viewer' | 'designer'; views?: HmiView[]; playbackStepMin?: number; canvas?: [number, number]; grid?: number; maxSignals?: number };
}

const STATES: MachineState[] = ['가동', '정지', '계획 비가동', '미수신'];
const VIEW_LABEL: Record<HmiView, string> = { process: '공정', energy: '에너지' };
export type Projection = 'iso' | 'plan';
export const PROJECTION_OPTIONS = [{ value: 'iso', label: '입체' }, { value: 'plan', label: '평면' }];
export const LOOK_OPTIONS = [{ value: 'standard', label: '기본' }, { value: 'illustrated', label: '일러스트 (검토)' }];
const CATEGORY: Record<string, string> = { breakdown: '고장', changeover: '금형·품번 교체' };

export function P13Viewer({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P13Definition;
  const app = useApp();
  const siteId = app.siteSelection;
  const all = useLocalStore(hmiStore);
  const screens = publishedScreens(all, siteId);
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v === null) n.delete(k);
      else n.set(k, v);
      return n;
    }, { replace: true });
  const screen = screens.find((s) => s.id === params.get('screen')) ?? screens[0] ?? null;
  const views = def.hmi.views ?? ['process', 'energy'];
  const view = (views.includes(params.get('view') as HmiView) ? params.get('view') : views[0]) as HmiView;
  const selected = params.get('eq');
  const projection: Projection = params.get('proj') === 'plan' ? 'plan' : 'iso';
  const look: IsoLook = params.get('look') === 'ill' ? 'illustrated' : 'standard';

  const times = useMemo(() => playbackTimes(def.hmi.playbackStepMin ?? 15), [def.hmi.playbackStepMin]);
  const [idx, setIdx] = useState(times.length - 1);
  const [playing, setPlaying] = useState(false);
  const at = times[idx];
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setIdx((i) => (i >= times.length - 1 ? i : i + 1)), 700);
    return () => clearInterval(timer);
  }, [playing, times.length]);
  useEffect(() => {
    if (playing && idx >= times.length - 1) setPlaying(false);
  }, [idx, playing, times.length]);

  const { value: snap } = useAsync(() => hmiSnapshot(siteId, at), `${siteId}|${at}`);
  const { value: risks } = useAsync(() => riskFeed([siteId]), siteId);
  const [wall, setWall] = useState(false);
  const pick = snap && selected ? snap.equipment.get(selected) ?? null : null;
  const live = at === NOW;
  const wallLabel = button('대형 화면');

  const playback = (
    <span className="p13__playback">
      <Tooltip title={playing ? '멈춤' : '오늘 0시부터 다시 보기'}>
        <Button size="small" aria-label={playing ? '멈춤' : '재생'} icon={playing ? <PauseOutlined /> : <CaretRightOutlined />} onClick={() => {
          if (!playing && idx >= times.length - 1) setIdx(0);
          setPlaying(!playing);
        }} />
      </Tooltip>
      <Slider className="p13__slider" min={0} max={times.length - 1} value={idx} onChange={(v) => { setPlaying(false); setIdx(v); }} tooltip={{ formatter: (v) => formatTime(times[v ?? 0]) }} aria-label="기준 시각" />
      <Tooltip title="지금으로">
        <Button size="small" aria-label="지금으로" icon={<StepForwardOutlined />} disabled={live} onClick={() => { setPlaying(false); setIdx(times.length - 1); }} />
      </Tooltip>
      <span className="num p13__time">{formatTime(at)}{live ? ' 현재' : ''}</span>
    </span>
  );

  return (
    <ScreenLayout
      entry={entry}
      badges={badges}
      primary={
        <Button
          type="primary"
          icon={<FullscreenOutlined />}
          disabled={!screen}
          onClick={() => {
            // Full screen needs the click itself; the overlay covers the page either way.
            document.documentElement.requestFullscreen?.().catch(() => undefined);
            setWall(true);
          }}
        >
          {wallLabel}
        </Button>
      }
      toolbar={
        <>
          {screens.length > 1 && <Segmented size="small" value={screen?.id} onChange={(v) => set('screen', String(v))} options={screens.map((s) => ({ value: s.id, label: s.name }))} />}
          <Segmented size="small" value={view} onChange={(v) => set('view', String(v))} options={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))} />
          <Segmented size="small" value={projection} onChange={(v) => set('proj', v === 'plan' ? 'plan' : null)} options={PROJECTION_OPTIONS} aria-label="표현" />
          {projection === 'iso' && <Segmented size="small" value={look} onChange={(v) => set('look', v === 'illustrated' ? 'ill' : null)} options={LOOK_OPTIONS} aria-label="스타일" />}
          <Legend snap={snap} />
          <span className="toolbar__spacer" />
          {playback}
        </>
      }
      bodyMode="fit"
    >
      {!screen ? (
        <Empty description={`${app.siteName(siteId)}에 게시된 설비 가동 화면이 없습니다. 화면 디자이너(SET-080)에서 그리고 게시하세요.`} />
      ) : (
        <div className="p13">
          <Panel
            className="p13__canvas-panel"
            title={screen.name}
            caption={`${look === 'illustrated' && projection === 'iso' ? '일러스트 스타일은 검토용 시안 · ' : ''}${view === 'process' ? '상태 · 신호값(직전 1시간 평균)' : '라인 전력·압축공기(15분 평균) · 비생산 시간 비중(오늘)'} · 게시 v${screen.version}`}
          >
            <Canvas screen={screen} snap={snap} view={view} projection={projection} look={look} selected={pick ? screen.objects.find((o) => o.kind === 'equipment' && o.equipmentId === pick.id)?.id ?? null : null} maxSignals={def.hmi.maxSignals} onPick={(id) => set('eq', id === selected ? null : id)} />
          </Panel>
          <div className="p13__side">
            <Panel title="선택 설비" className="p13__detail">
              {pick ? <Detail v={pick} at={at} /> : <p className="caption">공정도에서 설비를 누르면 상태, 정지, 신호값, 건전성과 관련 화면 링크가 보입니다.</p>}
            </Panel>
            <Panel title="이 사업장 알림" caption={risks ? `${risks.length}건 · 현재` : ''} className="p13__alerts">
              {!risks ? <Skeleton active /> : <RiskList risks={risks} />}
            </Panel>
          </div>
        </div>
      )}
      {wall && screen && <Wallboard screen={screen} snap={snap} view={view} projection={projection} look={look} setView={(v) => set('view', v)} views={views} at={at} risks={risks} siteName={app.siteName(siteId)} maxSignals={def.hmi.maxSignals} onClose={() => setWall(false)} />}
    </ScreenLayout>
  );
}

export function Canvas({ screen, snap, view, projection = 'iso', look = 'standard', selected, maxSignals, onPick }: { screen: HmiScreen; snap: HmiSnapshot | null; view: HmiView; projection?: Projection; look?: IsoLook; selected?: string | null; maxSignals?: number; onPick?: (id: string) => void }) {
  const vb = projection === 'iso' ? isoBox(screen) : [0, 0, screen.size[0], screen.size[1]];
  return (
    <svg className={`hmi-canvas hmi-canvas--${projection}`} viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${screen.name} 공정도`}>
      <HmiDefs />
      <IsoDefs />
      <rect className={projection === 'iso' ? 'hmi-canvas__bg hmi-canvas__bg--iso' : 'hmi-canvas__bg'} x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} />
      {projection === 'iso' ? (
        <HmiIso screen={screen} snap={snap} view={view} selected={selected} maxSignals={maxSignals} onPick={onPick} look={look} />
      ) : (
        <HmiDrawing screen={screen} snap={snap} view={view} selected={selected} maxSignals={maxSignals} onPick={onPick} />
      )}
    </svg>
  );
}

function Legend({ snap }: { snap: HmiSnapshot | null }) {
  return (
    <span className="p2__legend">
      {STATES.map((s) => (
        <span key={s} className="p2__legend-item">
          <i className={`p2__mark p2__mark--${STATE_CLASS[s]}`} aria-hidden="true" />
          {s} <span className="num">{snap?.counts[s] ?? 0}</span>
        </span>
      ))}
      {!!snap?.healthAlerts && (
        <span className="p2__legend-item">
          <StatusBadge level="warning" label={`건전성 주의 이상 ${snap.healthAlerts}`} />
        </span>
      )}
    </span>
  );
}

function Detail({ v, at }: { v: NonNullable<ReturnType<HmiSnapshot['equipment']['get']>>; at: number }) {
  const link = useShellLink();
  const today = formatDate(NOW);
  const h = v.health;
  return (
    <div className="p2__facts">
      <h3 className="p2__title">{v.name}</h3>
      <dl className="facts">
        <dt>설비</dt>
        <dd className="num">{v.id}</dd>
        <dt>상태</dt>
        <dd>
          <i className={`p2__mark p2__mark--${STATE_CLASS[v.state]}`} aria-hidden="true" /> {v.state}
          <span className="caption num"> · {formatTime(at)} 기준</span>
          {v.state === '미수신' && <span className="caption"> · 값은 0이 아니라 미수신으로 표시합니다</span>}
        </dd>
        <dt>정지</dt>
        <dd>
          {v.stop ? `${CATEGORY[v.stop.category] ?? v.stop.category} · ${v.stop.cause} · ${formatTime(parseTime(v.stop.start))}~${formatTime(parseTime(v.stop.end))}` : '진행 중인 정지 없음'}
          <span className="caption num"> · 오늘 {v.stopsToday}회</span>
        </dd>
        <dt>건전성</dt>
        <dd>
          {h ? (
            <>
              {h.level && h.level !== 'normal' && <StatusBadge level={h.level} />} {h.index === null ? terms.noData : `${h.index} / 100 · ${h.failureMode}${h.rul ? ` · 잔여수명 ${h.rul}` : ''}`}
              <span className="caption"> · 현재</span>
            </>
          ) : '감시 대상 아님'}
        </dd>
      </dl>
      {v.signals.length > 0 && (
        <table className="data-table p13__signals">
          <thead>
            <tr><th>신호</th><th className="num-col">값</th><th className="num-col">정상 범위</th></tr>
          </thead>
          <tbody>
            {v.signals.map((s) => (
              <tr key={s.signal}>
                <td>{s.name}</td>
                <td className="num num-col">{s.value === null ? terms.noData : `${formatNumber(s.value, 1)} ${s.unit}`}</td>
                <td className="num num-col">{s.normal[0]}~{s.normal[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {v.signals[0]?.hour && <p className="caption">신호값은 {v.signals[0].hour}부터 1시간 평균입니다.</p>}
      <div className="p2__links">
        {v.monitored && h && <Link to={link('MNT-011', { id: v.id })}>설비 진단 상세</Link>}
        {!v.lineId.endsWith('-UTL') && <Link to={link('OPS-020', { line: v.lineId, eq: v.id, 'f.period': `${today}~${today}` })}>오늘 손실 분석</Link>}
        <Link to={link('OPS-050', { 'f.lineId': v.lineId, 'f.cause': v.name })}>비가동 이력</Link>
      </div>
    </div>
  );
}

function RiskList({ risks, limit }: { risks: Risk[]; limit?: number }) {
  const shown = limit ? risks.slice(0, limit) : risks;
  if (!shown.length) return <p className="caption">처리 중인 알림이 없습니다.</p>;
  return (
    <ul className="p13__risks">
      {shown.map((r) => (
        <li key={r.id} className="p13__risk">
          <StatusBadge level={r.level} />
          <span className="p13__risk-body">
            <Link to={r.link.to}><strong>{r.title}</strong></Link>
            <span className="caption">{r.detail}</span>
          </span>
          <span className="caption num">{formatDateTime(parseTime(r.occurredAt)).slice(5)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Dark full-screen wallboard: the same drawing and data, larger, with nothing but what a control room needs. */
function Wallboard({ screen, snap, view, projection, look, setView, views, at, risks, siteName, maxSignals, onClose }: {
  screen: HmiScreen; snap: HmiSnapshot | null; view: HmiView; projection: Projection; look: IsoLook; setView: (v: HmiView) => void; views: HmiView[]; at: number;
  risks: Risk[] | null; siteName: string; maxSignals?: number; onClose: () => void;
}) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const prevMode = useRef(theme.mode);
  const closeLabel = button('닫기');
  useEffect(() => {
    const prev = prevMode.current;
    theme.setMode('dark');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Leaving full screen (Esc in the browser) closes the wallboard too.
    const onFs = () => !document.fullscreenElement && onClose();
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      theme.setMode(prev);
    };
    // Runs once per opening; theme.setMode is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lines = screen.objects.filter((o) => o.kind === 'zone' && o.lineId);
  return createPortal(
    <div className="p13-wall" ref={ref} role="dialog" aria-label={`${siteName} ${screen.name} 대형 화면`}>
      <header className="p13-wall__head">
        <div className="p13-wall__title">
          <span className="p13-wall__site">{siteName}</span>
          <strong>{screen.name}</strong>
          <span className="caption">{terms.badges.virtualData}</span>
        </div>
        <div className="p13-wall__counts">
          {STATES.map((s) => (
            <span key={s} className="p13-wall__count">
              <i className={`p2__mark p2__mark--${STATE_CLASS[s]}`} aria-hidden="true" />
              <span>{s}</span>
              <strong className="num">{snap?.counts[s] ?? 0}</strong>
            </span>
          ))}
        </div>
        <Segmented value={view} onChange={(v) => setView(v as HmiView)} options={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))} />
        <span className="p13-wall__clock num">{formatDateTime(at)}{at === NOW ? '' : ' (재생 중인 시각)'}</span>
        <Button onClick={onClose}>{closeLabel}</Button>
      </header>
      <div className="p13-wall__body">
        <div className="p13-wall__canvas">
          <Canvas screen={screen} snap={snap} view={view} projection={projection} look={look} maxSignals={maxSignals} />
        </div>
        <aside className="p13-wall__side">
          <section>
            <h2 className="p13-wall__h">알림</h2>
            {risks ? <RiskList risks={risks} limit={6} /> : null}
          </section>
          <section>
            <h2 className="p13-wall__h">{view === 'process' ? '오늘 생산' : '라인 전력 (15분 평균)'}</h2>
            <table className="data-table p13-wall__table">
              <tbody>
                {lines.map((z) => {
                  if (z.kind !== 'zone' || !z.lineId) return null;
                  const l = snap?.lines.get(z.lineId);
                  return (
                    <tr key={z.id}>
                      <td>{z.label}</td>
                      <td className="num num-col">
                        {view === 'process'
                          ? l?.produced == null ? '상시 가동' : `${formatNumber(l.produced, 0)} / ${formatNumber(l.planned ?? 0, 0)}`
                          : l?.kw == null ? '-' : `${formatNumber(l.kw, 0)} kW`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </div>,
    document.body
  );
}
