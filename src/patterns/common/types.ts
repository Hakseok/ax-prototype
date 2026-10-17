// Screen definition shapes shared by the pattern templates.
// The JSON Schema is config/screen-definition.schema.json (docs/screen-definition.md).

export type Control = 'text' | 'textarea' | 'number' | 'select' | 'multiSelect' | 'date' | 'dateRange' | 'month' | 'year' | 'switch' | 'readonly' | 'file';
export type OptionsSpec = string | (string | { value: string; label: string })[];

export interface FieldDef {
  field: string;
  label: string;
  control: Control;
  options?: OptionsSpec;
  required?: boolean;
  readOnly?: boolean;
  readOnlyOnEdit?: boolean;
  /** Value shown from another field's reference, e.g. unit derived from energySource. */
  derivedFrom?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  /** Filter default: today, thisMonth, thisYear, last7days, last30days, or a literal. */
  default?: unknown;
  /** Filter folded under "상세 조건". */
  collapsed?: boolean;
  /** Input not specified yet (분석 엔진 규격 확정 전). */
  pending?: boolean;
  help?: string;
  /** Text search over these row fields (filter control "text"). */
  fields?: string[];
  /** Format of a readonly value. */
  format?: ColumnFormat;
  /** Must not be earlier than another field (dates, months). */
  notBefore?: string;
  /** Must not be later than now (dates, months). */
  notFuture?: boolean;
  /** Options filtered to the selected site in another field. */
  siteField?: string;
}

export type ColumnFormat = 'number' | 'percent' | 'signedPercent' | 'datetime' | 'date' | 'month' | 'boolean' | 'list';

export interface ColumnDef {
  field: string;
  label: string;
  width?: number;
  flex?: number;
  pinned?: boolean;
  align?: 'left' | 'right';
  format?: ColumnFormat;
  fractionDigits?: number;
  render?: 'status' | 'shareBar';
  /** For render "status": badge text from another field (e.g. 가동, 미수신) instead of the level name. */
  labelField?: string;
  /** Reference name for id -> label (sites, processes, users, energySources, ...). */
  ref?: string;
  /** Show only when the site selection is company ("company") or one site ("site"). */
  showWhen?: 'company' | 'site';
  sort?: 'asc' | 'desc';
  /** Summed in the total row. */
  total?: boolean;
  /** Long text wraps (row grows) instead of being cut. */
  wrap?: boolean;
}

export interface LinkDef {
  label: string;
  to: string;
  /** target param -> row field (or a literal starting with "="). */
  params?: Record<string, string>;
}

export interface RelatedDef {
  title: string;
  dataSource: string;
  /** Field of the related rows that must equal the selected record's id. Omit to show all rows. */
  by?: string;
  columns: ColumnDef[];
}

export interface P8Definition {
  id: string;
  pattern: 'P8';
  title: string;
  permission: { view: string; edit?: string };
  dataSource: string;
  badges?: string[];
  newIdPrefix?: string;
  master: {
    type: 'list' | 'tree';
    search?: { placeholder: string; fields: string[] };
    filters?: FieldDef[];
    columns?: ColumnDef[];
    tree?: { parentField: string; labelField: string };
  };
  detail: {
    titleField?: string;
    sections: { title: string; fields: FieldDef[] }[];
    related?: RelatedDef[];
    /** Factor screens: saving adds a version with an effective date instead of overwriting. */
    versioned?: { kind: string; valueField: string; validFromField: string };
  };
  actions: string[];
  links?: LinkDef[];
}

export interface P4Definition {
  id: string;
  pattern: 'P4';
  title: string;
  permission: { view: string; edit?: string };
  dataSource: string;
  badges?: string[];
  filters: FieldDef[];
  columns: ColumnDef[];
  summary?: { count?: boolean };
  actions: string[];
  rowLink?: LinkDef;
  links?: LinkDef[];
  note?: string;
}
