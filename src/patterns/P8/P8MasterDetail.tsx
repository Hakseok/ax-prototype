import { useEffect, useMemo, useState } from 'react';
import { App, Alert as Notice, Button, Empty, Form, Input, Tag, Tree } from 'antd';
import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { DataGrid } from '../../components/DataGrid';
import { Panel } from '../../components/Panel';
import { terms } from '../../config';
import { COMPANY } from '../../data';
import { addVersion } from '../../data/versions';
import { deleteRecord, saveRecord, type Row } from '../../data/records';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { toGridColumns, visibleColumns } from '../common/columns';
import { FieldControl } from '../common/FieldControl';
import { formatValue } from '../common/format';
import { useDataset, useRefs } from '../common/hooks';
import { linkParams } from '../common/links';
import type { FieldDef, P8Definition, RelatedDef } from '../common/types';
import { useUnsavedGuard } from '../common/useUnsavedGuard';
import '../common/patterns.css';
import './P8.css';

const NEW = '__new__';

// P8 마스터-디테일형: list or tree on the left, the selected record's sections and related lists on the right.
export function P8MasterDetail({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P8Definition;
  const app = useApp();
  const { message, modal } = App.useApp();
  const link = useShellLink();
  const [params, setParams] = useSearchParams();
  const [form] = Form.useForm();
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [masterFilters, setMasterFilters] = useState<Record<string, unknown>>({});
  const guard = useUnsavedGuard(dirty);

  const isCompany = app.siteSelection === COMPANY;
  const canEdit = app.hasPermission((def.permission.edit ?? '관리') as '조회' | '편집' | '관리');
  const allFields = useMemo(() => def.detail.sections.flatMap((s) => s.fields), [def]);
  const masterColumns = useMemo(() => visibleColumns(def.master.columns ?? [], isCompany), [def, isCompany]);
  const relatedColumns = useMemo(() => (def.detail.related ?? []).flatMap((r) => r.columns), [def]);
  const { options, maps } = useRefs([...allFields, ...(def.master.filters ?? [])], [...masterColumns, ...relatedColumns]);
  const { rows, error } = useDataset(def.dataSource, {});

  // ---- master rows ----
  const listRows = useMemo(() => {
    let out = rows ?? [];
    const q = search.trim().toLowerCase();
    if (q && def.master.search) out = out.filter((r) => def.master.search!.fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
    for (const [field, v] of Object.entries(masterFilters)) {
      if (v === null || v === undefined || v === '') continue;
      out = out.filter((r) => (Array.isArray(r[field]) ? (r[field] as unknown[]).map(String).includes(String(v)) : String(r[field]) === String(v)));
    }
    return out;
  }, [rows, search, masterFilters, def.master.search]);

  const selectedId = params.get('id') ?? (listRows[0]?.id ?? null);
  const isNew = selectedId === NEW;
  const selected = useMemo(() => (isNew ? null : (rows ?? []).find((r) => r.id === selectedId) ?? null), [rows, selectedId, isNew]);

  const select = (id: string | null) =>
    guard(() => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        if (id) next.set('id', id);
        else next.delete('id');
        return next;
      });
    });

  // ---- form values follow the selection ----
  const versioned = def.detail.versioned;
  useEffect(() => {
    if (isNew) {
      const defaults: Record<string, unknown> = {};
      for (const f of allFields) {
        if (f.default !== undefined) defaults[f.field] = f.default;
        if (f.field === 'siteId' && !isCompany) defaults.siteId = app.siteSelection;
        if (f.control === 'switch' && defaults[f.field] === undefined) defaults[f.field] = true;
      }
      form.resetFields();
      form.setFieldsValue(defaults);
    } else if (selected) {
      form.resetFields();
      form.setFieldsValue(versioned ? { ...selected, [versioned.validFromField]: null } : selected);
    }
    setDirty(false);
  }, [selected, isNew, form, allFields, isCompany, app.siteSelection, versioned]);

  // ---- actions ----
  const labels = Object.fromEntries(allFields.map((f) => [f.field, f.label]));
  const titleField = def.detail.titleField ?? 'name';
  // Title shows the reference label when the title field is a code (e.g. siteId -> 여수공장).
  const titleRef = allFields.find((f) => f.field === titleField && typeof f.options === 'string')?.options as string | undefined;
  const recordName = (r: Record<string, unknown> | null) => {
    const raw = r?.[titleField] ?? r?.id ?? '';
    const label = titleRef ? maps[titleRef]?.get(String(raw)) : undefined;
    if (!label) return String(raw);
    return label;
  };
  const ctxFor = (r: Record<string, unknown> | null) => ({ dataset: def.dataSource, screenId: entry.id, userId: app.user.id, labels, name: recordName(r) });

  const onSave = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      message.error('필수 항목과 입력 형식을 확인하세요.');
      return;
    }
    if (versioned && selected) {
      addVersion(versioned.kind, String(selected.id), {
        validFrom: String(values[versioned.validFromField]),
        value: Number(values[versioned.valueField]),
        userId: app.user.id,
        note: String(values.note ?? '')
      });
      message.success(`${values[versioned.validFromField]}부터 적용되는 값을 저장했습니다.`);
      setDirty(false);
      form.setFieldValue(versioned.validFromField, null);
      return;
    }
    const id = isNew ? String(values.id ?? '').trim() || nextId(def, rows ?? []) : String(selected!.id);
    if (isNew && (rows ?? []).some((r) => r.id === id)) {
      message.error(`이미 있는 번호입니다: ${id}`);
      return;
    }
    const record = { ...(selected ?? {}), ...values, id } as Row;
    const changed = saveRecord(ctxFor(record), isNew ? null : selected, record);
    setDirty(false);
    message.success(isNew ? '새 항목을 저장했습니다.' : changed.length ? `저장했습니다 (${changed.map((f) => labels[f] ?? f).join(', ')}).` : '바뀐 내용이 없습니다.');
    if (isNew) setParams((p) => new URLSearchParams({ ...Object.fromEntries(p), id }));
  };

  const onDelete = () => {
    if (!selected) return;
    modal.confirm({
      title: '삭제할까요?',
      content: `${recordName(selected)}을(를) 삭제합니다. 변경 이력에 남습니다.`,
      okText: '확인',
      cancelText: '취소',
      onOk: () => {
        deleteRecord(ctxFor(selected), selected);
        setDirty(false);
        setParams((p) => {
          const next = new URLSearchParams(p);
          next.delete('id');
          return next;
        });
        message.success('삭제했습니다.');
      }
    });
  };

  const showNew = canEdit && def.actions.includes('신규') && !versioned;
  const showDelete = canEdit && def.actions.includes('삭제') && !versioned && selected;
  const showSave = canEdit && def.actions.includes('저장');

  // ---- render ----
  const masterGrid = useMemo(() => toGridColumns(masterColumns, maps), [masterColumns, maps]);
  const derived = (f: FieldDef, values: Record<string, unknown>) => (f.derivedFrom ? String(values[f.derivedFrom] ?? '') : undefined);

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      secondary={
        showNew && (
          <Button icon={<PlusOutlined />} onClick={() => select(NEW)}>
            신규
          </Button>
        )
      }
      primary={
        showSave && (
          <Button type="primary" onClick={onSave} disabled={!dirty && !isNew}>
            저장
          </Button>
        )
      }
      toolbar={
        <>
          {showDelete && (
            <Button icon={<DeleteOutlined />} onClick={onDelete}>
              삭제
            </Button>
          )}
          <span className="toolbar__count">
            <strong className="num">{listRows.length.toLocaleString('ko-KR')}</strong>건
            {rows && listRows.length !== rows.length && <span className="caption"> / 전체 {rows.length.toLocaleString('ko-KR')}건</span>}
          </span>
          {isCompany && <Tag bordered={false}>전사 {app.selectedSiteIds.length}개 사업장</Tag>}
          {!canEdit && <span className="caption">조회 권한으로 열었습니다. 편집 버튼은 표시하지 않습니다.</span>}
          <span className="toolbar__spacer" />
          {(def.links ?? []).map((l) => (
            <Link key={l.label} className="p8__link" to={link(l.to, linkParams(l, selected))}>
              {l.label}
            </Link>
          ))}
        </>
      }
      bodyMode="fit"
    >
      {error && <Notice type="error" showIcon message="데이터를 불러오지 못했습니다." description={error} />}
      <div className="p8">
        <Panel className="p8__master">
          <div className="p8__master-tools">
            {def.master.search && (
              <Input allowClear prefix={<SearchOutlined />} placeholder={def.master.search.placeholder} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="목록 검색" />
            )}
            {(def.master.filters ?? []).map((f) => (
              <FieldControl key={f.field} field={{ ...f, placeholder: f.placeholder ?? `${f.label} 전체` }} value={masterFilters[f.field] ?? null} refOptions={options} onChange={(v) => setMasterFilters((m) => ({ ...m, [f.field]: v }))} />
            ))}
          </div>
          {def.master.type === 'tree' ? (
            <MasterTree def={def} rows={listRows} selectedId={selectedId} onSelect={select} />
          ) : (
            <DataGrid ariaLabel={`${entry.name} 목록`} height="fill" columns={masterGrid} rows={listRows} selectedId={selectedId} onRowClick={(r) => select(String(r.id))} emptyText="검색 조건에 맞는 항목이 없습니다. 검색어를 지우고 다시 찾으세요." />
          )}
        </Panel>

        <Panel className="p8__detail" title={isNew ? '새 항목' : selected ? recordName(selected) : '항목을 선택하세요'} caption={selected && !isNew ? <span className="num">{String(selected.id)}</span> : undefined}>
          {!selected && !isNew ? (
            <Empty description="왼쪽 목록에서 항목을 고르면 상세 내용이 여기에 나옵니다." />
          ) : (
            <div className="p8__detail-body">
              <Form form={form} layout="vertical" requiredMark disabled={!canEdit} onValuesChange={() => setDirty(true)} className="p8__form">
                {def.detail.sections.map((s) => (
                  <section key={s.title} className="p8__section">
                    <h3 className="p8__section-title">{s.title}</h3>
                    <div className="p8__fields">
                      {s.fields.map((f) => (
                        <FieldItem key={f.field} f={f} isNew={isNew} options={options} maps={maps} derived={derived} versioned={!!versioned} currentValidFrom={String(selected?.validFrom ?? '')} />
                      ))}
                    </div>
                  </section>
                ))}
              </Form>
              {!isNew && selected && (def.detail.related ?? []).map((r) => <RelatedList key={r.title} def={r} selected={selected} maps={maps} />)}
            </div>
          )}
        </Panel>
      </div>
    </ScreenLayout>
  );
}

