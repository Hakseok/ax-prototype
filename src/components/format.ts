// Number formatting without React, usable from data and report code.
export const formatNumber = (value: number, fractionDigits = 0): string =>
  value.toLocaleString('ko-KR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
