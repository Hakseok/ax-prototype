// PDF of the monthly report (pdfmake, MIT) with IBM Plex Sans KR (OFL) so the text stays Korean
// and searchable. Loaded only when the viewer exports, so the first screen does not pay for it.
// The PDF is printed matter: it always uses the light palette, whatever the screen theme is.
import { renderChartPng } from '../components/Chart';
import { readToken, readTokenNumber } from '../theme/tokens';
import type { ReportModel } from './model';

// TrueType unwrapped from the package WOFF by scripts/fonts-unwrap.mjs (same tables, much faster to read).
const FONT_FILES = { normal: 'IBMPlexSansKR-Regular.ttf', bold: 'IBMPlexSansKR-SemiBold.ttf' };
let fontsReady: Promise<void> | null = null;

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const loadPdfMake = async () => {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  fontsReady ??= (async () => {
    const vfs: Record<string, string> = {};
    for (const f of Object.values(FONT_FILES)) {
      const res = await fetch(`${import.meta.env.BASE_URL}fonts/${f}`);
      if (!res.ok) throw new Error(`글꼴 파일을 읽지 못했습니다: ${f}`);
      vfs[f] = toBase64(await res.arrayBuffer());
    }
    pdfMake.addVirtualFileSystem(vfs);
    pdfMake.addFonts({ PlexKR: { normal: FONT_FILES.normal, bold: FONT_FILES.bold, italics: FONT_FILES.normal, bolditalics: FONT_FILES.bold } });
  })();
  await fontsReady;
  return pdfMake;
};

/** Run fn with the light theme applied, so token reads and chart images use the print palette. */
const withLightTheme = <T>(fn: () => T): T => {
  const root = document.documentElement;
  const prev = root.dataset.theme;
  root.dataset.theme = 'light';
  try {
    return fn();
  } finally {
    if (prev) root.dataset.theme = prev;
  }
};

