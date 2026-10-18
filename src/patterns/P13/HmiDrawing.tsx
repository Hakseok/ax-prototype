// Renders the objects of a process view (P13) as SVG groups: zones, connector lines, equipment
// and labels. The viewer, the wallboard, the designer and its preview all use this one renderer,
// so a drawing looks the same wherever it is shown.
// State marks are neutral (정상은 무채색, D-65); status colors appear only on the health badge of
// equipment the engine rates 주의 or 긴급, always with shape and text.
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { formatNumber } from '../../components/KpiCard';
import { statusLabel } from '../../config';
import { SYMBOL_NAMES, type HmiEquipmentObject, type HmiObject, type HmiScreen, type HmiSnapshot, type LineView } from '../../data/hmi';
import type { MachineState } from '../../data/lineMonitor';
import { SymbolArt } from './symbols';

export type HmiView = 'process' | 'energy';

export const STATE_CLASS: Record<MachineState, string> = { 가동: 'run', 정지: 'stop', '계획 비가동': 'idle', 미수신: 'missing' };

const SIGNAL_SHORT: Record<string, string> = { vibration: '진동', temperature: '온도', current: '전류' };
const LINE_H = 16;

interface Props {
  screen: HmiScreen;
  snap: HmiSnapshot | null;
  view: HmiView;
  selected?: string | null;
  /** Equipment names by id, for labels when there is no snapshot (designer). */
  names?: Map<string, string>;
  maxSignals?: number;
  /** Viewer: pick an equipment. */
  onPick?: (equipmentId: string) => void;
  /** Designer: start a drag on an object. */
  onObjectDown?: (e: ReactPointerEvent<SVGGElement>, o: HmiObject) => void;
  editing?: boolean;
  onZoneFocus?: (z: HmiObject) => void;
}

export function HmiDefs() {
  return (
    <defs>
      <pattern id="hmi-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line className="hmi-hatch-line" x1="0" y1="0" x2="0" y2="8" />
      </pattern>
    </defs>
  );
}

const zoneFigures = (view: HmiView, l: LineView | undefined): string => {
  if (!l) return '';
  if (view === 'energy') {
    const parts = [`전력 ${l.kw === null ? '-' : formatNumber(l.kw, 0)} kW`];
    if (l.airPerHour !== null) parts.push(`압축공기 ${formatNumber(l.airPerHour, 0)} Nm³/h`);
    if (l.idleShare !== null) parts.push(`비생산 ${formatNumber(l.idleShare * 100, 1)}%`);
    return parts.join(' · ');
  }
  if (l.produced === null) return '상시 가동';
  return `오늘 생산 ${formatNumber(l.produced, 0)} / 계획 ${formatNumber(l.planned ?? 0, 0)}`;
};

export function HmiDrawing({ screen, snap, view, selected, names, maxSignals = 2, onPick, onObjectDown, editing, onZoneFocus }: Props) {
  const zones = screen.objects.filter((o) => o.kind === 'zone');
  const kws = zones.map((z) => (z.kind === 'zone' && z.lineId ? snap?.lines.get(z.lineId)?.kw ?? null : null)).filter((v): v is number => v !== null);
  const maxKw = kws.length ? Math.max(...kws) : 0;
  const down = (o: HmiObject) => (onObjectDown ? (e: ReactPointerEvent<SVGGElement>) => onObjectDown(e, o) : undefined);
  const sel = (id: string) => (selected === id ? ' hmi-obj--selected' : '');

  const out: ReactNode[] = [];
  for (const o of screen.objects) {
    if (o.kind !== 'zone') continue;
    const l = o.lineId ? snap?.lines.get(o.lineId) : undefined;
    const heat = view === 'energy' && l?.kw != null && maxKw > 0 ? Math.round((l.kw / maxKw) * 100) : null;
    out.push(
      <g key={o.id} className={`hmi-zone${sel(o.id)}`} onPointerDown={down(o)} onDoubleClick={onZoneFocus ? () => onZoneFocus(o) : undefined} data-oid={o.id}>
        <rect
          className={heat === null ? 'hmi-zone__box' : 'hmi-zone__box hmi-zone__box--heat'}
          x={o.x} y={o.y} width={o.w} height={o.h}
          style={heat === null ? undefined : { fill: `color-mix(in srgb, var(--color-heat-high) ${heat}%, var(--color-heat-low))` }}
        />
        <text className="hmi-zone__label" x={o.x + 14} y={o.y + 24}>{o.label}</text>
        {snap && <text className="hmi-zone__figure num" x={o.x + o.w - 14} y={o.y + 24} textAnchor="end">{zoneFigures(view, l)}</text>}
      </g>
    );
  }
  for (const o of screen.objects) {
    if (o.kind !== 'line') continue;
    const pts = o.points.map((p) => p.join(',')).join(' ');
    out.push(
      <g key={o.id} className={`hmi-line hmi-line--${o.style}${sel(o.id)}`} onPointerDown={down(o)} data-oid={o.id}>
        <polyline className="hmi-line__hit" points={pts} />
        <polyline className="hmi-line__base" points={pts} />
        {o.style === 'conveyor' && <polyline className="hmi-line__belt" points={pts} />}
      </g>
    );
  }
  for (const o of screen.objects) {
    if (o.kind !== 'equipment') continue;
    out.push(<Equipment key={o.id} o={o} snap={snap} view={view} selected={selected === o.id} names={names} maxSignals={maxSignals} onPick={onPick} onDown={down(o)} editing={editing} />);
  }
  for (const o of screen.objects) {
    if (o.kind !== 'text') continue;
    out.push(
      <g key={o.id} className={`hmi-text${sel(o.id)}`} onPointerDown={down(o)} data-oid={o.id}>
        <text className={`hmi-text--${o.size}`} x={o.x} y={o.y}>{o.text}</text>
      </g>
    );
  }
  return <g className={`hmi-drawing hmi-drawing--${view}`}>{out}</g>;
}

