import type { ReactNode } from 'react';
import type { StatusLevel } from '../config';
import { terms } from '../config';
import { StatusBadge } from './StatusBadge';
import './KpiCard.css';

interface KpiCardProps {
  label: string;
  /** null means the value was not received; it is never shown as 0. */
  value: number | null;
  unit: string;
  fractionDigits?: number;
  /** Shown only for non-normal states, so normal cards stay quiet. */
  status?: StatusLevel;
  statusLabel?: string;
  footnote?: ReactNode;
  /** Ratio bar, e.g. demand against contract power. tick marks the caution limit. */
  meter?: { ratio: number; tick?: number; label: string };
  /** Text for a null value; default is 미수신 (collection stopped). */
  emptyLabel?: string;
}

import { formatNumber } from './format';

export { formatNumber };

const toPercent = (ratio: number): string => `${Math.max(0, Math.min(1, ratio)) * 100}%`;

export function KpiCard({ label, value, unit, fractionDigits = 0, status, statusLabel, footnote, meter, emptyLabel }: KpiCardProps) {
  return (
    <section className="kpi-card">
      <div className="kpi-card__head">
        <span className="kpi-card__label">{label}</span>
        {status && status !== 'normal' && <StatusBadge level={status} label={statusLabel} />}
      </div>
      <div className="kpi-card__value">
        {value === null ? (
          <span className="no-data">{emptyLabel ?? terms.noData}</span>
        ) : (
          <>
            <span className="num">{formatNumber(value, fractionDigits)}</span> <span className="kpi-card__unit">{unit}</span>
          </>
        )}
      </div>
      {meter && (
        <div className="kpi-card__meter" role="img" aria-label={meter.label}>
          <div
            className={`kpi-card__meter-fill kpi-card__meter-fill--${status ?? 'normal'}`}
            style={{ width: toPercent(meter.ratio) }}
          />
          {meter.tick !== undefined && <div className="kpi-card__meter-tick" style={{ left: toPercent(meter.tick) }} />}
        </div>
      )}
      {footnote && <div className="caption">{footnote}</div>}
    </section>
  );
}
