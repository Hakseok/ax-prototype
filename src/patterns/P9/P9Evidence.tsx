// P9 근거 추적형: summary cards, the list of effect items by class, and the evidence of the
// selected item (formula, inputs, assumptions, overlap, monthly amounts, source screen).
import { useMemo } from 'react';
import { Empty, Skeleton } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { Chart } from '../../components/Chart';
import { EffectMark } from '../../components/EffectMark';
import { formatNumber } from '../../components/KpiCard';
import { MoneyCard } from '../../components/MoneyCard';
import { formatMoney, type EffectClass } from '../../components/money';
import { Panel } from '../../components/Panel';
import { terms } from '../../config';
import { decisionStore } from '../../data/aiEngine';
import { useCostVersion } from '../../data/costs';
import { useLocalStore } from '../../data/localStore';
import { claimStore, workOrderStore } from '../../data/workflows';
import { METRICS, displayValue, metric } from '../../data/metrics/catalog';
import { buildLedger, type EffectItem, type Ledger } from '../../data/roi/ledger';
import { DAY, GO_LIVE, NOW, formatDate } from '../../data/time';
import { baselinePeriod } from '../../data/baseline';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import '../common/patterns.css';
import './P9.css';

interface P9Definition {
  badges?: string[];
  ledger: { compareMetrics: string[] };
}

const OVERVIEW = 'overview';
const GROUPS: { kind: EffectItem['kind']; title: string; note: string }[] = [
  { kind: '확정', title: '확정', note: '측정된 변화 × 확정 단가' },
  { kind: '추정', title: '추정', note: '가정이 들어간 효과' },
  { kind: '잠재', title: '잠재 (합계 제외)', note: 'AI 제안, 채택·실행 전' },
  { kind: '근거', title: '근거 (합계 제외)', note: '다른 항목에 이미 포함' },
  { kind: '제외', title: '제외', note: 'AX와 무관한 변화' }
];

const won = (v: number) => `${formatMoney(v)} 백만 원`;

