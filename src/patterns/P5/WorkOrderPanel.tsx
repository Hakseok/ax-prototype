// Content panel of one maintenance order (MNT-020): stage steps, facts, the AI result behind a
// predictive order, the expected and recorded effect, the action for the current stage and the log.
import { useState } from 'react';
import { App, Button, Input, InputNumber, Skeleton, Steps } from 'antd';
import { Link } from 'react-router-dom';
import { AiResultCard } from '../../components/AiResultCard';
import { formatNumber } from '../../components/KpiCard';
import { formatMoney } from '../../components/money';
import { Panel } from '../../components/Panel';
import { terms } from '../../config';
import { health } from '../../data/aiEngine';
import { costResolver } from '../../data/costs';
import { loadEquipment } from '../../data/loaders';
import { avoidedDowntimeEstimate, stopCostPerHour } from '../../data/maintenance';
import { lineMap } from '../../data/production';
import { PDM_MEASURE_DAYS } from '../../data/roi/ledger';
import { DAY, NOW, formatDateTime, parseTime } from '../../data/time';
import type { WorkOrder } from '../../data/types';
import { closeLinkedAlerts, useWorkOrders, workOrderActions } from '../../data/workflows';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { useAsync } from '../common/useAsync';
import { ProcessLog } from './ProcessLog';

const STAGES = terms.workOrderStages as WorkOrder['stage'][];
const label = (name: string) => [...terms.buttons.commands, ...terms.buttons.workflow.map((b) => b.label)].find((b) => b === name)!;
const at = (s: string | null) => (s ? formatDateTime(parseTime(s)) : '-');

export function WorkOrderPanel({ id, canEdit }: { id: string; canEdit: boolean }) {
  const orders = useWorkOrders();
  const wo = orders?.find((o) => o.id === id);
  const { value: ctx } = useAsync(async () => {
    if (!wo) return null;
    const [eqs, lines, cost] = await Promise.all([loadEquipment(), lineMap(), costResolver()]);
    const [est, perHour, h] = await Promise.all([
      wo.type === '예지' ? avoidedDowntimeEstimate(wo.equipmentId) : Promise.resolve(null),
      stopCostPerHour(wo.lineId),
      wo.type === '예지' ? health(wo.equipmentId) : Promise.resolve(null)
    ]);
    return { eq: eqs.find((e) => e.id === wo.equipmentId), line: lines.get(wo.lineId), est, perHour, h, laborRate: cost('maintenanceLaborKrwPerHour') };
  }, `${id}|${wo?.stage}|${!!orders}`);

  if (!orders) return <Skeleton active />;
  if (!wo) return <Panel title="정비 오더">{`${id}를 찾지 못했습니다.`}</Panel>;
  const rejected = wo.log.some((l) => l.action === '반려');
  const current = STAGES.indexOf(wo.stage);
  return (
    <Panel title={`${wo.id} · ${wo.title}`} caption={`${wo.type} 정비`} className="p5__detail">
      <div className="p5__detail-body">
        <Steps
          size="small"
          current={rejected ? 0 : current}
          items={STAGES.map((s, i) => ({
            title: rejected && i === 0 ? '반려' : s,
            description: i === 0 ? at(wo.requestedAt) : i === 1 ? at(wo.approvedAt) : i === 2 ? at(wo.startedAt) : i === 3 ? at(wo.completedAt) : at(wo.log.find((l) => l.action === '효과 확인')?.at ?? null)
          }))}
        />
        {!ctx ? (
          <Skeleton active />
        ) : (
          <>
            <WorkOrderFacts wo={wo} eqName={ctx.eq?.name ?? wo.equipmentId} lineName={ctx.line?.name ?? '유틸리티'} laborRate={ctx.laborRate} />
            {ctx.h && <AiResultCard result={ctx.h} compact />}
            {wo.type === '예지' && <Effect wo={wo} est={ctx.est} perHour={ctx.perHour} />}
            {canEdit && <StageAction wo={wo} est={ctx.est} />}
          </>
        )}
        <ProcessLog log={wo.log} />
      </div>
    </Panel>
  );
}

