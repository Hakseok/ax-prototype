import { useEffect, useMemo, useState } from 'react';
import { App, Alert as Notice, Button, Empty, Form, Skeleton, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { DataGrid } from '../../components/DataGrid';
import { Panel } from '../../components/Panel';
import { terms } from '../../config';
import { COMPANY } from '../../data';
import { saveRecord, type Row } from '../../data/records';
import { datasets } from '../../data/registry';
import { NOW, formatDate } from '../../data/time';
import { useApp } from '../../shell/AppContext';
import { useShellLink } from '../../shell/links';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';
import { useTheme } from '../../theme/ThemeProvider';
import { toGridColumns, visibleColumns } from '../common/columns';
import { FieldControl } from '../common/FieldControl';
import { useDataset, useRefs } from '../common/hooks';
import { linkParams } from '../common/links';
import type { ColumnDef, FieldDef, LinkDef } from '../common/types';
import { useUnsavedGuard } from '../common/useUnsavedGuard';
import '../common/patterns.css';
import './P6.css';

interface P6Definition {
  id: string;
  title: string;
  permission: { view: string; edit?: string };
  dataSource: string;
  /** append: each save adds a record. settings: one record is edited in place. */
  mode: 'append' | 'settings';
  newIdPrefix?: string;
  badges?: string[];
  note?: string;
  sections: { title: string; fields: FieldDef[] }[];
  /** Records already entered, shown under the form (append mode). */
  recent?: { title: string; columns: ColumnDef[] };
  /** Settings that take effect right away (COM-030): field -> theme | density | site. */
  apply?: Record<string, 'theme' | 'density' | 'site'>;
  actions: string[];
  links?: LinkDef[];
}

const TODAY = formatDate(NOW);

// P6 등록·편집형: sections of fields, required marks, immediate validation,
// save and cancel fixed at the bottom, and a warning before leaving with unsaved edits.
export function P6Form({ entry, def: rawDef, badges }: TemplateProps) {
  const def = rawDef as unknown as P6Definition;
  const app = useApp();
  const theme = useTheme();
  const { message, modal } = App.useApp();
  const link = useShellLink();
  const [form] = Form.useForm();
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty);
  const fields = useMemo(() => def.sections.flatMap((s) => s.fields), [def]);
  const recentColumns = useMemo(() => visibleColumns(def.recent?.columns ?? [], app.siteSelection === COMPANY), [def, app.siteSelection]);
  const { options, maps } = useRefs(fields, recentColumns);
  const { rows, error } = useDataset(def.dataSource, {});
  const canEdit = app.hasPermission((def.permission.edit ?? '편집') as '편집');
  const labels = Object.fromEntries(fields.map((f) => [f.field, f.label]));

  const initial = useMemo<Record<string, unknown> | null>(() => {
    if (def.mode === 'settings') return rows?.[0] ?? null;
    const v: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.default === 'today') v[f.field] = f.control === 'month' ? TODAY.slice(0, 7) : TODAY;
      else if (f.default !== undefined) v[f.field] = f.default;
      if (f.field === 'siteId' && app.siteSelection !== COMPANY) v.siteId = app.siteSelection;
      if (f.field === 'ownerId') v.ownerId = app.user.id;
    }
    return v;
  }, [def.mode, rows, fields, app.siteSelection, app.user.id]);

  const reset = () => {
    form.resetFields();
    if (initial) form.setFieldsValue(initial);
    setDirty(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [initial]);

  const save = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      message.error('필수 항목과 입력 형식을 확인하세요.');
      return;
    }
    const ds = datasets[def.dataSource];
    if (def.mode === 'settings') {
      const before = rows![0];
      const record = { ...before, ...values } as Row;
      const changed = saveRecord({ dataset: def.dataSource, screenId: entry.id, userId: app.user.id, labels, name: entry.name }, before, record);
      for (const [field, target] of Object.entries(def.apply ?? {})) {
        const v = String(values[field]);
        if (target === 'theme') theme.setMode(v as 'light' | 'dark');
        if (target === 'density') theme.setDensity(v as 'compact' | 'standard');
        if (target === 'site' && changed.includes(field)) app.setSiteSelection(v);
      }
      message.success(changed.length ? `저장했습니다 (${changed.map((f) => labels[f] ?? f).join(', ')}).` : '바뀐 내용이 없습니다.');
      setDirty(false);
      return;
    }
    const prefix = def.newIdPrefix ?? def.id;
    // Number against every site's records, not just the selected site's, so ids never collide.
    const all = ds ? await ds.load({ siteIds: app.sites.map((s) => s.id), params: {}, user: app.user }) : rows ?? [];
    const existing = new Set(all.map((r) => r.id));
    let n = all.length + 1;
    while (existing.has(`${prefix}-${String(n).padStart(3, '0')}`)) n++;
    let record = { ...values, id: `${prefix}-${String(n).padStart(3, '0')}` } as Row;
    if (ds?.prepare) record = await ds.prepare(record);
    saveRecord({ dataset: def.dataSource, screenId: entry.id, userId: app.user.id, labels, name: String(record.title ?? record.id) }, null, record);
    message.success(`저장했습니다 (${record.id}).`);
    reset();
  };

  const cancelLabel = terms.buttons.auxiliary.find((b) => b.label === '취소')!.label;
  const cancel = () => {
    if (!dirty) return;
    modal.confirm({ title: '입력을 취소할까요?', content: '저장하지 않은 내용이 사라집니다.', okText: '확인', cancelText: cancelLabel, onOk: reset });
  };

  return (
    <ScreenLayout
      entry={entry}
      badges={[...badges, ...(def.badges ?? [])]}
      toolbar={
        (def.note || def.links?.length || !canEdit) && (
          <>
            {def.note && <span className="caption">{def.note}</span>}
            {!canEdit && <span className="caption">조회 권한으로 열었습니다. 입력과 저장은 할 수 없습니다.</span>}
            <span className="toolbar__spacer" />
            {(def.links ?? []).map((l) => (
              <Link key={l.label} className="p6__link" to={link(l.to, linkParams(l, null))}>
                {l.label}
              </Link>
            ))}
          </>
        )
      }
      bodyMode="fit"
    >
      <div className="p6">
        <div className="p6__scroll">
          {error && <Notice type="error" showIcon message="데이터를 불러오지 못했습니다." description={error} />}
          {!initial ? (
            def.mode === 'settings' && rows && !rows.length ? <Empty description="설정 항목이 없습니다." /> : <Skeleton active />
          ) : (
            <Form form={form} layout="vertical" requiredMark disabled={!canEdit} onValuesChange={() => setDirty(true)} className="p6__form">
              {def.sections.map((s) => (
                <Panel key={s.title} title={s.title}>
                  <div className="p6__fields">
                    {s.fields.map((f) => (
                      <P6Field key={f.field} f={f} options={options} />
                    ))}
                  </div>
                </Panel>
              ))}
            </Form>
          )}
          {def.recent && (
            <Panel title={def.recent.title} caption={`${rows?.length ?? 0}건`}>
              <DataGrid ariaLabel={def.recent.title} columns={toGridColumns(recentColumns, maps)} rows={(rows ?? []).slice(0, 50)} emptyText="아직 입력한 기록이 없습니다." />
            </Panel>
          )}
        </div>
        {canEdit && (
          <footer className="p6__footer">
            {dirty && <span className="caption">저장하지 않은 변경이 있습니다.</span>}
            <span className="toolbar__spacer" />
            <Button onClick={cancel} disabled={!dirty}>
              {cancelLabel}
            </Button>
            <Button type="primary" onClick={save} disabled={!dirty}>
              저장
            </Button>
          </footer>
        )}
      </div>
    </ScreenLayout>
  );
}

