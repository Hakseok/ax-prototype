import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, SankeyChart, ScatterChart as EScatter } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useTheme } from '../theme/ThemeProvider';
import { readToken, readTokenNumber } from '../theme/tokens';
import { formatNumber } from './KpiCard';
import './Chart.css';

echarts.use([LineChart, BarChart, SankeyChart, EScatter,GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, DataZoomComponent, SVGRenderer, CanvasRenderer]);

export interface ChartSeries {
  name: string;
  /** null = not received; drawn as a gap, never as 0. */
  data: (number | null)[];
  kind?: 'line' | 'bar';
  /**
   * actual: measured values (neutral ink). compare: previous period (light neutral).
   * reference: target or baseline line. Otherwise a token name such as 'color-series-2' or 'color-energy-steam'.
   */
  color: string;
  dashed?: boolean;
  stack?: string;
  /** Bar fill pattern: hatch marks an estimated amount (guide 9), outline a potential one. */
  pattern?: 'hatch' | 'outline';
  /** Invisible spacer bar (waterfall base): not drawn, not in the legend or tooltip. */
  invisible?: boolean;
}

export interface ChartThreshold {
  name: string;
  value: number;
  level: 'critical' | 'warning' | 'reference';
}

interface ChartProps {
  categories: string[];
  series: ChartSeries[];
  thresholds?: ChartThreshold[];
  unit: string;
  ariaLabel: string;
  fractionDigits?: number;
  /** Horizontal bars (category on the y axis). */
  horizontal?: boolean;
  /** Range zoom and pan (P3). */
  zoom?: boolean;
  /** Fill the parent's height instead of the default chart height. */
  fill?: boolean;
  /** Vertical markers on categories, e.g. the moment an alert occurred. */
  markers?: { category: string; label: string }[];
}

const colorOf = (c: string) =>
  readToken(c === 'actual' ? 'color-data-actual' : c === 'compare' ? 'color-data-compare' : c === 'reference' ? 'color-data-reference' : c);

const thresholdColor = (level: ChartThreshold['level']) =>
  readToken(level === 'critical' ? 'color-status-critical' : level === 'warning' ? 'color-status-warning' : 'color-data-reference');

