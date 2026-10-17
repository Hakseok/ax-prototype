// Typed access to the project configuration in /config.
import menuJson from '../../config/menu.json';
import companyJson from '../../config/company.json';
import termsJson from '../../config/terms.json';
import templatesJson from '../../config/industry-templates.json';

export type StatusLevel = 'critical' | 'warning' | 'info' | 'normal';

export const menu = menuJson;
export const company = companyJson;
export const terms = termsJson;
export const industryTemplates = templatesJson.templates;

const STATUS: Record<StatusLevel, { label: string; shape: string }> = {
  critical: { label: terms.status[0], shape: 'diamond' },
  warning: { label: terms.status[1], shape: 'triangle' },
  info: { label: terms.status[2], shape: 'ring' },
  normal: { label: terms.status[3], shape: 'dash' }
};
export const statusLabel = (level: StatusLevel): string => STATUS[level].label;
export const statusShape = (level: StatusLevel): string => STATUS[level].shape;

export const ENERGY_NAMES: Record<string, { name: string; unit: string }> = {
  electricity: { name: '전력', unit: 'kWh' },
  compressedAir: { name: '압축공기', unit: 'Nm³' },
  lng: { name: 'LNG', unit: 'Nm³' }
};
export const energySourceName = (id: string): string => ENERGY_NAMES[id]?.name ?? id;

/** Every button label allowed on screens (terms.json, D-02). */
export const allowedButtons = new Set<string>([
  ...terms.buttons.commands,
  ...terms.buttons.auxiliary.map((b) => b.label),
  ...terms.buttons.judgement.map((b) => b.label),
  ...terms.buttons.workflow.map((b) => b.label)
]);
export const button = (label: string): string => {
  if (!allowedButtons.has(label)) throw new Error(`terms.json에 없는 버튼 명칭: ${label}`);
  return label;
};
