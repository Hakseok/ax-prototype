// Empty template shown until a screen has its definition (step 2). It draws the
// regions of the screen's pattern (docs/screen-guide.md 3) so the layout can be checked early.
import { PATTERN_NAMES, type ScreenEntry } from '../shell/menu';
import { ScreenLayout } from '../shell/ScreenLayout';
import './PatternSkeleton.css';

interface Region {
  name: string;
  area: string;
}

// Regions per pattern, placed on a named CSS grid (see PatternSkeleton.css).
const LAYOUTS: Record<string, { grid: string; regions: Region[] }> = {
  P1: { grid: 'dash', regions: [{ name: '지표 카드 4~6개', area: 'kpi' }, { name: '차트', area: 'main' }, { name: '이상·리스크 목록', area: 'side' }, { name: '요약 목록', area: 'foot' }] },
  P2: { grid: 'split', regions: [{ name: '배치 그림', area: 'main' }, { name: '선택 설비 상세', area: 'side' }] },
  P3: { grid: 'analysis', regions: [{ name: '대상·계층 선택', area: 'side' }, { name: '차트(시계열·폭포형)', area: 'main' }, { name: '데이터 표', area: 'foot' }] },
  P4: { grid: 'single', regions: [{ name: '그리드 (결과 건수·합계 행·내보내기)', area: 'main' }] },
  P5: { grid: 'worklist', regions: [{ name: '단계 탭', area: 'kpi' }, { name: '처리 대상 목록', area: 'side' }, { name: '내용·처리 패널, 처리 기록', area: 'main' }] },
  P6: { grid: 'form', regions: [{ name: '구역별 입력 또는 단계', area: 'main' }, { name: '하단 고정 버튼', area: 'foot' }] },
  P7: { grid: 'column', regions: [{ name: '요약', area: 'kpi' }, { name: '추이', area: 'main' }, { name: 'AI 결과·기록', area: 'foot' }] },
  P8: { grid: 'split', regions: [{ name: '목록·트리', area: 'side' }, { name: '상세 패널·변경 이력', area: 'main' }] },
  P9: { grid: 'evidence', regions: [{ name: '요약 카드', area: 'kpi' }, { name: '항목 목록(확정·추정·잠재)', area: 'side' }, { name: '근거 패널(계산 단계)', area: 'main' }] },
  P10: { grid: 'report', regions: [{ name: '목차', area: 'side' }, { name: '페이지 미리보기', area: 'main' }] },
  P11: { grid: 'cause', regions: [{ name: '대상 선택', area: 'kpi' }, { name: '집단 비교 차트', area: 'main' }, { name: '원인 후보·권장 조건', area: 'side' }, { name: '근거 패널', area: 'foot' }] },
  P12: { grid: 'chat', regions: [{ name: '예시 질문', area: 'side' }, { name: '대화 기록과 답(값·근거·링크)', area: 'main' }] }
};

export function PatternSkeleton({ entry, badges }: { entry: ScreenEntry; badges: string[] }) {
  const layout = LAYOUTS[entry.pattern] ?? LAYOUTS.P4;
  return (
    <ScreenLayout entry={entry} badges={badges} bodyMode="fit">
      <div className={`skeleton skeleton--${layout.grid}`} aria-label={`${PATTERN_NAMES[entry.pattern] ?? entry.pattern} 빈 템플릿`}>
        {layout.regions.map((r) => (
          <div key={r.name} className="skeleton__region" style={{ gridArea: r.area }}>
            <span className="skeleton__name">{r.name}</span>
          </div>
        ))}
        <p className="skeleton__note caption">
          {PATTERN_NAMES[entry.pattern] ?? entry.pattern} 빈 템플릿 · {entry.summary}
        </p>
      </div>
    </ScreenLayout>
  );
}