// All colors, sizes and fonts are read from tokens at build time,
// and the option is rebuilt whenever the theme revision changes.
export const buildOption = ({ categories, series, thresholds = [], unit, fractionDigits = 0, horizontal, zoom, markers = [] }: ChartProps): EChartsCoreOption => {
  const px = readTokenNumber;
  const text = readToken('color-text-secondary');
  const muted = readToken('color-text-tertiary');
  const font = readToken('font-family-base');
  const numFont = readToken('font-family-num');
  const caption = px('font-size-caption');
  const lineW = px('line-w');
  const axisLabel = { color: muted, fontFamily: numFont, fontSize: caption };
  const fmt = (v: number) => formatNumber(v, fractionDigits);

  const thresholdLines = thresholds.map((t) => ({
    name: t.name,
    [horizontal ? 'xAxis' : 'yAxis']: t.value,
    lineStyle: { color: thresholdColor(t.level), type: 'dashed', width: lineW },
    label: { formatter: `${t.name} ${fmt(t.value)}${unit ? ` ${unit}` : ''}`, position: horizontal ? 'end' : 'insideStartTop', color: text, fontFamily: font, fontSize: caption }
  }));
  const markerLines = markers.map((m) => ({
    xAxis: m.category,
    lineStyle: { color: readToken('color-text-secondary'), type: 'solid', width: px('border-w') },
    label: { formatter: m.label, position: 'insideEndTop', color: readToken('color-text-primary'), fontFamily: font, fontSize: caption, fontWeight: 600 }
  }));
  const valueAxis = {
    type: 'value',
    name: unit,
    nameTextStyle: { color: muted, fontFamily: font, fontSize: caption, align: horizontal ? 'left' : 'right' },
    scale: !series.some((s) => s.kind === 'bar'),
    splitLine: { lineStyle: { color: readToken('color-data-grid'), width: px('border-w') } },
    axisLabel: { ...axisLabel, formatter: (v: number) => formatNumber(v, Number.isInteger(v) ? 0 : fractionDigits) },
    // Keep threshold lines inside the plot even when values stay well below them.
    max: thresholds.length ? (extent: { max: number }) => Math.max(extent.max, ...thresholds.map((t) => t.value)) : undefined,
    // Bars always start at zero so heights compare honestly; lines may zoom to their range.
    min: series.some((s) => s.kind === 'bar') ? (extent: { min: number }) => Math.min(0, extent.min) : thresholds.length ? (extent: { min: number }) => Math.min(extent.min, ...thresholds.map((t) => t.value)) : undefined
  };
  const categoryAxis = {
    type: 'category',
    data: categories,
    boundaryGap: series.some((s) => s.kind === 'bar'),
    axisLine: { lineStyle: { color: readToken('color-border-strong') } },
    axisTick: { show: false },
    axisLabel: { ...axisLabel, hideOverlap: true }
  };

  return {
    animation: false,
    textStyle: { fontFamily: font, fontSize: caption, color: text },
    grid: {
      left: horizontal ? px('chart-axis-w') * 2 + px('space-lg') : px('chart-axis-w') + px('space-lg'),
      right: px('space-xl'),
      top: px('space-xl') + px('space-md'),
      bottom: zoom ? px('space-xl') * 3 : px('space-xl')
    },
    legend: {
      // A single series is named by the panel title; two or more get a legend (chart rule).
      show: series.filter((s) => !s.invisible).length > 1,
      data: series.filter((s) => !s.invisible).map((s) => s.name),
      top: 0,
      right: 0,
      itemWidth: px('chart-legend-swatch'),
      itemHeight: px('status-mark'),
      itemGap: px('space-lg'),
      textStyle: { color: text, fontFamily: font, fontSize: caption }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: readToken('color-bg-surface'),
      borderColor: readToken('color-border-strong'),
      borderWidth: px('border-w'),
      padding: [px('space-sm'), px('space-md')],
      textStyle: { color: readToken('color-text-primary'), fontFamily: font, fontSize: caption },
      extraCssText: 'box-shadow: var(--shadow-overlay); border-radius: var(--radius-control);',
      axisPointer: { type: horizontal ? 'shadow' : 'line', lineStyle: { color: readToken('color-action'), width: px('border-w') } },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? `${fmt(v)}${unit ? ` ${unit}` : ''}` : '미수신·없음'),
      // Spacer bars of a waterfall are not values.
      formatter: series.some((s) => s.invisible)
        ? (items: { seriesIndex: number; marker: string; seriesName: string; value: unknown; axisValueLabel: string }[]) =>
            [items[0]?.axisValueLabel, ...items.filter((it) => !series[it.seriesIndex].invisible && typeof it.value === 'number').map((it) => `${it.marker}${it.seriesName} ${fmt(it.value as number)}${unit ? ` ${unit}` : ''}`)].join('<br/>')
        : undefined
    },
    dataZoom: zoom
      ? [
          { type: 'inside', filterMode: 'none' },
          {
            type: 'slider', height: px('control-h-sm'), bottom: px('space-sm'), borderColor: readToken('color-border'),
            fillerColor: readToken('color-data-band'), textStyle: { color: muted, fontFamily: numFont, fontSize: caption },
            handleStyle: { color: readToken('color-bg-surface'), borderColor: readToken('color-border-strong') },
            dataBackground: { lineStyle: { color: readToken('color-data-compare') }, areaStyle: { color: readToken('color-bg-hover') } }
          }
        ]
      : undefined,
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
    series: series.map((s, i) => {
      const color = colorOf(s.color);
      const r = px('radius-control');
      if (s.invisible) {
        return { name: s.name, type: 'bar', data: s.data, stack: s.stack, silent: true, itemStyle: { color: 'transparent', borderColor: 'transparent' }, emphasis: { disabled: true } };
      }
      return {
        name: s.name,
        type: s.kind ?? 'line',
        data: s.data,
        stack: s.stack,
        connectNulls: false,
        showSymbol: false,
        symbolSize: px('status-mark'),
        barMaxWidth: px('space-xl') * 2,
        itemStyle: {
          color: s.pattern === 'outline' ? 'transparent' : color,
          borderColor: color,
          borderWidth: s.pattern === 'outline' ? lineW : 0,
          borderRadius: s.kind === 'bar' ? (horizontal ? [0, r, r, 0] : [r, r, 0, 0]) : 0,
          decal: s.pattern === 'hatch' ? { symbol: 'rect', symbolSize: px('border-w'), color: readToken('color-bg-surface'), dashArrayX: [1, 0], dashArrayY: [px('border-w') * 2, px('hatch-gap')], rotation: -Math.PI / 4 } : undefined
        },
        lineStyle: { color, width: lineW, type: s.dashed ? 'dashed' : 'solid' },
        emphasis: { focus: 'series' },
        z: s.color === 'actual' ? 3 : 2,
        markLine: i === 0 && thresholdLines.length + markerLines.length ? { symbol: 'none', silent: true, data: [...thresholdLines, ...markerLines] } : undefined
      };
    })
  };
};

