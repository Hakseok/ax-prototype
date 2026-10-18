// 2.5D equipment models for P13 process views, drawn to resemble the real machines inside the
// object's plan footprint (x, y, w, d). The operator side faces +y (lower left on screen), long
// machines run along x. Parts are listed back to front. Tones: body (covers), "metal" (frames,
// bases, platens), "dark" (motors, heads, dies); panels add glass, screens, grilles and seams.
// A model carries no state or status color; HmiIso draws those on top.
import type { ReactNode } from 'react';
import type { HmiSymbol } from '../../data/hmi';
import { isoKit } from './iso';

export interface IsoModel {
  parts: ReactNode[];
  /** Top of the model, for hit areas and the anchor of floating labels. */
  z: number;
}

type Kit = ReturnType<typeof isoKit>;

/** Vertical seam lines on the +y face (panel joints). */
const seamsY = (k: Kit, x: number, y: number, w: number, z0: number, z1: number, n: number) =>
  k.lines(
    Array.from(
      { length: n - 1 },
      (_, i) =>
        [
          [x + (w * (i + 1)) / n, y, z0],
          [x + (w * (i + 1)) / n, y, z1]
        ] as [[number, number, number], [number, number, number]]
    ),
    'hmi-iso-seam'
  );
/** Vertical seam lines on the +x face. */
const seamsX = (k: Kit, x: number, y: number, d: number, z0: number, z1: number, n: number) =>
  k.lines(
    Array.from(
      { length: n - 1 },
      (_, i) =>
        [
          [x, y + (d * (i + 1)) / n, z0],
          [x, y + (d * (i + 1)) / n, z1]
        ] as [[number, number, number], [number, number, number]]
    ),
    'hmi-iso-seam'
  );
/** Horizontal louvre lines on the +y face. */
const louvreY = (k: Kit, x: number, y: number, w: number, z0: number, z1: number, n: number) =>
  k.lines(
    Array.from(
      { length: n },
      (_, i) =>
        [
          [x, y, z0 + ((z1 - z0) * (i + 0.5)) / n],
          [x + w, y, z0 + ((z1 - z0) * (i + 0.5)) / n]
        ] as [[number, number, number], [number, number, number]]
    ),
    'hmi-iso-louvre'
  );
/** Horizontal louvre lines on the +x face. */
const louvreX = (k: Kit, x: number, y: number, d: number, z0: number, z1: number, n: number) =>
  k.lines(
    Array.from(
      { length: n },
      (_, i) =>
        [
          [x, y, z0 + ((z1 - z0) * (i + 0.5)) / n],
          [x, y + d, z0 + ((z1 - z0) * (i + 0.5)) / n]
        ] as [[number, number, number], [number, number, number]]
    ),
    'hmi-iso-louvre'
  );

/** A neutral signal tower (stack light) — segments stay grey; state is drawn by HmiIso. */
const tower = (k: Kit, cx: number, cy: number, z0: number) => [
  ...k.cylinder(cx, cy, 1.6, z0, z0 + 8, 'metal'),
  ...k.cylinder(cx, cy, 3, z0 + 8, z0 + 13, 'lamp'),
  ...k.cylinder(cx, cy, 3, z0 + 13, z0 + 18, 'lamp'),
  ...k.cylinder(cx, cy, 3, z0 + 18, z0 + 23, 'lamp')
];

