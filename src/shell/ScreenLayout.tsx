import type { ReactNode } from 'react';
import { App, Button, Tag } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { terms } from '../config';
import type { ScreenEntry } from './menu';
import './ScreenLayout.css';

interface ScreenLayoutProps {
  entry: ScreenEntry;
  /** Badges after the title, e.g. 시연용 계수, 전사 공통, 규격 확정 전. */
  badges?: string[];
  /** Period control for patterns without a condition area (P1, P2, P7). */
  period?: ReactNode;
  /** Secondary buttons, placed left of the primary button. */
  secondary?: ReactNode;
  /** The one emphasized button of the screen, at the right end of the title row. */
  primary?: ReactNode;
  conditions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  /** P1 fits one screen; others scroll inside the body. */
  bodyMode?: 'scroll' | 'fit';
}

// Fixed order for every screen: title row, conditions, toolbar, body (guide 2, 6).
export function ScreenLayout({ entry, badges = [], period, secondary, primary, conditions, toolbar, children, bodyMode = 'scroll' }: ScreenLayoutProps) {
  const { message } = App.useApp();
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      message.success('조회 조건이 담긴 링크를 복사했습니다.');
    } catch {
      message.info(window.location.href);
    }
  };
  const linkLabel = terms.buttons.auxiliary.find((b) => b.label === '링크 복사')!.label;

  return (
    <div className="screen">
      <div className="screen__title-row">
        <div className="screen__heading">
          <div className="caption">
            {entry.groupName} / {entry.name}
          </div>
          <div className="screen__title-line">
            <h1 className="screen__title">{entry.name}</h1>
            <span className="screen__id num">{entry.id}</span>
            {badges.map((b) => (
              <Tag key={b} className="screen__badge" bordered>
                {b}
              </Tag>
            ))}
          </div>
        </div>
        <div className="screen__title-actions">
          {period}
          <Button icon={<LinkOutlined />} onClick={copyLink}>
            {linkLabel}
          </Button>
          {secondary}
          {primary}
        </div>
      </div>
      {conditions && <div className="screen__conditions">{conditions}</div>}
      {toolbar && <div className="screen__toolbar">{toolbar}</div>}
      <div className={`screen__body screen__body--${bodyMode}`}>{children}</div>
    </div>
  );
}
