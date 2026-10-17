// Dataset registry: the one place where a screen definition's "dataSource" name is
// turned into rows. Templates stay generic; this file knows the data.
// Step 2 holds the master datasets; steps 3–4 add production, quality, maintenance and AI datasets.
import { industryTemplates, menu as menuConfig } from '../config';
import { mergeAlerts, alertChangesStore } from './alertStore';
import {
  loadAlerts, loadCollectors, loadCustomers, loadEquipment, loadFile, loadLines, loadMolds, loadProducts, loadSensors, loadSites, loadUsers
} from './loaders';
import { aiHistory, decisionStore, energyWaste, healthOverview, recommend, rootCause } from './aiEngine';
import { AI_KIND_LABEL, type AiResult } from './aiTypes';
import { BASELINE_ITEM, baselineBaseVersion, baselinePeriod } from './baseline';
import { recentWindow } from './period';
import { causeTarget } from './qualityAnalysis';
import { loadCostItems, type CostItem } from './costs';
import { LOSS_LABELS } from './metrics/oee';
import { valueAt, versionStore } from './versions';
import { getDowntime, getShifts, lineMap } from './production';
import { applyOverlay, overlayStore, type Row } from './records';
import { DAY, NOW, PRODUCTION_FROM, parseTime } from './time';
import type { User } from './types';
import { allClaims, claimStore } from './workflows';

export interface DatasetContext {
  siteIds: string[];
  /** Applied filter values by field. Periods are [from, to) in ms. */
  params: Record<string, unknown>;
  user: User;
}

export interface Dataset {
  load(ctx: DatasetContext): Promise<Row[]>;
  /** Filter fields the dataset applies itself (the template skips them). */
  handles?: string[];
  /** Overlay stores that change the rows; templates reload when they change. */
  stores?: { subscribe(l: () => void): () => void }[];
  /** Rows can be edited on P8 screens (saved as an overlay). */
  editable?: boolean;
  /** Complete a record before it is saved. */
  prepare?(values: Row): Promise<Row>;
}

export const bySite = (ctx: DatasetContext) => (r: object): boolean => {
  const siteId = (r as { siteId?: unknown }).siteId;
  return siteId === undefined || siteId === null || siteId === 'ALL' || ctx.siteIds.includes(String(siteId));
};
export const asRows = <T extends object>(items: T[], id: (x: T, i: number) => string = (x) => String((x as { id: unknown }).id)): Row[] =>
  items.map((x, i) => ({ ...x, id: id(x, i) }) as Row);
export const periodOf = (ctx: DatasetContext, field: string): [number, number] | null => {
  const v = ctx.params[field];
  // Screen actions are stamped exactly at "now", so the clipped end still includes that minute.
  return Array.isArray(v) && v.length === 2 ? [Number(v[0]), Math.min(Number(v[1]), NOW + 60_000)] : null;
};
export const inPeriod = (rows: Row[], ctx: DatasetContext, field: string): Row[] => {
  const p = periodOf(ctx, field);
  return p ? rows.filter((r) => parseTime(String(r[field])) >= p[0] && parseTime(String(r[field])) < p[1]) : rows;
};
export const byDesc = (field: string) => (a: Row, b: Row) => (String(a[field]) < String(b[field]) ? 1 : String(a[field]) > String(b[field]) ? -1 : 0);

/** Plain master file, scoped to the selected sites and editable through an overlay. */
const master = (name: string, path: string, opts: { scoped?: boolean; map?: (rows: Row[]) => Row[] | Promise<Row[]> } = {}): Dataset => ({
  editable: true,
  stores: [overlayStore(name)],
  async load(ctx) {
    let rows = asRows(await loadFile<object[]>(path));
    if (opts.map) rows = await opts.map(rows);
    rows = applyOverlay(name, rows);
    return opts.scoped === false ? rows : rows.filter(bySite(ctx));
  }
});

/** Unit cost items plus the AX baseline length as one versioned list (SET-020). */
const costAndBaselineItems = async (): Promise<CostItem[]> => {
  const items = await loadCostItems();
  const added = versionStore.get().unitCost?.[BASELINE_ITEM] ?? [];
  const versions = [baselineBaseVersion, ...added];
  return [
    { id: BASELINE_ITEM, name: 'AX 기준선 기간 (적용 전 개월 수)', unit: '개월', group: 'AX 기준선', value: baselinePeriod().months, versions },
    ...items
  ];
};

