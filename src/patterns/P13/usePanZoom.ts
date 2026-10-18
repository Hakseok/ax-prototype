// Zoom and pan for P13 process views by moving the SVG viewBox. Wheel zooms at the cursor, a drag
// pans (a drag never counts as a click, so dragging over equipment does not select it), and
// fitRect zooms to a region such as a line's zone. The aspect of the base box is kept.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export type Box = [number, number, number, number];

const MAX_ZOOM = 8;
const DRAG_START = 4;

export function usePanZoom(base: Box, svgRef: RefObject<SVGSVGElement | null>) {
  const [vb, setVb] = useState<Box>(base);
  const baseKey = base.join(' ');
  useEffect(() => setVb(base), [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = useCallback(
    (b: Box): Box => {
      const w = Math.max(base[2] / MAX_ZOOM, Math.min(base[2], b[2]));
      const h = (w * base[3]) / base[2];
      // Keep at least half of the view over the drawing.
      const x = Math.max(base[0] - w / 2, Math.min(base[0] + base[2] - w / 2, b[0]));
      const y = Math.max(base[1] - h / 2, Math.min(base[1] + base[3] - h / 2, b[1]));
      return [x, y, w, h];
    },
    [baseKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** A client point in drawing units under the current viewBox. */
  const toUser = (clientX: number, clientY: number): [number, number] | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };

  const zoomAt = useCallback(
    (factor: number, at?: [number, number]) =>
      setVb((b) => {
        const w = Math.max(base[2] / MAX_ZOOM, Math.min(base[2], b[2] / factor));
        const k = w / b[2];
        const [px, py] = at ?? [b[0] + b[2] / 2, b[1] + b[3] / 2];
        return clamp([px - (px - b[0]) * k, py - (py - b[1]) * k, w, b[3] * k]);
      }),
    [clamp] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Wheel needs a non-passive listener so the page does not scroll while zooming.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const at = toUser(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.0008), at ?? undefined);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const drag = useRef<{ x: number; y: number; vb: Box; scale: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const m = svgRef.current?.getScreenCTM();
    drag.current = { x: e.clientX, y: e.clientY, vb, scale: m ? 1 / m.a : 1, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_START) return;
    if (!d.moved) {
      d.moved = true;
      svgRef.current?.setPointerCapture(e.pointerId);
    }
    setVb(clamp([d.vb[0] - dx * d.scale, d.vb[1] - dy * d.scale, d.vb[2], d.vb[3]]));
  };
  const onPointerUp = () => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
  };
  /** Swallow the click that ends a drag, before it reaches equipment. */
  const onClickCapture = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /** Zoom to a region (drawing units), with a margin. */
  const fitRect = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const m = 0.08;
      const bw = Math.max(w, (h * base[2]) / base[3]) * (1 + m * 2);
      const bh = (bw * base[3]) / base[2];
      setVb(clamp([x + w / 2 - bw / 2, y + h / 2 - bh / 2, bw, bh]));
    },
    [clamp] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    toUser,
    viewBox: vb.join(' '),
    zoom: base[2] / vb[2],
    zoomIn: () => zoomAt(1.5),
    zoomOut: () => zoomAt(1 / 1.5),
    reset: () => setVb(base),
    fitRect,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture }
  };
}
