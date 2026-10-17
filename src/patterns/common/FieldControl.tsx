import { Button, DatePicker, Input, InputNumber, Select, Switch, Upload } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { RefOption } from '../../data/registry';
import { fieldOptions } from './hooks';
import type { FieldDef } from './types';

interface FieldControlProps {
  field: FieldDef;
  value: unknown;
  onChange?: (v: unknown) => void;
  refOptions: Record<string, RefOption[]>;
  disabled?: boolean;
  id?: string;
}

const DATE = 'YYYY-MM-DD';

// One input per definition control. Used by condition areas and detail forms.
export function FieldControl({ field: f, value, onChange, refOptions, disabled, id }: FieldControlProps) {
  const options = fieldOptions(f, refOptions);
  const common = { id, disabled, 'aria-label': f.label } as const;
  switch (f.control) {
    case 'textarea':
      return <Input.TextArea {...common} autoSize={{ minRows: 2, maxRows: 5 }} value={(value as string) ?? ''} placeholder={f.placeholder} onChange={(e) => onChange?.(e.target.value)} />;
    case 'number':
      return (
        <InputNumber
          {...common}
          className="field-control--wide"
          value={(value as number) ?? null}
          // Range is checked by the form rules so an out-of-range value shows a message right away.
          step={f.step}
          suffix={f.unit || undefined}
          onChange={(v) => onChange?.(v)}
        />
      );
    case 'select':
      return <Select {...common} className="field-control--wide" allowClear={!f.required} showSearch optionFilterProp="label" value={(value as string) ?? undefined} options={options} placeholder={f.placeholder ?? '전체'} onChange={(v) => onChange?.(v ?? null)} />;
    case 'multiSelect':
      return <Select {...common} className="field-control--wide" mode="multiple" allowClear showSearch optionFilterProp="label" maxTagCount="responsive" value={(value as string[]) ?? []} options={options} placeholder={f.placeholder ?? '전체'} onChange={(v) => onChange?.(v)} />;
    case 'date':
      return <DatePicker {...common} className="field-control--wide" value={value ? dayjs(String(value)) : null} allowClear={!f.required} onChange={(d) => onChange?.(d ? d.format(DATE) : null)} />;
    case 'month':
      return <DatePicker {...common} className="field-control--wide" picker="month" value={value ? dayjs(`${value}-01`) : null} onChange={(d) => onChange?.(d ? d.format('YYYY-MM') : null)} />;
    case 'year':
      return <DatePicker {...common} className="field-control--wide" picker="year" value={value ? dayjs(`${value}-01-01`) : null} onChange={(d) => onChange?.(d ? d.year() : null)} />;
    case 'dateRange': {
      const v = Array.isArray(value) ? (value as string[]) : null;
      return (
        <DatePicker.RangePicker
          {...common}
          className="field-control--wide"
          value={v ? [dayjs(v[0]), dayjs(v[1])] : null}
          allowClear={false}
          onChange={(d) => d && d[0] && d[1] && onChange?.([d[0].format(DATE), d[1].format(DATE)])}
        />
      );
    }
    case 'switch':
      return <Switch {...common} checked={!!value} checkedChildren="사용" unCheckedChildren="미사용" onChange={(v) => onChange?.(v)} />;
    case 'file':
      // Only the file name is kept as evidence; nothing is uploaded (no server).
      return (
        <Upload
          maxCount={1}
          beforeUpload={(file) => {
            onChange?.(file.name);
            return false;
          }}
          onRemove={() => onChange?.(null)}
          fileList={value ? [{ uid: String(value), name: String(value), status: 'done' }] : []}
        >
          <Button icon={<PaperClipOutlined />} disabled={disabled}>
            파일 선택
          </Button>
        </Upload>
      );
    case 'readonly':
      return <Input {...common} value={value === null || value === undefined ? '' : String(value)} readOnly variant="filled" />;
    default:
      return <Input {...common} value={(value as string) ?? ''} placeholder={f.placeholder} onChange={(e) => onChange?.(e.target.value)} />;
  }
}
