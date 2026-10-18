// 2.5D (isometric) rendering of a P13 process view. Same drawing and data as the plan renderer
// (HmiDrawing): zones become floor slabs with their name painted on the floor, lines become
// conveyors or pipe trenches, equipment becomes a shaded model sorted back to front. Labels,
// state chips, health badges and signal values float above the models in screen space so no
// model hides them. States stay neutral (D-65); only the health badge uses a status color.
import { useState, type ReactNode } from 'react';
import { formatNumber } from '../../components/KpiCard';
import { statusLabel } from '../../config';
import { SYMBOL_NAMES, type HmiEquipmentObject, type HmiObject, type HmiScreen, type HmiSnapshot, type LineView } from '../../data/hmi';
import type { HmiView } from './HmiDrawing';
import { STATE_CLASS } from './HmiDrawing';
import { P, floorTransform, hull, isoKit, isoViewBox, shadow } from './iso';
import { isoModel } from './isoModels';

const SLAB = 6;
const BELT = 12;
const SIGNAL_SHORT: Record<string, string> = { vibration: '진동', temperature: '온도', current: '전류' };
const CHIP_FS = 18;
const CHIP_H = 28;

/** Rough text width in canvas units: Hangul and full-width glyphs are square, others narrower. */
const textWidth = (s: string, fs: number) => [...s].reduce((a, ch) => a + (/[ᄀ-ᇿ　-鿿가-힯℃³]/.test(ch) ? fs : fs * 0.6), 0);

/** Body material of each symbol in the illustrated review look (D-73). */
const MATERIAL: Record<string, 'blue' | 'teal' | 'slate'> = {
  press: 'blue', injection: 'blue', machining: 'blue', lathe: 'blue', paintBooth: 'slate', oven: 'slate',
  robot: 'teal', fastening: 'teal', inspection: 'teal', agv: 'teal', compressor: 'slate', utility: 'slate', generic: 'slate'
};

export type IsoLook = 'standard' | 'illustrated';

const CONV_W = 26;
const CONV_Z = 26;
const CHUNK = 60;

/**
 * One piece of an axis-aligned conveyor (legs, side rails, belt and rollers), so conveyors can be
 * depth-sorted with the machines along them. `along` is the axis the belt runs on.
 */
function conveyorChunk(along: 'x' | 'y', a0: number, a1: number, c: number, crate: boolean): ReactNode[] {
  const k = isoKit();
  const h = CONV_W / 2;
  const box = (p0: number, p1: number, q0: number, q1: number, z0: number, z1: number, tone: string) =>
    along === 'x' ? k.box(p0, q0, p1 - p0, q1 - q0, z0, z1, tone) : k.box(q0, p0, q1 - q0, p1 - p0, z0, z1, tone);
  const pt = (p: number, q: number, z: number): [number, number, number] => (along === 'x' ? [p, q, z] : [q, p, z]);
  const rollers: [[number, number, number], [number, number, number]][] = [];
  for (let p = a0 + 5; p < a1; p += 10) rollers.push([pt(p, c - h + 3, CONV_Z), pt(p, c + h - 3, CONV_Z)]);
  return [
    ...box(a0 + 2, a0 + 5, c - h + 1, c - h + 4, 0, CONV_Z - 4, 'metal'),
    ...box(a0, a1, c - h, c - h + 3, CONV_Z - 5, CONV_Z + 2, 'metal'),
    ...box(a0, a1, c - h + 3, c + h - 3, CONV_Z - 4, CONV_Z, 'dark'),
    k.lines(rollers, 'hmi-iso-roller'),
    ...(crate ? box((a0 + a1) / 2 - 10, (a0 + a1) / 2 + 10, c - 9, c + 9, CONV_Z, CONV_Z + 15, 'crate') : []),
    ...box(a0 + 2, a0 + 5, c + h - 4, c + h - 1, 0, CONV_Z - 4, 'metal'),
    ...box(a0, a1, c + h - 3, c + h, CONV_Z - 5, CONV_Z + 2, 'metal')
  ];
}

