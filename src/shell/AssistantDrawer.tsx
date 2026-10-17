// AI 도우미 drawer (D-17): the same conversation as AIX-010, opened from the top bar.
import { Drawer, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { terms } from '../config';
import { AssistantPanel } from './AssistantPanel';
import { useShellLink } from './links';
import './AssistantDrawer.css';

export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const link = useShellLink();
  return (
    <Drawer
      title={
        <span className="assistant__title">
          AI 도우미 <Tag bordered>{terms.badges.virtualEngine}</Tag>
        </span>
      }
      extra={<Link to={link('AIX-010')}>넓게 보기</Link>}
      placement="right"
      width="var(--shell-assistant-w)"
      open={open}
      onClose={onClose}
      rootClassName="assistant"
      destroyOnHidden
    >
      <AssistantPanel />
    </Drawer>
  );
}