const useEChart = (option: EChartsCoreOption) => {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const instance = echarts.init(host.current, undefined, { renderer: 'svg' });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);
  return host;
};

/** Render a chart off screen to a PNG data URL (PDF report). Uses the current theme's tokens. */
export const renderChartPng = (props: ChartProps, width: number, height: number): string => {
  const host = document.createElement('div');
  const instance = echarts.init(host, undefined, { renderer: 'canvas', width, height, devicePixelRatio: 2 });
  instance.setOption({ ...buildOption(props), backgroundColor: readToken('color-bg-surface') });
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2 });
  instance.dispose();
  return url;
};

export type { ChartProps };

export function Chart(props: ChartProps) {
  const { revision } = useTheme();
  // Rebuild after the theme revision so token values are re-read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const option = useMemo(() => buildOption(props), [props, revision]);
  const host = useEChart(option);
  return <div ref={host} className={`chart${props.fill ? ' chart--fill' : ''}`} role="img" aria-label={props.ariaLabel} />;
}

interface FlowChartProps {
  nodes: { name: string }[];
  links: { source: string; target: string; value: number }[];
  /** Source node name -> color token, so each energy source keeps its color. */
  nodeColors: Record<string, string>;
  unit: string;
  ariaLabel: string;
  fill?: boolean;
}

/** Sankey flow, e.g. energy source -> process in TOE. */
export function FlowChart({ nodes, links, nodeColors, unit, ariaLabel, fill }: FlowChartProps) {
  const { revision } = useTheme();
  const option = useMemo<EChartsCoreOption>(() => {
    const px = readTokenNumber;
    const font = readToken('font-family-base');
    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: readToken('color-bg-surface'),
        borderColor: readToken('color-border-strong'),
        textStyle: { color: readToken('color-text-primary'), fontFamily: font, fontSize: px('font-size-caption') },
        valueFormatter: (v: unknown) => (typeof v === 'number' ? `${formatNumber(v, 1)} ${unit}` : '')
      },
      series: [
        {
          type: 'sankey',
          left: px('space-md'),
          right: px('chart-axis-w') * 3,
          top: px('space-md'),
          bottom: px('space-md'),
          nodeGap: px('space-md'),
          nodeWidth: px('space-md'),
          emphasis: { focus: 'adjacency' },
          data: nodes.map((n) => ({
            name: n.name,
            itemStyle: { color: nodeColors[n.name] ? readToken(nodeColors[n.name]) : readToken('color-series-other'), borderWidth: 0 }
          })),
          links,
          lineStyle: { color: 'source', opacity: 0.35, curveness: 0.5 },
          label: { color: readToken('color-text-primary'), fontFamily: font, fontSize: px('font-size-caption') }
        }
      ]
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, nodeColors, unit, revision]);
  const host = useEChart(option);
  return <div ref={host} className={`chart${fill ? ' chart--fill' : ''}`} role="img" aria-label={ariaLabel} />;
}

