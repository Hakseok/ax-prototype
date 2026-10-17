import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
// The ES module build: the CommonJS entry ends up wrapped and the Korean texts are lost.
import koKR from 'antd/es/locale/ko_KR';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { buildAntdTheme } from './antdTheme';
import type { Density, ThemeMode } from './tokens';

dayjs.locale('ko');

interface ThemeState {
  mode: ThemeMode;
  density: Density;
  setMode: (mode: ThemeMode) => void;
  setDensity: (density: Density) => void;
  /** Increments after tokens change, so token readers (charts) know to re-read. */
  revision: number;
}

const ThemeContext = createContext<ThemeState | null>(null);

const STORAGE_KEY = 'ax-prototype.theme';

const loadPreference = (): { mode: ThemeMode; density: Density } => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      mode: saved.mode === 'dark' ? 'dark' : 'light',
      density: saved.density === 'standard' ? 'standard' : 'compact'
    };
  } catch {
    return { mode: 'light', density: 'compact' };
  }
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState(loadPreference);
  const [applied, setApplied] = useState<{ revision: number; antd: ReturnType<typeof buildAntdTheme> } | null>(null);

  // Apply the attributes the token CSS keys on, then read the resolved values.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = pref.mode;
    root.dataset.density = pref.density;
    setApplied((prev) => ({ revision: (prev?.revision ?? 0) + 1, antd: buildAntdTheme(pref.mode) }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    } catch {
      // Storage may be unavailable; the preference then lasts for this page only.
    }
  }, [pref]);

  const value = useMemo<ThemeState>(
    () => ({
      mode: pref.mode,
      density: pref.density,
      setMode: (mode) => setPref((p) => ({ ...p, mode })),
      setDensity: (density) => setPref((p) => ({ ...p, density })),
      revision: applied?.revision ?? 0
    }),
    [pref, applied]
  );

  if (!applied) return null;

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={applied.antd} locale={koKR}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export const useTheme = (): ThemeState => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
