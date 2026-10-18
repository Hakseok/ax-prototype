// 2.5D (isometric) primitives for P13 process views. The drawing keeps plan coordinates (x right,
// y down, 1600 × 900); P() projects a plan point at height z to the screen. Faces take their shade
// from CSS classes (tokens): top lightest, the face toward +y (lower left) medium, the face toward
// +x (lower right) darkest. Nothing here carries a color.
import type { ReactNode } from 'react';

export const ISO_C = Math.cos(Math.PI / 6);
export const ISO_S = 0.5;

export type Pt = [number, number];
export const P = (x: number, y: number, z = 0): Pt => [(x - y) * ISO_C, (x + y) * ISO_S - z];
const pts = (a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/** SVG transform that lays plan-space content flat on the floor at height z. */
export const floorTransform = (z = 0) => `translate(0 ${-z}) matrix(${ISO_C} ${ISO_S} ${-ISO_C} ${ISO_S} 0 0)`;

/** The screen box that holds a plan of size w × h with objects up to height top. */
export const isoViewBox = (w: number, h: number, top = 190, pad = 40): [number, number, number, number] => [
  -h * ISO_C - pad,
  -top,
  (w + h) * ISO_C + pad * 2,
  (w + h) * ISO_S + top + pad * 2
];

/** Builders for one model; keys restart per model so re-renders keep the same elements. */
export function isoKit() {
  let n = 0;
  const key = (p: string) => `${p}${n++}`;
  return {
    /** An axis-aligned box: footprint (x, y, w, d), from z0 up to z1. */
    box(x: number, y: number, w: number, d: number, z0: number, z1: number, tone = ''): ReactNode[] {
      const t = tone ? ` hmi-iso--${tone}` : '';
      return [
        <polygon key={key('l')} className={`hmi-iso-l${t}`} points={pts([P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x, y + d, z1)])} />,
        <polygon key={key('r')} className={`hmi-iso-r${t}`} points={pts([P(x + w, y, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x + w, y, z1)])} />,
        <polygon key={key('t')} className={`hmi-iso-t${t}`} points={pts([P(x, y, z1), P(x + w, y, z1), P(x + w, y + d, z1), P(x, y + d, z1)])} />
      ];
    },

    /** A vertical cylinder centred on (cx, cy). */
    cylinder(cx: number, cy: number, r: number, z0: number, z1: number, tone = ''): ReactNode[] {
      const t = tone ? ` hmi-iso--${tone}` : '';
      const rx = r * ISO_C * Math.SQRT2;
      const ry = r * ISO_S * Math.SQRT2;
      const [sx, top] = P(cx, cy, z1);
      const bot = P(cx, cy, z0)[1];
      return [
        <path
          key={key('c')}
          className={`hmi-iso-l${t}`}
          d={`M${sx - rx},${top} L${sx - rx},${bot} A${rx},${ry} 0 0 0 ${sx + rx},${bot} L${sx + rx},${top} Z`}
        />,
        <ellipse key={key('e')} className={`hmi-iso-t${t}`} cx={sx} cy={top} rx={rx} ry={ry} />
      ];
    },

    /** A flat panel on the +y face of a box (window, door, screen). */
    frontPanel(x: number, y: number, w: number, z0: number, z1: number, cls: string): ReactNode {
      return <polygon key={key('p')} className={cls} points={pts([P(x, y, z0), P(x + w, y, z0), P(x + w, y, z1), P(x, y, z1)])} />;
    },

    /** A flat panel on the +x face of a box. */
    sidePanel(x: number, y: number, d: number, z0: number, z1: number, cls: string): ReactNode {
      return <polygon key={key('s')} className={cls} points={pts([P(x, y, z0), P(x, y + d, z0), P(x, y + d, z1), P(x, y, z1)])} />;
    },

    /** A jointed arm through plan points with heights. */
    arm(points: [number, number, number][]): ReactNode[] {
      const scr = points.map(([x, y, z]) => P(x, y, z));
      return [
        <polyline key={key('a')} className="hmi-iso-arm" points={pts(scr)} />,
        ...scr.slice(0, -1).map((p) => <circle key={key('j')} className="hmi-iso-joint" cx={p[0]} cy={p[1]} r="6" />)
      ];
    }
  };
}

/** Outline of a box (for hit areas, shadows and selection). */
export const hull = (x: number, y: number, w: number, d: number, h: number): string =>
  pts([P(x, y, h), P(x + w, y, h), P(x + w, y, 0), P(x + w, y + d, 0), P(x, y + d, 0), P(x, y + d, h)]);

/** The soft floor shadow of a footprint, cast toward the lower right. */
export const shadow = (x: number, y: number, w: number, d: number): string => {
  const o = Math.min(w, d) * 0.18;
  return pts([P(x + o, y + o), P(x + w + o, y + o), P(x + w + o, y + d + o), P(x + o, y + d + o)]);
};
