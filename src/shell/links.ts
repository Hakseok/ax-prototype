import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Link to another screen that keeps the site selection (and optional extra params). */
export const useShellLink = () => {
  const [params] = useSearchParams();
  const site = params.get('site');
  return useCallback(
    (screenId: string, extra: Record<string, string> = {}) => {
      const next = new URLSearchParams();
      if (site) next.set('site', site);
      for (const [k, v] of Object.entries(extra)) next.set(k, v);
      return `/${screenId}?${next.toString()}`;
    },
    [site]
  );
};
