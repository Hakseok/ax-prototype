import { useMemo } from 'react';
import { Alert as Notice, Button, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DataGrid } from '../../components/DataGrid';
import { COMPANY, formatDate, NOW } from '../../data';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { toGridColumns, totalRowOf, visibleColumns } from '../common/columns';
import { FilterBar } from '../common/FilterBar';
import { applyFilters, toParams, useFilterState } from '../common/filters';
import { downloadCsv } from '../common/format';
import { useDataset, useRefs } from '../common/hooks';
import { linkParams } from '../common/links';
import type { P4Definition } from '../common/types';
import '../common/patterns.css';

// P4 조회형: conditions, toolbar (count, export), grid with pinned first column and total row.
export function P4Query({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P4Definition;
  const app = useApp();
  const navigate = useNavigate();
  const link = useShellLink();
  const isCompany = app.siteSelection === COMPANY;
  const { values, apply } = useFilterState(def.filters);
  const params = useMemo(() => toParams(def.filters, values), [def.filters, values]);
  const { rows, error, loading, dataset } = useDataset(def.dataSource, params);
  const columns = useMemo(() => visibleColumns(def.columns, isCompany), [def.columns, isCompany]);
  const { options, maps } = useRefs(def.filters, columns);

  const filtered = useMemo(() => (rows ? applyFilters(rows, def.filters, values, dataset?.handles) : []), [rows, def.filters, values, dataset]);
  const total = useMemo(() => totalRowOf(columns, filtered), [columns, filtered]);
  const gridColumns = useMemo(() => toGridColumns(columns, maps), [columns, maps]);
  const canExport = def.actions.includes('내보내기');

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
          {def.note && <span className="caption">{def.note}</span>}
          <span className="toolbar__spacer" />
          {canExport && (
            <Button
              icon={<DownloadOutlined />}
              title="CSV 파일로 내려받습니다"
              disabled={!filtered.length}
              onClick={() => downloadCsv(`${entry.id}_${entry.name}_${formatDate(NOW)}.csv`, columns, filtered, maps, total)}
            >
              내보내기
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <Notice type="error" showIcon message="데이터를 불러오지 못했습니다." description={error} />
      ) : (
        <DataGrid
          ariaLabel={entry.name}
          height="fill"
          columns={gridColumns}
          rows={filtered}
          totalRow={total}
          emptyText="조건에 맞는 결과가 없습니다. 기간을 넓히거나 조건을 줄여 다시 조회하세요."
          onRowClick={def.rowLink ? (r) => navigate(link(def.rowLink!.to, linkParams(def.rowLink!, r))) : undefined}
        />
      )}
    </ScreenLayout>
  );
}
