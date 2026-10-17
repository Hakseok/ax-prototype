import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Segmented, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { Chart } from '../components/Chart';
import { DataGrid, type GridColumn } from '../components/DataGrid';
import { AiResultCard } from '../components/AiResultCard';
import { EffectMark } from '../components/EffectMark';
import { KpiCard } from '../components/KpiCard';
import { MoneyCard } from '../components/MoneyCard';
import { EFFECT_CLASSES } from '../components/money';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { ENERGY_NAMES, company, terms, type StatusLevel } from '../config';
import { useTheme } from '../theme/ThemeProvider';
import { readToken } from '../theme/tokens';
import { catalog, lineRows, lineTotal, sampleAiResult } from './catalogData';
import './Catalog.css';

const colorGroups: { title: string; tokens: string[] }[] = [
  {
    title: '배경·테두리',
    tokens: ['color-bg-app', 'color-bg-surface', 'color-bg-subtle', 'color-bg-hover', 'color-bg-header', 'color-border', 'color-border-strong']
  },
  {
    title: '글자·강조',
    tokens: ['color-text-primary', 'color-text-secondary', 'color-text-tertiary', 'color-action', 'color-action-subtle', 'color-text-on-action']
  },
  {
    title: '상태',
    tokens: [
      'color-status-critical', 'color-status-critical-bg', 'color-status-warning', 'color-status-warning-bg',
      'color-status-warning-mark', 'color-status-info', 'color-status-info-bg'
    ]
  },
  {
    title: '데이터·계열',
    tokens: [
      'color-data-actual', 'color-data-compare', 'color-data-reference', 'color-data-band', 'color-data-grid',
      'color-series-1', 'color-series-2', 'color-series-3', 'color-series-4', 'color-series-5', 'color-series-6', 'color-series-other'
    ]
  },
  { title: 'AX 효과·AI', tokens: ['color-effect', 'color-effect-subtle', 'color-ai', 'color-ai-bg'] }
];

const energyTokens = Object.entries(ENERGY_NAMES).map(([id, e]) => ({
  name: e.name,
  token: `color-energy-${id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`
}));

const spaceTokens = ['space-xs', 'space-sm', 'space-md', 'space-lg', 'space-xl'];
const fontTokens = ['font-size-caption', 'font-size-body', 'font-size-title', 'font-size-page', 'font-size-kpi'];
const sizeTokens = [
  'shell-header-h', 'shell-nav-w', 'shell-title-h', 'shell-toolbar-h', 'shell-drawer-w', 'shell-assistant-w',
  'control-h', 'control-h-sm', 'grid-row-h', 'grid-head-h', 'card-pad', 'kpi-pad', 'badge-h'
];

const levels: StatusLevel[] = ['critical', 'warning', 'info', 'normal'];

const gridColumns: GridColumn[] = [
  { field: 'name', label: '라인', flex: 1.4, pinned: true },
  { field: 'availability', label: '가용성 (%)', flex: 1, format: 'percent' },
  { field: 'performance', label: '성능 (%)', flex: 1, format: 'percent' },
  { field: 'quality', label: '품질 (%)', flex: 1, format: 'percent' },
  { field: 'oee', label: 'OEE (%)', flex: 1, format: 'percent' },
  { field: 'lossThousand', label: '정지 손실 (천 원)', flex: 1.2, format: 'number' },
  { field: 'status', label: '상태', flex: 1, render: 'status' }
];

function TokenValue({ name }: { name: string }) {
  // Re-read on every render; the parent re-renders when the theme revision changes.
  return <span className="num catalog__token-value">{readToken(name)}</span>;
}