// ---- datasets ----
export const datasets: Record<string, Dataset> = {
  sites: master('sites', 'master/sites.json'),
  lines: master('lines', 'master/lines.json'),
  equipment: master('equipment', 'master/equipment.json'),
  products: master('products', 'master/products.json'),
  molds: master('molds', 'master/molds.json'),
  customers: master('customers', 'master/customers.json', { scoped: false }),
  users: master('users', 'master/users.json', {
    scoped: false,
    map: (rows) => rows.map((r) => ({ ...r, sitesText: (r.sites as string[]).join(', ') }))
  }),
  alerts: {
    handles: ['occurredAt'],
    stores: [alertChangesStore],
    async load(ctx) {
      return inPeriod(asRows(mergeAlerts(await loadAlerts())), ctx, 'occurredAt').filter(bySite(ctx)).sort(byDesc('occurredAt'));
    }
  },
  /** Customer claims (QUA-030). */
  claims: {
    handles: ['receivedAt'],
    stores: [claimStore],
    async load(ctx) {
      return inPeriod(asRows(await allClaims()), ctx, 'receivedAt').filter(bySite(ctx)).sort(byDesc('receivedAt'));
    }
  },
  /** AI results and their decisions (AIX-020): past results (file) plus the results computed now. */
  aiResults: {
    handles: ['generatedAt'],
    stores: [decisionStore],
    async load(ctx) {
      const [past, eqs, products] = await Promise.all([aiHistory(), loadEquipment(), loadProducts()]);
      const label = (r: { equipmentId: string | null; productId: string | null }) =>
        r.equipmentId ? `${r.equipmentId} ${eqs.find((e) => e.id === r.equipmentId)?.name ?? ''}`.trim() : r.productId ? products.find((p) => p.id === r.productId)?.name ?? r.productId : '';
      const rows: Row[] = past.map((r) => ({
        id: r.id, generatedAt: r.generatedAt, kind: r.kind, siteId: r.siteId, targetLabel: label(r), conclusion: r.conclusion, confidence: Math.round(r.confidence * 100),
        decision: r.decision
      }) as unknown as Row);
      // Results the engine computes at "now" for the selected sites.
      const now: AiResult[] = [];
      now.push(...(await healthOverview(ctx.siteIds)).filter((h) => h.level));
      for (const s of ctx.siteIds) {
        const w = await energyWaste(s);
        if (w) now.push(w);
        const t = await causeTarget([s], recentWindow(14).from, recentWindow(14).to);
        if (t) {
          const q = { siteIds: [t.siteId], productId: t.productId, lineId: t.lineId, ...recentWindow(14) };
          const [rc, rec] = await Promise.all([rootCause(q), recommend(q)]);
          if (rc) now.push(rc);
          if (rec) now.push(rec);
        }
      }
      for (const r of now) {
        rows.push({ id: r.id, generatedAt: r.generatedAt, kind: r.kind, siteId: r.target.siteId, targetLabel: r.target.label, conclusion: r.conclusion, confidence: Math.round(r.confidence * 100), decision: r.decision ?? null } as unknown as Row);
      }
      return inPeriod(rows, ctx, 'generatedAt')
        .filter(bySite(ctx))
        .map((r) => {
          const d = r.decision as { value: string; reason: string; by: string; at: string } | null;
          return { ...r, kindLabel: AI_KIND_LABEL[r.kind as keyof typeof AI_KIND_LABEL] ?? String(r.kind), decisionLabel: d?.value ?? '판정 전', reason: d?.reason ?? '', decidedBy: d?.by ?? '', decidedAt: d?.at ?? '' };
        })
        .sort(byDesc('generatedAt'));
    }
  },
  /** Industry templates for the initial setup (SET-010). */
  industryTemplates: {
    async load() {
      return asRows(industryTemplates);
    }
  },
  /** Virtual unit costs and the AX baseline length (SET-020); saving adds a dated version. */
  unitCosts: {
    stores: [versionStore],
    async load() {
      return (await costAndBaselineItems()).map((i) => {
        const latest = [...i.versions].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
        return { id: i.id, name: i.name, unit: i.unit, group: i.group, value: i.value, validFrom: latest.validFrom, versions: i.versions.length, note: '' } as Row;
      });
    }
  },
  /** Version history of the items above (current one marked). */
  unitCostVersions: {
    stores: [versionStore],
    async load() {
      return (await costAndBaselineItems()).flatMap((i) => {
        const current = valueAt(i.versions, NOW);
        const live = [...i.versions].filter((v) => parseTime(v.validFrom) <= NOW).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
        return i.versions.map((v, n) => ({
          id: `${i.id}#${n}`, itemId: i.id, ...v, state: v === live ? '적용 중' : parseTime(v.validFrom) > NOW ? '예정' : '지난 값', current
        }) as Row);
      }).sort(byDesc('changedAt'));
    }
  },
  /** Stop events (OPS-050) with duration and the line-minutes they cost (parallel lines: 1/machines). */
  downtime: {
    handles: ['start'],
    async load(ctx) {
      const p = periodOf(ctx, 'start') ?? [PRODUCTION_FROM, NOW];
      const [events, lines, eqs] = await Promise.all([getDowntime({ siteIds: ctx.siteIds, from: p[0], to: p[1] }), lineMap(), loadEquipment()]);
      const eqName = new Map(eqs.map((e) => [e.id, e.name]));
      return events
        .map((e) => {
          const line = lines.get(e.lineId)!;
          const durationMin = (parseTime(e.end) - parseTime(e.start)) / 60_000;
          return {
            ...e, categoryLabel: LOSS_LABELS[e.category], durationMin, lineMin: line.parallel ? durationMin / line.machines : durationMin,
            equipmentName: `${e.equipmentId} ${eqName.get(e.equipmentId) ?? ''}`.trim()
          } as Row;
        })
        .sort(byDesc('start'));
    }
  }
};

