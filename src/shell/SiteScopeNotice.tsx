import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { COMPANY } from '../data';
import type { AppState } from './AppContext';
import { useApp } from './AppContext';
import type { ScreenEntry } from './menu';

export type ScopeProblem = 'needs-site' | 'needs-company' | 'company-not-permitted';

/** Whether the current site selection fits the screen's siteScope (menu.json, D-04). */
export const siteScopeProblem = (entry: ScreenEntry, app: AppState): ScopeProblem | null => {
  if (entry.siteScope === 'site-only' && app.siteSelection === COMPANY) return 'needs-site';
  if (entry.siteScope === 'company-only' && app.siteSelection !== COMPANY) return app.canCompany ? 'needs-company' : 'company-not-permitted';
  return null;
};

// Shown in the body instead of the screen content. Choices are links, not buttons (button names are fixed).
export function SiteScopeNotice({ problem }: { problem: ScopeProblem }) {
  const app = useApp();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const hrefFor = (site: string) => {
    const next = new URLSearchParams(params);
    next.set('site', site);
    return `${pathname}?${next.toString()}`;
  };

  const text = {
    'needs-site': ['사업장을 선택하세요.', '이 화면은 사업장 하나의 현장 상태를 보여 주므로 전사 합산으로 보여 주지 않습니다.'],
    'needs-company': ['전사를 선택하세요.', '이 화면은 사업장을 나란히 비교합니다.'],
    'company-not-permitted': ['전사 비교는 2개 이상 사업장 권한이 필요합니다.', '관리자에게 사업장 권한을 요청하세요.']
  }[problem];

  return (
    <div className="scope-notice" role="status">
      <h2 className="scope-notice__title">{text[0]}</h2>
      <p className="caption">{text[1]}</p>
      <div className="scope-notice__links">
        {problem === 'needs-company' && (
          <Link className="scope-notice__link" to={hrefFor(COMPANY)}>
            전사로 보기
          </Link>
        )}
        {problem === 'needs-site' &&
          app.allowedSites.map((s) => (
            <Link key={s.id} className="scope-notice__link" to={hrefFor(s.id)}>
              {s.name}
            </Link>
          ))}
      </div>
    </div>
  );
}
