import { statusLabel, type StatusLevel } from '../config';
import './StatusBadge.css';

interface StatusBadgeProps {
  level: StatusLevel;
  /** Defaults to the standard label (긴급, 주의, 참고, 정상). */
  label?: string;
}

// Status is always shape + color + text. Normal stays achromatic.
export function StatusBadge({ level, label }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${level}`}>{label ?? statusLabel(level)}</span>;
}