function FieldItem({ f, isNew, options, maps, derived, versioned, currentValidFrom }: {
  f: FieldDef; isNew: boolean; options: Record<string, { value: string; label: string }[]>; maps: Record<string, Map<string, string>>;
  derived: (f: FieldDef, values: Record<string, unknown>) => string | undefined; versioned: boolean; currentValidFrom: string;
}) {
  const readOnly = f.readOnly || f.control === 'readonly' || (f.readOnlyOnEdit && !isNew) || !!f.derivedFrom;
  const label = (
    <span>
      {f.label}
      {f.pending && (
        <Tag className="pending-tag" bordered>
          {terms.badges.specPending}
        </Tag>
      )}
    </span>
  );
  const rules = [
    ...(f.required ? [{ required: true, message: `${f.label}을(를) 입력하세요.` }] : []),
    ...(f.control === 'number' && (f.min !== undefined || f.max !== undefined)
      ? [{ type: 'number' as const, min: f.min, max: f.max, message: `${f.min ?? ''} ~ ${f.max ?? ''} 사이 값을 입력하세요.` }]
      : []),
    ...(versioned && f.field === 'validFrom'
      ? [{
          validator: (_: unknown, v: string | null) =>
            !v || v > currentValidFrom ? Promise.resolve() : Promise.reject(new Error(`현재 적용 시작일(${currentValidFrom})보다 뒤여야 합니다.`))
        }]
      : [])
  ];
  if (readOnly) {
    return (
      <Form.Item label={label} shouldUpdate>
        {({ getFieldsValue }) => {
          const values = getFieldsValue(true);
          const v = f.derivedFrom ? derived(f, values) : values[f.field];
          return <Input readOnly variant="filled" value={formatValue(v, { format: f.format, ref: typeof f.options === 'string' ? f.options : undefined }, maps)} />;
        }}
      </Form.Item>
    );
  }
  return (
    <Form.Item label={label} name={f.field} rules={rules} validateTrigger="onChange" extra={f.help} className={f.control === 'textarea' ? 'p8__field--wide' : undefined}>
      <BoundControl field={f} options={options} />
    </Form.Item>
  );
}