export function Catalog() {
  const { mode, density, setMode, setDensity, revision } = useTheme();
  const [primaryCommand, ...otherCommands] = ['저장', ...terms.buttons.commands.filter((b) => b !== '저장')];

  return (
    <div className="catalog" data-revision={revision}>
      <header className="catalog__header">
        <div>
          <div className="caption">개발용 / 컴포넌트 카탈로그</div>
          <h1 className="catalog__title">컴포넌트 카탈로그</h1>
        </div>
        <span className="catalog__spacer" />
        <Space size="middle" wrap>
          <span className="caption">테마</span>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[
              { label: '밝게', value: 'light' },
              { label: '어둡게', value: 'dark' }
            ]}
          />
          <span className="caption">밀도</span>
          <Segmented
            value={density}
            onChange={(v) => setDensity(v as typeof density)}
            options={[
              { label: '조밀', value: 'compact' },
              { label: '표준', value: 'standard' }
            ]}
          />
        </Space>
      </header>

      <Panel title="색상 토큰" caption="2단 의미 토큰 · 현재 테마에서 계산된 값">
        <div className="catalog__color-groups">
          {colorGroups.map((g) => (
            <div key={g.title}>
              <h3 className="catalog__subtitle">{g.title}</h3>
              <ul className="catalog__swatches">
                {g.tokens.map((t) => (
                  <li key={t}>
                    <span className="catalog__swatch" style={{ background: `var(--${t})` }} />
                    <span className="catalog__token-name">--{t}</span>
                    <TokenValue name={t} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3 className="catalog__subtitle">에너지원 고정색</h3>
            <ul className="catalog__swatches">
              {energyTokens.map((e) => (
                <li key={e.token}>
                  <span className="catalog__swatch" style={{ background: `var(--${e.token})` }} />
                  <span className="catalog__token-name">{e.name}</span>
                  <span className="caption">--{e.token}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <div className="catalog__row">
        <Panel title="간격" caption="--space-*">
          <ul className="catalog__scale">
            {spaceTokens.map((t) => (
              <li key={t}>
                <span className="catalog__token-name">--{t}</span>
                <span className="catalog__bar" style={{ width: `var(--${t})` }} />
                <TokenValue name={t} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="글자 크기" caption="--font-size-*">
          <ul className="catalog__scale">
            {fontTokens.map((t) => (
              <li key={t}>
                <span className="catalog__token-name">--{t}</span>
                <span style={{ fontSize: `var(--${t})` }}>에너지 1,234</span>
                <TokenValue name={t} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="치수" caption="3단 컴포넌트 토큰 · 밀도에 따라 바뀜">
          <ul className="catalog__scale">
            {sizeTokens.map((t) => (
              <li key={t}>
                <span className="catalog__token-name">--{t}</span>
                <TokenValue name={t} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="catalog__row">
        <Panel title="버튼" caption="config/terms.json">
          <div className="catalog__stack">
            <div className="catalog__label">명령 버튼 6개 · 강조색은 화면당 1개</div>
            <Space wrap>
              {otherCommands.map((b) => (
                <Button key={b}>{b}</Button>
              ))}
              <Button type="primary">{primaryCommand}</Button>
            </Space>
            <div className="catalog__label">보조 버튼</div>
            <Space wrap>
              {terms.buttons.auxiliary.map((b) => (
                <Button key={b.label} title={b.where}>
                  {b.label}
                </Button>
              ))}
            </Space>
            <div className="catalog__label">판정 버튼 · AI 결과 카드 전용, 작은 크기</div>
            <Space wrap>
              {terms.buttons.judgement.map((b) => (
                <Button key={b.label} size="small" title={b.where}>
                  {b.label}
                </Button>
              ))}
            </Space>
            <div className="catalog__label">처리 버튼 · P5 처리 목록형 전용</div>
            <Space wrap>
              {terms.buttons.workflow.map((b) => (
                <Button key={b.label} title={b.where}>
                  {b.label}
                </Button>
              ))}
            </Space>
            <div className="catalog__label">권한 없음 → 숨김. 처리 중 → 비활성</div>
            <Space wrap>
              <Button disabled>저장</Button>
              <Button type="primary" loading>
                조회
              </Button>
            </Space>
          </div>
        </Panel>

        <Panel title="상태 배지" caption="4단계 · 도형 + 색 + 글자">
          <div className="catalog__stack">
            <Space size="large" wrap>
              {levels.map((l) => (
                <StatusBadge key={l} level={l} />
              ))}
            </Space>
            <div className="catalog__label">사유를 글자로 쓸 때</div>
            <Space size="large" wrap>
              <StatusBadge level="critical" label="설비 4대 미수신" />
              <StatusBadge level="warning" label="건전성 61" />
              <StatusBadge level="info" label="불량률 상승" />
              <StatusBadge level="normal" label="정상" />
            </Space>
            <div className="catalog__label">값이 들어오지 않을 때</div>
            <span className="no-data">{terms.noData}</span>
          </div>
        </Panel>
      </div>

      <div className="catalog__kpis">
        <KpiCard label="OEE" value={78.4} fractionDigits={1} unit="%" footnote={`${catalog.siteName} · 전일 대비 +1.2%p · 예시 값`} />
        <KpiCard label="공정 PPM" value={1250} unit="PPM" status="warning" statusLabel="주의" footnote="김해공장 범퍼 불량 증가 · 예시 값" />
        <MoneyCard
          label="AX 효과 (확정 + 추정)"
          amount={612_400_000}
          classes={[
            { kind: '확정', amount: 498_300_000 },
            { kind: '추정', amount: 114_100_000 }
          ]}
          excluded={[{ kind: '잠재', amount: 86_000_000 }]}
          footnote="기준선 대비 · 예시 값"
          evidenceTo="/EXE-020"
        />
        <KpiCard label="하우징 가공 2라인 생산" value={null} unit="개" status="critical" statusLabel="미수신" footnote="수집 장치 중단 14:05부터" />
      </div>

      <div className="catalog__row">
        <Panel title="AX 효과 분류" caption="색이 아니라 채움·빗금·테두리와 글자로 구분">
          <div className="catalog__stack">
            <Space size="large" wrap>
              {EFFECT_CLASSES.map((k) => (
                <EffectMark key={k} kind={k} />
              ))}
            </Space>
            <div className="catalog__label">잠재는 합계에 넣지 않는다</div>
          </div>
        </Panel>
        <Panel title="AI 결과 카드" caption="근거·신뢰도·모델·판정 · 가상 엔진" className="catalog__wide">
          <AiResultCard result={sampleAiResult} onDecide={() => undefined} />
        </Panel>
      </div>

      <div className="catalog__row">
        <Panel title="입력" caption="필수 항목 표시 · 입력 즉시 검증">
          <Form layout="vertical" className="catalog__form" requiredMark>
            <Form.Item label="기간" required>
              <DatePicker.RangePicker defaultValue={[dayjs(company.now), dayjs(company.now)]} />
            </Form.Item>
            <Form.Item label="라인" required>
              <Select defaultValue={company.sites[0].lines[0].id} options={company.sites[0].lines.map((l) => ({ value: l.id, label: l.name }))} />
            </Form.Item>
            <Form.Item label="정비 요청 제목" name="woTitle" required rules={[{ required: true, message: '정비 요청 제목을 입력하세요.' }]} validateTrigger="onChange">
              <Input placeholder="예: 메인 모터 베어링 점검" />
            </Form.Item>
            <Form.Item label="예상 작업 시간 (시간)">
              <InputNumber min={0} defaultValue={4} />
            </Form.Item>
            <Form.Item>
              <Checkbox defaultChecked>AI 결과 연결</Checkbox>
            </Form.Item>
          </Form>
        </Panel>

        <Panel title="라인별 OEE" caption={`${catalog.siteName} · 금일 · 예시 값`} className="catalog__wide">
          <DataGrid ariaLabel="라인별 OEE" columns={gridColumns} rows={lineRows} totalRow={lineTotal} />
        </Panel>
      </div>

      <Panel title="시간별 양품 생산" caption={`${catalog.lineName} · 1시간 · 예시 값`}>
        <Chart
          ariaLabel="금일 시간별 양품 생산. 실적과 전일, 목표선"
          unit="개"
          categories={catalog.chart.categories}
          series={[
            { name: terms.chart.compare, data: catalog.chart.yesterday, color: 'compare' },
            { name: terms.chart.actual, data: catalog.chart.today, color: 'actual' }
          ]}
          thresholds={[{ name: terms.chart.target, value: catalog.chart.target, level: 'reference' }]}
        />
      </Panel>
    </div>
  );
}