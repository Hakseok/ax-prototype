// Text for KPI comparisons and company aggregation, shared by cards, the report preview and the PDF.
import { formatNumber } from '../components/format';
import type { KpiValue } from './executive';
import { METRICS } from './metrics/catalog';

/** "n개 사업장 합산 / 가중 평균 / 중 최저" (guide 6, 전사 값). */
export const aggregationText = (metricId: string, siteCount: number): string => {
  if (siteCount < 2) return '';
  const a = METRICS[metricId].aggregation;
  return a === 'sum' ? `${siteCount}개 사업장 합산` : a === 'min' ? `${siteCount}개 사업장 중 최저` : a === 'max' ? `${siteCount}개 사업장 중 최고` : `${siteCount}개 사업장 가중 평균`;
};

export const changeText = (k: KpiValue): string => {
  if (k.change === null) return '비교 데이터 없음';
  const v = Math.abs(k.change);
  // A change that rounds to zero is reported as no change, not as better or worse.
  if ((k.changeKind === 'points' ? v : v * 100) < 0.05) return `${k.label} 대비 변화 없음`;
  const sign = k.change > 0 ? '+' : '−';
  const body = k.changeKind === 'points' ? `${formatNumber(v, 1)}%p` : `${formatNumber(v * 100, 1)}%`;
  const word = k.improved === null ? '' : k.improved ? ' 개선' : ' 악화';
  return `${k.label} 대비 ${sign}${body}${word}`;
};
