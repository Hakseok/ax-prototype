// P10 보고서형: report month, table of contents, page preview, and PDF export. The preview and
// the PDF are built from the same report model (src/report/model.ts).
import { useState } from 'react';
import { App, Button, Select, Skeleton } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { terms } from '../../config';
import { decisionStore } from '../../data/aiEngine';
import { useCostVersion } from '../../data/costs';
import { reportMonths } from '../../data/executive';
import { useLocalStore } from '../../data/localStore';
import { REPORT_PAGES, buildReport } from '../../report/model';
import { ReportPreview } from '../../report/ReportPreview';
import { saveFile } from '../../report/save';
import { useApp } from '../../shell/AppContext';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useAsync } from '../common/useAsync';
import './P10.css';

interface P10Definition {
  badges?: string[];
  report: { kind: 'monthly'; contents: string[] };
  actions: string[];
}

/** Page of each table-of-contents entry (cover, KPIs, trend, sites, effect, risks, notes). */
const PAGE_OF = [1, 2, 2, 2, 3, 4, 4, 5, 5];

export function P10Report({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P10Definition;
  const app = useApp();
  const { message } = App.useApp();
  const months = reportMonths();
  const [params, setParams] = useSearchParams();
  const month = months.includes(params.get('month') ?? '') ? params.get('month')! : months[0];
  const costVersion = useCostVersion();
  const decisions = useLocalStore(decisionStore);
  const siteIds = app.selectedSiteIds;
  const { value: model, loading } = useAsync(() => buildReport(siteIds, month), `${siteIds}|${month}|${costVersion}|${JSON.stringify(decisions)}`);
  const [busy, setBusy] = useState(false);
  const exportLabel = terms.buttons.commands.find((b) => b === '내보내기')!;

  const exportPdf = async () => {
    if (!model) return;
    setBusy(true);
    try {
      const { buildPdf } = await import('../../report/pdf');
      const blob = await buildPdf(model);
      const scope = siteIds.length > 1 ? '전사' : app.siteName(siteIds[0]);
      const outcome = await saveFile(`경영보고서_${month}_${scope}.pdf`, blob);
      if (outcome === 'saved') message.success('PDF를 저장했습니다.');
      else if (outcome === 'declined') message.info('저장을 취소했습니다.');
      else message.warning('이 화면에서는 파일 저장을 쓸 수 없습니다. 로컬 실행 화면에서 내보내기를 이용하세요.');
    } catch (e) {
      message.error(`PDF를 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      period={
        <Select
          aria-label="보고 월"
          value={month}
          onChange={(v) =>
            setParams((p) => {
              const next = new URLSearchParams(p);
              next.set('month', v);
              return next;
            })
          }
          options={months.map((m) => ({ value: m, label: `${m.slice(0, 4)}년 ${Number(m.slice(5))}월${m === months[0] ? ' (현재까지)' : ''}` }))}
          popupMatchSelectWidth={false}
        />
      }
      primary={
        def.actions.includes('내보내기') && (
          <Button type="primary" icon={<FilePdfOutlined />} onClick={exportPdf} loading={busy} disabled={!model || loading} title="PDF로 내보내기">
            {exportLabel}
          </Button>
        )
      }
      bodyMode="fit"
    >
      <div className="p10">
        <Panel title="목차" caption={`${REPORT_PAGES}쪽 · A4`} className="p10__toc">
          <ol className="p10__toc-list">
            {def.report.contents.map((c, i) => (
              <li key={c}>
                <a href={`#rp-${PAGE_OF[i] ?? REPORT_PAGES}`} onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`rp-${PAGE_OF[i] ?? REPORT_PAGES}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}>
                  {c}
                </a>
              </li>
            ))}
          </ol>
          <p className="caption">화면과 PDF는 같은 계산 결과로 만듭니다. 금액은 {terms.badges.demoOnly} 가상 단가입니다.</p>
        </Panel>
        <div className="p10__preview" aria-busy={loading}>
          {model ? <ReportPreview m={model} /> : <Skeleton active />}
        </div>
      </div>
    </ScreenLayout>
  );
}
