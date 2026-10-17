import { createElement } from 'react';
import type { GridColumn } from '../../components/DataGrid';
import { StatusBadge } from '../../components/StatusBadge';
import type { StatusLevel } from '../../config';
import { formatValue, type RefMaps } from './format';
import type { ColumnDef } from './types';

/** Columns visible for the current site selection (showWhen). */
export const visibleColumns = (cols: ColumnDef[], isCompany: boolean): ColumnDef[] =>
  cols.filter((c) => !c.showWhen || (c.showWhen === 'company') === isCompany);

/** Definition columns -> grid columns, with reference labels and formats. */
export const toGridColumns = (cols: ColumnDef[], refs: RefMaps): GridColumn[] => {
  // A pinned column does not stretch, so make sure one unpinned column takes the remaining width.
  const stretch = cols.some((c) => !c.pinned && c.flex) ? null : [...cols].reverse().find((c) => !c.pinned)?.field;
  return cols.map((col) => {
    const c = col.field === stretch ? { ...col, flex: 1, width: undefined } : col;
    const numeric = c.format === 'number' || c.format === 'percent' || c.format === 'signedPercent';
    return {
      field: c.field,
      label: c.label,
      width: c.width,
      flex: c.flex,
      pinned: c.pinned,
      align: c.align ?? (numeric ? 'right' : undefined),
      sort: c.sort,
      wrap: c.wrap,
      // shareBar is drawn by the P1 template; a status badge with its own label uses the renderer below.
      render: c.render === 'status' && !c.labelField ? 'status' : undefined,
      format: numeric ? (c.format as GridColumn['format']) : undefined,
      fractionDigits: c.fractionDigits,
      formatter: !numeric && !c.render ? (v) => formatValue(v, c, refs) : undefined,
      renderer:
        c.render === 'status' && c.labelField
          ? (v, row) => (v ? createElement(StatusBadge, { level: v as StatusLevel, label: String(row[c.labelField!] ?? '') }) : null)
          : undefined
    };
  });
};

/** Total row: label in the first column, sums for columns marked total. */
export const totalRowOf = (cols: ColumnDef[], rows: Record<string, unknown>[]): Record<string, unknown> | undefined => {
  const summed = cols.filter((c) => c.total);
  if (!summed.length) return undefined;
  const row: Record<string, unknown> = { id: '__total__', [cols[0].field]: '합계' };
  for (const c of summed) row[c.field] = rows.reduce((a, r) => a + (Number(r[c.field]) || 0), 0);
  return row;
};
