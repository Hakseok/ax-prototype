// COM-010 알림 센터 as a page (direct link). The drawer is its usual form; both use the same list.
import { Panel } from '../components/Panel';
import { AlertList } from '../shell/AlertCenter';
import { ScreenLayout } from '../shell/ScreenLayout';
import type { ScreenEntry } from '../shell/menu';
import './AlertCenterPage.css';

export function AlertCenterPage({ entry }: { entry: ScreenEntry }) {
  return (
    <ScreenLayout entry={entry} bodyMode="fit">
      <Panel className="alert-page" title="처리 중인 알림" caption="상단 바의 알림 아이콘으로 여는 드로어와 같은 목록입니다.">
        <div className="alert-page__list">
          <AlertList />
        </div>
      </Panel>
    </ScreenLayout>
  );
}