function WorkOrderFacts({ wo, eqName, lineName, laborRate }: { wo: WorkOrder; eqName: string; lineName: string; laborRate: number }) {
  const app = useApp();
  const link = useShellLink();
  const user = (id: string | null) => (id ? app.users.find((u) => u.id === id)?.name ?? id : '-');
  const cost = wo.laborHours * laborRate + wo.partsKrw;
  return (
    <dl className="facts p5__facts">
      <dt>설비</dt>
      <dd>
        <Link to={link('MNT-011', { id: wo.equipmentId })}>
          {wo.equipmentId} {eqName}
        </Link>{' '}
        <span className="caption">· {lineName} · {app.siteName(wo.siteId)}</span>
      </dd>
      <dt>고장 유형</dt>
      <dd>{wo.failureMode ?? '-'}</dd>
      <dt>요청</dt>
      <dd>
        {user(wo.requestedBy)} · <span className="num">{at(wo.requestedAt)}</span>
        {wo.aiResultId && <span className="caption"> · 근거 AI 결과 {wo.aiResultId}</span>}
      </dd>
      <dt>작업</dt>
      <dd>
        {wo.laborHours ? `${wo.laborHours}시간 · 부품비 ${formatNumber(wo.partsKrw / 1000, 0)}천 원 · 정비 비용 ${formatNumber(cost / 1000, 0)}천 원 (${terms.badges.demoOnly})` : '-'}
      </dd>
    </dl>
  );
}

function Effect({ wo, est, perHour }: { wo: WorkOrder; est: Awaited<ReturnType<typeof avoidedDowntimeEstimate>> | null; perHour: number }) {
  const link = useShellLink();
  const recorded = wo.stage === '효과 확인' && wo.avoidedDowntimeMin !== null;
  const minutes = recorded ? wo.avoidedDowntimeMin! : est?.minutes ?? 0;
  const won = (minutes / 60) * perHour;
  const measured = recorded && wo.completedAt && parseTime(wo.completedAt) <= NOW - PDM_MEASURE_DAYS * DAY;
  return (
    <section className="p5__effect">
      <h3 className="p5__h">{recorded ? '확인한 효과' : '예상 효과'}</h3>
      <p className="p5__effect-value">
        피한 정지 <strong className="num">{formatNumber(minutes / 60, 1)}</strong>시간 × 정지 단가 <span className="num">{formatNumber(perHour, 0)}</span>원/시간 ={' '}
        <strong className="num">{formatMoney(won)}</strong> 백만 원 <span className="caption">({terms.badges.demoOnly})</span>
      </p>
      <p className="caption">
        {recorded ? '효과 확인 때 기록한 피한 정지 시간' : est?.basis}. 정지 단가는 비가동 손실과 같은 기준(납기 제약 라인은 공헌이익, 그 밖은 투입 인원 × 잔업 단가)입니다.
      </p>
      {recorded && (
        <p className="p5__ledger">
          {measured ? (
            <>
              AX 성과에서는 측정된 <Link to={link('EXE-020', { item: 'fx.breakdown' })}>고장 정지 감소(확정)</Link>에 들어 있고, 사례는 <Link to={link('EXE-020', { item: 'fx.pdm.cases' })}>근거</Link>로만 보입니다.
            </>
          ) : (
            <>
              효과 확인 후 {PDM_MEASURE_DAYS}일이 지나지 않아 AX 성과의 <Link to={link('EXE-020', { item: 'fx.pdm.recent' })}>추정 항목 「예지 정비로 피할 고장 (측정 전)」</Link>에 반영했습니다.
            </>
          )}
        </p>
      )}
    </section>
  );
}

