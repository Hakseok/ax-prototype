import { useState } from 'react';
import { Button, Input, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { terms } from '../config';
import { AI_KIND_LABEL, type AiResult } from '../data/aiTypes';
import { formatDateTime, parseTime } from '../data/time';
import { formatNumber } from './KpiCard';
import { formatMoney } from './money';
import { StatusBadge } from './StatusBadge';
import './AiResultCard.css';

export const confidenceLabel = (c: number): string => terms.confidence.find((x) => c >= x.min)!.label;

interface AiResultCardProps {
  result: AiResult;
  /** Present when the user may judge; called with 채택 or 기각 and the reason. */
  onDecide?: (value: '채택' | '기각', reason: string) => void;
  /** Resolves a user id to a name for the decision line. */
  userName?: (id: string) => string;
  compact?: boolean;
}

const range = (r: [number, number], unit: string) => `${formatNumber(r[0], 1)}~${formatNumber(r[1], 1)} ${unit}`;

// One component for every AI result (guide 10): kind, target, conclusion, confidence,
// top evidence, impact, decision and model. Confidence never uses status colors.
export function AiResultCard({ result, onDecide, userName = (id) => id, compact = false }: AiResultCardProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [accept, reject] = terms.buttons.judgement.map((b) => b.label) as ['채택', '기각'];
  const pct = Math.round(result.confidence * 100);
  const d = result.decision;

  return (
    <article className={`ai-card${compact ? ' ai-card--compact' : ''}${d?.value === '기각' ? ' ai-card--rejected' : ''}`} aria-label={`${AI_KIND_LABEL[result.kind]} 결과`}>
      <header className="ai-card__head">
        <span className="ai-card__kind">{AI_KIND_LABEL[result.kind]}</span>
        {result.level && <StatusBadge level={result.level} />}
        <span className="caption ai-card__target">{result.target.label}</span>
        <span className="ai-card__spacer" />
        <Tag bordered className="ai-card__engine">{terms.badges.virtualEngine}</Tag>
        <span className="caption num">{formatDateTime(parseTime(result.generatedAt))}</span>
      </header>
      <p className="ai-card__conclusion">{result.conclusion}</p>
      <div className="ai-card__confidence">
        <span className="caption">신뢰도</span>
        <span className="ai-card__meter" role="img" aria-label={`신뢰도 ${pct}%`}>
          <span className="ai-card__meter-fill" style={{ width: `${pct}%` }} />
        </span>
        <strong>{confidenceLabel(result.confidence)}</strong> <span className="num caption">{pct} %</span>
      </div>
      {!compact && result.evidence.length > 0 && (
        <table className="ai-card__evidence">
          <thead>
            <tr>
              <th>근거</th>
              <th className="num-col">현재</th>
              <th className="num-col">정상 범위</th>
              <th className="num-col">차이</th>
            </tr>
          </thead>
          <tbody>
            {result.evidence.slice(0, 3).map((e) => (
              <tr key={e.label}>
                <td>{e.chartRef ? <Link to={e.chartRef}>{e.label}</Link> : e.label}</td>
                <td className="num num-col">
                  {formatNumber(e.value, 1)} {e.unit}
                </td>
                <td className="num num-col">{range(e.normalRange, e.unit)}</td>
                <td className="num num-col">
                  {e.delta > 0 ? '+' : ''}
                  {formatNumber(e.delta, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result.impact && (
        <div className="caption ai-card__impact">
          예상 영향
          {result.impact.downtimeHours && ` · 정지 ${formatNumber(result.impact.downtimeHours[0], 0)}~${formatNumber(result.impact.downtimeHours[1], 0)} 시간`}
          {result.impact.defectQty !== undefined && ` · 불량 ${formatNumber(result.impact.defectQty, 0)} 개`}
          {result.impact.costKrw && ` · ${formatMoney(result.impact.costKrw[0])}~${formatMoney(result.impact.costKrw[1])} 백만 원 (${terms.badges.demoOnly})`}
        </div>
      )}
      <footer className="ai-card__foot">
        <span className="caption">
          {result.model.name} {result.model.version}
          {result.model.trainedFrom !== '-' && ` · 학습 ${result.model.trainedFrom}~${result.model.trainedTo}`}
        </span>
        <span className="ai-card__spacer" />
        {d ? (
          <span className="caption">
            <strong>{d.value}</strong>
            {d.reason && ` · ${d.reason}`} · {userName(d.by)} <span className="num">{formatDateTime(parseTime(d.at))}</span>
          </span>
        ) : (
          onDecide &&
          (rejecting ? (
            <span className="ai-card__reject">
              <Input size="small" placeholder="기각 사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="기각 사유" />
              <Button size="small" onClick={() => setRejecting(false)}>
                취소
              </Button>
              <Button size="small" disabled={!reason.trim()} onClick={() => onDecide(reject, reason.trim())}>
                {reject}
              </Button>
            </span>
          ) : (
            <>
              <Button size="small" onClick={() => setRejecting(true)}>
                {reject}
              </Button>
              <Button size="small" onClick={() => onDecide(accept, '')}>
                {accept}
              </Button>
            </>
          ))
        )}
      </footer>
    </article>
  );
}