function utility(k: Kit, x: number, y: number, w: number, d: number, name: string): IsoModel {
  const cx = x + w / 2;
  const cy = y + d / 2;
  if (/변압기/.test(name)) {
    const fins = Array.from({ length: 6 }, (_, i) => k.box(x + w * (0.14 + i * 0.12), y + d * 0.82, w * 0.05, d * 0.16, 6, 40, 'metal')).flat();
    return {
      z: 66,
      parts: [
        ...k.box(x + w * 0.06, y + d * 0.08, w * 0.88, d * 0.76, 0, 6, 'dark'),
        ...k.box(x + w * 0.1, y + d * 0.1, w * 0.8, d * 0.72, 6, 46),
        ...fins,
        ...[0.3, 0.5, 0.7].flatMap((f) => [
          ...k.cylinder(x + w * f, cy - d * 0.05, 3.5, 46, 58, 'metal'),
          ...k.cylinder(x + w * f, cy - d * 0.05, 2, 58, 66, 'dark')
        ]),
        k.frontPanel(x + w * 0.18, y + d * 0.82, w * 0.14, 30, 40, 'hmi-iso-plate')
      ]
    };
  }
  if (/냉각탑/.test(name)) {
    return {
      z: 78,
      parts: [
        ...k.box(x + w * 0.08, y + d * 0.08, w * 0.84, d * 0.84, 0, 54),
        louvreY(k, x + w * 0.12, y + d * 0.92, w * 0.76, 6, 40, 8),
        louvreX(k, x + w * 0.92, y + d * 0.12, d * 0.76, 6, 40, 8),
        ...k.cylinder(cx, cy, Math.min(w, d) * 0.3, 54, 70, 'metal'),
        k.disc(cx, cy, Math.min(w, d) * 0.26, 70, 'hmi-iso-fan'),
        ...k.cylinder(cx, cy, 3, 70, 78, 'dark')
      ]
    };
  }
  if (/냉동기|칠러/.test(name)) {
    return {
      z: 52,
      parts: [
        ...k.box(x, y + d * 0.1, w, d * 0.8, 0, 6, 'dark'),
        ...k.box(x + w * 0.04, y + d * 0.14, w * 0.92, d * 0.72, 6, 44),
        louvreY(k, x + w * 0.08, y + d * 0.86, w * 0.84, 10, 38, 6),
        k.disc(x + w * 0.3, cy, Math.min(w, d) * 0.22, 44, 'hmi-iso-fan'),
        k.disc(x + w * 0.7, cy, Math.min(w, d) * 0.22, 44, 'hmi-iso-fan'),
        ...k.cylY(y - d * 0.02, y + d * 0.14, x + w * 0.9, 20, 4, 'metal')
      ]
    };
  }
  if (/펌프/.test(name)) {
    return {
      z: 40,
      parts: [
        ...k.box(x + w * 0.05, y + d * 0.25, w * 0.9, d * 0.5, 0, 6, 'dark'),
        ...k.cylX(x + w * 0.1, x + w * 0.55, cy, 22, d * 0.2, ''),
        ...k.box(x + w * 0.55, cy - 3, w * 0.08, 6, 18, 26, 'metal'),
        ...k.cylY(cy - d * 0.14, cy + d * 0.14, x + w * 0.76, 24, d * 0.22, 'metal'),
        ...k.cylinder(x + w * 0.76, cy, 4, 34, 40, 'metal')
      ]
    };
  }
  if (/크레인/.test(name)) {
    return {
      z: 92,
      parts: [
        ...k.box(x, y + d * 0.4, w * 0.1, d * 0.2, 0, 86, 'metal'),
        ...k.box(x + w * 0.4, y + d * 0.42, w * 0.18, d * 0.16, 62, 76, 'dark'),
        k.lines(
          [
            [
              [x + w * 0.49, cy, 62],
              [x + w * 0.49, cy, 34]
            ]
          ],
          'hmi-iso-cable'
        ),
        ...k.box(x + w * 0.45, cy - 3, w * 0.08, 6, 28, 34, 'dark'),
        ...k.box(x + w * 0.9, y + d * 0.4, w * 0.1, d * 0.2, 0, 86, 'metal'),
        ...k.box(x, y + d * 0.38, w, d * 0.24, 86, 92, 'metal')
      ]
    };
  }
  if (/집진기/.test(name)) {
    return {
      z: 86,
      parts: [
        ...k.frustum(cx, cy, Math.min(w, d) * 0.12, Math.min(w, d) * 0.34, 10, 34, 'metal'),
        ...k.box(x + w * 0.16, y + d * 0.16, w * 0.68, d * 0.68, 34, 78),
        seamsY(k, x + w * 0.16, y + d * 0.84, w * 0.68, 34, 78, 3),
        ...k.cylY(y - d * 0.05, y + d * 0.2, x + w * 0.7, 82, 6, 'metal')
      ]
    };
  }
  if (/배기 팬/.test(name)) {
    return {
      z: 56,
      parts: [
        ...k.box(x + w * 0.2, y + d * 0.3, w * 0.6, d * 0.4, 0, 14, 'metal'),
        ...k.cylY(y + d * 0.2, y + d * 0.65, cx, 34, Math.min(w, d) * 0.3, ''),
        k.disc(cx, y + d * 0.66, Math.min(w, d) * 0.2, 34, 'hmi-iso-fan')
      ]
    };
  }
  if (/보일러/.test(name)) {
    return {
      z: 66,
      parts: [
        ...k.box(x, y + d * 0.2, w, d * 0.6, 0, 8, 'dark'),
        ...k.cylX(x + w * 0.05, x + w * 0.78, cy, 30, d * 0.28, ''),
        ...k.box(x + w * 0.78, cy - d * 0.14, w * 0.18, d * 0.28, 8, 40, 'dark'),
        ...k.cylinder(x + w * 0.2, cy, 4, 48, 66, 'metal')
      ]
    };
  }
  if (/발전기/.test(name)) {
    return {
      z: 54,
      parts: [
        ...k.box(x, y + d * 0.1, w, d * 0.8, 0, 6, 'dark'),
        ...k.box(x + w * 0.04, y + d * 0.14, w * 0.92, d * 0.72, 6, 44),
        louvreY(k, x + w * 0.1, y + d * 0.86, w * 0.3, 12, 36, 6),
        louvreX(k, x + w * 0.96, y + d * 0.2, d * 0.6, 12, 36, 6),
        k.frontPanel(x + w * 0.5, y + d * 0.86, w * 0.18, 18, 34, 'hmi-iso-door'),
        ...k.cylinder(x + w * 0.8, cy, 3, 44, 54, 'dark')
      ]
    };
  }
  // Generic utility cabinet (dryer, charger, temperature controller, ...).
  return {
    z: 54,
    parts: [
      ...k.box(x + w * 0.05, y + d * 0.05, w * 0.9, d * 0.9, 0, 6, 'dark'),
      ...k.box(x + w * 0.1, y + d * 0.1, w * 0.8, d * 0.8, 6, 50),
      louvreY(k, x + w * 0.16, y + d * 0.9, w * 0.32, 12, 38, 7),
      k.frontPanel(x + w * 0.56, y + d * 0.9, w * 0.26, 24, 40, 'hmi-iso-screen'),
      louvreX(k, x + w * 0.9, y + d * 0.2, d * 0.6, 12, 38, 7),
      ...k.box(x + w * 0.3, y + d * 0.3, w * 0.4, d * 0.4, 50, 54, 'metal')
    ]
  };
}

