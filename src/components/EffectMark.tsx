import { effectClassKey, type EffectClass } from './money';
import './EffectMark.css';

// 확정·추정·잠재 are told apart by fill, hatch and outline plus the word — never by color alone (guide 9).
export function EffectMark({ kind, label = true }: { kind: EffectClass; label?: boolean }) {
  return (
    <span className="effect-mark">
      <span className={`effect-swatch effect-swatch--${effectClassKey[kind]}`} aria-hidden="true" />
      {label && <span>{kind}</span>}
    </span>
  );
}