function P6Field({ f, options }: { f: FieldDef; options: Record<string, { value: string; label: string }[]> }) {
  const rules: object[] = [];
  if (f.required) rules.push({ required: true, message: `${f.label}을(를) 입력하세요.` });
  if (f.control === 'number' && (f.min !== undefined || f.max !== undefined)) {
    rules.push({ type: 'number', min: f.min, max: f.max, message: `${f.min ?? ''} ~ ${f.max ?? ''} 사이 값을 입력하세요.` });
  }
  if (f.notFuture) rules.push({ validator: (_: unknown, v: string | null) => (!v || v <= TODAY.slice(0, v.length) ? Promise.resolve() : Promise.reject(new Error('미래 날짜는 입력할 수 없습니다.'))) });
  if (f.notBefore) {
    rules.push(({ getFieldValue }: { getFieldValue: (n: string) => unknown }) => ({
      validator: (_: unknown, v: string | null) => {
        const other = getFieldValue(f.notBefore!) as string | null;
        return !v || !other || v >= other ? Promise.resolve() : Promise.reject(new Error('시작일보다 빠를 수 없습니다.'));
      }
    }));
  }
  const readOnly = f.readOnly || f.control === 'readonly';
  return (
    <Form.Item
      name={f.field}
      label={
        <span>
          {f.label}
          {f.pending && <Tag className="pending-tag">{terms.badges.specPending}</Tag>}
        </span>
      }
      rules={readOnly ? [] : rules}
      validateTrigger="onChange"
      dependencies={f.notBefore ? [f.notBefore] : undefined}
      extra={f.help}
      className={f.control === 'textarea' ? 'p6__field--wide' : undefined}
    >
      <Bound f={f} options={options} />
    </Form.Item>
  );
}

function Bound({ f, options, value, onChange, id }: { f: FieldDef; options: Record<string, { value: string; label: string }[]>; value?: unknown; onChange?: (v: unknown) => void; id?: string }) {
  return <FieldControl field={f} value={value} onChange={onChange} refOptions={options} id={id} />;
}

