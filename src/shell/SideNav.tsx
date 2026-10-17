import { useEffect, useMemo, useState } from 'react';
import { Menu } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { terms } from '../config';
import { useApp } from './AppContext';
import { useShellLink } from './links';
import { menuGroups, roleById, screenById, screens } from './menu';
import { isScreenVisible } from './visibility';
import './SideNav.css';

// Groups follow the user's role (guide 4); next-version screens stay listed but muted (D-16).
export function SideNav() {
  const app = useApp();
  const navigate = useNavigate();
  const link = useShellLink();
  const { pathname } = useLocation();
  const current = pathname.slice(1);
  const currentEntry = screenById.get(current);
  const currentGroup = currentEntry?.group;
  const menuKey = currentEntry?.parent ?? current;
  const [openKeys, setOpenKeys] = useState<string[]>(currentGroup ? [currentGroup] : []);

  useEffect(() => {
    if (currentGroup) setOpenKeys((keys) => (keys.includes(currentGroup) ? keys : [...keys, currentGroup]));
  }, [currentGroup]);

  const items = useMemo(() => {
    const order = roleById.get(app.user.role)?.groupOrder ?? menuGroups.map((g) => g.code);
    return [...menuGroups]
      .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
      .map((g) => ({
        key: g.code,
        label: g.name,
        children: screens
          .filter((s) => !s.common && s.group === g.code && isScreenVisible(s, app))
          .map((s) => ({
            key: s.id,
            label: s.phase === 'next' ? (
              <span className="sidenav__next" title={terms.badges.nextVersion}>
                {s.name} <span className="sidenav__next-tag">다음</span>
              </span>
            ) : (
              s.name
            )
          }))
      }))
      .filter((g) => g.children.length > 0);
  }, [app]);

  return (
    <nav className="sidenav" aria-label="주 메뉴">
      <Menu
        mode="inline"
        items={items}
        selectedKeys={[menuKey]}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        onClick={({ key }) => navigate(link(key))}
      />
    </nav>
  );
}
