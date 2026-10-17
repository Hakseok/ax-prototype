import { theme, type ThemeConfig } from 'antd';
import { readToken, readTokenNumber, type ThemeMode } from './tokens';

// Map design tokens to Ant Design theme tokens. Values are read from the live CSS,
// so this must run after data-theme / data-density are applied to <html>.
export const buildAntdTheme = (mode: ThemeMode): ThemeConfig => {
  const color = readToken;
  const num = readTokenNumber;
  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: color('color-action'),
      colorInfo: color('color-action'),
      colorLink: color('color-action'),
      // Normal state is achromatic by rule, so "success" maps to neutral ink.
      colorSuccess: color('color-text-secondary'),
      colorWarning: color('color-status-warning'),
      colorError: color('color-status-critical'),
      colorTextBase: color('color-text-primary'),
      colorText: color('color-text-primary'),
      colorTextSecondary: color('color-text-secondary'),
      colorTextTertiary: color('color-text-tertiary'),
      colorTextLightSolid: color('color-text-on-action'),
      colorBgBase: color('color-bg-surface'),
      colorBgLayout: color('color-bg-app'),
      colorBgContainer: color('color-bg-surface'),
      colorBgElevated: color('color-bg-surface'),
      colorFillAlter: color('color-bg-subtle'),
      colorBorder: color('color-border-strong'),
      colorBorderSecondary: color('color-border'),
      controlItemBgHover: color('color-bg-hover'),
      controlItemBgActive: color('color-action-subtle'),
      fontFamily: color('font-family-base'),
      fontFamilyCode: color('font-family-num'),
      fontSize: num('font-size-body'),
      fontSizeSM: num('font-size-caption'),
      fontSizeLG: num('font-size-title'),
      fontSizeHeading1: num('font-size-kpi'),
      fontSizeHeading2: num('font-size-page'),
      fontSizeHeading3: num('font-size-title'),
      fontSizeHeading4: num('font-size-title'),
      fontSizeHeading5: num('font-size-body'),
      borderRadius: num('radius-control'),
      borderRadiusSM: num('radius-badge'),
      borderRadiusLG: num('radius-surface'),
      lineWidth: num('border-w'),
      lineWidthFocus: num('focus-ring-w'),
      controlHeight: num('control-h'),
      controlHeightSM: num('control-h-sm'),
      paddingXXS: num('space-xs'),
      paddingXS: num('space-sm'),
      paddingSM: num('space-md'),
      padding: num('space-lg'),
      paddingLG: num('space-xl'),
      marginXXS: num('space-xs'),
      marginXS: num('space-sm'),
      marginSM: num('space-md'),
      margin: num('space-lg'),
      marginLG: num('space-xl'),
      boxShadowSecondary: color('shadow-overlay'),
      wireframe: false
    },
    components: {
      Menu: {
        itemHeight: num('control-h'),
        itemMarginBlock: 0,
        itemMarginInline: 0,
        itemBorderRadius: 0,
        itemBg: color('color-bg-surface'),
        subMenuItemBg: color('color-bg-surface'),
        itemHoverBg: color('color-bg-hover'),
        itemSelectedBg: color('color-action-subtle'),
        itemSelectedColor: color('color-text-primary'),
        itemColor: color('color-text-secondary'),
        activeBarBorderWidth: 0
      },
      Drawer: {
        paddingLG: num('space-lg')
      },
      Segmented: {
        itemSelectedBg: color('color-action-subtle'),
        itemSelectedColor: color('color-text-primary'),
        trackBg: color('color-bg-hover')
      }
    }
  };
};
