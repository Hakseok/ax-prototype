import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { terms } from '../config';
import { EffectMark } from './EffectMark';
import { MONEY_UNITS, formatMoney, type EffectClass, type MoneyUnit } from './money';
import './KpiCard.css';
import './MoneyCard.css';

interface MoneyCardProps {
  label: string;
  /** Won. */
  amount: number;
  unit?: MoneyUnit;
  /** Which effect classes the amount adds up (e.g. 확정 + 추정). */
  classes?: { kind: EffectClass; amount: number }[];
  /** Effect classes shown next to the total but not added (잠재). */
  excluded?: { kind: EffectClass; amount: number }[];
  footnote?: ReactNode;
  /** Link to the evidence (P9). */
  evidenceTo?: string;
}

// A KPI card for money: one unit, the classes it adds, a 시연용 mark and a way to the evidence.
export function MoneyCard({ label, amount, unit = 'million', classes, excluded, footnote, evidenceTo }: MoneyCardProps) {
  return (
    <section className="kpi-card money-card">
      <div className="kpi-card__head">
        <span className="kpi-card__label">{label}</span>
        <span className="money-card__demo">{terms.badges.demoOnly}</span>
      </div>
      <div className="kpi-card__value">
        <span className="num">{formatMoney(amount, unit)}</span> <span className="kpi-card__unit">{MONEY_UNITS[unit].label}</span>
      </div>
      {classes && (
        <div className="money-card__classes caption">
          {classes.map((c, i) => (
            <span key={c.kind} className="money-card__class">
              {i > 0 && <span aria-hidden="true">+</span>}
              <EffectMark kind={c.kind} /> <span className="num">{formatMoney(c.amount, unit)}</span>
            </span>
          ))}
          {excluded?.map((c) => (
            <span key={c.kind} className="money-card__class money-card__class--excluded">
              <EffectMark kind={c.kind} /> <span className="num">{formatMoney(c.amount, unit)}</span> 별도
            </span>
          ))}
        </div>
      )}
      {(footnote || evidenceTo) && (
        <div className="caption money-card__foot">
          <span>{footnote}</span>
          {evidenceTo && (
            <Link to={evidenceTo} className="money-card__link">
              근거 보기
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
