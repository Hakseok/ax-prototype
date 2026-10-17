// Initial setup (SET-010): the industry template and the headline KPI set chosen from it.
// Only the auto-parts template has data (D-09); the others change the KPI set and layout and
// show "데이터 없음 · 연계 후 표시" for values. Every change is kept in the change log.
import templatesJson from '../../config/industry-templates.json';
import { createLocalStore, useLocalStore } from './localStore';
import { METRICS } from './metrics/catalog';
import { changeLogStore } from './records';
import { NOW, formatDateTime } from './time';

export type IndustryTemplate = (typeof templatesJson.templates)[number];
export const TEMPLATES = templatesJson.templates as IndustryTemplate[];
export const DATA_TEMPLATE = 'auto-parts';

export interface IndustrySetting {
  templateId: string;
  headlineKpis: string[];
  changedAt: string;
  changedBy: string;
}

const DEFAULT: IndustrySetting = {
  templateId: DATA_TEMPLATE,
  headlineKpis: TEMPLATES.find((t) => t.id === DATA_TEMPLATE)!.headlineKpis,
  changedAt: '2025-09-25T10:00',
  changedBy: 'u-admin'
};

export const industryStore = createLocalStore<IndustrySetting>('industry', DEFAULT);

export const templateOf = (id: string): IndustryTemplate => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export const saveIndustry = (templateId: string, headlineKpis: string[], userId: string) => {
  const before = industryStore.get();
  const at = formatDateTime(NOW).replace(' ', 'T');
  industryStore.set({ templateId, headlineKpis, changedAt: at, changedBy: userId });
  changeLogStore.set((prev) => [
    ...prev,
    {
      id: `CLX-IND-${prev.length}`, at, userId, dataSource: 'industry', targetId: templateId, field: '업종 템플릿·핵심 지표',
      before: `${templateOf(before.templateId).name}: ${before.headlineKpis.join(', ')}`, after: `${templateOf(templateId).name}: ${headlineKpis.join(', ')}`
    }
  ]);
};

export const resetIndustry = (userId: string) => saveIndustry(DEFAULT.templateId, DEFAULT.headlineKpis, userId);

export const useIndustry = () => {
  const s = useLocalStore(industryStore);
  const template = templateOf(s.templateId);
  return { ...s, template, hasData: s.templateId === DATA_TEMPLATE };
};

/** Label and unit of any KPI id: the metric catalog first, then the dictionary names of the templates. */
export const kpiName = (id: string): { label: string; unit: string; computable: boolean } => {
  const m = METRICS[id];
  if (m) return { label: m.label, unit: m.unit === '원' ? '백만 원' : m.unit, computable: true };
  const n = (templatesJson.kpiNames as Record<string, { label: string; unit: string }>)[id];
  return { label: n?.label ?? id, unit: n?.unit ?? '', computable: false };
};

export const costItemName = (id: string): string => (templatesJson.costItemNames as Record<string, string>)[id] ?? id;
