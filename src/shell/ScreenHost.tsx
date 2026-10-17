import type { ComponentType } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Empty } from 'antd';
import { terms } from '../config';
import { useApp } from './AppContext';
import { useShellLink } from './links';
import { DEFAULT_SCREEN, PATTERN_NAMES, screenById, type ScreenEntry } from './menu';
import { screenDefs, type ScreenDefinitionBase } from './screenDefs';
import { ScreenLayout } from './ScreenLayout';
import { SiteScopeNotice, siteScopeProblem } from './SiteScopeNotice';
import { patternTemplates } from '../patterns';
import { PatternSkeleton } from '../patterns/PatternSkeleton';
import { AlertCenterPage } from '../screens/AlertCenterPage';
import { IndustryPreview } from '../screens/IndustryPreview';
import { useIndustry } from '../data/industry';
import './ScreenHost.css';

const DATA_GROUPS = ['EXE', 'OPS', 'QUA', 'MNT', 'ENG'];

export interface TemplateProps {
  entry: ScreenEntry;
  def: ScreenDefinitionBase;
  /** Badges the shell adds (전사 공통). Templates add their own and pass all to ScreenLayout. */
  badges: string[];
}

export function ScreenHost() {
  const { screenId = DEFAULT_SCREEN } = useParams();
  const app = useApp();
  const industry = useIndustry();
  const link = useShellLink();
  const entry = screenById.get(screenId);
  if (!entry) return <Navigate to={link(DEFAULT_SCREEN)} replace />;

  const badges = entry.siteScope === 'common' ? ['전사 공통'] : [];
  if (!app.hasPermission(entry.view)) {
    return (
      <ScreenLayout entry={entry} badges={badges}>
        <Empty description={`이 화면은 ${entry.view} 권한이 필요합니다. 관리자에게 권한을 요청하세요.`} />
      </ScreenLayout>
    );
  }
  if (entry.phase === 'next') return <NextVersion entry={entry} />;
  const problem = siteScopeProblem(entry, app);
  if (problem) {
    return (
      <ScreenLayout entry={entry} badges={badges}>
        <SiteScopeNotice problem={problem} />
      </ScreenLayout>
    );
  }

  // COM-010 has no body pattern (it is a drawer); its page form reuses the same list.
  if (entry.id === 'COM-010') return <AlertCenterPage entry={entry} />;
  // A template without data (D-09): data screens show its KPI set with 데이터 없음.
  if (!industry.hasData && DATA_GROUPS.includes(entry.group)) return <IndustryPreview key={entry.id} entry={entry} />;
  const def = screenDefs.get(entry.id);
  const Template = (def && (patternTemplates as Record<string, ComponentType<TemplateProps>>)[def.pattern]) || null;
  // Remount per screen and site so templates start from their own defaults.
  if (def && Template) return <Template key={`${entry.id}|${app.siteSelection}`} entry={entry} def={def} badges={badges} />;
  return <PatternSkeleton entry={entry} badges={badges} />;
}

function NextVersion({ entry }: { entry: ScreenEntry }) {
  return (
    <ScreenLayout entry={entry} badges={[terms.badges.nextVersion]}>
      <div className="placeholder">
        <dl className="placeholder__facts">
          <dt>화면 ID</dt>
          <dd className="num">{entry.id}</dd>
          <dt>화면 설명</dt>
          <dd>{entry.summary}</dd>
          <dt>패턴</dt>
          <dd>{PATTERN_NAMES[entry.pattern] ?? entry.pattern}</dd>
        </dl>
        <p className="caption">{terms.badges.nextVersion}. 이번 시연 버전은 경영진 시연 흐름에 필요한 화면부터 만들었습니다.</p>
      </div>
    </ScreenLayout>
  );
}
