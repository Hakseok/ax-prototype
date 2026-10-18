// 2.5D equipment models for P13 process views, built from boxes, cylinders and panels inside the
// object's plan footprint (x, y, w, d). Parts are listed back to front. Three tones: the body,
// "metal" frames and bases, "dark" heads and motors; glass, screens and grilles are panels.
// A model carries no state or status color; HmiIso draws those on top.
import type { ReactNode } from 'react';
import type { HmiSymbol } from '../../data/hmi';
import { isoKit } from './iso';

export interface IsoModel {
  parts: ReactNode[];
  /** Top of the model, for hit areas and the anchor of floating labels. */
  z: number;
}

export function isoModel(symbol: HmiSymbol, x: number, y: number, w: number, d: number): IsoModel {
  const k = isoKit();
  const m = Math.min(w, d) * 0.08;
  const cx = x + w / 2;
  const cy = y + d / 2;
  const r = Math.min(w, d);
  switch (symbol) {
    case 'press':
      return {
        z: 122,
        parts: [
          ...k.box(x, y, w, d, 0, 14, 'metal'),
          ...k.box(x + m, y + m, w * 0.18, d - 2 * m, 14, 96),
          ...k.box(x + w * 0.26, y + d * 0.22, w * 0.48, d * 0.56, 50, 66, 'dark'),
          ...k.box(x + w * 0.3, y + d * 0.26, w * 0.4, d * 0.48, 14, 24, 'metal'),
          ...k.box(x + w - m - w * 0.18, y + m, w * 0.18, d - 2 * m, 14, 96),
          ...k.box(x, y, w, d, 96, 122),
          k.frontPanel(x + w * 0.62, y + d, w * 0.18, 102, 116, 'hmi-iso-screen')
        ]
      };
    case 'robot':
      return {
        z: 96,
        parts: [
          ...k.cylinder(cx, cy, r * 0.3, 0, 14, 'metal'),
          ...k.cylinder(cx, cy, r * 0.17, 14, 36, 'dark'),
          ...k.arm([
            [cx, cy, 36],
            [cx, cy, 74],
            [cx + w * 0.34, cy - d * 0.06, 90],
            [cx + w * 0.46, cy + d * 0.14, 62]
          ])
        ]
      };
    case 'injection':
      return {
        z: 80,
        parts: [
          ...k.box(x, y, w, d, 0, 18, 'metal'),
          ...k.box(x + m, y + m, w * 0.36, d - 2 * m, 18, 64),
          ...k.box(x + w * 0.42, y + d * 0.3, w * 0.5, d * 0.4, 18, 40, 'metal'),
          ...k.box(x + w * 0.7, y + d * 0.32, w * 0.12, d * 0.36, 40, 72, 'dark'),
          k.frontPanel(x + m + w * 0.04, y + d - m, w * 0.14, 30, 54, 'hmi-iso-screen'),
          k.frontPanel(x + m + w * 0.2, y + d - m, w * 0.12, 26, 58, 'hmi-iso-glass')
        ]
      };
    case 'paintBooth':
      return {
        z: 84,
        parts: [
          ...k.box(x, y, w, d, 0, 66),
          ...k.box(x + w * 0.2, y + d * 0.2, w * 0.6, d * 0.6, 66, 82, 'metal'),
          k.frontPanel(x + w * 0.36, y + d, w * 0.28, 0, 46, 'hmi-iso-door'),
          k.sidePanel(x + w, y + d * 0.2, d * 0.6, 28, 54, 'hmi-iso-glass')
        ]
      };
    case 'oven':
      return {
        z: 72,
        parts: [
          ...k.box(x, y, w, d, 0, 44),
          ...k.cylinder(x + w * 0.8, y + d * 0.35, 7, 44, 72, 'metal'),
          k.frontPanel(x + w * 0.1, y + d, w * 0.8, 12, 30, 'hmi-iso-grille'),
          k.sidePanel(x + w, y + d * 0.25, d * 0.5, 10, 34, 'hmi-iso-door')
        ]
      };
    case 'machining':
      return {
        z: 84,
        parts: [
          ...k.box(x, y, w, d, 0, 8, 'metal'),
          ...k.box(x + m, y + m, w - 2 * m, d - 2 * m, 8, 82),
          k.frontPanel(x + m + w * 0.1, y + d - m, w * 0.5, 24, 66, 'hmi-iso-glass'),
          k.sidePanel(x + w - m, y + m + d * 0.15, d * 0.3, 40, 70, 'hmi-iso-screen')
        ]
      };
    case 'lathe':
      return {
        z: 58,
        parts: [
          ...k.box(x, y, w, d, 0, 46),
          ...k.box(x + w * 0.7, y + d * 0.2, w * 0.24, d * 0.6, 46, 58, 'metal'),
          k.frontPanel(x + w * 0.1, y + d, w * 0.55, 16, 40, 'hmi-iso-glass'),
          k.frontPanel(x + w * 0.72, y + d, w * 0.18, 20, 38, 'hmi-iso-screen')
        ]
      };
    case 'fastening':
      return {
        z: 92,
        parts: [
          ...k.box(x + w * 0.3, y + d * 0.3, w * 0.4, d * 0.4, 0, 22, 'metal'),
          ...k.box(x, y, w, d, 22, 30),
          ...k.box(x + w * 0.42, y + d * 0.08, w * 0.16, d * 0.16, 30, 90, 'metal'),
          ...k.box(x + w * 0.46, y + d * 0.42, w * 0.08, d * 0.08, 46, 72, 'dark'),
          ...k.box(x + w * 0.3, y + d * 0.08, w * 0.4, d * 0.42, 72, 86, 'dark')
        ]
      };
    case 'inspection':
      return {
        z: 82,
        parts: [
          ...k.box(x + w * 0.12, y + d * 0.12, w * 0.76, d * 0.76, 0, 10, 'metal'),
          ...k.box(x, y + d * 0.35, w * 0.12, d * 0.3, 0, 70, 'metal'),
          ...k.box(x + w * 0.42, y + d * 0.4, w * 0.16, d * 0.2, 56, 70, 'dark'),
          ...k.box(x + w * 0.88, y + d * 0.35, w * 0.12, d * 0.3, 0, 70, 'metal'),
          ...k.box(x, y + d * 0.35, w, d * 0.3, 70, 80)
        ]
      };
    case 'agv':
      return {
        z: 22,
        parts: [
          ...k.box(x + w * 0.1, y + d * 0.1, w * 0.8, d * 0.8, 0, 4, 'dark'),
          ...k.box(x, y, w, d, 4, 16),
          ...k.box(x + w * 0.1, y + d * 0.15, w * 0.8, d * 0.7, 16, 20, 'metal'),
          k.frontPanel(x + w * 0.7, y + d, w * 0.18, 8, 14, 'hmi-iso-screen')
        ]
      };
    case 'compressor':
      return {
        z: 58,
        parts: [
          ...k.box(x, y, w, d, 0, 8, 'metal'),
          ...k.box(x + m, y + d * 0.15, w * 0.6, d * 0.7, 8, 44),
          ...k.cylinder(x + w * 0.3, y + d * 0.5, 5, 44, 56, 'metal'),
          ...k.box(x + w * 0.68, y + d * 0.25, w * 0.26, d * 0.5, 8, 36, 'dark'),
          k.frontPanel(x + m + w * 0.08, y + d * 0.85, w * 0.2, 18, 34, 'hmi-iso-screen')
        ]
      };
    case 'utility':
      return {
        z: 54,
        parts: [
          ...k.box(x, y, w, d, 0, 48),
          ...k.cylinder(cx, cy, r * 0.24, 48, 54, 'metal'),
          k.frontPanel(x + w * 0.15, y + d, w * 0.7, 10, 38, 'hmi-iso-grille')
        ]
      };
    default:
      return { z: 50, parts: [...k.box(x, y, w, d, 0, 50), k.frontPanel(x + w * 0.3, y + d, w * 0.4, 12, 36, 'hmi-iso-grille')] };
  }
}
