// P6 단계형 (D-01): the initial setup (SET-010) walks through industry → KPI set → loss
// categories → quality metrics and cost items → unit costs → confirm, with 이전·다음 and one 저장.
import { useState } from 'react';
import { App, Button, Checkbox, Radio, Skeleton, Steps, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { formatNumber } from '../../components/KpiCard';
import { terms } from '../../config';
import { loadCostItems } from '../../data/costs';
import { baselinePeriod } from '../../data/baseline';
import { DATA_TEMPLATE, TEMPLATES, costItemName, kpiName, saveIndustry, templateOf, useIndustry } from '../../data/industry';
import { formatDate, DAY } from '../../data/time';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import { useUnsavedGuard } from '../common/useUnsavedGuard';
import './P6.css';

interface StepDef {
  id: 'industry' | 'kpis' | 'losses' | 'quality' | 'costs' | 'confirm';
  title: string;
}
const MIN_HEADLINE = 4;
const MAX_HEADLINE = 6;

export function P6Steps({ entry, def, badges }: TemplateProps & { def: { steps: StepDef[]; badges?: string[]; permission: { edit?: string } } }) {
  const app = useApp();
  const link = useShellLink();
  const { message } = App.useApp();
  const current = useIndustry();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState(current.templateId);
  const [headline, setHeadline] = useState<string[]>(current.headlineKpis);
  const canEdit = app.hasPermission((def.permission.edit ?? '관리') as '관리');
  const dirty = templateId !== current.templateId || headline.join() !== current.headlineKpis.join();
  useUnsavedGuard(dirty);
  const t = templateOf(templateId);
  const hasData = templateId === DATA_TEMPLATE;
  const steps = def.steps;
  const s = steps[step];
  const headlineOk = headline.length >= MIN_HEADLINE && headline.length <= MAX_HEADLINE;

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    // A new template starts from its recommended headline set.
    setHeadline(id === current.templateId ? current.headlineKpis : templateOf(id).headlineKpis);
  };
  const save = () => {
    saveIndustry(templateId, headline, app.user.id);
    message.success(hasData ? '초기 설정을 저장했습니다. 경영 현황 카드가 바뀐 핵심 지표로 보입니다.' : `${t.name} 템플릿으로 저장했습니다. 데이터가 연계되지 않아 값은 "데이터 없음"으로 보입니다.`);
  };
  const cancel = () => {
    setTemplateId(current.templateId);
    setHeadline(current.headlineKpis);
    setStep(0);
  };

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      toolbar={
        <>
          <span className="caption">
            현재 설정: <strong>{current.template.name}</strong> · 핵심 지표 {current.headlineKpis.length}개 · {current.changedAt.replace('T', ' ')} {app.users.find((u) => u.id === current.changedBy)?.name ?? current.changedBy}
          </span>
          {!canEdit && <span className="caption">조회 권한으로 열었습니다. 저장은 관리 권한에서 할 수 있습니다.</span>}
        </>
      }
      bodyMode="fit"
    >
      <div className="p6">
        <div className="p6__scroll">
          <Steps size="small" current={step} onChange={(n) => setStep(n)} items={steps.map((x) => ({ title: x.title }))} className="p6__steps" />
          <Panel title={`${step + 1}. ${s.title}`} caption={t.name}>
            {s.id === 'industry' && (
              <Radio.Group value={templateId} onChange={(e) => pickTemplate(e.target.value)} disabled={!canEdit} className="p6__choices">
                {TEMPLATES.map((x) => (
                  <Radio key={x.id} value={x.id} className="p6__choice">
                    <strong>{x.name}</strong> {x.id === DATA_TEMPLATE ? <Tag bordered>가상 데이터 있음</Tag> : <Tag bordered>데이터 연계 전</Tag>}
                    <div className="caption">{x.description} · 생산 단위 {x.productionUnit}</div>
                  </Radio>
                ))}
              </Radio.Group>
            )}
            {s.id === 'kpis' && (
              <>
                <p className="caption p6__hint">
                  권장 지표 세트입니다. 경영 현황 카드에 올릴 핵심 지표를 {MIN_HEADLINE}~{MAX_HEADLINE}개 고르세요(지금 {headline.length}개).
                  {!hasData && ' 이 업종은 데이터가 없어 값은 "데이터 없음"으로 보입니다.'}
                </p>
                <Checkbox.Group value={headline} onChange={(v) => setHeadline(t.kpis.filter((id) => (v as string[]).includes(id)))} disabled={!canEdit} className="p6__kpis">
                  {t.kpis.map((id) => {
                    const k = kpiName(id);
                    const blocked = hasData && !k.computable;
                    return (
                      <Checkbox key={id} value={id} disabled={blocked || (!headline.includes(id) && headline.length >= MAX_HEADLINE)}>
                        {k.label} <span className="caption">({k.unit || '지수'})</span> {t.headlineKpis.includes(id) && <Tag bordered>권장</Tag>}
                      </Checkbox>
                    );
                  })}
                </Checkbox.Group>
              </>
            )}
            {s.id === 'losses' && (
              <table className="data-table p6__table">
                <thead>
                  <tr>
                    <th>손실 분류</th>
                    <th>OEE 요소</th>
                    <th>코드</th>
                  </tr>
                </thead>
                <tbody>
                  {t.lossCategories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.group}</td>
                      <td className="num caption">{c.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {s.id === 'quality' && <QualityStep templateId={templateId} />}
            {s.id === 'costs' && <CostStep hasData={hasData} templateId={templateId} />}
            {s.id === 'confirm' && (
              <dl className="facts">
                <dt>업종</dt>
                <dd>
                  {t.name} {hasData ? '' : '(데이터 연계 전 · 값은 "데이터 없음")'}
                </dd>
                <dt>핵심 지표</dt>
                <dd>{headline.map((id) => kpiName(id).label).join(', ')}</dd>
                <dt>손실 분류</dt>
                <dd>{t.lossCategories.map((c) => c.name).join(', ')}</dd>
                <dt>품질 지표</dt>
                <dd>{t.qualityMetrics.map((id) => kpiName(id).label).join(', ')}</dd>
                <dt>바뀌는 화면</dt>
                <dd>
                  {hasData ? (
                    <>
                      <Link to={link('EXE-010')}>경영 현황</Link> 지표 카드
                    </>
                  ) : (
                    '경영·공장 운영·품질·설비·에너지 화면 전체가 이 업종의 지표 구성으로 바뀌고 값은 "데이터 없음"으로 보입니다. 상단 안내에서 언제든 되돌릴 수 있습니다'
                  )}
                </dd>
              </dl>
            )}
            {s.id !== 'confirm' && s.id !== 'industry' && !headlineOk && <p className="caption">핵심 지표를 {MIN_HEADLINE}~{MAX_HEADLINE}개 골라야 저장할 수 있습니다.</p>}
          </Panel>
        </div>
        <footer className="p6__footer">
          {dirty && <span className="caption">저장하지 않은 변경이 있습니다.</span>}
          <span className="toolbar__spacer" />
          {canEdit && (
            <Button onClick={cancel} disabled={!dirty}>
              취소
            </Button>
          )}
          <Button onClick={() => setStep(step - 1)} disabled={step === 0}>
            이전
          </Button>
          {step < steps.length - 1 ? (
            <Button type="primary" onClick={() => setStep(step + 1)}>
              다음
            </Button>
          ) : (
            canEdit && (
              <Button type="primary" onClick={save} disabled={!dirty || !headlineOk}>
                저장
              </Button>
            )
          )}
        </footer>
      </div>
    </ScreenLayout>
  );
}

function QualityStep({ templateId }: { templateId: string }) {
  const t = templateOf(templateId) as ReturnType<typeof templateOf> & { defectTypes?: Record<string, string[]> };
  return (
    <div className="p6__cols">
      <section>
        <h3 className="p6__h">품질 지표</h3>
        <ul className="p6__list">
          {t.qualityMetrics.map((id) => (
            <li key={id}>{kpiName(id).label}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="p6__h">불량 유형 (공정별)</h3>
        {t.defectTypes ? (
          <ul className="p6__list">
            {Object.entries(t.defectTypes).map(([p, list]) => (
              <li key={p}>
                <span className="caption">{PROCESS_NAMES[p] ?? p}</span> {list.join(', ')}
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">데이터 연계 때 공정별 불량 유형을 등록합니다.</p>
        )}
      </section>
      <section>
        <h3 className="p6__h">원가 항목</h3>
        <ul className="p6__list">
          {t.costItems.map((c) => (
            <li key={c}>{costItemName(c)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const PROCESS_NAMES: Record<string, string> = { press: '프레스', welding: '용접', injection: '사출', painting: '도장', machining: '가공', assembly: '조립' };

function CostStep({ hasData, templateId }: { hasData: boolean; templateId: string }) {
  const link = useShellLink();
  const { value: items } = useAsync(() => loadCostItems(), 'costs');
  const bl = baselinePeriod();
  if (!hasData) {
    return (
      <>
        <p className="caption p6__hint">이 업종은 단가 데이터가 없습니다. 연계할 때 아래 항목을 적용 시작일과 함께 입력합니다.</p>
        <ul className="p6__list">
          {templateOf(templateId).costItems.map((c) => (
            <li key={c}>{costItemName(c)}</li>
          ))}
        </ul>
      </>
    );
  }
  if (!items) return <Skeleton active />;
  const common = items.filter((i) => ['에너지', '인건비', '품질'].includes(i.group));
  return (
    <>
      <p className="caption p6__hint">
        단가와 AX 기준선은 적용 시작일과 변경 이력이 필요한 값이라 <Link to={link('SET-020')}>단가·기준선</Link>에서 바꿉니다. 바꾸면 AX 성과가 다시 계산됩니다. 모든 단가는 {terms.badges.demoOnly} 가상값입니다.
      </p>
      <table className="data-table p6__table">
        <thead>
          <tr>
            <th>항목</th>
            <th className="num-col">현재 값</th>
            <th>단위</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>AX 기준선 기간</td>
            <td className="num num-col">{bl.months}개월</td>
            <td className="num">
              {formatDate(bl.from)} ~ {formatDate(bl.to - DAY)}
            </td>
          </tr>
          {common.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td className="num num-col">{formatNumber(i.value, 0)}</td>
              <td>{i.unit}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="caption">
              라인 손실 단가 {items.filter((i) => i.group === '라인 손실').length}개, 제품 원가 {items.filter((i) => i.group === '제품 원가').length}개는 단가·기준선 화면에서 봅니다.
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export type { StepDef };
