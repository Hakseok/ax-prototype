// New maintenance request (MNT-020 신규). Opened from an AI result (?eq=&ai=) it is pre-filled
// with the equipment, failure mode and the result id (D-02: 정비 요청 is a link, not a button).
import { useEffect, useState } from 'react';
import { App, Button, Input, Select, Skeleton } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { decide, health } from '../../data/aiEngine';
import { loadEquipment } from '../../data/loaders';
import type { WorkOrder } from '../../data/types';
import { workOrderActions } from '../../data/workflows';
import { useApp } from '../../shell/AppContext';
import { useAsync } from '../common/useAsync';

export function NewWorkOrder({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const app = useApp();
  const { message } = App.useApp();
  const [params] = useSearchParams();
  const eqParam = params.get('eq');
  const aiParam = params.get('ai');
  const { value: eqs } = useAsync(async () => (await loadEquipment()).filter((e) => app.selectedSiteIds.includes(e.siteId)), `${app.selectedSiteIds}`);
  const [eqId, setEqId] = useState<string | null>(eqParam);
  const [type, setType] = useState<WorkOrder['type']>(aiParam ? '예지' : '사후');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('');
  const [note, setNote] = useState('');
  const { value: h } = useAsync(() => (eqId ? health(eqId) : Promise.resolve(null)), `${eqId}`);

  // Pre-fill from the AI result of the equipment.
  useEffect(() => {
    const eq = eqs?.find((e) => e.id === eqId);
    if (!eq) return;
    const fm = h && h.payload.failureMode !== '정상 범위' ? h.payload.failureMode : '';
    setMode(fm);
    setTitle(`${eq.name} ${fm ? `${fm} ` : ''}${type} 정비`);
    if (aiParam && h) setNote(`AI 결과 ${h.id} 채택 · ${h.conclusion}`);
  }, [eqs, eqId, h, type, aiParam]);

  if (!eqs) return <Skeleton active />;
  const eq = eqs.find((e) => e.id === eqId);
  const save = () => {
    if (!eq) return;
    if (aiParam && h && h.id === aiParam && !h.decision) decide(h.id, '채택', '정비 요청', app.user.id);
    const id = workOrderActions.request({ siteId: eq.siteId, lineId: eq.lineId, equipmentId: eq.id, type, title: title.trim(), failureMode: mode.trim() || null, aiResultId: aiParam }, app.user.id, note.trim());
    message.success(`${id} 정비 요청을 저장했습니다. 승인 대기 단계입니다.`);
    onDone(id);
  };
  return (
    <Panel title="정비 요청 (신규)" caption="* 필수" className="p5__detail">
      <div className="p5__detail-body">
        <div className="p5__form">
          <label>
            <span className="filter-bar__label">설비 *</span>
            <Select
              showSearch
              optionFilterProp="label"
              value={eqId ?? undefined}
              onChange={setEqId}
              placeholder="설비를 고르세요"
              options={eqs.map((e) => ({ value: e.id, label: `${e.id} ${e.name}` }))}
              aria-label="설비"
            />
          </label>
          <label>
            <span className="filter-bar__label">유형 *</span>
            <Select value={type} onChange={setType} options={(['예지', '예방', '사후'] as const).map((t) => ({ value: t, label: t }))} aria-label="유형" />
          </label>
          <label className="p5__form-wide">
            <span className="filter-bar__label">제목 *</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="제목" />
          </label>
          <label>
            <span className="filter-bar__label">고장 유형</span>
            <Input value={mode} onChange={(e) => setMode(e.target.value)} aria-label="고장 유형" />
          </label>
          <label className="p5__form-wide">
            <span className="filter-bar__label">요청 메모</span>
            <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="요청 메모" />
          </label>
        </div>
        {eqParam && !eqs.some((e) => e.id === eqParam) && <p className="caption">{eqParam}는 지금 사업장 선택(또는 권한) 밖의 설비입니다. 사업장을 바꾸거나 다른 설비를 고르세요.</p>}
        {aiParam && <p className="caption">AI 결과에서 연 요청입니다. 저장하면 그 결과를 채택한 것으로 기록합니다(판정 이력 AIX-020).</p>}
        <div className="p5__buttons">
          <Button onClick={onCancel}>취소</Button>
          <span className="p5__spacer" />
          <Button type="primary" disabled={!eq || !title.trim()} onClick={save}>
            저장
          </Button>
        </div>
      </div>
    </Panel>
  );
}
