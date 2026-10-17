// P1 현황 대시보드형: KPI cards, then panels on a fixed grid (main-top, main-bottom, side).
// One screen at 1920×1080; one column on phones for screens marked mobile in menu.json.
import { useMemo } from 'react';
import { Segmented, Skeleton } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { useCostVersion } from '../../data/costs';
import { decisionStore } from '../../data/aiEngine';
import { kpiValue } from '../../data/executive';
import { useLocalStore } from '../../data/localStore';
import { alertChangesStore } from '../../data/alertStore';
import { claimStore, workOrderStore } from '../../data/workflows';
import { useIndustry } from '../../data/industry';
import { PERIOD_LABELS, periodOf, type PeriodKey } from '../../data/period';
import { buildLedger } from '../../data/roi/ledger';
import { formatDateTime, NOW } from '../../data/time';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import { AxEffectTile, KpiTile } from './KpiTile';
import { PANELS } from './P1Panels';
import type { P1Definition } from './types';
import '../common/patterns.css';
import './P1.css';

export function P1Dashboard({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P1Definition;
  const app = useApp();
  const link = useShellLink();
  const [params, setParams] = useSearchParams();
  const periodKey = (def.period.options.includes(params.get('period') as PeriodKey) ? params.get('period') : def.period.default) as PeriodKey;
  const period = periodOf(periodKey);
  // Anything that changes numbers on screen: unit costs, AI decisions, alert actions.
  const costVersion = useCostVersion();
  const decisions = useLocalStore(decisionStore);
  const alertChanges = useLocalStore(alertChangesStore);
  const workOrders = useLocalStore(workOrderStore);
  const claims = useLocalStore(claimStore);
  const version = useMemo(
    () => [costVersion, JSON.stringify(decisions), JSON.stringify(alertChanges), JSON.stringify(workOrders), JSON.stringify(claims)].join('|'),
    [costVersion, decisions, alertChanges, workOrders, claims]
  );
  const siteIds = app.selectedSiteIds;
  const industry = useIndustry();
  const kpiDefs = useMemo(
    () => (def.kpisFrom === 'industry' ? industry.headlineKpis.map((id) => def.kpis.find((k) => k.metric === id) ?? { metric: id, scope: id === 'ax.effect' ? ('sinceGoLive' as const) : undefined }) : def.kpis),
    [def, industry.headlineKpis]
  );

  const { value: kpis } = useAsync(
    () =>
      Promise.all(
        kpiDefs.map(async (k) => (k.scope === 'sinceGoLive' ? { k, ledger: await buildLedger(siteIds) } : { k, value: await kpiValue(k.metric, siteIds, period) }))
      ),
    `${siteIds}|${periodKey}|${version}|${kpiDefs.map((k) => k.metric)}`
  );

  const setPeriod = (v: PeriodKey) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('period', v);
      return next;
    });

  const byArea = (area: string) => def.panels.filter((p) => p.area === area);
  const renderPanel = (p: P1Definition['panels'][number]) => {
    const Body = PANELS[p.type];
    return (
      <Panel
        key={p.id}
        title={p.title}
        caption={['siteTable', 'lineTable', 'lossByLine'].includes(p.type) ? period.label : undefined}
        extra={p.link && <Link to={link(p.link.to, p.link.params)}>{p.link.label}</Link>}
        className={`p1__panel p1__panel--${p.type}`}
        style={p.grow ? { flexGrow: p.grow } : undefined}
      >
        <div className="p1__panel-body">
          <Body panel={p} siteIds={siteIds} period={period} version={version} />
        </div>
      </Panel>
    );
  };

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      period={
        <>
          <span className="caption num p1__asof">{formatDateTime(NOW)} 기준</span>
          <Segmented value={periodKey} onChange={(v) => setPeriod(v as PeriodKey)} options={def.period.options.map((o) => ({ value: o, label: PERIOD_LABELS[o] }))} />
        </>
      }
      bodyMode="fit"
    >
      <div className={`p1${entry.mobile ? ' p1--mobile' : ''}`}>
        <div className="p1__kpis" style={{ ['--p1-kpi-count' as string]: kpiDefs.length }}>
          {!kpis
            ? kpiDefs.map((k) => <Skeleton key={k.metric} active paragraph={{ rows: 1 }} />)
            : kpis.map(({ k, value, ledger }) =>
                ledger ? (
                  <AxEffectTile key={k.metric} ledger={ledger} label={k.label} to={k.link ? link(k.link.to) : undefined} />
                ) : (
                  <KpiTile key={k.metric} k={value!} label={k.label} siteCount={siteIds.length} to={k.link ? link(k.link.to, { period: periodKey }) : undefined} linkLabel={k.link?.label} />
                )
              )}
        </div>
        <div className="p1__grid">
          <div className="p1__main">
            {byArea('main-top').map(renderPanel)}
            {byArea('main-bottom').map(renderPanel)}
          </div>
          <div className="p1__side">{byArea('side').map(renderPanel)}</div>
        </div>
      </div>
    </ScreenLayout>
  );
}
