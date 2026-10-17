import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COMPANY, loadSites, loadUsers, permittedSites, type Permission, type Site, type User } from '../data';
import { createLocalStore, useLocalStore } from '../data/localStore';

const LEVEL: Record<Permission, number> = { 조회: 1, 편집: 2, 관리: 3 };

export interface AppState {
  user: User;
  users: User[];
  setUserId: (id: string) => void;
  sites: Site[];
  /** Sites this user may see, in master order. */
  allowedSites: Site[];
  /** 'ALL' (company) or a site id. Lives in the URL as ?site=. */
  siteSelection: string;
  setSiteSelection: (id: string) => void;
  /** Site ids the current selection stands for. */
  selectedSiteIds: string[];
  canCompany: boolean;
  /** Permission check: '조회' < '편집' < '관리'. */
  hasPermission: (required: Permission) => boolean;
  siteName: (id: string) => string;
}

const AppContext = createContext<AppState | null>(null);
export const userStore = createLocalStore<string | null>('user', null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);
  const savedUserId = useLocalStore(userStore);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    Promise.all([loadUsers(), loadSites()]).then(([u, s]) => {
      setUsers(u);
      setSites(s);
    });
  }, []);

  const user = users?.find((u) => u.id === savedUserId) ?? users?.find((u) => u.role === 'executive') ?? users?.[0];
  const allowedSites = useMemo(
    () => (user && sites ? sites.filter((s) => permittedSites(user, sites.map((x) => x.id)).includes(s.id)) : []),
    [user, sites]
  );
  const canCompany = allowedSites.length > 1;
  const defaultSelection = canCompany ? COMPANY : allowedSites[0]?.id ?? COMPANY;
  const requested = params.get('site');
  const valid = requested === COMPANY ? canCompany : allowedSites.some((s) => s.id === requested);
  const siteSelection = requested && valid ? requested : defaultSelection;

  const setSiteSelection = useCallback(
    (id: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('site', id);
          return next;
        },
        { replace: false }
      );
    },
    [setParams]
  );

  // Keep the URL explicit so a copied link always carries the site.
  useEffect(() => {
    if (sites && users && params.get('site') !== siteSelection) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('site', siteSelection);
          return next;
        },
        { replace: true }
      );
    }
  }, [sites, users, params, siteSelection, setParams]);

  const value = useMemo<AppState | null>(() => {
    if (!user || !sites) return null;
    const siteById = new Map(sites.map((s) => [s.id, s]));
    return {
      user,
      users: users!,
      setUserId: (id) => userStore.set(id),
      sites,
      allowedSites,
      siteSelection,
      setSiteSelection,
      selectedSiteIds: siteSelection === COMPANY ? allowedSites.map((s) => s.id) : [siteSelection],
      canCompany,
      hasPermission: (required) => LEVEL[user.permission] >= LEVEL[required],
      siteName: (id) => (id === COMPANY ? '전사' : siteById.get(id)?.name ?? id)
    };
  }, [user, users, sites, allowedSites, siteSelection, setSiteSelection, canCompany]);

  if (!value) return null;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};

export { COMPANY };
