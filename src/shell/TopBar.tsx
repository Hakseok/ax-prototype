import { useMemo } from 'react';
import { Badge, Button, Dropdown, Popover, Segmented, Select, Space } from 'antd';
import { BellOutlined, DownOutlined, MessageOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { company, terms } from '../config';
import { COMPANY, NOW, formatDateTime } from '../data';
import { useAlerts } from '../data/alertStore';
import { useTheme } from '../theme/ThemeProvider';
import { useApp } from './AppContext';
import { useShellLink } from './links';
import { homeOf, roleById } from './menu';
import './TopBar.css';

export function TopBar({ onOpenAlerts, onOpenAssistant }: { onOpenAlerts: () => void; onOpenAssistant: () => void }) {
  const app = useApp();
  const theme = useTheme();
  const navigate = useNavigate();
  const link = useShellLink();
  const { alerts } = useAlerts();
  const unread = useMemo(
    () => alerts.filter((a) => a.state === '미확인' && app.selectedSiteIds.includes(a.siteId)).length,
    [alerts, app.selectedSiteIds]
  );

  const siteOptions = [
    ...(app.canCompany ? [{ value: COMPANY, label: `전사 (${app.allowedSites.length}개 사업장)` }] : []),
    ...app.allowedSites.map((s) => ({ value: s.id, label: s.name }))
  ];
  const sitesText = (sites: string[]) => (sites.length === app.sites.length ? '전 사업장' : sites.map(app.siteName).join(', '));

  return (
    <header className="topbar">
      {/* The logo goes to the role's first screen — the way back on phones, where the menu is hidden. */}
      <Link className="topbar__brand" to={link(homeOf(app.user.role))} title="첫 화면으로">
        <svg className="topbar__logo" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 15 L8 9 L12 12 L17 5" />
          <circle cx="17" cy="5" r="1.6" />
          <path d="M2 18 H18" />
        </svg>
        <strong>제조 AX</strong>
        <span className="topbar__company">{company.company.displayName}</span>
      </Link>
      <Select
        className="topbar__site"
        aria-label="사업장 선택"
        variant="borderless"
        value={app.siteSelection}
        options={siteOptions}
        onChange={app.setSiteSelection}
        popupMatchSelectWidth={false}
      />
      <span className="topbar__spacer" />
      <span className="topbar__tag">{terms.badges.virtualData}</span>
      <span className="topbar__time num">{formatDateTime(NOW)} 기준</span>
      <Button className="topbar__icon" type="text" aria-label="AI 도우미 열기" icon={<MessageOutlined />} onClick={onOpenAssistant}>
        <span className="topbar__label">AI 도우미</span>
      </Button>
      <Badge count={unread} size="small" offset={[-4, 4]}>
        <Button className="topbar__icon" type="text" aria-label={`알림 센터 열기, 미확인 ${unread}건`} icon={<BellOutlined />} onClick={onOpenAlerts} />
      </Badge>
      <Popover
        trigger="click"
        placement="bottomRight"
        title="화면 표시"
        content={
          <Space direction="vertical">
            <Segmented
              value={theme.mode}
              onChange={(v) => theme.setMode(v as typeof theme.mode)}
              options={[{ label: '밝게', value: 'light' }, { label: '어둡게', value: 'dark' }]}
            />
            <Segmented
              value={theme.density}
              onChange={(v) => theme.setDensity(v as typeof theme.density)}
              options={[{ label: '조밀', value: 'compact' }, { label: '표준', value: 'standard' }]}
            />
          </Space>
        }
      >
        <Button className="topbar__icon" type="text" aria-label="테마와 밀도" icon={<SettingOutlined />} />
      </Popover>
      <Dropdown
        trigger={['click']}
        menu={{
          selectedKeys: [app.user.id],
          items: [
            {
              type: 'group',
              label: '사용자 전환 (가상)',
              children: app.users.map((u) => ({
                key: u.id,
                label: `${u.name} · ${roleById.get(u.role)?.name ?? u.role} · ${u.permission} · ${sitesText(u.sites)}`
              }))
            },
            { type: 'divider' },
            { key: 'COM-030', label: '내 정보·개인 설정' },
            { key: 'COM-040', label: '로그인 화면' }
          ],
          onClick: ({ key }) => {
            if (key.startsWith('COM-')) {
              navigate(key === 'COM-040' ? '/COM-040' : link(key));
              return;
            }
            const u = app.users.find((x) => x.id === key)!;
            app.setUserId(key);
            // Switching user lands on that role's first screen, with a site the user may see.
            navigate(`/${homeOf(u.role)}?site=${u.sites.length > 1 ? COMPANY : u.sites[0]}`);
          }
        }}
      >
        <Button className="topbar__user" type="text" icon={<UserOutlined />}>
          {app.user.name} <span className="topbar__role">{roleById.get(app.user.role)?.name}</span> <DownOutlined />
        </Button>
      </Dropdown>
    </header>
  );
}
