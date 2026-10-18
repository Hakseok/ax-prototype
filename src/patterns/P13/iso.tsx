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

type P3 = [number, number, number];

/** Convex hull of screen points (monotone chain), for cylinder bodies. */
const convexHull = (points: Pt[]): Pt[] => {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

const ring = (f: (t: number) => P3, n = 28): Pt[] => Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2)).map(([x, y, z]) => P(x, y, z));

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

    /** Any face through plan points (x, y, z). */
    face(points: P3[], cls: string): ReactNode {
      return <polygon key={key('f')} className={cls} points={pts(points.map(([x, y, z]) => P(x, y, z)))} />;
    },

    /** A horizontal cylinder along x from x0 to x1, axis at (cy, cz). The +x end cap shows. */
    cylX(x0: number, x1: number, cy: number, cz: number, r: number, tone = ''): ReactNode[] {
      const t = tone ? ` hmi-iso--${tone}` : '';
      const cap = (x: number) => ring((a) => [x, cy + r * Math.cos(a), cz + r * Math.sin(a)]);
      return [
        <polygon key={key('cx')} className={`hmi-iso-l hmi-iso-cyl-v${t}`} points={pts(convexHull([...cap(x0), ...cap(x1)]))} />,
        <polygon key={key('ce')} className={`hmi-iso-r${t}`} points={pts(cap(x1))} />
      ];
    },

    /** A horizontal cylinder along y from y0 to y1, axis at (cx, cz). The +y end cap shows. */
    cylY(y0: number, y1: number, cx: number, cz: number, r: number, tone = ''): ReactNode[] {
      const t = tone ? ` hmi-iso--${tone}` : '';
      const cap = (y: number) => ring((a) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)]);
      return [
        <polygon key={key('cy')} className={`hmi-iso-r hmi-iso-cyl-v${t}`} points={pts(convexHull([...cap(y0), ...cap(y1)]))} />,
        <polygon key={key('ce')} className={`hmi-iso-l${t}`} points={pts(cap(y1))} />
      ];
    },

    /** A square frustum (hopper, funnel): top half-size rt at z1, bottom half-size rb at z0. */
    frustum(cx: number, cy: number, rb: number, rt: number, z0: number, z1: number, tone = ''): ReactNode[] {
      const t = tone ? ` hmi-iso--${tone}` : '';
      return [
        <polygon
          key={key('fl')}
          className={`hmi-iso-l${t}`}
          points={pts([P(cx - rb, cy + rb, z0), P(cx + rb, cy + rb, z0), P(cx + rt, cy + rt, z1), P(cx - rt, cy + rt, z1)])}
        />,
        <polygon
          key={key('fr')}
          className={`hmi-iso-r${t}`}
          points={pts([P(cx + rb, cy - rb, z0), P(cx + rb, cy + rb, z0), P(cx + rt, cy + rt, z1), P(cx + rt, cy - rt, z1)])}
        />,
        <polygon
          key={key('ft')}
          className={`hmi-iso-t${t}`}
          points={pts([P(cx - rt, cy - rt, z1), P(cx + rt, cy - rt, z1), P(cx + rt, cy + rt, z1), P(cx - rt, cy + rt, z1)])}
        />
      ];
    },

    /** A thick arm segment between two plan points, drawn in screen space with rounded ends. */
    link(a: P3, b: P3, width: number, tone = ''): ReactNode[] {
      const t = tone ? ` hmi-iso--${tone}` : '';
      const [ax, ay] = P(...a);
      const [bx, by] = P(...b);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let nx = (-(by - ay) / len) * (width / 2);
      let ny = ((bx - ax) / len) * (width / 2);
      // The highlight strip runs along the upper edge.
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const body: Pt[] = [
        [ax + nx, ay + ny],
        [bx + nx, by + ny],
        [bx - nx, by - ny],
        [ax - nx, ay - ny]
      ];
      const hi: Pt[] = [
        [ax + nx, ay + ny],
        [bx + nx, by + ny],
        [bx + nx * 0.1, by + ny * 0.1],
        [ax + nx * 0.1, ay + ny * 0.1]
      ];
      return [
        <circle key={key('lc')} className={`hmi-iso-l${t}`} cx={ax} cy={ay} r={width / 2} />,
        <circle key={key('lc')} className={`hmi-iso-l${t}`} cx={bx} cy={by} r={width / 2} />,
        <polygon key={key('lb')} className={`hmi-iso-l hmi-iso-link${t}`} points={pts(body)} />,
        <polygon key={key('lh')} className={`hmi-iso-t hmi-iso-link${t}`} points={pts(hi)} />
      ];
    },

    /** A round joint at a plan point. */
    joint(p: P3, r: number): ReactNode {
      const [x, y] = P(...p);
      return <circle key={key('jn')} className="hmi-iso-joint" cx={x} cy={y} r={r} />;
    },

    /** Straight lines between plan points (seams, cables, rollers). */
    lines(segments: [P3, P3][], cls: string): ReactNode {
      const d = segments
        .map(([a, b]) => {
          const [x1, y1] = P(...a);
          const [x2, y2] = P(...b);
          return `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
        })
        .join(' ');
      return <path key={key('ln')} className={cls} d={d} />;
    },

    /** An ellipse lying flat at height z (fan grilles, lamps seen from above). */
    disc(cx: number, cy: number, r: number, z: number, cls: string): ReactNode {
      const [x, y] = P(cx, cy, z);
      return <ellipse key={key('ds')} className={cls} cx={x} cy={y} rx={r * ISO_C * Math.SQRT2} ry={r * ISO_S * Math.SQRT2} />;
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
