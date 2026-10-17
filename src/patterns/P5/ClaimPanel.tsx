// Content panel of one customer claim (QUA-030): stage steps, facts, the back-trace from the
// claim to its lots, their common factors and process conditions, the lots made under the same
// condition and where they went (shipped or in stock), the action for the stage and the log.
import { useEffect, useState } from 'react';
import { App, Button, Input, Skeleton, Steps } from 'antd';
import { Link } from 'react-router-dom';
import { formatNumber } from '../../components/KpiCard';
import { Panel } from '../../components/Panel';
import { terms } from '../../config';
import { loadCustomers, loadProducts } from '../../data/loaders';
import { formatDate, formatDateTime, parseTime } from '../../data/time';
import { traceClaim, type TraceResult } from '../../data/traceability';
import type { Claim } from '../../data/types';
import { claimActions, closeLinkedAlerts, useClaims } from '../../data/workflows';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { useAsync } from '../common/useAsync';
import { ProcessLog } from './ProcessLog';
import { OutOfScope } from './OutOfScope';

const STAGES = terms.claimStages as Claim['stage'][];

export function ClaimPanel({ id, canEdit }: { id: string; canEdit: boolean }) {
  const app = useApp();
  const claims = useClaims();
  const claim = claims?.find((c) => c.id === id);
  const { value: ctx } = useAsync(async () => {
    if (!claim) return null;
    const [customers, products, trace] = await Promise.all([loadCustomers(), loadProducts(), traceClaim(claim)]);
    return { customer: customers.find((c) => c.id === claim.customerId)?.name ?? claim.customerId, product: products.find((p) => p.id === claim.productId)?.name ?? claim.productId, trace };
  }, `${id}|${!!claims}`);
  if (!claims) return <Skeleton active />;
  if (!claim) return <Panel title="클레임">{`${id}를 찾지 못했습니다.`}</Panel>;
  if (!app.selectedSiteIds.includes(claim.siteId)) return <OutOfScope title="클레임" what="이 클레임" siteName={app.siteName(claim.siteId)} />;
  const rejected = claim.log.some((l) => l.action === '반려');
  const STEP_ACTIONS: Record<string, string[]> = { '원인 분석': ['원인 분석 시작', '접수 승인'], 대책: ['원인 기록', '대책'], 종결: ['대책·종결', '반려', '종결'] };
  const stepAt = (s: string) => claim.log.find((l) => (STEP_ACTIONS[s] ?? [s]).includes(l.action))?.at;
  return (
    <Panel title={`${claim.id} · ${claim.title}`} caption={app.siteName(claim.siteId)} className="p5__detail">
      <div className="p5__detail-body">
        <Steps
          size="small"
          current={rejected ? 0 : STAGES.indexOf(claim.stage)}
          items={STAGES.map((s, i) => ({ title: rejected && i === 0 ? '반려' : s, description: i === 0 ? formatDateTime(parseTime(claim.receivedAt)) : stepAt(s) ? formatDateTime(parseTime(stepAt(s)!)) : '-' }))}
        />
        {!ctx ? (
          <Skeleton active />
        ) : (
          <>
            <dl className="facts p5__facts">
              <dt>고객사·제품</dt>
              <dd>
                {ctx.customer} · {claim.productId} {ctx.product}
              </dd>
              <dt>불량</dt>
              <dd>
                {claim.defectType} {formatNumber(claim.qty, 0)}개 · 비용 {formatNumber(claim.costKrw / 1000, 0)}천 원 <span className="caption">({terms.badges.demoOnly}, 반품 × 판매가 + 처리비)</span>
              </dd>
              <dt>접수</dt>
              <dd className="num">{formatDateTime(parseTime(claim.receivedAt))}</dd>
            </dl>
            {ctx.trace ? <Trace claim={claim} trace={ctx.trace} /> : <p className="caption">연결된 로트가 데이터 기간 밖이라 역추적하지 못했습니다.</p>}
            {canEdit && <ClaimAction claim={claim} trace={ctx.trace} />}
          </>
        )}
        <ProcessLog log={claim.log} />
      </div>
    </Panel>
  );
}

