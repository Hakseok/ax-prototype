// The AI assistant conversation, shared by the top-bar drawer and AIX-010 (D-17). Only questions
// are stored; answers are recomputed by the rule-based interpreter, so the same question always
// gives the same answer for the same data and sites.
import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Input, Skeleton, Tag } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { AiResultCard } from '../components/AiResultCard';
import { terms } from '../config';
import { answer, EXAMPLE_QUESTIONS } from '../data/assistant';
import { useIndustry } from '../data/industry';
import { createLocalStore, useLocalStore } from '../data/localStore';
import { useAsync } from '../patterns/common/useAsync';
import { useApp } from './AppContext';
import './AssistantPanel.css';

interface Turn {
  question: string;
  sites: string[];
}
export const assistantStore = createLocalStore<Turn[]>('assistant', []);

export function AssistantPanel({ full = false }: { full?: boolean }) {
  const app = useApp();
  const turns = useLocalStore(assistantStore);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [turns.length]);
  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    assistantStore.set((prev) => [...prev, { question, sites: app.selectedSiteIds }]);
    setText('');
  };
  return (
    <div className={`assistant-panel${full ? ' assistant-panel--full' : ''}`}>
      <div className="assistant-panel__log" aria-live="polite">
        {!turns.length && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="caption">
                지표 값, 가장 낮은 라인과 이유, 불량 원인, 정비가 필요한 설비, AX 효과, 클레임 로트, 에너지 낭비를 물어볼 수 있습니다. 답은 {terms.badges.virtualEngine}이 데이터에서 계산하고 근거와 화면 링크를 붙입니다.
              </span>
            }
          />
        )}
        {turns.map((t, i) => (
          <TurnView key={`${i}-${t.question}`} turn={t} />
        ))}
        <div ref={end} />
      </div>
      <div className="assistant-panel__examples">
        {EXAMPLE_QUESTIONS.map((q) => (
          <Tag.CheckableTag key={q} checked={false} onChange={() => ask(q)} className="assistant-panel__example">
            {q}
          </Tag.CheckableTag>
        ))}
      </div>
      <form
        className="assistant-panel__input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="질문을 입력하세요. 예: 이번 달 OEE가 가장 낮은 라인과 이유는?" aria-label="질문" />
        <Button htmlType="submit" type="primary" icon={<SendOutlined />} disabled={!text.trim()} aria-label="질문 보내기" title="질문 보내기" />
        {turns.length > 0 && (
          <Button onClick={() => assistantStore.reset()} title="대화 기록을 지웁니다">
            삭제
          </Button>
        )}
      </form>
      <p className="caption assistant-panel__note">
        규칙 기반 질의 해석기(가상 엔진)입니다. 지원하지 않는 질문에는 답을 만들지 않고 지원 범위를 안내합니다. 금액은 {terms.badges.demoOnly}입니다.
      </p>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const app = useApp();
  const ind = useIndustry();
  // Only the sites the user may still see.
  const sites = turn.sites.filter((s) => app.allowedSites.some((a) => a.id === s));
  const { value } = useAsync(() => answer(turn.question, sites.length ? sites : app.selectedSiteIds), `${turn.question}|${sites}|${ind.templateId}`);
  return (
    <div className="assistant-turn">
      <div className="assistant-turn__q">{turn.question}</div>
      {!ind.hasData ? (
        <div className="assistant-turn__a caption">{ind.template.name} 템플릿은 데이터가 연계되지 않아 답하지 않습니다. 상단 안내에서 자동차 부품으로 되돌리면 답할 수 있습니다.</div>
      ) : !value ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : value.payload.intent === null || value.payload.intent === 'siteScope' ? (
        <div className="assistant-turn__a">
          <p className="assistant-turn__text">{value.conclusion}</p>
          <ul className="assistant-turn__list">
            {value.payload.supported?.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="assistant-turn__a">
          <AiResultCard result={value} compact={!value.evidence.length} />
          <div className="assistant-turn__params caption">
            {Object.entries(value.payload.params).map(([k, v]) => (
              <span key={k}>
                {PARAM_LABELS[k] ?? k}: {v}
              </span>
            ))}
          </div>
          {value.payload.rows && value.payload.rows.length > 0 && (
            <table className="data-table">
              <tbody>
                {value.payload.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num num-col">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="assistant-turn__links">
            {value.payload.links.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PARAM_LABELS: Record<string, string> = { period: '기간', metric: '지표', sites: '사업장' };
