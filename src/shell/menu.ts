// Menu model from config/menu.json — the single source of menu names, screen titles and roles.
import { menu } from '../config';
import type { Permission, RoleId } from '../data/types';

export type SiteScope = 'site-or-company' | 'site-only' | 'company-only' | 'common';

export interface ScreenEntry {
  id: string;
  group: string;
  groupName: string;
  name: string;
  pattern: string;
  summary: string;
  siteScope: SiteScope;
  view: Permission;
  edit?: Permission;
  /** now = built in this version; next = shown in the menu with a notice. */
  phase: 'now' | 'next';
  mobile: boolean;
  /** Sub-screens (e.g. MNT-011) open from their parent and stay out of the menu. */
  parent?: string;
  /** Common screens (COM-*) are reached from the top bar, not the menu. */
  common: boolean;
}

export const PATTERN_NAMES: Record<string, string> = {
  P1: 'P1 현황 대시보드형',
  P2: 'P2 배치도형',
  P3: 'P3 분석형',
  P4: 'P4 조회형',
  P5: 'P5 처리 목록형',
  P6: 'P6 등록·편집형',
  P7: 'P7 상세 랜딩형',
  P8: 'P8 마스터-디테일형',
  P9: 'P9 근거 추적형',
  P10: 'P10 보고서형',
  P11: 'P11 원인 분석형',
  P12: 'P12 대화형',
  drawer: '드로어',
  standalone: '단독 화면'
};

const groupName = new Map(menu.groups.map((g) => [g.code, g.name]));

export const menuGroups = menu.groups;

export const screens: ScreenEntry[] = [
  ...menu.screens.map((s) => ({
    ...s,
    groupName: groupName.get(s.group) ?? s.group,
    siteScope: s.siteScope as SiteScope,
    view: s.view as Permission,
    edit: (s as { edit?: string }).edit as Permission | undefined,
    phase: s.phase as 'now' | 'next',
    mobile: Boolean((s as { mobile?: boolean }).mobile),
    parent: (s as { parent?: string }).parent,
    common: false
  })),
  ...menu.common.map((c) => ({
    id: c.id,
    group: 'COM',
    groupName: '공통 화면',
    name: c.name,
    pattern: c.pattern,
    summary: '',
    siteScope: 'site-or-company' as SiteScope,
    view: '조회' as Permission,
    phase: c.phase as 'now' | 'next',
    mobile: Boolean((c as { mobile?: boolean }).mobile),
    common: true
  }))
];

export const screenById = new Map(screens.map((s) => [s.id, s]));

export interface RoleDef {
  id: RoleId;
  name: string;
  home: string;
  groupOrder: string[];
}
export const roles = menu.roles as RoleDef[];
export const roleById = new Map(roles.map((r) => [r.id, r]));
export const homeOf = (role: RoleId): string => roleById.get(role)?.home ?? 'EXE-010';
export const DEFAULT_SCREEN = 'EXE-010';