// pdfmake rewrites the arrays it is given (list items become layout nodes), so every array from the
// model is copied before it goes into the document definition; the on-screen preview keeps the model.
export const buildPdf = async (m: ReportModel): Promise<Blob> => {
  const pdfMake = await loadPdfMake();
  const doc = withLightTheme(() => {
    const ink = readToken('color-text-primary');
    const muted = readToken('color-text-secondary');
    const line = readToken('color-border');
    const subtle = readToken('color-bg-subtle');
    const accent = readToken('color-effect');
    // Print geometry in PDF points, derived from the screen tokens (1 CSS pixel = 0.75 pt).
    const pt = (token: string, times = 1) => readTokenNumber(token) * 0.75 * times;
    const body = pt('font-size-body');
    const small = pt('font-size-caption');
    const margin = pt('space-xl', 2);
    const contentWidth = pt('report-page-w') - margin * 2;
    const thin = pt('border-w');
    const trendImg = renderChartPng(
      {
        ariaLabel: '월별 OEE',
        unit: m.trend.unit,
        fractionDigits: 1,
        categories: m.trend.categories,
        series: [
          { name: '기준선 기간', data: m.trend.baseline, kind: 'bar', color: 'compare', stack: 'm' },
          { name: 'AX 적용 후', data: m.trend.after, kind: 'bar', color: 'color-effect', stack: 'm' }
        ],
        thresholds: [{ name: '기준선 평균', value: m.trend.baselineAvg, level: 'reference' }]
      },
      1000,
      380
    );
    const cumImg = renderChartPng(
      {
        ariaLabel: '누적 순효과와 투자비',
        unit: '백만 원',
        fractionDigits: 1,
        categories: m.cumulative.categories,
        series: [
          { name: '누적 순효과 (실적)', data: m.cumulative.actual, color: 'color-effect' },
          { name: '누적 순효과 (예상)', data: m.cumulative.projected, color: 'color-effect', dashed: true }
        ],
        thresholds: m.cumulative.investment === null ? [] : [{ name: '투자비', value: m.cumulative.investment, level: 'reference' }]
      },
      1000,
      380
    );
    // numeric: indexes of right-aligned (number) columns.
    const table = (header: string[], rows: string[][], widths: (string | number)[], numeric: number[], lastBold = false) => ({
      table: {
        headerRows: 1,
        widths,
        body: [
          header.map((h, ci) => ({ text: h, bold: true, fontSize: small, color: muted, fillColor: subtle, alignment: numeric.includes(ci) ? 'right' : 'left' })),
          ...rows.map((r, ri) => r.map((c, ci) => ({ text: c, fontSize: body, alignment: numeric.includes(ci) ? 'right' : 'left', bold: lastBold && ri === rows.length - 1 })))
        ]
      },
      layout: { hLineColor: (): string => line, vLineWidth: (): number => 0, hLineWidth: (): number => thin, paddingTop: (): number => pt('space-xs'), paddingBottom: (): number => pt('space-xs') }
    });
    const h = (text: string) => ({ text, fontSize: body * 1.45, bold: true, margin: [0, pt('space-lg'), 0, pt('space-sm')] });

    return {
      pageSize: 'A4',
      pageMargins: [margin, margin * 1.4, margin, margin * 1.3],
      defaultStyle: { font: 'PlexKR', fontSize: body, color: ink, lineHeight: 1.3 },
      info: { title: `${m.title} ${m.month}`, author: m.company, subject: '시연용 가상 데이터' },
      header: (page: number) =>
        page === 1
          ? null
          : { columns: [{ text: `${m.title} · ${m.periodLabel}`, color: muted }, { text: m.demo, alignment: 'right', color: muted }], fontSize: small, margin: [margin, margin * 0.6, margin, 0] },
      footer: (page: number, count: number) => ({
        columns: [{ text: `${m.company} · ${m.scopeText}`, color: muted }, { text: `${page} / ${count}`, alignment: 'right', color: muted }],
        fontSize: small,
        margin: [margin, margin * 0.4, margin, 0]
      }),
      content: [
        // 1. cover and key messages
        { text: m.company, color: muted, margin: [0, margin * 3, 0, pt('space-sm')] },
        { text: m.title, fontSize: body * 3, bold: true },
        { text: `${m.periodLabel} · ${m.scopeText}`, fontSize: body * 1.5, margin: [0, pt('space-sm'), 0, pt('space-xs')] },
        { text: m.periodText, color: muted },
        { text: `${m.demo} · 작성 ${m.generatedAt}`, color: muted, fontSize: small, margin: [0, pt('space-xs'), 0, margin] },
        {
          table: { widths: ['*'], body: [[{ stack: [{ text: '핵심 요약', bold: true, margin: [0, 0, 0, pt('space-sm')] }, { ul: [...m.messages], lineHeight: 1.5 }], margin: [pt('space-md'), pt('space-md'), pt('space-md'), pt('space-md')] }]] },
          layout: { hLineColor: (): string => accent, vLineColor: (): string => accent, hLineWidth: (): number => thin, vLineWidth: (i: number): number => (i === 0 ? pt('line-w', 2) : 0) }
        },
        // 2. KPIs and OEE trend
        { ...h('1. 핵심 지표'), pageBreak: 'before' },
        table(['지표', '값', '단위', '비교', '비고'], m.kpis.map((k) => [k.label, k.value, k.unit, k.change, k.note]), [110, 60, 50, '*', 90], [1]),
        h('2. 월별 OEE · AX 적용 전후'),
        { image: trendImg, width: contentWidth },
        // 3. sites
        h('3. 사업장별 실적'),
        table(m.siteHeader, m.siteRows, [90, '*', '*', '*', '*', 50], [1, 2, 3, 4, 5], true),
        // 4. AX effect
        { ...h('4. AX 효과와 근거'), pageBreak: 'before' },
        {
          text: [
            '적용 후 누적 ',
            { text: `${m.effect.counted} 백만 원`, bold: true },
            ` (확정 ${m.effect.confirmed} + 추정 ${m.effect.estimated}) · 이번 보고 월 ${m.effect.monthCounted} 백만 원 · 투자비 ${m.effect.investment} 백만 원 · 누적 순효과 ${m.effect.net} 백만 원 · 회수 ${m.effect.payback}. 잠재 ${m.effect.potential} 백만 원(연간)은 합계에 넣지 않았다.`
          ],
          margin: [0, 0, 0, pt('space-sm')]
        },
        table(['항목', '분류', '누적 (백만 원)', '보고 월 (백만 원)', '합계'], m.effect.rows, ['*', 40, 90, 90, 40], [2, 3]),
        { image: cumImg, width: contentWidth, margin: [0, pt('space-md'), 0, 0] },
        // 5. risks and notes
        { ...h('5. 주요 리스크'), pageBreak: 'before' },
        m.risks.length ? table(['등급', '사업장', '내용', '상세', '예상 영향 (백만 원)'], m.risks, [30, 50, 90, '*', 70], [4]) : { text: '처리 중인 리스크가 없다.' },
        h('작성 기준'),
        { ul: [...m.notes], color: muted, fontSize: small }
      ]
    };
  });
  return pdfMake.createPdf(doc).getBlob();
};