/** Crates riding a conveyor (decoration of the illustrated look, not data). */
function crates(points: [number, number][], z: number): ReactNode[] {
  const k = isoKit();
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let t = 60; t < len - 20; t += 130) {
      const cx = x1 + ((x2 - x1) * t) / len;
      const cy = y1 + ((y2 - y1) * t) / len;
      out.push(...k.box(cx - 11, cy - 11, 22, 22, z, z + 16, 'crate'));
    }
  }
  return out;
}

export const isoBox = (screen: HmiScreen) => isoViewBox(screen.size[0], screen.size[1]);

interface Props {
  screen: HmiScreen;
  snap: HmiSnapshot | null;
  view: HmiView;
  selected?: string | null;
  names?: Map<string, string>;
  maxSignals?: number;
  onPick?: (equipmentId: string) => void;
  /** Designer: pick an object by id. */
  onObject?: (o: HmiObject) => void;
  editing?: boolean;
  look?: IsoLook;
}

const zoneFigure = (view: HmiView, l: LineView | undefined): string => {
  if (!l) return '';
  if (view === 'energy') {
    const parts = [`${l.kw === null ? '-' : formatNumber(l.kw, 0)} kW`];
    if (l.airPerHour !== null) parts.push(`압축공기 ${formatNumber(l.airPerHour, 0)} Nm³/h`);
    if (l.idleShare !== null) parts.push(`비생산 ${formatNumber(l.idleShare * 100, 1)}%`);
    return parts.join(' · ');
  }
  return l.produced === null ? '상시 가동' : `오늘 ${formatNumber(l.produced, 0)} / 계획 ${formatNumber(l.planned ?? 0, 0)}`;
};

function Chip({ x, y, text, cls = '', mark }: { x: number; y: number; text: string; cls?: string; mark?: ReactNode }) {
  const w = textWidth(text, CHIP_FS) + (mark ? 34 : 20);
  return (
    <g className={`hmi-chip ${cls}`}>
      <rect className="hmi-chip__box" x={x - w / 2} y={y - CHIP_H} width={w} height={CHIP_H} rx="6" />
      {mark && <g transform={`translate(${x - w / 2 + 16} ${y - CHIP_H / 2})`}>{mark}</g>}
      <text className="hmi-chip__text" x={x + (mark ? 7 : 0)} y={y - 8} textAnchor="middle">{text}</text>
    </g>
  );
}

