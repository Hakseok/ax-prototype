// P13 공정도형 · designer (SET-080 화면 디자이너). First scope (D-71): place symbols and equipment
// from the master data by dragging (or clicking) from the palette, move and resize them on a
// snapping grid, draw connector lines, bind equipment, signals and lines in the property panel,
// save the draft and publish it to the viewer. The draft never shows in the viewer until published.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { App, Button, Checkbox, Input, InputNumber, Segmented, Select, Skeleton, Tag } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { button, company } from '../../config';
import {
  SYMBOL_NAMES, checkScreen, editableScreens, hmiSnapshot, hmiStore, newScreenId, publish, saveDraft, symbolFor,
  type HmiEquipmentObject, type HmiObject, type HmiScreen, type HmiSymbol
} from '../../data/hmi';
import { loadEquipment, loadSensors } from '../../data/loaders';
import { useLocalStore } from '../../data/localStore';
import { NOW } from '../../data/time';
import type { Equipment, Sensor, Signal } from '../../data/types';
import { useApp } from '../../shell/AppContext';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import { HmiDefs, HmiDrawing, type HmiView } from './HmiDrawing';
import { Canvas, type P13Definition } from './P13Viewer';
import { SymbolArt } from './symbols';
import '../common/patterns.css';
import './P13.css';

const SIZE: Record<HmiSymbol, [number, number]> = {
  press: [110, 90], robot: [72, 72], injection: [150, 80], paintBooth: [110, 80], oven: [130, 80], machining: [84, 84], lathe: [84, 64],
  fastening: [72, 72], inspection: [72, 72], agv: [64, 44], compressor: [80, 64], utility: [72, 60], generic: [72, 72]
};
const SYMBOLS = Object.keys(SYMBOL_NAMES) as HmiSymbol[];
const MIN = 20;

type Tool = 'select' | 'line';
type Drop =
  | { kind: 'equipment'; equipmentId: string }
  | { kind: 'symbol'; symbol: HmiSymbol }
  | { kind: 'zone' }
  | { kind: 'text' };