function StageAction({ wo, est }: { wo: WorkOrder; est: { minutes: number } | null }) {
  const app = useApp();
  const { message } = App.useApp();
  const [note, setNote] = useState('');
  const [labor, setLabor] = useState<number | null>(null);
  const [parts, setParts] = useState<number | null>(null);
  const [avoided, setAvoided] = useState<number | null>(est ? est.minutes : null);
  const [rejecting, setRejecting] = useState(false);
  const user = app.user.id;
  const rejected = wo.log.some((l) => l.action === '반려');
  if (rejected || wo.stage === '효과 확인') return null;
  if (wo.stage === '완료' && wo.type !== '예지') return null;

  const done = (msg: string) => {
    message.success(msg);
    setNote('');
  };
  const noteBox = (placeholder: string) => <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-label="처리 메모" />;

  if (wo.stage === '요청') {
    return (
      <section className="p5__action">
        <h3 className="p5__h">승인</h3>
        {noteBox(rejecting ? '반려 사유 (필수)' : '승인 메모 (선택). 예: 다음 주말 계획 정지 때 작업')}
        <div className="p5__buttons">
          {rejecting ? (
            <>
              <Button onClick={() => setRejecting(false)}>취소</Button>
              <Button danger disabled={!note.trim()} onClick={() => (workOrderActions.reject(wo, user, note.trim()), done('반려했습니다.'))}>
                {label('반려')}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setRejecting(true)}>{label('반려')}</Button>
              <span className="p5__spacer" />
              <Button type="primary" onClick={() => (workOrderActions.approve(wo, user, note.trim()), done('승인했습니다. 작업 착수를 기록하세요.'))}>
                {label('승인')}
              </Button>
            </>
          )}
        </div>
      </section>
    );
  }
  if (wo.stage === '승인') {
    return (
      <section className="p5__action">
        <h3 className="p5__h">작업 착수</h3>
        <p className="caption">작업을 시작하면 확인을 누르세요. 착수 시각이 기록됩니다.</p>
        <div className="p5__buttons">
          <span className="p5__spacer" />
          <Button type="primary" onClick={() => (workOrderActions.start(wo, user), done('작업 착수를 기록했습니다.'))}>
            {label('확인')}
          </Button>
        </div>
      </section>
    );
  }
  if (wo.stage === '작업 중') {
    return (
      <section className="p5__action">
        <h3 className="p5__h">작업 결과</h3>
        <div className="p5__fields">
          <label>
            <span className="filter-bar__label">작업 시간 (시간) *</span>
            <InputNumber min={0.5} step={0.5} value={labor} onChange={setLabor} aria-label="작업 시간" />
          </label>
          <label>
            <span className="filter-bar__label">부품비 (원) *</span>
            <InputNumber min={0} step={100000} value={parts} onChange={setParts} formatter={(v) => (v === undefined || v === null ? '' : Number(v).toLocaleString('ko-KR'))} parser={(v) => Number(String(v ?? '').replace(/,/g, ''))} aria-label="부품비" />
          </label>
        </div>
        {noteBox('작업 내용. 예: 메인 베어링 교체, 윤활 계통 점검')}
        <div className="p5__buttons">
          <span className="p5__spacer" />
          <Button
            type="primary"
            disabled={!labor || parts === null || !note.trim()}
            onClick={async () => {
              workOrderActions.complete(wo, user, labor!, parts!, note.trim());
              const n = await closeLinkedAlerts(wo, user);
              done(n ? `작업을 완료했습니다. 연결된 알림 ${n}건을 조치 완료로 닫았습니다.` : '작업을 완료했습니다.');
            }}
          >
            {label('완료')}
          </Button>
        </div>
      </section>
    );
  }
  // 완료 → 효과 확인 (predictive orders)
  return (
    <section className="p5__action">
      <h3 className="p5__h">효과 확인</h3>
      <p className="caption">교체 후 신호가 정상 범위로 돌아왔는지 확인하고, 피한 정지 시간을 기록합니다. 기본값은 예상 효과의 정지 시간입니다.</p>
      <div className="p5__fields">
        <label>
          <span className="filter-bar__label">피한 정지 시간 (분) *</span>
          <InputNumber min={0} step={30} value={avoided} onChange={setAvoided} aria-label="피한 정지 시간" />
        </label>
      </div>
      {noteBox('확인 내용. 예: 교체 후 진동·온도 정상 범위 복귀')}
      <div className="p5__buttons">
        <span className="p5__spacer" />
        <Button
          type="primary"
          disabled={avoided === null || !note.trim()}
          onClick={() => (workOrderActions.confirmEffect(wo, user, avoided, note.trim()), done('효과를 기록했습니다. AX 성과에 추정 효과로 반영됩니다.'))}
        >
          {label('확인')}
        </Button>
      </div>
    </section>
  );
}
