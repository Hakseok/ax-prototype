// COM-040 로그인: a stand-alone virtual sign-in that picks one of the users.
// Outside the shell, so it cannot be a pattern template (exception, see docs/decisions.md).
import { useEffect, useState } from 'react';
import { Button, Radio, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { company, terms } from '../config';
import { COMPANY, loadSites, loadUsers, type Site, type User } from '../data';
import { userStore } from '../shell/AppContext';
import { homeOf, roleById } from '../shell/menu';
import './Login.css';

export function Login() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [picked, setPicked] = useState<string>(userStore.get() ?? 'u-ceo');
  useEffect(() => {
    Promise.all([loadUsers(), loadSites()]).then(([u, s]) => {
      setUsers(u);
      setSites(s);
    });
  }, []);
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id;

  const signIn = () => {
    const u = users.find((x) => x.id === picked)!;
    userStore.set(u.id);
    navigate(`/${homeOf(u.role)}?site=${u.sites.length > 1 ? COMPANY : u.sites[0]}`);
  };

  return (
    <main className="login">
      <section className="login__card" aria-labelledby="login-title">
        <div className="login__brand">
          <strong>제조 AX</strong>
          <span className="caption">{company.company.displayName}</span>
          <Tag bordered>{terms.badges.virtualData}</Tag>
        </div>
        <h1 id="login-title" className="login__title">로그인</h1>
        <p className="caption">가상 화면입니다. 비밀번호 없이 사용자를 골라 들어갑니다. 역할에 따라 첫 화면이 다릅니다. <span className="num">COM-040</span></p>
        <Radio.Group value={picked} onChange={(e) => setPicked(e.target.value)} className="login__users">
          <Space direction="vertical" className="login__users">
            {users.map((u) => (
              <Radio key={u.id} value={u.id} className="login__user">
                <strong>{u.name}</strong>{' '}
                <span className="caption">
                  {roleById.get(u.role)?.name} · {u.permission} · {u.sites.length === sites.length ? '전 사업장' : u.sites.map(siteName).join(', ')}
                </span>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
        <Button type="primary" block onClick={signIn} disabled={!users.length}>
          확인
        </Button>
      </section>
    </main>
  );
}