export function HmiIso({ screen, snap, view, selected, names, maxSignals = 2, onPick, onObject, editing, look = 'standard' }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [W, H] = screen.size;
  const vb = isoBox(screen);
  const zones = screen.objects.filter((o) => o.kind === 'zone');
  const kws = zones.map((z) => (z.kind === 'zone' && z.lineId ? snap?.lines.get(z.lineId)?.kw ?? null : null)).filter((v): v is number => v !== null);
  const maxKw = kws.length ? Math.max(...kws) : 0;
  const eqs = screen.objects
    .filter((o): o is HmiEquipmentObject => o.kind === 'equipment')
    .sort((a, b) => a.x + a.w / 2 + a.y + a.h / 2 - (b.x + b.w / 2 + b.y + b.h / 2));
  const click = (o: HmiObject) => () => onObject?.(o);

  const floor: ReactNode[] = [];
  for (const z of zones) {
    if (z.kind !== 'zone') continue;
    const l = z.lineId ? snap?.lines.get(z.lineId) : undefined;
    const heat = view === 'energy' && l?.kw != null && maxKw > 0 ? Math.round((l.kw / maxKw) * 100) : null;
    const top = [P(z.x, z.y, SLAB), P(z.x + z.w, z.y, SLAB), P(z.x + z.w, z.y + z.h, SLAB), P(z.x, z.y + z.h, SLAB)].map((p) => p.join(',')).join(' ');
    const left = [P(z.x, z.y + z.h, 0), P(z.x + z.w, z.y + z.h, 0), P(z.x + z.w, z.y + z.h, SLAB), P(z.x, z.y + z.h, SLAB)].map((p) => p.join(',')).join(' ');
    const right = [P(z.x + z.w, z.y, 0), P(z.x + z.w, z.y + z.h, 0), P(z.x + z.w, z.y + z.h, SLAB), P(z.x + z.w, z.y, SLAB)].map((p) => p.join(',')).join(' ');
    floor.push(
      <g key={z.id} className={`hmi-iso-zone${selected === z.id ? ' hmi-obj--selected' : ''}`} onClick={onObject ? click(z) : undefined} data-oid={z.id}>
        <polygon className="hmi-iso-slab-side" points={left} />
        <polygon className="hmi-iso-slab-side hmi-iso-slab-side--r" points={right} />
        <polygon
          className="hmi-iso-slab-top"
          points={top}
          style={heat === null ? undefined : { fill: `color-mix(in srgb, var(--color-heat-high) ${heat}%, var(--color-heat-low))` }}
        />
        <g transform={floorTransform(SLAB)}>
          {/* Painted on the floor just in front of the slab, where no model can hide it. */}
          <text className="hmi-iso-zone-label" x={z.x + 6} y={z.y + z.h + 25}>
            {z.label}
            {snap && <tspan className="hmi-iso-zone-figure num" dx="16">{zoneFigure(view, l)}</tspan>}
          </text>
        </g>
      </g>
    );
  }
  const lines: ReactNode[] = [];
  // Machines and conveyor pieces share one back-to-front order.
  const sorted: { depth: number; node: ReactNode }[] = [];
  for (const o of screen.objects) {
    if (o.kind !== 'line') continue;
    const pts = o.points.map((p) => p.join(',')).join(' ');
    const axisAligned = o.style === 'conveyor' && o.points.every((p, i) => i === 0 || p[0] === o.points[i - 1][0] || p[1] === o.points[i - 1][1]);
    if (axisAligned) {
      let n = 0;
      for (let i = 0; i < o.points.length - 1; i++) {
        const [x1, y1] = o.points[i];
        const [x2, y2] = o.points[i + 1];
        const along = y1 === y2 ? 'x' : 'y';
        const a0 = along === 'x' ? Math.min(x1, x2) : Math.min(y1, y2);
        const a1 = along === 'x' ? Math.max(x1, x2) : Math.max(y1, y2);
        const c = along === 'x' ? y1 : x1;
        for (let t = a0; t < a1; t += CHUNK) {
          const t1 = Math.min(a1, t + CHUNK);
          const mid = (t + t1) / 2;
          const crate = look === 'illustrated' && n++ % 2 === 1;
          sorted.push({
            depth: mid + c,
            node: (
              <g key={`${o.id}-${i}-${t}`} className={`hmi-iso-conveyor${selected === o.id ? ' hmi-obj--selected' : ''}`} transform={`translate(0 ${-SLAB})`} onClick={onObject ? click(o) : undefined} data-oid={o.id}>
                {conveyorChunk(along, t, t1, c, crate)}
              </g>
            )
          });
        }
      }
      continue;
    }
    lines.push(
      o.style === 'conveyor' ? (
        <g key={o.id} className={`hmi-iso-conveyor${selected === o.id ? ' hmi-obj--selected' : ''}`} onClick={onObject ? click(o) : undefined} data-oid={o.id}>
          <g transform={floorTransform(SLAB)}><polyline className="hmi-iso-conveyor__side" points={pts} /></g>
          <g transform={floorTransform(SLAB + BELT)}>
            <polyline className="hmi-iso-conveyor__top" points={pts} />
            <polyline className="hmi-iso-conveyor__belt" points={pts} />
          </g>
          {look === 'illustrated' && <g className="hmi-iso-crates">{crates(o.points, SLAB + BELT)}</g>}
        </g>
      ) : (
        <g key={o.id} className={`hmi-iso-pipe${selected === o.id ? ' hmi-obj--selected' : ''}`} transform={floorTransform(SLAB)} onClick={onObject ? click(o) : undefined} data-oid={o.id}>
          <polyline className="hmi-iso-pipe__line" points={pts} />
        </g>
      )
    );
  }

  const overlays: ReactNode[] = [];
  for (const o of eqs) {
    const v = o.equipmentId ? snap?.equipment.get(o.equipmentId) : undefined;
    const name = o.label || v?.name || (o.equipmentId ? names?.get(o.equipmentId) : undefined) || SYMBOL_NAMES[o.symbol];
    const state = v?.state;
    const level = v?.health?.level === 'warning' || v?.health?.level === 'critical' ? v.health.level : null;
    const model = isoModel(o.symbol, o.x, o.y, o.w, o.h, name);
    const pick = onPick && o.equipmentId ? () => onPick(o.equipmentId!) : onObject ? click(o) : undefined;
    const isSel = selected === o.id;
    sorted.push({ depth: o.x + o.w / 2 + o.y + o.h / 2, node: (
      <g
        key={o.id}
        className={`hmi-iso-eq${state ? ` hmi-iso-eq--${STATE_CLASS[state]}` : ''}${isSel ? ' hmi-obj--selected' : ''}${!o.equipmentId && editing ? ' hmi-iso-eq--unbound' : ''}`}
        transform={`translate(0 ${-SLAB})`}
        data-oid={o.id}
        onClick={pick}
        onPointerEnter={() => setHover(o.id)}
        onPointerLeave={() => setHover((h) => (h === o.id ? null : h))}
        onKeyDown={pick ? (e) => (e.key === 'Enter' || e.key === ' ') && pick() : undefined}
        role={pick ? 'button' : undefined}
        tabIndex={pick ? 0 : undefined}
        aria-label={pick ? `${name} ${state ?? ''}${level ? ` · ${statusLabel(level)}` : ''}` : undefined}
      >
        <polygon className="hmi-iso-shadow" points={shadow(o.x, o.y, o.w, o.h)} />
        <g className={`hmi-iso-model hmi-mat--${MATERIAL[o.symbol] ?? 'slate'}`}>{model.parts}</g>
        {state === '미수신' && <polygon className="hmi-iso-hatch" points={hull(o.x, o.y, o.w, o.h, model.z)} />}
        <polygon className="hmi-iso-hit" points={hull(o.x, o.y, o.w, o.h, model.z)} />
      </g>
    ) });

    // Floating labels: state chip, health badge and signal values above, the name below.
    const [ax, ay] = P(o.x + o.w / 2, o.y + o.h / 2, model.z + SLAB);
    const signals = view === 'process' && v ? (o.signals ?? []).slice(0, maxSignals).map((s) => v.signals.find((x) => x.signal === s)).filter((s) => !!s) : [];
    const chips: ReactNode[] = [];
    let cy = ay - 16;
    if (state && state !== '가동') {
      chips.push(<Chip key="state" x={ax} y={cy} cls={`hmi-chip--state hmi-chip--${STATE_CLASS[state]}`} text={state === '정지' ? '■ 정지' : state === '계획 비가동' ? '— 계획 비가동' : '▤ 미수신'} />);
      cy -= CHIP_H + 6;
    }
    if (level) {
      chips.push(
        <Chip
          key="health"
          x={ax}
          y={cy}
          cls={`hmi-chip--${level}`}
          text={statusLabel(level)}
          mark={level === 'warning' ? <polygon className="hmi-chip__shape" points="-7,6 0,-7 7,6" /> : <polygon className="hmi-chip__shape" points="0,-8 8,0 0,8 -8,0" />}
        />
      );
      cy -= CHIP_H + 6;
    }
    for (const s of signals) {
      chips.push(<Chip key={s!.signal} x={ax} y={cy} cls="hmi-chip--value" text={`${SIGNAL_SHORT[s!.signal] ?? s!.name} ${s!.value === null ? '미수신' : `${formatNumber(s!.value, 1)} ${s!.unit}`}`} />);
      cy -= CHIP_H + 6;
    }
    const showName = isSel || hover === o.id || chips.length > 0 || (editing && !o.equipmentId);
    const [lx] = P(o.x + o.w / 2, o.y + o.h / 2, 0);
    const ly = P(o.x + o.w, o.y + o.h, 0)[1] + 4;
    overlays.push(
      <g key={o.id} className="hmi-iso-overlay" aria-hidden="true">
        {chips.length > 0 && <line className="hmi-iso-leader" x1={ax} y1={ay} x2={ax} y2={ay - 16} />}
        {chips}
        {showName && <text className={`hmi-iso-label${isSel ? ' hmi-iso-label--selected' : ''}`} x={lx} y={ly} textAnchor="middle">{editing && !o.equipmentId ? `${name} · 연결 안 됨` : name}</text>}
      </g>
    );
  }

  const titles = screen.objects.filter((o) => o.kind === 'text');
  return (
    <g className={`hmi-iso hmi-iso--${view}${look === 'illustrated' ? ' hmi-iso--ill' : ''}`}>
      <g transform={floorTransform(0)}>
        <rect className="hmi-iso-floor" x="0" y="0" width={W} height={H} />
        <rect className={look === 'illustrated' ? 'hmi-iso-floor-grid hmi-iso-floor-grid--tile' : 'hmi-iso-floor-grid'} x="0" y="0" width={W} height={H} />
      </g>
      {floor}
      {lines}
      {sorted.sort((a, b) => a.depth - b.depth).map((x) => x.node)}
      {overlays}
      {titles.map((t) =>
        t.kind !== 'text' ? null : t.size === 'title' ? (
          <text key={t.id} className={`hmi-iso-title${selected === t.id ? ' hmi-iso-label--selected' : ''}`} x={vb[0] + 30} y={vb[1] + 56} onClick={onObject ? click(t) : undefined}>{t.text}</text>
        ) : (
          <g key={t.id} transform={floorTransform(SLAB)} onClick={onObject ? click(t) : undefined}>
            <text className="hmi-iso-floor-text" x={t.x} y={t.y}>{t.text}</text>
          </g>
        )
      )}
    </g>
  );
}

export function IsoDefs() {
  return (
    <defs>
      <pattern id="hmi-iso-grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <path className="hmi-iso-grid-line" d="M 50 0 L 0 0 0 50" />
      </pattern>
      {/* Cylinder shading: light along the top, dark along the bottom. */}
      {(['body', 'metal', 'dark'] as const).map((t) => (
        <linearGradient key={t} id={`hmi-g-${t}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: `var(--hmi-iso-${t === 'body' ? '' : `${t}-`}top)` }} />
          <stop offset="0.55" style={{ stopColor: `var(--hmi-iso-${t === 'body' ? '' : `${t}-`}left)` }} />
          <stop offset="1" style={{ stopColor: `var(--hmi-iso-${t === 'body' ? '' : `${t}-`}right)` }} />
        </linearGradient>
      ))}
      <pattern id="hmi-iso-tile" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect className="hmi-iso-tile-a" x="0" y="0" width="50" height="50" />
        <rect className="hmi-iso-tile-a" x="50" y="50" width="50" height="50" />
        <path className="hmi-iso-grid-line" d="M 100 0 L 0 0 0 100 M 50 0 L 50 100 M 0 50 L 100 50" />
      </pattern>
    </defs>
  );
}