// antd Form passes value/onChange to its direct child.
function BoundControl({ field, options, value, onChange, id }: { field: FieldDef; options: Record<string, { value: string; label: string }[]>; value?: unknown; onChange?: (v: unknown) => void; id?: string }) {
  return <FieldControl field={field} value={value} onChange={onChange} refOptions={options} id={id} />;
}

function MasterTree({ def, rows, selectedId, onSelect }: { def: P8Definition; rows: Row[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { parentField, labelField } = def.master.tree!;
  const treeData = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    type Node = { key: string; title: string; children: Node[] };
    const byParent = new Map<string, Node[]>();
    const nodes = new Map<string, Node>();
    for (const r of rows) nodes.set(r.id, { key: r.id, title: String(r[labelField] ?? r.id), children: [] });
    for (const r of [...rows].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))) {
      const p = r[parentField] && ids.has(String(r[parentField])) ? String(r[parentField]) : '';
      byParent.set(p, [...(byParent.get(p) ?? []), nodes.get(r.id)!]);
    }
    for (const [p, children] of byParent) if (p) nodes.get(p)!.children = children;
    return byParent.get('') ?? [];
  }, [rows, parentField, labelField]);
  const expanded = useMemo(() => rows.filter((r) => !r[parentField]).map((r) => r.id), [rows, parentField]);
  return (
    <div className="p8__tree">
      {/* Remount when the roots change so the top level opens once the rows have loaded. */}
      <Tree key={expanded.join(',')} treeData={treeData} defaultExpandedKeys={expanded} selectedKeys={selectedId ? [selectedId] : []} onSelect={(keys) => keys[0] && onSelect(String(keys[0]))} blockNode />
    </div>
  );
}

function RelatedList({ def, selected, maps }: { def: RelatedDef; selected: Row; maps: Record<string, Map<string, string>> }) {
  const { rows } = useDataset(def.dataSource, {});
  const columns = useMemo(() => toGridColumns(def.columns, maps), [def.columns, maps]);
  const filtered = useMemo(() => (rows ?? []).filter((r) => !def.by || String(r[def.by]) === String(selected.id)), [rows, def.by, selected.id]);
  return (
    <section className="p8__related">
      <h3 className="p8__section-title">
        {def.title} <span className="caption num">{filtered.length}건</span>
      </h3>
      <DataGrid ariaLabel={def.title} columns={columns} rows={filtered.slice(0, 200)} emptyText="기록이 없습니다." />
      {filtered.length > 200 && <span className="caption">앞의 200건만 표시합니다.</span>}
    </section>
  );
}

function nextId(def: P8Definition, rows: Row[]): string {
  const prefix = def.newIdPrefix ?? def.id;
  let n = rows.length + 1;
  while (rows.some((r) => r.id === `${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}