export function P9Evidence({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P9Definition;
  const app = useApp();
  const [params, setParams] = useSearchParams();
  const selected = params.get('item') ?? OVERVIEW;
  const costVersion = useCostVersion();
  const decisions = useLocalStore(decisionStore);
  const siteIds = app.selectedSiteIds;
  const workOrders = useLocalStore(workOrderStore);
  const claims = useLocalStore(claimStore);
  const { value: ledger, loading } = useAsync(() => buildLedger(siteIds), `${siteIds}|${costVersion}|${JSON.stringify(decisions)}|${JSON.stringify(workOrders)}|${JSON.stringify(claims)}`);

  const select = (id: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('item', id);
      return next;
    });

  return (
    <ScreenLayout entry={entry} badges={[...badges, ...(def.badges ?? [])]} bodyMode="fit">
      {!ledger ? (
        <Skeleton active />
      ) : (
        <div className="p9">
          <Summary ledger={ledger} />
          <div className="p9__grid">
            <Panel title="효과 항목" caption={`${formatDate(GO_LIVE)} ~ ${formatDate(NOW)} · ${siteIds.length > 1 ? `${siteIds.length}개 사업장 합산` : app.siteName(siteIds[0])}`} className="p9__list">
              <div className="p9__items" role="listbox" aria-label="효과 항목">
                <ItemButton id={OVERVIEW} selected={selected} onSelect={select} title="AX 적용 전후 비교" sub="기준선 대 적용 후, 누적 효과와 투자비" />
                {GROUPS.map((g) => {
                  const items = ledger.items.filter((i) => i.kind === g.kind);
                  if (!items.length) return null;
                  return (
                    <div key={g.kind} className="p9__group">
                      <div className="p9__group-head">
                        {['확정', '추정', '잠재'].includes(g.kind) ? <EffectMark kind={g.kind as EffectClass} label={false} /> : null}
                        <strong>{g.title}</strong>
                        <span className="caption">{g.note}</span>
                      </div>
                      {items.map((i) => (
                        <ItemButton key={i.id} id={i.id} selected={selected} onSelect={select} title={i.title} amount={i.kind === '제외' ? null : i.amount} muted={!['확정', '추정'].includes(i.kind)} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </Panel>
            <div className="p9__detail">
              {selected === OVERVIEW ? (
                <Overview ledger={ledger} compareMetrics={def.ledger.compareMetrics} siteIds={siteIds} />
              ) : (
                <ItemDetail item={ledger.items.find((i) => i.id === selected)} />
              )}
            </div>
          </div>
          {loading && <span className="caption">다시 계산하는 중입니다.</span>}
        </div>
      )}
    </ScreenLayout>
  );
}

function ItemButton({ id, selected, onSelect, title, sub, amount, muted }: { id: string; selected: string; onSelect: (id: string) => void; title: string; sub?: string; amount?: number | null; muted?: boolean }) {
  return (
    <button type="button" role="option" aria-selected={selected === id} className={`p9__item${selected === id ? ' p9__item--selected' : ''}${muted ? ' p9__item--muted' : ''}`} onClick={() => onSelect(id)}>
      <span className="p9__item-title">{title}</span>
      {sub && <span className="caption">{sub}</span>}
      {amount !== undefined && amount !== null && <span className="num p9__item-amount">{formatMoney(amount)}</span>}
    </button>
  );
}

function Summary({ ledger }: { ledger: Ledger }) {
  const last = [...ledger.cumulative].reverse().find((c) => !c.projected);
  const pb = ledger.payback;
  return (
    <div className="p9__summary">
      <MoneyCard
        label="AX 효과 (확정 + 추정)"
        amount={ledger.totals.counted}
        classes={[
          { kind: '확정', amount: ledger.totals.confirmed },
          { kind: '추정', amount: ledger.totals.estimated }
        ]}
        footnote="적용 후 누적"
      />
      <MoneyCard label="투자비" amount={ledger.investment.total} footnote={`운영비 월 ${formatMoney(ledger.investment.monthlyOperating)} 백만 원 별도`} />
      <MoneyCard label="누적 순효과 (효과 − 운영비)" amount={last?.net ?? 0} footnote={pb.scope === 'site' ? '운영비는 전사 기준이라 빼지 않음' : `투자비 대비 ${formatNumber(((last?.net ?? 0) / ledger.investment.total) * 100, 1)}%`} />
      <section className="kpi-card">
        <div className="kpi-card__head">
          <span className="kpi-card__label">회수 시점</span>
        </div>
        <div className="kpi-card__value">
          <span className="num">{pb.scope === 'site' ? '전사 기준' : pb.month ? pb.month.replace('-', '.') : '예측 불가'}</span> {pb.projected && <span className="kpi-card__unit">예상</span>}
        </div>
        <div className="caption">
          {pb.scope === 'site' ? '투자비가 전사 단위라 사업장별 회수 시점은 계산하지 않음' : `${pb.projected ? '최근 3개월 평균 순효과로 연장' : '누적 순효과가 투자비를 넘은 달'} · 현재 ROI ${formatNumber(pb.roi * 100, 1).replace('-', '−')}%`}
        </div>
      </section>
      <MoneyCard label="잠재 효과 (연간, 합계 제외)" amount={ledger.totals.potential} classes={[{ kind: '잠재', amount: ledger.totals.potential }]} footnote="채택·실행되면 확정·추정으로 옮겨 간다" />
    </div>
  );
}

function Overview({ ledger, compareMetrics, siteIds }: { ledger: Ledger; compareMetrics: string[]; siteIds: string[] }) {
  const { value: rows } = useAsync(
    () =>
      Promise.all(
        compareMetrics.map(async (id) => {
          const [b, a] = await Promise.all([metric(id, { siteIds, from: baselinePeriod().from, to: baselinePeriod().to }), metric(id, { siteIds, from: GO_LIVE, to: NOW })]);
          return { id, b, a };
        })
      ),
    `${siteIds}|${compareMetrics}|${baselinePeriod().months}`
  );
  const cats = ledger.cumulative.map((c) => `${c.month.slice(2).replace('-', '.')}${c.projected ? '*' : ''}`);
  const monthly = useMemo(() => {
    const by = (kind: string) => ledger.cumulative.map((c) => (c.projected ? null : ledger.items.filter((i) => i.kind === kind).reduce((a, i) => a + (i.monthly[c.month] ?? 0), 0) / 1e6));
    return { confirmed: by('확정'), estimated: by('추정') };
  }, [ledger]);
  return (
    <>
      <Panel title="누적 순효과와 투자비" caption={`${terms.badges.demoOnly} · * 최근 3개월 평균으로 연장한 예상`} className="p9__chart">
        <Chart
          ariaLabel="누적 순효과와 투자비. 순효과가 투자비 선을 넘는 달이 회수 시점"
          unit="백만 원"
          fractionDigits={1}
          categories={cats}
          series={[
            { name: '누적 순효과 (실적)', data: ledger.cumulative.map((c) => (c.projected ? null : c.net / 1e6)), color: 'color-effect' },
            { name: '누적 순효과 (예상)', data: ledger.cumulative.map((c, i) => (c.projected || (!c.projected && ledger.cumulative[i + 1]?.projected) ? c.net / 1e6 : null)), color: 'color-effect', dashed: true }
          ]}
          thresholds={ledger.payback.scope === 'company' ? [{ name: '투자비', value: ledger.investment.total / 1e6, level: 'reference' }] : []}
          fill
        />
      </Panel>
      <div className="p9__row">
        <Panel title="월별 효과" caption="확정·추정 (백만 원)" className="p9__chart">
          <Chart
            ariaLabel="월별 효과. 확정과 추정을 쌓은 막대"
            unit="백만 원"
            fractionDigits={1}
            categories={cats}
            series={[
              { name: '확정', data: monthly.confirmed, kind: 'bar', color: 'color-effect', stack: 'e' },
              { name: '추정', data: monthly.estimated, kind: 'bar', color: 'color-effect', stack: 'e', pattern: 'hatch' }
            ]}
            fill
          />
        </Panel>
        <Panel title="AX 적용 전후 비교" caption={`기준선 ${formatDate(baselinePeriod().from)}~${formatDate(baselinePeriod().to - DAY)} 대 적용 후`} className="p9__compare">
          {!rows ? (
            <Skeleton active />
          ) : (
            <table className="p9__table">
              <thead>
                <tr>
                  <th>지표</th>
                  <th className="num-col">기준선</th>
                  <th className="num-col">적용 후</th>
                  <th className="num-col">변화</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ id, b, a }) => {
                  const d = METRICS[id];
                  const unit = d.unit === '원' ? '백만 원' : d.unit;
                  const show = (v: number | null) => (v === null ? '-' : d.unit === '원' ? formatMoney(v) : formatNumber(displayValue(id, v)!, d.digits));
                  const diff = a !== null && b !== null ? (d.percent ? `${formatNumber((a - b) * 100, 1)}%p` : `${formatNumber(((a - b) / b) * 100, 1)}%`) : '-';
                  const better = a !== null && b !== null && a !== b ? (a > b) === d.higherIsBetter : null;
                  return (
                    <tr key={id}>
                      <td>
                        {d.label} <span className="caption">({unit})</span>
                      </td>
                      <td className="num num-col">{show(b)}</td>
                      <td className="num num-col">{show(a)}</td>
                      <td className="num num-col">
                        {diff.startsWith('-') ? diff.replace('-', '−') : `+${diff}`} {better === null ? '' : better ? '개선' : '악화'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}

function ItemDetail({ item }: { item?: EffectItem }) {
  const link = useShellLink();
  if (!item) return <Empty description="왼쪽에서 효과 항목을 고르세요." />;
  const months = Object.keys(item.monthly).sort();
  return (
    <Panel
      title={item.title}
      caption={['확정', '추정', '잠재'].includes(item.kind) ? <EffectMark kind={item.kind as EffectClass} /> : item.kind}
      extra={<Link to={link(item.source.to.replace(/^\//, '').split('?')[0], Object.fromEntries(new URLSearchParams(item.source.to.split('?')[1] ?? '')))}>{item.source.label}에서 보기</Link>}
      className="p9__evidence"
    >
      <div className="p9__evidence-body">
        <div className="p9__amount">
          <span className="caption">{item.kind === '근거' ? '참고 금액 (합계에 넣지 않음)' : item.kind === '잠재' ? '연간 예상 (합계에 넣지 않음)' : '금액'}</span>
          <span className="num p9__amount-value">{item.kind === '제외' ? '-' : won(item.amount)}</span>
          <span className="caption">{terms.badges.demoOnly}</span>
        </div>
        <section>
          <h3 className="p9__h">1. 계산식</h3>
          <p className="p9__formula">{item.formula}</p>
        </section>
        {item.inputs.length > 0 && (
          <section>
            <h3 className="p9__h">2. 입력값</h3>
            <table className="p9__table">
              <thead>
                <tr>
                  <th>항목</th>
                  <th className="num-col">값</th>
                  <th>단위</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {item.inputs.map((i) => (
                  <tr key={i.label} className={i.label.startsWith('합계') ? 'p9__total' : undefined}>
                    <td>{i.label}</td>
                    <td className="num num-col">{i.unit ? formatNumber(i.value, Number.isInteger(i.value) ? 0 : 1) : ''}</td>
                    <td>{i.unit}</td>
                    <td className="caption">{i.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <section>
          <h3 className="p9__h">3. 가정과 보수적 처리</h3>
          <ul className="p9__list-text">
            {item.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
        {item.overlap && (
          <section>
            <h3 className="p9__h">4. 겹침 처리</h3>
            <p>{item.overlap}</p>
          </section>
        )}
        {months.length > 0 && (
          <section className="p9__monthly">
            <h3 className="p9__h">월별 금액 (백만 원)</h3>
            <Chart
              ariaLabel={`${item.title} 월별 금액`}
              unit="백만 원"
              fractionDigits={1}
              categories={months.map((m) => `${Number(m.slice(5))}월`)}
              series={[{ name: item.title, data: months.map((m) => item.monthly[m] / 1e6), kind: 'bar', color: 'color-effect', pattern: item.kind === '추정' ? 'hatch' : undefined }]}
              fill
            />
          </section>
        )}
      </div>
    </Panel>
  );
}
