import { useMemo, type ReactNode } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type RowClassParams,
  type ValueFormatterParams
} from 'ag-grid-community';
import type { StatusLevel } from '../config';
import { useTheme } from '../theme/ThemeProvider';
import { cssVar } from '../theme/tokens';
import { StatusBadge } from './StatusBadge';
import { formatNumber } from './KpiCard';
import './DataGrid.css';

// Community modules only. Enterprise features (row grouping, pivot, Excel export,
// tree data, master/detail) are not allowed by the license rules.
ModuleRegistry.registerModules([AllCommunityModule]);

// Every theme parameter points at a CSS token, so theme and density
// switches restyle the grid without rebuilding it.
const gridTheme = themeQuartz.withParams({
  backgroundColor: cssVar('color-bg-surface'),
  foregroundColor: cssVar('color-text-primary'),
  textColor: cssVar('color-text-primary'),
  accentColor: cssVar('color-action'),
  borderColor: cssVar('color-border'),
  chromeBackgroundColor: cssVar('color-bg-subtle'),
  headerBackgroundColor: cssVar('color-bg-subtle'),
  headerTextColor: cssVar('color-text-secondary'),
  rowHoverColor: cssVar('color-bg-hover'),
  selectedRowBackgroundColor: cssVar('color-action-subtle'),
  fontFamily: cssVar('font-family-base'),
  fontSize: cssVar('font-size-body'),
  headerFontSize: cssVar('font-size-caption'),
  headerFontWeight: 600,
  rowHeight: cssVar('grid-row-h'),
  headerHeight: cssVar('grid-head-h'),
  cellHorizontalPadding: cssVar('space-md'),
  wrapperBorderRadius: cssVar('radius-control'),
  borderRadius: cssVar('radius-control'),
  wrapperBorder: true,
  columnBorder: false
});

export interface GridColumn {
  field: string;
  /** Header text. Put the unit in the header, e.g. "사용량 (kWh)". */
  label: string;
  width?: number;
  flex?: number;
  pinned?: boolean;
  align?: 'left' | 'right';
  format?: 'number' | 'percent' | 'signedPercent';
  fractionDigits?: number;
  render?: 'status';
  sort?: 'asc' | 'desc';
  /** Long text wraps and the row grows instead of cutting the text. */
  wrap?: boolean;
  /** Display text for a value; sorting still uses the raw value. */
  formatter?: (value: unknown, row: Record<string, unknown>) => string;
  /** Custom cell content. */
  renderer?: (value: unknown, row: Record<string, unknown>) => ReactNode;
}

interface DataGridProps<Row> {
  columns: GridColumn[];
  rows: Row[];
  /** Pinned total row, computed by the caller from the same rows. */
  totalRow?: Row;
  ariaLabel: string;
  /** auto: grow with rows. fill: take the parent's height and scroll inside. */
  height?: 'auto' | 'fill';
  onRowClick?: (row: Row) => void;
  selectedId?: string | null;
  emptyText?: string;
}

const formatSignedPercent = (v: number) => `${v >= 0 ? '+' : '−'}${formatNumber(Math.abs(v) * 100, 1)}%`;

const toColDef = (c: GridColumn): ColDef => {
  const numeric = c.align === 'right' || (c.format !== undefined && !c.formatter);
  const def: ColDef = {
    field: c.field,
    headerName: c.label,
    width: c.width,
    flex: c.flex ?? (c.width ? undefined : 1),
    minWidth: c.width ? undefined : 80,
    pinned: c.pinned ? 'left' : undefined,
    lockPinned: c.pinned,
    sortable: true,
    resizable: true,
    // Long headers ("비생산 시간 사용 비중 (%)") wrap instead of being cut.
    wrapHeaderText: true,
    autoHeaderHeight: true,
    sort: c.sort,
    wrapText: c.wrap,
    autoHeight: c.wrap,
    type: numeric ? 'rightAligned' : undefined,
    cellClass: numeric ? 'num' : undefined,
    tooltipValueGetter: (p) => (p.valueFormatted ?? (p.value == null ? '' : String(p.value))) || undefined
  };
  if (c.formatter) {
    const f = c.formatter;
    def.valueFormatter = (p: ValueFormatterParams) => (p.value == null ? '' : f(p.value, p.data ?? {}));
  } else if (c.format === 'number') {
    def.valueFormatter = (p: ValueFormatterParams) => (p.value == null ? '' : formatNumber(p.value, c.fractionDigits ?? 0));
  } else if (c.format === 'percent') {
    def.valueFormatter = (p: ValueFormatterParams) => (p.value == null ? '' : `${formatNumber(p.value * 100, 1)}%`);
  } else if (c.format === 'signedPercent') {
    def.valueFormatter = (p: ValueFormatterParams) => (p.value == null ? '' : formatSignedPercent(p.value));
  }
  if (c.render === 'status') {
    def.cellRenderer = (p: { value?: StatusLevel }) => (p.value ? <StatusBadge level={p.value} /> : null);
  } else if (c.renderer) {
    const r = c.renderer;
    def.cellRenderer = (p: { value?: unknown; data?: Record<string, unknown> }) => r(p.value, p.data ?? {});
  }
  return def;
};

const getRowClass = (p: RowClassParams) => (p.node.rowPinned === 'bottom' ? 'grid-total-row' : undefined);

export function DataGrid<Row extends object>({ columns, rows, totalRow, ariaLabel, height = 'auto', onRowClick, selectedId, emptyText }: DataGridProps<Row>) {
  const { density } = useTheme();
  const columnDefs = useMemo(() => columns.map(toColDef), [columns]);
  const pinnedBottom = useMemo(() => (totalRow ? [totalRow] : undefined), [totalRow]);
  const rowClassRules = useMemo(
    () => ({ 'grid-row--selected': (p: RowClassParams) => selectedId != null && (p.data as { id?: string } | undefined)?.id === selectedId }),
    [selectedId]
  );

  return (
    <div className={`data-grid data-grid--${height}${onRowClick ? ' data-grid--clickable' : ''}`} role="region" aria-label={ariaLabel}>
      <AgGridReact
        // Row height is measured once per grid, so remount when density changes.
        key={density}
        theme={gridTheme}
        columnDefs={columnDefs}
        rowData={rows}
        getRowId={(p) => String((p.data as { id?: unknown }).id ?? JSON.stringify(p.data))}
        pinnedBottomRowData={pinnedBottom}
        getRowClass={getRowClass}
        rowClassRules={rowClassRules}
        domLayout={height === 'auto' ? 'autoHeight' : 'normal'}
        // Field names such as "emission.total" are flat keys, not nested paths.
        suppressFieldDotNotation
        suppressCellFocus
        tooltipShowDelay={500}
        overlayNoRowsTemplate={`<span class="data-grid__empty">${emptyText ?? '표시할 행이 없습니다.'}</span>`}
        onRowClicked={(e) => {
          if (onRowClick && e.data && !e.node.rowPinned) onRowClick(e.data as Row);
        }}
      />
    </div>
  );
}