function Equipment({ o, snap, view, selected, names, maxSignals, onPick, onDown, editing }: {
  o: HmiEquipmentObject; snap: HmiSnapshot | null; view: HmiView; selected: boolean; names?: Map<string, string>; maxSignals: number;
  onPick?: (id: string) => void; onDown?: (e: ReactPointerEvent<SVGGElement>) => void; editing?: boolean;
}) {
  const v = o.equipmentId ? snap?.equipment.get(o.equipmentId) : undefined;
  const name = o.label || v?.name || (o.equipmentId ? names?.get(o.equipmentId) : undefined) || SYMBOL_NAMES[o.symbol];
  const state = v?.state;
  const cx = o.x + o.w / 2;
  const level = v?.health?.level === 'warning' || v?.health?.level === 'critical' ? v.health.level : null;
  const signals = view === 'process' && v ? (o.signals ?? []).slice(0, maxSignals).map((s) => v.signals.find((x) => x.signal === s)).filter((s) => !!s) : [];
  const pick = onPick && o.equipmentId ? () => onPick(o.equipmentId!) : undefined;
  return (
    <g
      className={`hmi-eq${state ? ` hmi-eq--${STATE_CLASS[state]}` : ''}${selected ? ' hmi-obj--selected' : ''}${!o.equipmentId && editing ? ' hmi-eq--unbound' : ''}`}
      data-oid={o.id}
      onPointerDown={onDown}
      onClick={pick}
      onKeyDown={pick ? (e) => (e.key === 'Enter' || e.key === ' ') && pick() : undefined}
      role={pick ? 'button' : undefined}
      tabIndex={pick ? 0 : undefined}
      aria-label={pick ? `${name} ${state ?? ''}${level ? ` · ${statusLabel(level)}` : ''}` : undefined}
    >
      <rect className="hmi-eq__frame" x={o.x - 4} y={o.y - 4} width={o.w + 8} height={o.h + 8} />
      <SymbolArt symbol={o.symbol} x={o.x} y={o.y} w={o.w} h={o.h} />
      {state === '미수신' && <rect className="hmi-eq__hatch" x={o.x} y={o.y} width={o.w} height={o.h} />}
      {state === '정지' && <rect className="hmi-eq__stop-mark" x={o.x + o.w - 12} y={o.y + 2} width="10" height="10" />}
      {level && (
        <g className={`hmi-badge hmi-badge--${level}`}>
          <rect className="hmi-badge__box" x={o.x - 6} y={o.y - 10} width="52" height="20" />
          {level === 'warning'
            ? <polygon className="hmi-badge__shape" points={`${o.x},${o.y + 5} ${o.x + 6},${o.y - 6} ${o.x + 12},${o.y + 5}`} />
            : <polygon className="hmi-badge__shape" points={`${o.x + 6},${o.y - 6} ${o.x + 12},${o.y} ${o.x + 6},${o.y + 6} ${o.x},${o.y}`} />}
          <text className="hmi-badge__text" x={o.x + 16} y={o.y + 5}>{statusLabel(level)}</text>
        </g>
      )}
      {signals.map((s, i) => (
        <text key={s!.signal} className="hmi-eq__value num" x={cx} y={o.y - (level ? 18 : 12) - (signals.length - 1 - i) * LINE_H} textAnchor="middle">
          {SIGNAL_SHORT[s!.signal] ?? s!.name} {s!.value === null ? '미수신' : `${formatNumber(s!.value, 1)} ${s!.unit}`}
        </text>
      ))}
      <text className="hmi-eq__label" x={cx} y={o.y + o.h + LINE_H} textAnchor="middle">{name}</text>
      {state && state !== '가동' && (
        <text className="hmi-eq__state" x={cx} y={o.y + o.h + LINE_H * 2} textAnchor="middle">
          {state === '정지' ? '■ 정지' : state === '계획 비가동' ? '— 계획 비가동' : '▤ 미수신'}
        </text>
      )}
      {editing && !o.equipmentId && <text className="hmi-eq__state" x={cx} y={o.y + o.h + LINE_H * 2} textAnchor="middle">연결 안 됨</text>}
    </g>
  );
}
