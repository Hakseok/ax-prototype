// Read design tokens (CSS custom properties) at runtime.
// Libraries that need concrete values (Ant Design, ECharts) get them from here,
// so src/ never holds a raw color or length.

export type ThemeMode = 'light' | 'dark';
export type Density = 'compact' | 'standard';

/** CSS reference to a token, e.g. cssVar('color-action') -> 'var(--color-action)'. */
export const cssVar = (name: string): string => `var(--${name})`;

/** Resolved value of a token on the document root, e.g. '#1456B8' or '32px'. */
export const readToken = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

/** Numeric part of a length token, e.g. '32px' -> 32. */
export const readTokenNumber = (name: string): number => {
  const value = parseFloat(readToken(name));
  return Number.isFinite(value) ? value : 0;
};
