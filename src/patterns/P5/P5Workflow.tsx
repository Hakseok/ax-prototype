// P5 처리 목록형 (MNT-020, QUA-030): conditions, stage tabs with counts, the list, and the
// content panel of the selected record with its action for the current stage and the process log.
// The workflow kind (workOrder, claim) picks the content panel; columns and stages come from the definition.
import { useMemo } from 'react';
import { Alert as Notice, Button, Segmented, Tag } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { DataGrid } from '../../components/DataGrid';
import { Panel } from '../../components/Panel';
import { COMPANY, formatDate, NOW } from '../../data';
import { useApp } from '../../shell/AppContext';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { toGridColumns, visibleColumns } from '../common/columns';
import { FilterBar } from '../common/FilterBar';
import { applyFilters, toParams, useFilterState } from '../common/filters';
import { downloadCsv } from '../common/format';
import { useDataset, useRefs } from '../common/hooks';
import type { ColumnDef, FieldDef } from '../common/types';
import { ClaimPanel } from './ClaimPanel';
import { WorkOrderPanel } from './WorkOrderPanel';
import { NewWorkOrder } from './NewWorkOrder';
import '../common/patterns.css';
import './P5.css';

interface P5Definition {
  badges?: string[];
  dataSource: string;
  workflow: 'workOrder' | 'claim';
  filters: FieldDef[];
  list: { stageField: string; stages: string[]; openStages: string[]; columns: ColumnDef[] };
  content: { title: string };
  actions: string[];
}

const ALL = '전체';
const OPEN = '처리 대기';

export function P5Workflow({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P5Definition;
  const app = useApp();
  const [params, setParams] = useSearchParams();
  const isCompany = app.siteSelection === COMPANY;
  const { values, apply } = useFilterState(def.filters);
  const query = useMemo(() => toParams(def.filters, values), [def.filters, values]);
  const { rows, error, loading, dataset } = useDataset(def.dataSource, query);
  const columns = useMemo(() => visibleColumns(def.list.columns, isCompany), [def.list.columns, isCompany]);
  const { options, maps } = useRefs(def.filters, columns);
  const gridColumns = useMemo(() => toGridColumns(columns, maps), [columns, maps]);
  const filtered = useMemo(() => (rows ? applyFilters(rows, def.filters, values, dataset?.handles) : []), [rows, def.filters, values, dataset]);
  const stageOf = (r: Record<string, unknown>) => String(r[def.list.stageField]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of filtered) c.set(stageOf(r), (c.get(stageOf(r)) ?? 0) + 1);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);
  const openCount = def.list.openStages.reduce((a, s) => a + (counts.get(s) ?? 0), 0);
  const stage = params.get('stage') ?? (openCount ? OPEN : ALL);
  const shown = filtered.filter((r) => stage === ALL || (stage === OPEN ? def.list.openStages.includes(stageOf(r)) : stageOf(r) === stage));
  const selectedId = params.get('id');
  const creating = params.get('new') === '1';
  const canEdit = app.hasPermission(entry.edit ?? '편집');

  const set = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) (v === null ? n.delete(k) : n.set(k, v));
      return n;
    });

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      conditions={<FilterBar filters={def.filters} values={values} refOptions={options} onSubmit={apply} />}
      toolbar={
        <>
          <span className="toolbar__count">
            결과 <strong className="num">{loading ? '…' : filtered.length.toLocaleString('ko-KR')}</strong>건
          </span>
          {isCompany && (
            <Tag bordered={false} className="num">
              전사 {app.selectedSiteIds.length}개 사업장
            </Tag>
          )}
          <span className="toolbar__spacer" />
          {!canEdit && <span className="caption">조회 권한으로 열었습니다. 처리 버튼은 편집 권한에서 보입니다.</span>}
          {def.actions.includes('내보내기') && (
            <Button icon={<DownloadOutlined />} disabled={!shown.length} onClick={() => downloadCsv(`${entry.id}_${entry.name}_${formatDate(NOW)}.csv`, columns, shown, maps)}>
              내보내기
            </Button>
          )}
          {def.actions.includes('신규') && canEdit && def.workflow === 'workOrder' && (
            <Button icon={<PlusOutlined />} onClick={() => set({ new: '1', id: null, eq: null, ai: null })}>
              신규
            </Button>
          )}
        </>
      }
      bodyMode="fit"
    >
      {error ? (
        <Notice type="error" showIcon message="데이터를 불러오지 못했습니다." description={error} />
      ) : (
        <div className="p5">
          <Panel className="p5__list">
            <Segmented
              // The selection mark lags when the value and the counts change together; remount instead.
              key={`${stage}|${filtered.length}|${openCount}`}
              value={stage}
              onChange={(v) => set({ stage: String(v) })}
              options={[OPEN, ...def.list.stages, ALL].map((s) => ({
                value: s,
                label: `${s} ${s === ALL ? filtered.length : s === OPEN ? openCount : counts.get(s) ?? 0}`
              }))}
            />
            <DataGrid
              ariaLabel={`${entry.name} 목록`}
              columns={gridColumns}
              rows={shown}
              height="fill"
              selectedId={selectedId}
              onRowClick={(r) => set({ id: String((r as { id: string }).id), new: null })}
              emptyText={stage === OPEN ? '처리할 건이 없습니다. 기간을 넓히거나 다른 단계를 고르세요.' : '조건에 맞는 건이 없습니다.'}
            />
          </Panel>
          <div className="p5__content">
            {creating && def.workflow === 'workOrder' ? (
              <NewWorkOrder onDone={(id) => set({ new: null, id, stage: '요청', eq: null, ai: null })} onCancel={() => set({ new: null, eq: null, ai: null })} />
            ) : selectedId ? (
              def.workflow === 'workOrder' ? (
                <WorkOrderPanel id={selectedId} canEdit={canEdit} />
              ) : (
                <ClaimPanel id={selectedId} canEdit={canEdit} />
              )
            ) : (
              <Panel title={def.content.title} className="p5__empty">
                <p className="caption">왼쪽 목록에서 건을 고르세요. 단계별 처리 버튼과 처리 기록이 여기에 보입니다.</p>
              </Panel>
            )}
          </div>
        </div>
      )}
    </ScreenLayout>
  );
}
