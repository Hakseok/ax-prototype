import type { LinkDef } from './types';

/** Target params of a definition link: values are row fields, or literals prefixed with "=". */
export const linkParams = (l: LinkDef, row: Record<string, unknown> | null): Record<string, string> =>
  Object.fromEntries(
    Object.entries(l.params ?? {}).map(([k, src]) => [k, src.startsWith('=') ? src.slice(1) : String(row?.[src] ?? '')])
  );
