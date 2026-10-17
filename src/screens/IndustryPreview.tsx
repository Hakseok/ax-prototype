// Exception screen (CLAUDE.md structure rule 1): when SET-010 selects an industry without data
// (D-09), every data screen shows the KPI set and loss categories of that industry with
// "데이터 없음 · 연계 후 표시" instead of auto-parts numbers. It is one screen for all data screens
// because no pattern template can draw values that do not exist.
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { Panel } from '../components/Panel';
import { terms } from '../config';
import { costItemName, kpiName, useIndustry } from '../data/industry';
import type { ScreenEntry } from '../shell/menu';
import { useShellLink } from '../shell/links';
import { ScreenLayout } from '../shell/ScreenLayout';
import './IndustryPreview.css';

const GROUP_KPIS: Record<string, (id: string) => boolean> = {
  OPS: (id) => /^(plan|oee|loss|yield)/.test(id),
  QUA: (id) => /^(quality|yield)/.test(id),
  MNT: (id) => /^(mnt|oee\.availability|loss)/.test(id),
  ENG: (id) => /^(energy|carbon)/.test(id)
};

export function IndustryPreview({ entry }: { entry: ScreenEntry }) {
  const ind = useIndustry();
  const link = useShellLink();
  const t = ind.template;
  const kpis = (entry.group === 'EXE' ? ind.headlineKpis : t.kpis.filter(GROUP_KPIS[entry.group] ?? (() => true))).slice(0, 6);
  return (
    <ScreenLayout entry={entry} badges={[terms.badges.demoOnly]} bodyMode="scroll">
      <div className="ind-preview">
        <p className="ind-preview__lead">
          업종 템플릿 <strong>{t.name}</strong>의 지표 구성입니다. 이 업종의 데이터는 연계되지 않아 값은 "데이터 없음 · 연계 후 표시"로 보입니다.{' '}
          <Link to={link('SET-010')}>초기 설정에서 업종 바꾸기</Link>
        </p>
        <div className="ind-preview__kpis" style={{ ['--ind-kpi-count' as string]: Math.max(1, kpis.length) }}>
          {kpis.map((id) => {
            const k = kpiName(id);
            return <KpiCard key={id} label={k.label} value={null} unit={k.unit} emptyLabel="데이터 없음" footnote="연계 후 표시" />;
          })}
        </div>
        <div className="ind-preview__grid">
          <Panel title="손실 분류" caption={`${t.name} 템플릿 · OEE 분해 기준`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>손실</th>
                  <th>OEE 요소</th>
                </tr>
              </thead>
              <tbody>
                {t.lossCategories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.group}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="지표 세트" caption={`${t.kpis.length}개 · 생산 단위 ${t.productionUnit}`}>
            <ul className="ind-preview__list">
              {t.kpis.map((id) => (
                <li key={id}>
                  {kpiName(id).label} <span className="caption num">{id}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="연계 후 쓰는 AI·원가 항목" caption="가상 엔진 · 시연용 단가">
            <h3 className="ind-preview__h">AI 활용</h3>
            <ul className="ind-preview__list">
              {t.aiUseCases.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
            <h3 className="ind-preview__h">원가 항목</h3>
            <ul className="ind-preview__list">
              {t.costItems.map((c) => (
                <li key={c}>{costItemName(c)}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </ScreenLayout>
  );
}