// ---- references: id -> label maps and select options ----
export type RefOption = { value: string; label: string };

const withSite = (ctx: DatasetContext, label: string, siteId: string) => (ctx.siteIds.length > 1 ? `${label} (${siteId})` : label);

export const refs: Record<string, (ctx: DatasetContext) => Promise<RefOption[]>> = {
  sites: async (ctx) => (await loadSites()).filter((s) => ctx.siteIds.includes(s.id)).map((s) => ({ value: s.id, label: s.name })),
  siteList: async () => (await loadSites()).map((s) => ({ value: s.id, label: s.name })),
  /** Sites the user may choose, plus company when there are two or more. */
  mySites: async (ctx) => {
    const sites = (await loadSites()).filter((s) => ctx.user.sites.includes(s.id)).map((s) => ({ value: s.id, label: s.name }));
    return sites.length > 1 ? [{ value: 'ALL', label: '전사' }, ...sites] : sites;
  },
  lines: async (ctx) => (await loadLines()).filter((l) => ctx.siteIds.includes(l.siteId)).map((l) => ({ value: l.id, label: withSite(ctx, l.name, l.siteId) })),
  equipment: async (ctx) => (await loadEquipment()).filter((e) => ctx.siteIds.includes(e.siteId)).map((e) => ({ value: e.id, label: `${e.id} ${e.name}` })),
  sensors: async () => (await loadSensors()).map((s) => ({ value: s.id, label: s.name })),
  products: async (ctx) => (await loadProducts()).filter((p) => ctx.siteIds.includes(p.siteId)).map((p) => ({ value: p.id, label: `${p.id} ${p.name}` })),
  molds: async (ctx) => (await loadMolds()).filter((m) => ctx.siteIds.includes(m.siteId)).map((m) => ({ value: m.id, label: m.name })),
  customers: async () => (await loadCustomers()).map((c) => ({ value: c.id, label: c.name })),
  collectors: async (ctx) => (await loadCollectors()).filter((c) => ctx.siteIds.includes(c.siteId)).map((c) => ({ value: c.id, label: c.name })),
  users: async () => (await loadUsers()).map((u) => ({ value: u.id, label: u.name })),
  permissions: async () => ['조회', '편집', '관리'].map((r) => ({ value: r, label: r })),
  /** Defect types recorded in the last 90 days of the selected sites. */
  defectTypes: async (ctx) => {
    const recs = await getShifts({ siteIds: ctx.siteIds, from: NOW - 90 * DAY, to: NOW });
    const names = new Set<string>();
    for (const r of recs) for (const k of Object.keys(r.defects)) names.add(k);
    return [...names].sort().map((n) => ({ value: n, label: n }));
  },
  costGroups: async () => ['AX 기준선', '에너지', '인건비', '품질', '라인 손실', '제품 원가'].map((g) => ({ value: g, label: g })),
  lossCategories: async () => [['breakdown', LOSS_LABELS.breakdown], ['changeover', LOSS_LABELS.changeover]].map(([value, label]) => ({ value, label })),
  grades: async () => [['critical', '긴급'], ['warning', '주의'], ['info', '참고']].map(([value, label]) => ({ value, label })),
  menuGroups: async () => menuConfig.groups.map((g) => ({ value: g.code, label: g.name }))
};
