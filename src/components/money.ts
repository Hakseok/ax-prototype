// Money display (guide 9). Amounts are computed in won and shown in one unit per area.
export type MoneyUnit = 'won' | 'thousand' | 'million' | 'hundredMillion';

export const MONEY_UNITS: Record<MoneyUnit, { divisor: number; label: string; digits: number }> = {
  won: { divisor: 1, label: '원', digits: 0 },
  thousand: { divisor: 1_000, label: '천 원', digits: 0 },
  million: { divisor: 1_000_000, label: '백만 원', digits: 1 },
  hundredMillion: { divisor: 100_000_000, label: '억 원', digits: 1 }
};

export const formatMoney = (krw: number, unit: MoneyUnit = 'million'): string => {
  const u = MONEY_UNITS[unit];
  return (krw / u.divisor).toLocaleString('ko-KR', { minimumFractionDigits: u.digits, maximumFractionDigits: u.digits });
};

export type EffectClass = '확정' | '추정' | '잠재';
export const EFFECT_CLASSES: EffectClass[] = ['확정', '추정', '잠재'];
export const effectClassKey: Record<EffectClass, 'confirmed' | 'estimated' | 'potential'> = { 확정: 'confirmed', 추정: 'estimated', 잠재: 'potential' };
