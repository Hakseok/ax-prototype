import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppProvider } from './AppContext';
import { AlertCenterDrawer } from './AlertCenter';
import { AssistantDrawer } from './AssistantDrawer';
import { IndustryBanner } from './IndustryBanner';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import './Shell.css';

type Panel = 'alerts' | 'assistant' | null;

// Common frame: top bar, menu, then the screen (title row, conditions, toolbar, body).
// The alert center and the AI assistant never open together (D-17).
export function Shell() {
  const [panel, setPanel] = useState<Panel>(null);
  const { pathname } = useLocation();
  // Following a link from a drawer closes it.
  useEffect(() => setPanel(null), [pathname]);
  return (
    <AppProvider>
      <div className="shell">
        <TopBar onOpenAlerts={() => setPanel('alerts')} onOpenAssistant={() => setPanel('assistant')} />
        <IndustryBanner />
        <div className="shell__main">
          <SideNav />
          <main className="shell__content">
            <Outlet />
          </main>
        </div>
        <AlertCenterDrawer open={panel === 'alerts'} onClose={() => setPanel(null)} />
        <AssistantDrawer open={panel === 'assistant'} onClose={() => setPanel(null)} />
      </div>
    </AppProvider>
  );
}
