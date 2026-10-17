import { formatNumber } from '../../components/KpiCard';
import type { ColumnDef } from './types';

export type RefMaps = Record<string, Map<string, string>>;

const toDateTime = (v: string) => v.replace('T', ' ').slice(0, 16);

/** Display text of a cell, shared by grids, detail panels and CSV. */
export const formatValue = (value: unknown, col: Pick<ColumnDef, 'format' | 'fractionDigits' | 'ref'>, refs: RefMaps, forCsv = false): string => {
  if (value === null || value === undefined || value === '') return '';
  const lookup = (v: unknown) => (col.ref ? refs[col.ref]?.get(String(v)) ?? String(v) : String(v));
  switch (col.format) {
    case 'number':
      return forCsv ? String(Math.round(Number(value) * 10 ** (col.fractionDigits ?? 0)) / 10 ** (col.fractionDigits ?? 0)) : formatNumber(Number(value), col.fractionDigits ?? 0);
    case 'percent':
      return `${formatNumber(Number(value) * 100, col.fractionDigits ?? 1)}%`;
    case 'signedPercent': {
      const v = Number(value);
      return `${v >= 0 ? '+' : '−'}${formatNumber(Math.abs(v) * 100, col.fractionDigits ?? 1)}%`;
    }
    case 'datetime':
      return toDateTime(String(value));
    case 'date':
      return String(value).slice(0, 10);
    case 'month':
      return String(value).slice(0, 7);
    case 'boolean':
      return value ? '사용' : '미사용';
    case 'list':
      return (Array.isArray(value) ? value : [value]).map(lookup).join(', ');
    default:
      return Array.isArray(value) ? value.map(lookup).join(', ') : lookup(value);
  }
};

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV text with a UTF-8 BOM so spreadsheet programs read Korean text correctly (Excel export is not allowed). */
export const buildCsv = (columns: ColumnDef[], rows: Record<string, unknown>[], refs: RefMaps, totalRow?: Record<string, unknown>): string => {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const r of [...rows, ...(totalRow ? [totalRow] : [])]) {
    lines.push(columns.map((c) => csvCell(formatValue(r[c.field], c, refs, true))).join(','));
  }
  return '﻿' + lines.join('\r\n');
};

export const downloadCsv = (fileName: string, columns: ColumnDef[], rows: Record<string, unknown>[], refs: RefMaps, totalRow?: Record<string, unknown>) => {
  const blob = new Blob([buildCsv(columns, rows, refs, totalRow)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};