interface ScatterChartProps {
  /** Each group is one series, e.g. problem lots and normal lots. */
  groups: { name: string; points: { x: number; y: number; id: string }[]; color: string; hollow?: boolean }[];
  xName: string;
  yName: string;
  xDigits?: number;
  yDigits?: number;
  /** Shaded x range, e.g. the recommended condition. */
  band?: { from: number; to: number; label: string };
  ariaLabel: string;
  fill?: boolean;
  onPick?: (id: string) => void;
}

/** Scatter of two variables (P11: process condition vs defect rate per lot). */
export function ScatterChart({ groups, xName, yName, xDigits = 1, yDigits = 1, band, ariaLabel, fill, onPick }: ScatterChartProps) {
  const { revision } = useTheme();
  const option = useMemo<EChartsCoreOption>(() => {
    const px = readTokenNumber;
    const font = readToken('font-family-base');
    const muted = readToken('color-text-tertiary');
    const caption = px('font-size-caption');
    const axis = (name: string, digits: number, x = false) => ({
      type: 'value',
      name,
      // The x name sits under the axis so it never covers the last tick label.
      nameLocation: x ? 'middle' : 'end',
      nameGap: x ? px('space-xl') : px('space-md'),
      scale: true,
      nameTextStyle: { color: muted, fontFamily: font, fontSize: caption },
      splitLine: { lineStyle: { color: readToken('color-data-grid'), width: px('border-w') } },
      axisLabel: { color: muted, fontFamily: readToken('font-family-num'), fontSize: caption, formatter: (v: number) => formatNumber(v, digits) }
    });
    return {
      animation: false,
      textStyle: { fontFamily: font, fontSize: caption },
      grid: { left: px('chart-axis-w') + px('space-lg'), right: px('space-xl'), top: px('space-xl') + px('space-md'), bottom: px('space-xl') * 2 },
      legend: { top: 0, right: 0, itemWidth: px('status-mark'), itemHeight: px('status-mark'), itemGap: px('space-lg'), textStyle: { color: readToken('color-text-secondary'), fontFamily: font, fontSize: caption } },
      tooltip: {
        trigger: 'item',
        backgroundColor: readToken('color-bg-surface'),
        borderColor: readToken('color-border-strong'),
        textStyle: { color: readToken('color-text-primary'), fontFamily: font, fontSize: caption },
        formatter: (p: { data: [number, number, string]; seriesName: string }) => `${p.data[2]}<br/>${p.seriesName} · ${xName} ${formatNumber(p.data[0], xDigits)} · ${yName} ${formatNumber(p.data[1], yDigits)}`
      },
      xAxis: axis(xName, xDigits, true),
      yAxis: axis(yName, yDigits),
      series: groups.map((g, i) => {
        const color = readToken(g.color === 'compare' ? 'color-data-compare' : g.color);
        return {
          name: g.name,
          type: 'scatter',
          symbolSize: px('status-mark') + px('space-xs'),
          data: g.points.map((p) => [p.x, p.y, p.id]),
          itemStyle: { color: g.hollow ? 'transparent' : color, borderColor: color, borderWidth: px('border-w') * 1.5 },
          z: groups.length - i + 2,
          markArea:
            i === 0 && band
              ? { silent: true, itemStyle: { color: readToken('color-data-band') }, label: { show: true, position: 'insideTop', color: readToken('color-text-secondary'), fontFamily: font, fontSize: caption }, data: [[{ xAxis: band.from, name: band.label }, { xAxis: band.to }]] }
              : undefined
        };
      })
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, xName, yName, xDigits, yDigits, band, revision]);
  const host = useEChart(option);
  useEffect(() => {
    const el = host.current;
    if (!el || !onPick) return;
    const inst = echarts.getInstanceByDom(el);
    const handler = (p: { data?: [number, number, string] }) => p.data && onPick(p.data[2]);
    inst?.on('click', handler as never);
    return () => {
      // The chart may already be disposed when the screen unmounts.
      if (inst && !inst.isDisposed()) inst.off('click', handler as never);
    };
  }, [host, onPick]);
  return <div ref={host} className={`chart${fill ? ' chart--fill' : ''}`} role="img" aria-label={ariaLabel} />;
}