function Trace({ claim, trace }: { claim: Claim; trace: TraceResult }) {
  const link = useShellLink();
  const lead = trace.params[0];
  const eqFactor = trace.factors.find((f) => f.field === 'equipmentId');
  const from = formatDate(trace.windowFrom);
  const to = formatDate(parseTime(claim.receivedAt));
  return (
    <section className="p5__trace">
      <h3 className="p5__h">역추적</h3>
      <ol className="p5__trace-steps">
        <li>
          <strong>클레임 로트 {trace.claimLots.length}개</strong>
          <table className="data-table">
            <thead>
              <tr>
                <th>로트</th>
                <th>생산</th>
                <th className="num-col">수량</th>
                <th className="num-col">공정 불량</th>
                {lead && <th className="num-col">{lead.name} ({lead.unit})</th>}
                <th>출하</th>
              </tr>
            </thead>
            <tbody>
              {trace.claimLots.map((l) => (
                <tr key={l.id}>
                  <td className="num">{l.id}</td>
                  <td className="num">
                    {l.date.slice(5)} {l.shift}
                  </td>
                  <td className="num num-col">{formatNumber(l.qty, 0)}</td>
                  <td className="num num-col">{formatNumber(l.defectQty, 0)}</td>
                  {lead && <td className="num num-col">{formatNumber(l.params[lead.id][0], lead.digits)}</td>}
                  <td className="num">{l.shippedOn ?? '창고'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
        <li>
          <strong>공통 요인</strong> <span className="caption">같은 라인 {trace.comparedLots}개 로트({from}~{to})와 비교</span>
          <ul className="p5__factors">
            {trace.factors.map((f) => (
              <li key={f.field + f.value}>
                {f.label} <strong>{f.valueLabel}</strong> <span className="caption">· 클레임 로트 전부, 다른 로트 {Math.round(f.otherShare * 100)}%</span>
                {f.field === 'equipmentId' && (
                  <>
                    {' '}
                    <Link to={link('MNT-011', { id: f.value })}>설비 진단</Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </li>
        <li>
          <strong>공정 조건</strong> <span className="caption">로트 평균 · 다른 로트는 10~90% 범위 · 영향 크기 = (클레임 로트 평균 − 다른 로트 평균) ÷ 표준편차</span>
          <table className="data-table">
            <thead>
              <tr>
                <th>조건</th>
                <th className="num-col">클레임 로트</th>
                <th className="num-col">다른 로트</th>
                <th className="num-col">영향 크기</th>
              </tr>
            </thead>
            <tbody>
              {trace.params.map((p, i) => (
                <tr key={p.id} className={i === 0 ? 'data-table__selected' : undefined}>
                  <td>
                    {p.name} <span className="caption">({p.unit})</span>
                  </td>
                  <td className="num num-col">
                    {formatNumber(p.claimRange[0], p.digits)}~{formatNumber(p.claimRange[1], p.digits)}
                  </td>
                  <td className="num num-col">
                    {formatNumber(p.normalRange[0], p.digits)}~{formatNumber(p.normalRange[1], p.digits)}
                  </td>
                  <td className="num num-col">
                    {p.effect > 0 ? '+' : '−'}
                    {formatNumber(Math.abs(p.effect), 2)} ({p.direction})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link to={link('QUA-020', { 'f.productId': claim.productId, 'f.lineId': trace.claimLots[0].lineId, 'f.period': `${from}~${to}` })}>품질 원인 분석에서 보기</Link>
        </li>
        <li>
          <strong>같은 조건 로트와 출하 범위</strong>{' '}
          <span className="caption">
            {eqFactor ? `${eqFactor.value} · ` : ''}
            {lead ? `${lead.name}이 클레임 로트 범위(${lead.direction === '높음' ? '이상' : '이하'})인 로트` : ''}
          </span>
          <div className="p5__ship">
            <div>
              <span className="caption">출하</span>
              <strong className="num">{formatNumber(trace.shipped.qty, 0)}</strong>개 · {trace.shipped.lots}개 로트 · {trace.shipped.customers.join(', ') || '-'}
            </div>
            <div>
              <span className="caption">창고 재고</span>
              <strong className="num">{formatNumber(trace.inStock.qty, 0)}</strong>개 · {trace.inStock.lots}개 로트
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>로트</th>
                <th>생산</th>
                <th className="num-col">수량</th>
                <th>출하일</th>
                <th className="num-col">창고</th>
                <th>구분</th>
              </tr>
            </thead>
            <tbody>
              {trace.suspectLots.map((l) => (
                <tr key={l.id}>
                  <td className="num">{l.id}</td>
                  <td className="num">
                    {l.date.slice(5)} {l.shift}
                  </td>
                  <td className="num num-col">{formatNumber(l.qty, 0)}</td>
                  <td className="num">{l.shippedOn ?? '-'}</td>
                  <td className="num num-col">{formatNumber(l.stockQty, 0)}</td>
                  <td className="caption">{l.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
      </ol>
      <p className="caption">역추적은 로트 데이터에 대한 규칙 계산입니다(가상 AI 엔진 아님). 원인 확정은 현장 확인 후 처리 단계에서 기록합니다.</p>
    </section>
  );
}

function ClaimAction({ claim, trace }: { claim: Claim; trace: TraceResult | null }) {
  const app = useApp();
  const { message } = App.useApp();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const lead = trace?.params[0];
  const eq = trace?.factors.find((f) => f.field === 'equipmentId');
  // Suggested text for the cause step, from the trace.
  useEffect(() => {
    if (claim.stage === '원인 분석' && trace && lead) {
      setNote(`${eq ? `${eq.valueLabel}에서 ` : ''}${lead.name} ${lead.direction === '높음' ? '상한' : '하한'} 쪽(${formatNumber(lead.claimRange[0], lead.digits)}~${formatNumber(lead.claimRange[1], lead.digits)} ${lead.unit})으로 생산한 로트`);
    } else if (claim.stage === '대책' && trace) {
      setNote(`${lead ? `${lead.name} 관리 기준 강화, ` : ''}출하분 ${formatNumber(trace.shipped.qty, 0)}개 고객사 선별 요청${trace.inStock.qty ? `, 재고 ${formatNumber(trace.inStock.qty, 0)}개 격리` : ''}`);
    } else setNote('');
  }, [claim.stage, trace, lead, eq]);
  if (claim.stage === '종결') return null;
  const user = app.user.id;
  const done = (msg: string) => message.success(msg);
  const box = (placeholder: string) => <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-label="처리 메모" />;
  if (claim.stage === '접수') {
    return (
      <section className="p5__action">
        <h3 className="p5__h">접수 판단</h3>
        {box(rejecting ? '반려 사유 (필수). 예: 당사 공정과 무관한 손상' : '메모 (선택)')}
        <div className="p5__buttons">
          {rejecting ? (
            <>
              <Button onClick={() => setRejecting(false)}>취소</Button>
              <Button danger disabled={!note.trim()} onClick={() => (claimActions.advance(claim, user, '종결', '반려', note.trim()), done('반려했습니다.'))}>
                반려
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setRejecting(true)}>반려</Button>
              <span className="p5__spacer" />
              <Button type="primary" onClick={() => (claimActions.advance(claim, user, '원인 분석', '접수 승인', note.trim()), done('원인 분석 단계로 넘겼습니다.'))}>
                승인
              </Button>
            </>
          )}
        </div>
      </section>
    );
  }
  if (claim.stage === '원인 분석') {
    return (
      <section className="p5__action">
        <h3 className="p5__h">원인 기록</h3>
        <p className="caption">역추적 결과로 채운 문장입니다. 현장 확인 내용으로 고친 뒤 확인을 누르세요.</p>
        {box('원인')}
        <div className="p5__buttons">
          <span className="p5__spacer" />
          <Button type="primary" disabled={!note.trim()} onClick={() => (claimActions.advance(claim, user, '대책', '원인 기록', note.trim()), done('원인을 기록했습니다. 대책을 입력하세요.'))}>
            확인
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className="p5__action">
      <h3 className="p5__h">대책과 종결</h3>
      {box('대책')}
      <div className="p5__buttons">
        <span className="p5__spacer" />
        <Button
          type="primary"
          disabled={!note.trim()}
          onClick={async () => {
            claimActions.advance(claim, user, '종결', '대책·종결', note.trim());
            const n = await closeLinkedAlerts(claim, user);
            done(n ? `종결했습니다. 연결된 알림 ${n}건을 조치 완료로 닫았습니다.` : '종결했습니다.');
          }}
        >
          완료
        </Button>
      </div>
    </section>
  );
}
