import type { AppState } from './AppContext';
import type { ScreenEntry } from './menu';

/** Permission needed to open a screen (menu.json `view`). */
export const viewPermission = (s: ScreenEntry) => s.view;

/** Menu visibility: the user's permission meets the screen's view permission; sub-screens stay out of the menu. */
export const isScreenVisible = (s: ScreenEntry, app: AppState): boolean => !s.parent && app.hasPermission(s.view);
