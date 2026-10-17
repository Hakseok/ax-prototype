import { useEffect, useState } from 'react';
import { Button, Typography } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import type { RefOption } from '../../data/registry';
import { FieldControl } from './FieldControl';
import type { FilterValues } from './filters';
import type { FieldDef } from './types';
import './patterns.css';

interface FilterBarProps {
  filters: FieldDef[];
  values: FilterValues;
  refOptions: Record<string, RefOption[]>;
  onSubmit: (values: FilterValues) => void;
}

// Condition area: up to five conditions open, the rest folded under "상세 조건" (guide 6).
// 조회 is the screen's emphasized button for query screens (D-11).
export function FilterBar({ filters, values, refOptions, onSubmit }: FilterBarProps) {
  const [draft, setDraft] = useState<FilterValues>(values);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setDraft(values), [values]);
  const open = filters.filter((f) => !f.collapsed);
  const folded = filters.filter((f) => f.collapsed);
  const foldedActive = folded.filter((f) => {
    const v = values[f.field];
    return v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;

  const item = (f: FieldDef) => (
    <label key={f.field} className={`filter-bar__item filter-bar__item--${f.control}`}>
      <span className="filter-bar__label">
        {f.label}
        {f.required && <span className="filter-bar__required" aria-hidden="true"> *</span>}
      </span>
      <FieldControl field={f} value={draft[f.field]} refOptions={refOptions} onChange={(v) => setDraft((d) => ({ ...d, [f.field]: v as never }))} />
    </label>
  );

  return (
    <form
      className="filter-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
      }}
    >
      <div className="filter-bar__row">
        {open.map(item)}
        <span className="filter-bar__spacer" />
        {folded.length > 0 && (
          // A disclosure toggle, not an action button (D-11).
          <Typography.Link className="filter-bar__toggle" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
            상세 조건{foldedActive ? ` ${foldedActive}` : ''} {expanded ? <UpOutlined /> : <DownOutlined />}
          </Typography.Link>
        )}
        <Button type="primary" htmlType="submit">
          조회
        </Button>
      </div>
      {expanded && folded.length > 0 && <div className="filter-bar__row">{folded.map(item)}</div>}
    </form>
  );
}
