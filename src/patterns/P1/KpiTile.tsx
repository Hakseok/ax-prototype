import { Link } from 'react-router-dom';
import { KpiCard } from '../../components/KpiCard';
import { aggregationText, changeText } from '../../data/kpiText';
import { MoneyCard } from '../../components/MoneyCard';
import { METRICS, displayValue } from '../../data/metrics/catalog';
import type { KpiValue } from '../../data/executive';
import type { Ledger } from '../../data/roi/ledger';

export { aggregationText, changeText };

interface KpiTileProps {
  k: KpiValue;
  label?: string;
  siteCount: number;
  to?: string;
  linkLabel?: string;
}

/** One KPI: value, comparison and aggregation note; money metrics use the money card. */
export function KpiTile({ k, label, siteCount, to, linkLabel }: KpiTileProps) {
  const def = METRICS[k.metric];
  const agg = aggregationText(k.metric, siteCount);
  const foot = (
    <>
      <span className={`kpi-change${k.improved === false ? ' kpi-change--worse' : ''}`} title={`비교 기간: ${k.basis}`}>{changeText(k)}</span>
      {agg && <span> · {agg}</span>}
      {to && (
        <>
          {' · '}
          <Link to={to}>{linkLabel ?? '자세히'}</Link>
        </>
      )}
    </>
  );
  if (def.unit === '원') return <MoneyCard label={label ?? def.label} amount={k.value ?? 0} footnote={foot} />;
  return <KpiCard label={label ?? def.label} value={displayValue(k.metric, k.value)} unit={def.unit} fractionDigits={def.digits} footnote={foot} />;
}

/** The AX effect card: confirmed + estimated since go-live, potential shown apart, payback. */
export function AxEffectTile({ ledger, label, to }: { ledger: Ledger; label?: string; to?: string }) {
  const pb = ledger.payback;
  return (
    <MoneyCard
      label={label ?? 'AX 효과 (적용 후 누적)'}
      amount={ledger.totals.counted}
      classes={[
        { kind: '확정', amount: ledger.totals.confirmed },
        { kind: '추정', amount: ledger.totals.estimated }
      ]}
      excluded={[{ kind: '잠재', amount: ledger.totals.potential }]}
      footnote={pb.scope === 'site' ? '회수 시점은 전사 기준' : pb.month ? `회수 ${pb.month}${pb.projected ? ' (예상)' : ''}` : '회수 시점 예측 불가'}
      evidenceTo={to}
    />
  );
}
