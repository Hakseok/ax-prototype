import type { PeriodKey } from '../../data/period';
import type { LinkDef } from '../common/types';

export interface P1Kpi {
  metric: string;
  /** Overrides the metric label. */
  label?: string;
  /** sinceGoLive: cumulative since AX go-live instead of the selected period (AX effect). */
  scope?: 'period' | 'sinceGoLive';
  link?: LinkDef;
}

export type P1PanelType =
  | 'siteTable' | 'monthlyTrend' | 'risks'
  | 'lineTable' | 'lossByLine' | 'healthTable' | 'openOrders' | 'healthAlerts' | 'collection' | 'energyWaste' | 'dailyEnergy';

export interface P1Panel {
  id: string;
  type: P1PanelType;
  title: string;
  /** Grid area of the dashboard layout: main-top, main-bottom, side. */
  area: 'main-top' | 'main-bottom' | 'side';
  metrics?: string[];
  metric?: string;
  link?: LinkDef;
  /** siteTable: screen a row opens (default OPS-010). */
  rowTo?: string;
  /** Relative height in its column (default 1). */
  grow?: number;
}

export interface P1Definition {
  id: string;
  title: string;
  permission: { view: string };
  badges?: string[];
  period: { options: PeriodKey[]; default: PeriodKey };
  kpis: P1Kpi[];
  /** industry: the cards follow the headline KPIs chosen on SET-010; `kpis` gives links and the default set. */
  kpisFrom?: 'industry';
  panels: P1Panel[];
}
