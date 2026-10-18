// Flat line-art equipment symbols for P13 process views, drawn in a 100 × 100 box and scaled into
// the object's frame. Strokes and fills come from CSS classes (tokens), never from the drawing,
// so the same symbol reads in light, dark and the wallboard. State and status are drawn on top
// by HmiDrawing; a symbol carries no color of its own.
import type { ReactNode } from 'react';
import type { HmiSymbol } from '../../data/hmi';

const B = 'hmi-sym__body';
const D = 'hmi-sym__detail';

const PATHS: Record<HmiSymbol, ReactNode> = {
  press: (
    <>
      <rect className={B} x="10" y="6" width="80" height="18" />
      <rect className={B} x="14" y="24" width="12" height="60" />
      <rect className={B} x="74" y="24" width="12" height="60" />
      <rect className={B} x="28" y="38" width="44" height="14" />
      <line className={D} x1="50" y1="24" x2="50" y2="38" />
      <rect className={B} x="6" y="84" width="88" height="10" />
      <line className={D} x1="30" y1="76" x2="70" y2="76" />
    </>
  ),
  robot: (
    <>
      <rect className={B} x="30" y="82" width="40" height="12" />
      <polyline className={B} points="50,82 50,58 76,36" />
      <circle className={B} cx="50" cy="58" r="7" />
      <circle className={B} cx="76" cy="36" r="6" />
      <polyline className={D} points="76,36 88,22 84,14" />
      <polyline className={D} points="88,22 94,18" />
    </>
  ),
  injection: (
    <>
      <rect className={B} x="4" y="28" width="32" height="54" />
      <rect className={B} x="36" y="42" width="60" height="28" />
      <line className={D} x1="4" y1="38" x2="36" y2="38" />
      <line className={D} x1="4" y1="72" x2="36" y2="72" />
      <polygon className={B} points="62,16 80,16 74,42 68,42" />
      <rect className={B} x="4" y="82" width="92" height="8" />
    </>
  ),
  paintBooth: (
    <>
      <rect className={B} x="8" y="26" width="84" height="64" />
      <polyline className={D} points="8,26 50,10 92,26" />
      <rect className={D} x="38" y="56" width="24" height="34" />
      <line className={D} x1="18" y1="36" x2="30" y2="36" />
      <line className={D} x1="70" y1="36" x2="82" y2="36" />
    </>
  ),
  oven: (
    <>
      <rect className={B} x="4" y="34" width="92" height="50" />
      <path className={D} d="M20 26 q4 -8 0 -16 M40 26 q4 -8 0 -16 M60 26 q4 -8 0 -16 M80 26 q4 -8 0 -16" />
      <line className={D} x1="4" y1="48" x2="96" y2="48" />
      <rect className={B} x="4" y="84" width="92" height="6" />
    </>
  ),
  machining: (
    <>
      <rect className={B} x="10" y="8" width="80" height="84" />
      <rect className={D} x="20" y="20" width="44" height="40" />
      <rect className={D} x="70" y="20" width="12" height="28" />
      <line className={D} x1="42" y1="20" x2="42" y2="40" />
      <line className={D} x1="20" y1="72" x2="80" y2="72" />
    </>
  ),
  lathe: (
    <>
      <rect className={B} x="4" y="26" width="92" height="50" />
      <circle className={D} cx="24" cy="50" r="12" />
      <line className={D} x1="36" y1="50" x2="74" y2="50" />
      <rect className={D} x="74" y="40" width="14" height="20" />
      <rect className={B} x="4" y="76" width="92" height="8" />
    </>
  ),
  fastening: (
    <>
      <rect className={B} x="8" y="64" width="84" height="12" />
      <rect className={B} x="42" y="12" width="16" height="44" />
      <rect className={D} x="34" y="44" width="32" height="10" />
      <line className={D} x1="50" y1="54" x2="50" y2="64" />
      <line className={D} x1="16" y1="76" x2="16" y2="92" />
      <line className={D} x1="84" y1="76" x2="84" y2="92" />
    </>
  ),
  inspection: (
    <>
      <rect className={B} x="8" y="14" width="84" height="12" />
      <line className={B} x1="14" y1="26" x2="14" y2="90" />
      <line className={B} x1="86" y1="26" x2="86" y2="90" />
      <rect className={B} x="40" y="26" width="20" height="14" />
      <polyline className={D} points="42,40 30,74 70,74 58,40" />
    </>
  ),
  agv: (
    <>
      <rect className={B} x="6" y="28" width="88" height="40" rx="6" />
      <circle className={D} cx="24" cy="74" r="7" />
      <circle className={D} cx="76" cy="74" r="7" />
      <path className={D} d="M40 48 H56 M52 42 L56 48 L52 54" />
    </>
  ),
  compressor: (
    <>
      <rect className={B} x="6" y="34" width="60" height="44" rx="18" />
      <rect className={B} x="68" y="40" width="26" height="32" />
      <circle className={D} cx="36" cy="22" r="8" />
      <line className={D} x1="36" y1="30" x2="36" y2="34" />
      <rect className={B} x="6" y="80" width="88" height="8" />
    </>
  ),
  utility: (
    <>
      <rect className={B} x="10" y="18" width="80" height="70" />
      <circle className={D} cx="50" cy="53" r="18" />
      <line className={D} x1="50" y1="35" x2="50" y2="71" />
      <line className={D} x1="32" y1="53" x2="68" y2="53" />
    </>
  ),
  generic: (
    <>
      <rect className={B} x="10" y="14" width="80" height="74" />
      <line className={D} x1="10" y1="14" x2="90" y2="88" />
      <line className={D} x1="90" y1="14" x2="10" y2="88" />
    </>
  )
};

/** A symbol scaled into the frame (x, y, w, h). */
export function SymbolArt({ symbol, x, y, w, h }: { symbol: HmiSymbol; x: number; y: number; w: number; h: number }) {
  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="hmi-sym" overflow="visible">
      {PATHS[symbol]}
    </svg>
  );
}
