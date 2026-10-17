import { describe, expect, it } from 'vitest';
import { buildCsv, formatValue } from './format';
import { totalRowOf } from './columns';
import type { ColumnDef } from './types';

const refs = { siteList: new Map([['YSU', '여수공장']]) };
const columns: ColumnDef[] = [
  { field: 'at', label: '시각', format: 'datetime' },
  { field: 'siteId', label: '사업장', ref: 'siteList' },
  { field: 'note', label: '내용' },
  { field: 'emission', label: '배출량 (tCO2eq)', format: 'number', fractionDigits: 1, total: true }
];
const rows = [
  { id: '1', at: '2026-09-30T14:00', siteId: 'YSU', note: '쉼표, 포함', emission: 1234.56 },
  { id: '2', at: '2026-09-30T14:15', siteId: 'YSU', note: '따옴표 "포함"', emission: 10 }
];

describe('CSV 내보내기', () => {
  it('BOM, 머리글, 참조 이름, 따옴표 처리, 합계 행을 담는다', () => {
    const csv = buildCsv(columns, rows, refs, totalRowOf(columns, rows));
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('시각,사업장,내용,배출량 (tCO2eq)');
    expect(lines[1]).toBe('2026-09-30 14:00,여수공장,"쉼표, 포함",1234.6');
    expect(lines[2]).toBe('2026-09-30 14:15,여수공장,"따옴표 ""포함""",10');
    expect(lines[3]).toBe('합계,,,1244.6');
  });

  it('화면 표시는 천 단위 구분과 단위 형식을 쓴다', () => {
    expect(formatValue(1234.56, { format: 'number', fractionDigits: 1 }, refs)).toBe('1,234.6');
    expect(formatValue(-0.034, { format: 'signedPercent' }, refs)).toBe('−3.4%');
    expect(formatValue(true, { format: 'boolean' }, refs)).toBe('사용');
  });
});
