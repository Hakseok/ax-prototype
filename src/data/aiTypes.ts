// Result shapes of the virtual AI engine (docs/ai-engine.md 2).
import type { Grade } from './types';

export type AiKind = 'anomaly' | 'health' | 'rul' | 'rootCause' | 'recommendation' | 'energyWaste' | 'answer';

export interface Evidence {
  label: string;
  value: number;
  normalRange: [number, number];
  unit: string;
  /** value − nearest edge of the normal range (0 when inside). */
  delta: number;
  /** Screen link that shows the signal, e.g. "MNT-011?id=…". */
  chartRef?: string;
}

export interface AiDecision {
  value: '채택' | '기각';
  reason: string;
  by: string;
  at: string;
}

export interface AiResult<T = unknown> {
  id: string;
  kind: AiKind;
  target: { siteId: string; lineId?: string; equipmentId?: string; productId?: string; lotIds?: string[]; label: string };
  generatedAt: string;
  model: { name: string; version: string; trainedFrom: string; trainedTo: string };
  level?: Grade;
  /** 0..1 */
  confidence: number;
  conclusion: string;
  evidence: Evidence[];
  impact?: { downtimeHours?: [number, number]; defectQty?: number; costKrw?: [number, number] };
  payload: T;
  decision?: AiDecision;
}

export const AI_KIND_LABEL: Record<AiKind, string> = {
  anomaly: '이상 탐지',
  health: '설비 건전성',
  rul: '잔여수명 예측',
  rootCause: '불량 원인 후보',
  recommendation: '권장 조건',
  energyWaste: '에너지 낭비 탐지',
  answer: '질의 응답'
};
