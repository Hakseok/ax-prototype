import { useEffect, useState } from 'react';

/** Run an async computation when its key changes; keeps the last value while reloading. */
export const useAsync = <T>(fn: () => Promise<T>, key: string): { value: T | null; error: string | null; loading: boolean } => {
  const [state, setState] = useState<{ value: T | null; error: string | null; key: string | null }>({ value: null, error: null, key: null });
  useEffect(() => {
    let alive = true;
    fn()
      .then((value) => alive && setState({ value, error: null, key }))
      .catch((e: unknown) => alive && setState((s) => ({ ...s, error: String(e instanceof Error ? e.message : e), key })));
    return () => {
      alive = false;
    };
    // The caller encodes every input in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { value: state.value, error: state.error, loading: state.key !== key };
};