export function isoModel(symbol: HmiSymbol, x: number, y: number, w: number, d: number, name = ''): IsoModel {
  const k = isoKit();
  const cx = x + w / 2;
  const cy = y + d / 2;
  const r = Math.min(w, d);
  switch (symbol) {
    case 'press': {
      // Straight-side press: bed and bolster, side frames with windows, slide with dies, crown with drive.
      const fw = w * 0.16;
      return {
        z: 170,
        parts: [
          ...k.box(x - w * 0.02, y - d * 0.02, w * 1.04, d * 1.04, 0, 18, 'dark'),
          ...k.box(x + w * 0.14, y + d * 0.1, w * 0.72, d * 0.8, 18, 25, 'metal'),
          ...k.box(x + w * 0.24, y + d * 0.24, w * 0.52, d * 0.52, 25, 35, 'dark'),
          ...k.box(x, y, fw, d, 18, 112),
          k.frontPanel(x + fw * 0.2, y + d, fw * 0.6, 42, 96, 'hmi-iso-recess'),
          ...k.box(x + w * 0.24, y + d * 0.24, w * 0.52, d * 0.52, 48, 60, 'dark'),
          ...k.box(x + fw, y + d * 0.08, w - 2 * fw, d * 0.84, 60, 84, 'metal'),
          k.frontPanel(x + w * 0.3, y + d * 0.92, w * 0.4, 66, 78, 'hmi-iso-plate'),
          ...k.box(x + w * 0.2, y + d * 0.96, 3, 3, 25, 62, 'dark'),
          ...k.box(x + w * 0.78, y + d * 0.96, 3, 3, 25, 62, 'dark'),
          ...k.box(x + w - fw, y, fw, d, 18, 112),
          k.frontPanel(x + w - fw + fw * 0.2, y + d, fw * 0.6, 42, 96, 'hmi-iso-recess'),
          k.sidePanel(x + w, y + d * 0.2, d * 0.6, 42, 96, 'hmi-iso-recess'),
          ...k.box(x + w * 0.88, y + d, w * 0.12, d * 0.1, 56, 92, 'metal'),
          k.frontPanel(x + w * 0.9, y + d * 1.1, w * 0.08, 70, 86, 'hmi-iso-screen'),
          ...k.box(x - w * 0.04, y - d * 0.04, w * 1.08, d * 1.08, 112, 142),
          seamsY(k, x - w * 0.04, y + d * 1.04, w * 1.08, 112, 142, 3),
          k.frontPanel(x + w * 0.36, y + d * 1.04, w * 0.28, 120, 134, 'hmi-iso-plate'),
          ...k.box(x + w * 0.1, y + d * 0.18, w * 0.42, d * 0.56, 142, 156, 'dark'),
          ...k.cylY(y + d * 0.2, y + d * 0.42, x + w * 0.74, 158, 13, 'metal'),
          ...k.cylY(y + d * 0.42, y + d * 0.5, x + w * 0.74, 158, 5, 'dark')
        ]
      };
    }
    case 'robot': {
      // 6-axis articulated robot on a riser: base, turret, lower and upper arm, wrist and torch.
      const base: [number, number, number] = [cx, cy, 36];
      const elbow: [number, number, number] = [cx + w * 0.04, cy - d * 0.08, 86];
      const wrist: [number, number, number] = [cx + w * 0.46, cy + d * 0.02, 94];
      const tool: [number, number, number] = [cx + w * 0.56, cy + d * 0.14, 76];
      const tip: [number, number, number] = [cx + w * 0.52, cy + d * 0.26, 58];
      return {
        z: 104,
        parts: [
          ...k.box(x + w * 0.12, y + d * 0.12, w * 0.76, d * 0.76, 0, 8, 'metal'),
          ...k.cylinder(cx, cy, r * 0.26, 8, 20, 'dark'),
          ...k.cylinder(cx, cy, r * 0.22, 20, 32, ''),
          ...k.box(cx - r * 0.16, cy - r * 0.12, r * 0.32, r * 0.24, 30, 44, ''),
          k.lines(
            [
              [
                [cx - r * 0.12, cy, 26],
                [cx - r * 0.08, cy - d * 0.1, 82]
              ]
            ],
            'hmi-iso-cable'
          ),
          ...k.link(base, elbow, 13, ''),
          ...k.box(cx - w * 0.1, cy - d * 0.16, w * 0.12, d * 0.12, 80, 94, 'dark'),
          k.joint(base, 7),
          ...k.link(elbow, wrist, 9, ''),
          k.joint(elbow, 6),
          ...k.link(wrist, tool, 6, 'dark'),
          k.joint(wrist, 4),
          ...k.link(tool, tip, 3, 'metal')
        ]
      };
    }
    case 'injection': {
      // Injection moulding machine: frame, clamp unit (platens, tie bars, guard), barrel, hopper, carriage, panel.
      const tb = (yy: number, zz: number) => k.cylX(x + w * 0.03, x + w * 0.44, yy, zz, 2.6, 'metal');
      return {
        z: 96,
        parts: [
          ...k.box(x, y + d * 0.12, w, d * 0.76, 0, 24, 'dark'),
          seamsY(k, x, y + d * 0.88, w, 4, 22, 6),
          ...tb(y + d * 0.24, 36),
          ...tb(y + d * 0.24, 64),
          ...k.box(x + w * 0.02, y + d * 0.16, w * 0.06, d * 0.68, 24, 72, 'metal'),
          ...k.cylX(x + w * 0.08, x + w * 0.18, cy, 50, 7, 'dark'),
          ...k.box(x + w * 0.18, y + d * 0.16, w * 0.06, d * 0.68, 24, 72, 'metal'),
          ...k.box(x + w * 0.36, y + d * 0.13, w * 0.08, d * 0.74, 24, 76, 'metal'),
          ...tb(y + d * 0.76, 36),
          ...tb(y + d * 0.76, 64),
          k.frontPanel(x + w * 0.03, y + d * 0.88, w * 0.4, 26, 74, 'hmi-iso-guard'),
          ...k.box(x + w * 0.03, y + d * 0.12, w * 0.41, d * 0.76, 74, 78, 'metal'),
          ...k.cylX(x + w * 0.44, x + w * 0.74, cy, 48, 6, 'metal'),
          ...[0.5, 0.56, 0.62, 0.68].flatMap((f) => k.cylX(x + w * f, x + w * (f + 0.03), cy, 48, 7.5, 'dark')),
          ...k.frustum(x + w * 0.66, cy, 4, 12, 56, 84, ''),
          ...k.box(x + w * 0.74, y + d * 0.24, w * 0.16, d * 0.52, 24, 64, ''),
          ...k.cylX(x + w * 0.9, x + w * 0.99, cy, 46, 10, 'dark'),
          ...k.box(x + w * 0.46, y + d * 0.86, w * 0.1, d * 0.12, 24, 76, ''),
          k.frontPanel(x + w * 0.475, y + d * 0.98, w * 0.07, 50, 70, 'hmi-iso-screen'),
          ...k.box(x + w * 0.38, y - d * 0.06, w * 0.04, d * 1.0, 78, 84, 'metal'),
          ...k.box(x + w * 0.36, y + d * 0.42, w * 0.08, d * 0.1, 84, 92, 'dark')
        ]
      };
    }
    case 'paintBooth': {
      // Spray booth: panelled enclosure, conveyor openings, access door, roof exhaust ducts and fan units.
      return {
        z: 104,
        parts: [
          ...k.box(x, y, w, d, 0, 70),
          seamsY(k, x, y + d, w, 0, 70, 5),
          seamsX(k, x + w, y, d, 0, 70, 4),
          k.sidePanel(x + w, y + d * 0.3, d * 0.4, 14, 44, 'hmi-iso-opening'),
          k.frontPanel(x + w * 0.1, y + d, w * 0.14, 0, 50, 'hmi-iso-door'),
          k.frontPanel(x + w * 0.13, y + d, w * 0.08, 32, 44, 'hmi-iso-glass'),
          k.frontPanel(x + w * 0.34, y + d, w * 0.56, 46, 58, 'hmi-iso-glass'),
          ...k.box(x + w * 0.1, y + d * 0.15, w * 0.34, d * 0.5, 70, 84, 'metal'),
          ...k.cylinder(x + w * 0.62, y + d * 0.35, 8, 70, 104, 'metal'),
          ...k.cylinder(x + w * 0.82, y + d * 0.6, 8, 70, 98, 'metal')
        ]
      };
    }
    case 'oven': {
      // Drying oven: insulated tunnel with panel seams, entry opening, burner unit and exhaust stack.
      return {
        z: 96,
        parts: [
          ...k.box(x, y + d * 0.08, w, d * 0.84, 0, 52),
          seamsY(k, x, y + d * 0.92, w, 0, 52, 7),
          k.sidePanel(x + w, y + d * 0.28, d * 0.44, 8, 34, 'hmi-iso-opening'),
          ...k.box(x + w * 0.18, y + d * 0.22, w * 0.3, d * 0.5, 52, 70, 'dark'),
          louvreY(k, x + w * 0.2, y + d * 0.72, w * 0.26, 54, 68, 4),
          ...k.cylinder(x + w * 0.7, y + d * 0.42, 6, 52, 96, 'metal'),
          ...k.box(x + w * 0.04, y + d * 0.92, w * 0.1, d * 0.1, 0, 44, 'metal'),
          k.frontPanel(x + w * 0.055, y + d * 1.02, w * 0.07, 24, 38, 'hmi-iso-screen')
        ]
      };
    }
    case 'machining': {
      // Vertical machining centre: skid, enclosure with two glass doors, spindle head housing, pendant, chip conveyor.
      const ex = x + w * 0.04;
      const ey = y + d * 0.04;
      const ew = w * 0.8;
      const ed = d * 0.78;
      return {
        z: 106,
        parts: [
          ...k.box(x, y, w * 0.88, d * 0.86, 0, 6, 'dark'),
          ...k.box(ex, ey, ew, ed, 6, 80),
          k.frontPanel(ex + ew * 0.06, ey + ed, ew * 0.42, 22, 66, 'hmi-iso-glass'),
          k.frontPanel(ex + ew * 0.52, ey + ed, ew * 0.42, 22, 66, 'hmi-iso-glass'),
          seamsY(k, ex, ey + ed, ew, 10, 76, 2),
          k.frontPanel(ex + ew * 0.06, ey + ed, ew * 0.88, 70, 76, 'hmi-iso-plate'),
          louvreX(k, ex + ew, ey + ed * 0.15, ed * 0.7, 14, 70, 9),
          ...k.box(ex + ew * 0.25, ey + ed * 0.2, ew * 0.4, ed * 0.4, 80, 100, 'metal'),
          ...tower(k, ex + ew * 0.9, ey + ed * 0.12, 80),
          ...k.box(x + w * 0.86, y + d * 0.14, w * 0.14, d * 0.4, 6, 22, 'metal'),
          ...k.box(x + w * 0.88, y + d * 0.6, w * 0.06, d * 0.06, 6, 60, 'metal'),
          ...k.box(x + w * 0.84, y + d * 0.66, w * 0.14, d * 0.2, 50, 80, 'dark'),
          k.frontPanel(x + w * 0.855, y + d * 0.86, w * 0.11, 58, 76, 'hmi-iso-screen')
        ]
      };
    }
    case 'lathe': {
      // CNC lathe: enclosure, glass door, headstock bulge, control panel, chip conveyor at the back.
      return {
        z: 82,
        parts: [
          ...k.box(x + w * 0.62, y - d * 0.02, w * 0.3, d * 0.16, 6, 26, 'metal'),
          ...k.box(x, y + d * 0.08, w, d * 0.86, 0, 6, 'dark'),
          ...k.box(x + w * 0.02, y + d * 0.12, w * 0.96, d * 0.78, 6, 58),
          k.frontPanel(x + w * 0.1, y + d * 0.9, w * 0.52, 18, 48, 'hmi-iso-glass'),
          seamsY(k, x + w * 0.02, y + d * 0.9, w * 0.96, 10, 54, 3),
          k.frontPanel(x + w * 0.7, y + d * 0.9, w * 0.2, 24, 50, 'hmi-iso-screen'),
          louvreX(k, x + w * 0.98, y + d * 0.2, d * 0.6, 12, 50, 6),
          ...k.box(x + w * 0.06, y + d * 0.2, w * 0.26, d * 0.56, 58, 70, 'metal'),
          ...tower(k, x + w * 0.9, y + d * 0.2, 58)
        ]
      };
    }
    case 'fastening': {
      // Assembly station: profile-frame bench, fixture with part, column and boom with nutrunner, monitor, bins.
      const leg = (lx: number, ly: number) => k.box(lx, ly, 3, 3, 0, 36, 'metal');
      return {
        z: 104,
        parts: [
          ...leg(x + w * 0.04, y + d * 0.04),
          ...leg(x + w * 0.92, y + d * 0.04),
          ...k.box(x + w * 0.78, y + d * 0.06, w * 0.08, d * 0.08, 36, 104, 'metal'),
          ...leg(x + w * 0.04, y + d * 0.92),
          ...leg(x + w * 0.92, y + d * 0.92),
          ...k.box(x + w * 0.06, y + d * 0.1, w * 0.88, d * 0.8, 14, 17, 'metal'),
          ...k.box(x, y, w, d, 36, 40, 'metal'),
          ...k.box(x + w * 0.24, y + d * 0.28, w * 0.44, d * 0.36, 40, 46, 'dark'),
          ...k.box(x + w * 0.3, y + d * 0.32, w * 0.3, d * 0.26, 46, 56, ''),
          ...k.box(x + w * 0.22, y + d * 0.07, w * 0.64, d * 0.06, 98, 104, 'metal'),
          k.lines(
            [
              [
                [x + w * 0.42, y + d * 0.1, 98],
                [x + w * 0.42, y + d * 0.1, 82]
              ]
            ],
            'hmi-iso-cable'
          ),
          ...k.cylinder(x + w * 0.42, y + d * 0.1, 3.5, 62, 82, 'dark'),
          ...k.box(x + w * 0.04, y + d * 0.04, w * 0.04, d * 0.04, 40, 74, 'metal'),
          ...k.box(x - w * 0.02, y + d * 0.02, w * 0.2, d * 0.06, 66, 82, 'dark'),
          k.frontPanel(x, y + d * 0.08, w * 0.16, 68, 80, 'hmi-iso-screen'),
          ...[0.12, 0.32, 0.52].flatMap((f) => k.box(x + w * f, y + d * 0.78, w * 0.16, d * 0.16, 40, 47, ''))
        ]
      };
    }
    case 'inspection': {
      if (/EOL|시험기/.test(name)) {
        // End-of-line tester: cabinet with fixture window, screen and rack.
        return {
          z: 96,
          parts: [
            ...k.box(x + w * 0.04, y + d * 0.04, w * 0.92, d * 0.92, 0, 6, 'dark'),
            ...k.box(x + w * 0.08, y + d * 0.08, w * 0.84, d * 0.8, 6, 88),
            k.frontPanel(x + w * 0.14, y + d * 0.88, w * 0.72, 34, 62, 'hmi-iso-glass'),
            k.frontPanel(x + w * 0.14, y + d * 0.88, w * 0.32, 68, 82, 'hmi-iso-screen'),
            louvreY(k, x + w * 0.14, y + d * 0.88, w * 0.72, 8, 28, 5),
            ...tower(k, x + w * 0.84, y + d * 0.2, 88)
          ]
        };
      }
      // Vision inspection: conveyor plate through a portal with camera heads and ring light.
      return {
        z: 90,
        parts: [
          ...k.box(x + w * 0.1, y + d * 0.1, w * 0.08, d * 0.08, 0, 78, 'metal'),
          ...k.box(x + w * 0.82, y + d * 0.1, w * 0.08, d * 0.08, 0, 78, 'metal'),
          ...k.box(x, y + d * 0.3, w, d * 0.4, 18, 24, 'metal'),
          ...k.box(x + w * 0.02, y + d * 0.32, w * 0.96, d * 0.36, 24, 25, 'dark'),
          ...k.box(x + w * 0.4, y + d * 0.42, w * 0.14, d * 0.14, 24, 34, ''),
          ...k.box(x + w * 0.42, y + d * 0.42, w * 0.16, d * 0.16, 54, 70, 'dark'),
          ...k.cylinder(cx, cy, r * 0.13, 50, 54, 'lamp'),
          ...k.box(x + w * 0.1, y + d * 0.82, w * 0.08, d * 0.08, 0, 78, 'metal'),
          ...k.box(x + w * 0.82, y + d * 0.82, w * 0.08, d * 0.08, 0, 78, 'metal'),
          ...k.box(x + w * 0.1, y + d * 0.1, w * 0.8, d * 0.8, 78, 84, 'metal'),
          ...k.box(x + w * 0.62, y + d * 0.86, w * 0.2, d * 0.12, 0, 14, 'dark')
        ]
      };
    }
    case 'agv': {
      // Low AGV with bumper, lidar and a cart frame on top.
      return {
        z: 44,
        parts: [
          ...k.box(x + w * 0.04, y + d * 0.06, w * 0.92, d * 0.88, 0, 4, 'dark'),
          ...k.box(x, y, w, d, 4, 16),
          louvreY(k, x + w * 0.1, y + d, w * 0.8, 6, 10, 1),
          ...k.cylinder(x + w * 0.86, cy, 4, 16, 22, 'dark'),
          ...[0.1, 0.84].flatMap((f) => k.box(x + w * f, y + d * 0.1, w * 0.04, d * 0.04, 16, 40, 'metal')),
          ...[0.1, 0.84].flatMap((f) => k.box(x + w * f, y + d * 0.84, w * 0.04, d * 0.04, 16, 40, 'metal')),
          ...k.box(x + w * 0.08, y + d * 0.08, w * 0.82, d * 0.82, 40, 44, 'metal')
        ]
      };
    }
    case 'compressor': {
      // Screw compressor package with louvres and cooler fan, plus a vertical air receiver.
      const pw = w * 0.66;
      return {
        z: 86,
        parts: [
          ...k.box(x, y, pw, d, 0, 6, 'dark'),
          ...k.box(x + w * 0.02, y + d * 0.04, pw - w * 0.04, d * 0.92, 6, 52),
          louvreY(k, x + w * 0.06, y + d * 0.96, pw * 0.46, 12, 44, 8),
          k.frontPanel(x + w * 0.4, y + d * 0.96, pw * 0.3, 26, 42, 'hmi-iso-screen'),
          louvreX(k, x + pw - w * 0.02, y + d * 0.12, d * 0.76, 12, 44, 8),
          k.disc(x + pw * 0.48, y + d * 0.5, Math.min(pw, d) * 0.3, 52, 'hmi-iso-fan'),
          ...k.cylX(x + pw - w * 0.02, x + w * 0.76, y + d * 0.3, 40, 3, 'metal'),
          ...k.cylinder(x + w * 0.84, y + d * 0.5, Math.min(w * 0.15, d * 0.3), 0, 74, 'metal'),
          k.disc(x + w * 0.84, y + d * 0.5, Math.min(w * 0.15, d * 0.3) * 0.7, 74, 'hmi-iso-dome'),
          ...k.cylinder(x + w * 0.84, y + d * 0.5, 2.5, 74, 86, 'dark')
        ]
      };
    }
    case 'utility':
      return utility(k, x, y, w, d, name);
    default:
      return {
        z: 56,
        parts: [
          ...k.box(x, y, w, d, 0, 6, 'dark'),
          ...k.box(x + w * 0.06, y + d * 0.06, w * 0.88, d * 0.88, 6, 52),
          louvreY(k, x + w * 0.12, y + d * 0.94, w * 0.4, 12, 40, 6),
          k.frontPanel(x + w * 0.6, y + d * 0.94, w * 0.26, 24, 40, 'hmi-iso-screen')
        ]
      };
  }
}
