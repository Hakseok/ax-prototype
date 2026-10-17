// Screen definitions from config/screens/*.json, keyed by screen id.
const modules = import.meta.glob('../../config/screens/*.json', { eager: true, import: 'default' });

export interface ScreenDefinitionBase {
  id: string;
  pattern: string;
  title: string;
  permission: { view: '조회' | '편집' | '관리'; edit?: '조회' | '편집' | '관리' };
  [key: string]: unknown;
}

export const screenDefs = new Map<string, ScreenDefinitionBase>(
  Object.values(modules).map((d) => {
    const def = d as ScreenDefinitionBase;
    return [def.id, def];
  })
);