type Drag =
  | { mode: 'move'; id: string; start: [number, number]; orig: HmiObject }
  | { mode: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; start: [number, number]; orig: HmiObject }
  | { mode: 'point'; id: string; index: number; start: [number, number]; orig: HmiObject };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function P13Designer({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P13Definition;
  const { message, modal } = App.useApp();
  const app = useApp();
  const siteId = app.siteSelection;
  const all = useLocalStore(hmiStore);
  const list = editableScreens(all, siteId);
  const [params, setParams] = useSearchParams();
  const grid = def.hmi.grid ?? 10;
  const canvasSize = def.hmi.canvas ?? [1600, 900];
  const maxSignals = def.hmi.maxSignals ?? 2;

  const { value: master } = useAsync(async () => {
    const [eqs, sensors] = await Promise.all([loadEquipment(), loadSensors()]);
    return { eqs: eqs.filter((e) => e.siteId === siteId), sensors };
  }, siteId);
  const names = useMemo(() => new Map((master?.eqs ?? []).map((e) => [e.id, e.name])), [master]);

  // The working copy: the stored draft or published version, or a new unsaved screen.
  const requested = params.get('screen');
  const stored = list.find((x) => x.screen.id === requested) ?? list[0] ?? null;
  const [doc, setDoc] = useState<HmiScreen | null>(stored ? clone(stored.screen) : null);
  const [isNew, setIsNew] = useState(false);
  const savedJson = isNew ? '' : JSON.stringify(stored?.screen ?? null);
  const dirty = !!doc && JSON.stringify(doc) !== savedJson;
  useEffect(() => {
    // Reload the working copy when another screen is chosen or the stored version changes.
    if (!isNew) setDoc(stored ? clone(stored.screen) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.screen.id, savedJson]);

  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [lineDraft, setLineDraft] = useState<[number, number][]>([]);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [preview, setPreview] = useState(false);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const snap = (v: number) => Math.round(v / grid) * grid;
  const toCanvas = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [Math.max(0, Math.min(canvasSize[0], p.x)), Math.max(0, Math.min(canvasSize[1], p.y))];
  };
  const update = useCallback((id: string, fn: (o: HmiObject) => HmiObject) => setDoc((d) => (d ? { ...d, objects: d.objects.map((o) => (o.id === id ? fn(o) : o)) } : d)), []);
  const nextId = (d: HmiScreen, p: string) => {
    const used = new Set(d.objects.map((o) => o.id));
    for (let n = d.objects.length + 1; ; n++) if (!used.has(`${p}${n}`)) return `${p}${n}`;
  };
  const sel = doc?.objects.find((o) => o.id === selected) ?? null;

  const confirmDiscard = (then: () => void) => {
    if (!dirty) return then();
    modal.confirm({ title: '저장하지 않은 변경이 있습니다', content: '변경을 버리고 이동합니다.', okText: button('확인'), cancelText: button('취소'), onOk: then });
  };
  const openScreen = (id: string) =>
    confirmDiscard(() => {
      setIsNew(false);
      setSelected(null);
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('screen', id);
        return n;
      }, { replace: true });
      const s = list.find((x) => x.screen.id === id);
      if (s) setDoc(clone(s.screen));
    });

  const addObject = (what: Drop, at: [number, number]) => {
    if (!doc) return;
    let o: HmiObject;
    if (what.kind === 'equipment') {
      const e = master?.eqs.find((x) => x.id === what.equipmentId);
      const symbol = e ? symbolFor(e) : 'generic';
      const [w, h] = SIZE[symbol];
      o = { id: nextId(doc, 'e'), kind: 'equipment', symbol, x: snap(at[0] - w / 2), y: snap(at[1] - h / 2), w, h, equipmentId: what.equipmentId };
    } else if (what.kind === 'symbol') {
      const [w, h] = SIZE[what.symbol];
      o = { id: nextId(doc, 'e'), kind: 'equipment', symbol: what.symbol, x: snap(at[0] - w / 2), y: snap(at[1] - h / 2), w, h, equipmentId: null };
    } else if (what.kind === 'zone') {
      o = { id: nextId(doc, 'z'), kind: 'zone', x: snap(at[0] - 200), y: snap(at[1] - 100), w: 400, h: 200, label: '새 영역', lineId: null };
    } else {
      o = { id: nextId(doc, 't'), kind: 'text', x: snap(at[0]), y: snap(at[1]), text: '글자', size: 'body' };
    }
    setDoc({ ...doc, objects: [...doc.objects, o] });
    setSelected(o.id);
    setTool('select');
  };
  const removeSelected = () => {
    if (!doc || !selected) return;
    setDoc({ ...doc, objects: doc.objects.filter((o) => o.id !== selected) });
    setSelected(null);
  };
  const finishLine = () => {
    if (!doc) return;
    const pts = lineDraft.filter((p, i) => i === 0 || p[0] !== lineDraft[i - 1][0] || p[1] !== lineDraft[i - 1][1]);
    if (pts.length >= 2) {
      const o: HmiObject = { id: nextId(doc, 'l'), kind: 'line', style: 'conveyor', points: pts };
      setDoc({ ...doc, objects: [...doc.objects, o] });
      setSelected(o.id);
    }
    setLineDraft([]);
  };

  // Keyboard: Delete removes, arrows nudge by one grid step, Esc cancels a line or the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, .ant-select')) return;
      if (e.key === 'Escape') {
        if (lineDraft.length) setLineDraft([]);
        else setSelected(null);
      } else if (e.key === 'Enter' && lineDraft.length >= 2) finishLine();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        removeSelected();
      } else if (selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -grid : e.key === 'ArrowRight' ? grid : 0;
        const dy = e.key === 'ArrowUp' ? -grid : e.key === 'ArrowDown' ? grid : 0;
        update(selected, (o) => (o.kind === 'line' ? { ...o, points: o.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : { ...o, x: o.x + dx, y: o.y + dy }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onObjectDown = (e: ReactPointerEvent<SVGGElement>, o: HmiObject) => {
    if (tool === 'line') return;
    e.stopPropagation();
    setSelected(o.id);
    drag.current = { mode: 'move', id: o.id, start: toCanvas(e.clientX, e.clientY), orig: clone(o) };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onHandleDown = (e: ReactPointerEvent<SVGElement>, d: Omit<Drag, 'start' | 'orig'>) => {
    e.stopPropagation();
    const o = doc?.objects.find((x) => x.id === d.id);
    if (!o) return;
    drag.current = { ...d, start: toCanvas(e.clientX, e.clientY), orig: clone(o) } as Drag;
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onCanvasDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = toCanvas(e.clientX, e.clientY);
    if (tool === 'line') setLineDraft((d) => [...d, [snap(p[0]), snap(p[1])]]);
    else setSelected(null);
  };
  const onCanvasMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = toCanvas(e.clientX, e.clientY);
    if (tool === 'line') setCursor([snap(p[0]), snap(p[1])]);
    const d = drag.current;
    if (!d) return;
    const dx = snap(p[0] - d.start[0]);
    const dy = snap(p[1] - d.start[1]);
    const o = d.orig;
    if (d.mode === 'move') {
      update(d.id, () => (o.kind === 'line' ? { ...o, points: o.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : { ...o, x: o.x + dx, y: o.y + dy }));
    } else if (d.mode === 'point' && o.kind === 'line') {
      update(d.id, () => ({ ...o, points: o.points.map((pt, i) => (i === d.index ? ([pt[0] + dx, pt[1] + dy] as [number, number]) : pt)) }));
    } else if (d.mode === 'resize' && (o.kind === 'equipment' || o.kind === 'zone')) {
      const west = d.corner.endsWith('w');
      const north = d.corner.startsWith('n');
      const w = Math.max(MIN, west ? o.w - dx : o.w + dx);
      const h = Math.max(MIN, north ? o.h - dy : o.h + dy);
      update(d.id, () => ({ ...o, x: west ? o.x + o.w - w : o.x, y: north ? o.y + o.h - h : o.y, w, h }));
    }
  };
  const onCanvasUp = () => {
    drag.current = null;
  };
  const onDrop = (e: DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    try {
      addObject(JSON.parse(e.dataTransfer.getData('text/plain')) as Drop, toCanvas(e.clientX, e.clientY));
    } catch {
      // Not a palette item.
    }
  };

  const issues = doc && master ? checkScreen(doc, master.eqs) : [];
  const onNew = () =>
    confirmDiscard(() => {
      const id = newScreenId(all, siteId);
      setIsNew(true);
      setSelected(null);
      setDoc({ id, siteId, name: '새 화면', size: canvasSize, grid, version: 0, publishedAt: null, publishedBy: null, objects: [] });
    });
  const onSave = () => {
    if (!doc) return;
    saveDraft(doc);
    setIsNew(false);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('screen', doc.id);
      return n;
    }, { replace: true });
    message.success('편집본을 저장했습니다. 게시해야 설비 가동 화면에 반영됩니다.');
  };
  const onPublish = () => {
    if (!doc) return;
    if (issues.length) {
      modal.warning({ title: `게시 전에 고칠 것 ${issues.length}건`, content: <ul className="p13__issues">{issues.map((i, k) => <li key={k}>{i.text}</li>)}</ul>, okText: button('확인') });
      return;
    }
    modal.confirm({
      title: `${doc.name}을(를) 게시합니다`,
      content: '게시하면 설비 가동 화면(OPS-060)에 바로 반영됩니다. 이전 게시본은 버전 이력으로 남지 않고 이 버전으로 바뀝니다.',
      okText: button('확인'),
      cancelText: button('취소'),
      onOk: () => {
        publish(doc, app.user.name);
        setIsNew(false);
        setParams((p) => {
          const n = new URLSearchParams(p);
          n.set('screen', doc.id);
          return n;
        }, { replace: true });
        message.success('게시했습니다. 설비 가동 화면에서 볼 수 있습니다.');
      }
    });
  };

  const current = list.find((x) => x.screen.id === doc?.id);
  const status = !doc ? null : isNew ? '새 화면 · 저장 안 됨' : dirty ? '저장하지 않은 변경 있음' : current?.draft ? '편집본 저장됨 · 게시 전' : `게시본 v${doc.version}`;
  const placed = new Set(doc?.objects.flatMap((o) => (o.kind === 'equipment' && o.equipmentId ? [o.equipmentId] : [])) ?? []);
  const center: [number, number] = [canvasSize[0] / 2, canvasSize[1] / 2];

  return (
    <ScreenLayout
      entry={entry}
      badges={badges}
      secondary={
        <>
          <Button onClick={onNew}>{button('신규')}</Button>
          <Button onClick={onSave} disabled={!doc || !dirty}>{button('저장')}</Button>
          <Button onClick={() => setPreview(true)} disabled={!doc}>{button('미리보기')}</Button>
          <Button danger onClick={removeSelected} disabled={!selected}>{button('삭제')}</Button>
        </>
      }
      primary={<Button type="primary" onClick={onPublish} disabled={!doc}>{button('게시')}</Button>}
      toolbar={
        <>
          <Select
            size="small"
            className="p13__screen-select"
            value={doc?.id}
            onChange={openScreen}
            options={[
              ...list.map((x) => ({ value: x.screen.id, label: `${x.screen.name}${x.draft ? ' · 편집본' : ''}` })),
              ...(isNew && doc ? [{ value: doc.id, label: `${doc.name} · 저장 안 됨` }] : [])
            ]}
            aria-label="편집할 화면"
          />
          {status && <Tag bordered>{status}</Tag>}
          <Segmented size="small" value={tool} onChange={(v) => { setTool(v as Tool); setLineDraft([]); }} options={[{ value: 'select', label: '선택·이동' }, { value: 'line', label: '선 그리기' }]} />
          <span className="toolbar__spacer" />
          <span className="caption">
            {tool === 'line' ? '점을 차례로 누르고, 두 번 누르거나 Enter로 끝냅니다. Esc는 취소.' : `팔레트에서 끌어다 놓거나 누르면 가운데에 놓입니다. 격자 ${grid} 단위로 맞춥니다. Delete 삭제, 방향키 이동.`}
          </span>
        </>
      }
      bodyMode="fit"
    >
      {!doc || !master ? (
        <Skeleton active />
      ) : (
        <div className="p13d">
          <Panel title="팔레트" className="p13d__palette">
            <Palette eqs={master.eqs} placed={placed} onAdd={(d) => addObject(d, center)} />
          </Panel>
          <Panel title={doc.name} caption={`${doc.id} · ${doc.objects.length}개 객체`} className="p13d__stage">
            <svg
              ref={svgRef}
              className={`hmi-canvas hmi-canvas--edit${tool === 'line' ? ' hmi-canvas--line' : ''}`}
              viewBox={`0 0 ${doc.size[0]} ${doc.size[1]}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerDown={onCanvasDown}
              onPointerMove={onCanvasMove}
              onPointerUp={onCanvasUp}
              onDoubleClick={() => tool === 'line' && finishLine()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              aria-label={`${doc.name} 편집 캔버스`}
            >
              <HmiDefs />
              <defs>
                <pattern id="hmi-grid" width={grid * 5} height={grid * 5} patternUnits="userSpaceOnUse">
                  <path className="hmi-grid-line" d={`M ${grid * 5} 0 L 0 0 0 ${grid * 5}`} />
                </pattern>
              </defs>
              <rect className="hmi-canvas__bg" x="0" y="0" width={doc.size[0]} height={doc.size[1]} />
              <rect className="hmi-canvas__grid" x="0" y="0" width={doc.size[0]} height={doc.size[1]} />
              <HmiDrawing screen={doc} snap={null} view="process" selected={selected} names={names} maxSignals={maxSignals} onObjectDown={onObjectDown} editing />
              {sel && <Handles o={sel} onDown={onHandleDown} />}
              {lineDraft.length > 0 && <polyline className="hmi-line-draft" points={[...lineDraft, ...(cursor ? [cursor] : [])].map((p) => p.join(',')).join(' ')} />}
            </svg>
          </Panel>
          <Panel title={sel ? '속성' : '화면'} className="p13d__props">
            {sel ? (
              <Props o={sel} eqs={master.eqs} sensors={master.sensors} siteId={siteId} maxSignals={maxSignals} onChange={(fn) => update(sel.id, fn)} />
            ) : (
              <ScreenProps doc={doc} onName={(name) => setDoc({ ...doc, name })} issues={issues} onPick={setSelected} published={!!current?.published} />
            )}
          </Panel>
        </div>
      )}
      {preview && doc && <Preview screen={doc} siteId={siteId} maxSignals={maxSignals} onClose={() => setPreview(false)} />}
    </ScreenLayout>
  );
}

function Handles({ o, onDown }: { o: HmiObject; onDown: (e: ReactPointerEvent<SVGElement>, d: { mode: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se' } | { mode: 'point'; id: string; index: number }) => void }) {
  if (o.kind === 'line') {
    return (
      <g className="hmi-handles">
        {o.points.map(([x, y], i) => (
          <circle key={i} className="hmi-handle" cx={x} cy={y} r="7" onPointerDown={(e) => onDown(e, { mode: 'point', id: o.id, index: i })} />
        ))}
      </g>
    );
  }
  if (o.kind === 'text') return null;
  const corners: ['nw' | 'ne' | 'sw' | 'se', number, number][] = [['nw', o.x, o.y], ['ne', o.x + o.w, o.y], ['sw', o.x, o.y + o.h], ['se', o.x + o.w, o.y + o.h]];
  return (
    <g className="hmi-handles">
      <rect className="hmi-handles__box" x={o.x} y={o.y} width={o.w} height={o.h} />
      {corners.map(([c, x, y]) => (
        <rect key={c} className={`hmi-handle hmi-handle--${c}`} x={x - 6} y={y - 6} width="12" height="12" onPointerDown={(e) => onDown(e, { mode: 'resize', id: o.id, corner: c })} />
      ))}
    </g>
  );
}

function Palette({ eqs, placed, onAdd }: { eqs: Equipment[]; placed: Set<string>; onAdd: (d: Drop) => void }) {
  const [q, setQ] = useState('');
  const start = (d: Drop) => (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(d));
    e.dataTransfer.effectAllowed = 'copy';
  };
  const byLine = new Map<string, Equipment[]>();
  for (const e of eqs) if (!q || e.name.includes(q) || e.id.toLowerCase().includes(q.toLowerCase())) byLine.set(e.lineId, [...(byLine.get(e.lineId) ?? []), e]);
  const lineName = (id: string) => company.sites.flatMap((s) => s.lines).find((l) => l.id === id)?.name ?? (id.endsWith('-UTL') ? '유틸리티' : id);
  return (
    <div className="p13d__palette-body">
      <section>
        <h3 className="p13d__h">기본 도형</h3>
        <div className="p13d__chips">
          <button type="button" className="p13d__chip" draggable onDragStart={start({ kind: 'zone' })} onClick={() => onAdd({ kind: 'zone' })}>영역 (라인 연결)</button>
          <button type="button" className="p13d__chip" draggable onDragStart={start({ kind: 'text' })} onClick={() => onAdd({ kind: 'text' })}>글자</button>
        </div>
      </section>
      <section>
        <h3 className="p13d__h">심볼 (설비는 속성에서 연결)</h3>
        <div className="p13d__symbols">
          {SYMBOLS.map((s) => (
            <button key={s} type="button" className="p13d__symbol" draggable onDragStart={start({ kind: 'symbol', symbol: s })} onClick={() => onAdd({ kind: 'symbol', symbol: s })} title={SYMBOL_NAMES[s]}>
              <svg viewBox="0 0 100 100" className="p13d__symbol-art" aria-hidden="true">
                <SymbolArt symbol={s} x={4} y={4} w={92} h={92} />
              </svg>
              <span>{SYMBOL_NAMES[s]}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="p13d__h">설비 (기준정보, 연결된 채로 놓임)</h3>
        <Input size="small" allowClear placeholder="설비 이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="설비 찾기" />
        {[...byLine.entries()].map(([lineId, list]) => (
          <div key={lineId} className="p13d__eq-group">
            <div className="caption">{lineName(lineId)}</div>
            {list.map((e) => (
              <button key={e.id} type="button" className={`p13d__eq${placed.has(e.id) ? ' p13d__eq--placed' : ''}`} draggable onDragStart={start({ kind: 'equipment', equipmentId: e.id })} onClick={() => onAdd({ kind: 'equipment', equipmentId: e.id })}>
                <span>{e.name}</span>
                <span className="caption">{placed.has(e.id) ? '배치됨' : e.type}</span>
              </button>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function XYWH({ o, onChange }: { o: HmiObject; onChange: (fn: (o: HmiObject) => HmiObject) => void }) {
  if (o.kind === 'line') return null;
  const field = (k: 'x' | 'y' | 'w' | 'h', label: string) => (
    <label className="p13d__field">
      <span className="caption">{label}</span>
      <InputNumber size="small" value={(o as unknown as Record<string, number>)[k]} min={k === 'w' || k === 'h' ? MIN : 0} onChange={(v) => v !== null && onChange((x) => ({ ...x, [k]: v }) as HmiObject)} />
    </label>
  );
  return (
    <div className="p13d__xywh">
      {field('x', 'X')}
      {field('y', 'Y')}
      {o.kind !== 'text' && field('w', '너비')}
      {o.kind !== 'text' && field('h', '높이')}
    </div>
  );
}

function Props({ o, eqs, sensors, siteId, maxSignals, onChange }: { o: HmiObject; eqs: Equipment[]; sensors: Sensor[]; siteId: string; maxSignals: number; onChange: (fn: (o: HmiObject) => HmiObject) => void }) {
  const lines = [...(company.sites.find((s) => s.id === siteId)?.lines ?? []).map((l) => ({ value: l.id, label: l.name })), { value: `${siteId}-UTL`, label: '유틸리티' }];
  if (o.kind === 'equipment') {
    const e = eqs.find((x) => x.id === o.equipmentId);
    const sigs = sensors.filter((s) => s.equipmentId === o.equipmentId);
    return (
      <div className="p13d__form">
        <div className="caption">설비 심볼 · {o.id}</div>
        <label className="p13d__field">
          <span className="caption">연결 설비</span>
          <Select
            size="small" showSearch allowClear optionFilterProp="label" value={o.equipmentId ?? undefined} placeholder="설비를 고르세요"
            options={eqs.map((x) => ({ value: x.id, label: `${x.name} · ${x.id}` }))}
            onChange={(v: string | undefined) => onChange((x) => ({ ...(x as HmiEquipmentObject), equipmentId: v ?? null, signals: [] }))}
          />
        </label>
        <label className="p13d__field">
          <span className="caption">심볼</span>
          <Select size="small" value={o.symbol} options={SYMBOLS.map((s) => ({ value: s, label: SYMBOL_NAMES[s] }))} onChange={(v: HmiSymbol) => onChange((x) => ({ ...(x as HmiEquipmentObject), symbol: v }))} />
        </label>
        <label className="p13d__field">
          <span className="caption">표시 이름 (비우면 설비 이름)</span>
          <Input size="small" value={o.label ?? ''} placeholder={e?.name} onChange={(ev) => onChange((x) => ({ ...(x as HmiEquipmentObject), label: ev.target.value || undefined }))} />
        </label>
        <div className="p13d__field">
          <span className="caption">표시할 신호 (최대 {maxSignals}개)</span>
          {sigs.length ? (
            <Checkbox.Group
              value={o.signals ?? []}
              onChange={(v) => onChange((x) => ({ ...(x as HmiEquipmentObject), signals: (v as Signal[]).slice(0, maxSignals) }))}
              options={sigs.map((s) => ({ value: s.signal, label: `${s.name} (${s.unit})`, disabled: !(o.signals ?? []).includes(s.signal) && (o.signals ?? []).length >= maxSignals }))}
            />
          ) : (
            <span className="caption">{o.equipmentId ? '이 설비는 감시 신호가 없습니다' : '설비를 먼저 연결하세요'}</span>
          )}
        </div>
        <XYWH o={o} onChange={onChange} />
      </div>
    );
  }
  if (o.kind === 'zone') {
    return (
      <div className="p13d__form">
        <div className="caption">영역 · {o.id}</div>
        <label className="p13d__field">
          <span className="caption">이름</span>
          <Input size="small" value={o.label} onChange={(ev) => onChange((x) => ({ ...x, label: ev.target.value }) as HmiObject)} />
        </label>
        <label className="p13d__field">
          <span className="caption">연결 라인 (공정: 오늘 생산, 에너지: 전력·압축공기)</span>
          <Select size="small" allowClear value={o.lineId ?? undefined} placeholder="라인을 고르세요" options={lines} onChange={(v: string | undefined) => onChange((x) => ({ ...x, lineId: v ?? null }) as HmiObject)} />
        </label>
        <XYWH o={o} onChange={onChange} />
      </div>
    );
  }
  if (o.kind === 'line') {
    return (
      <div className="p13d__form">
        <div className="caption">선 · {o.id} · 점 {o.points.length}개</div>
        <label className="p13d__field">
          <span className="caption">종류</span>
          <Select size="small" value={o.style} options={[{ value: 'conveyor', label: '컨베이어' }, { value: 'pipe', label: '배관' }]} onChange={(v: 'conveyor' | 'pipe') => onChange((x) => ({ ...x, style: v }) as HmiObject)} />
        </label>
        <p className="caption">점의 동그라미를 끌어 옮기고, 선을 끌면 통째로 옮깁니다.</p>
      </div>
    );
  }
  return (
    <div className="p13d__form">
      <div className="caption">글자 · {o.id}</div>
      <label className="p13d__field">
        <span className="caption">내용</span>
        <Input size="small" value={o.text} onChange={(ev) => onChange((x) => ({ ...x, text: ev.target.value }) as HmiObject)} />
      </label>
      <label className="p13d__field">
        <span className="caption">크기</span>
        <Select size="small" value={o.size} options={[{ value: 'title', label: '제목' }, { value: 'body', label: '본문' }]} onChange={(v: 'title' | 'body') => onChange((x) => ({ ...x, size: v }) as HmiObject)} />
      </label>
      <XYWH o={o} onChange={onChange} />
    </div>
  );
}

function ScreenProps({ doc, onName, issues, onPick, published }: { doc: HmiScreen; onName: (n: string) => void; issues: { objectId: string | null; text: string }[]; onPick: (id: string) => void; published: boolean }) {
  const counts = { equipment: 0, zone: 0, line: 0, text: 0 } as Record<HmiObject['kind'], number>;
  for (const o of doc.objects) counts[o.kind]++;
  return (
    <div className="p13d__form">
      <label className="p13d__field">
        <span className="caption">화면 이름</span>
        <Input size="small" value={doc.name} onChange={(e) => onName(e.target.value)} />
      </label>
      <dl className="facts">
        <dt>화면 ID</dt>
        <dd className="num">{doc.id}</dd>
        <dt>게시</dt>
        <dd>{published ? `v${doc.version} · ${doc.publishedAt?.replace('T', ' ') ?? ''} · ${doc.publishedBy ?? ''}` : '게시 전'}</dd>
        <dt>객체</dt>
        <dd className="num">설비 {counts.equipment} · 영역 {counts.zone} · 선 {counts.line} · 글자 {counts.text}</dd>
      </dl>
      <h3 className="p13d__h">게시 전 검사 {issues.length ? `${issues.length}건` : '· 문제 없음'}</h3>
      {issues.length > 0 && (
        <ul className="p13__issues">
          {issues.map((i, k) => (
            <li key={k}>
              {i.objectId ? <button type="button" className="p13d__link" onClick={() => onPick(i.objectId!)}>{i.text}</button> : i.text}
            </li>
          ))}
        </ul>
      )}
      <p className="caption">객체를 누르면 속성이 보입니다. 저장은 편집본만 남기고, 게시해야 설비 가동 화면에 반영됩니다.</p>
    </div>
  );
}

/** The draft as the viewer would show it now, without publishing. */
function Preview({ screen, siteId, maxSignals, onClose }: { screen: HmiScreen; siteId: string; maxSignals: number; onClose: () => void }) {
  const [view, setView] = useState<HmiView>('process');
  const { value: snap } = useAsync(() => hmiSnapshot(siteId, NOW), `${siteId}|preview`);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="p13-preview" role="dialog" aria-label={`${screen.name} 미리보기`}>
      <header className="p13-preview__head">
        <strong>{screen.name}</strong>
        <Tag bordered>미리보기 · 게시 전</Tag>
        <Segmented size="small" value={view} onChange={(v) => setView(v as HmiView)} options={[{ value: 'process', label: '공정' }, { value: 'energy', label: '에너지' }]} />
        <span className="toolbar__spacer" />
        <Button onClick={onClose}>{button('닫기')}</Button>
      </header>
      <div className="p13-preview__body">
        <Canvas screen={screen} snap={snap} view={view} maxSignals={maxSignals} />
      </div>
    </div>
  );
}
