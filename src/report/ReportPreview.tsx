import { Chart } from '../components/Chart';
import type { ReportModel } from './model';
import './ReportPreview.css';

/** A4 pages of the monthly report, drawn from the same model as the PDF. */
export function ReportPreview({ m }: { m: ReportModel }) {
  const head = (
    <div className="rp__head">
      <span>
        {m.title} · {m.periodLabel}
      </span>
      <span>{m.demo}</span>
    </div>
  );
  const foot = (n: number) => (
    <div className="rp__foot">
      <span>
        {m.company} · {m.scopeText}
      </span>
      <span className="num">{n} / 4</span>
    </div>
  );
  return (
    <div className="rp">
      <section className="rp__page" id="rp-1" aria-label="1쪽 표지와 핵심 요약">
        <div className="rp__cover">
          <div className="caption">{m.company}</div>
          <h1 className="rp__title">{m.title}</h1>
          <div className="rp__subtitle">
            {m.periodLabel} · {m.scopeText}
          </div>
          <div className="caption num">{m.periodText}</div>
          <div className="caption">
            {m.demo} · 작성 <span className="num">{m.generatedAt}</span>
          </div>
          <div className="rp__summary">
            <strong>핵심 요약</strong>
            <ul>
              {m.messages.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        {foot(1)}
      </section>

      <section className="rp__page" id="rp-2" aria-label="2쪽 핵심 지표와 사업장 실적">
        {head}
        <h2 className="rp__h">1. 핵심 지표</h2>
        <table className="rp__table">
          <thead>
            <tr>
              <th>지표</th>
              <th className="rp__num">값</th>
              <th>단위</th>
              <th>비교</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {m.kpis.map((k) => (
              <tr key={k.label}>
                <td>{k.label}</td>
                <td className="rp__num num">{k.value}</td>
                <td>{k.unit}</td>
                <td className={k.worse ? 'rp__worse' : undefined}>{k.change}</td>
                <td className="caption">{k.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="rp__h">2. 월별 OEE · AX 적용 전후</h2>
        <div className="rp__chart">
          <Chart
            ariaLabel="월별 OEE. 기준선 기간과 AX 적용 후"
            unit={m.trend.unit}
            fractionDigits={1}
            categories={m.trend.categories}
            series={[
              { name: '기준선 기간', data: m.trend.baseline, kind: 'bar', color: 'compare', stack: 'm' },
              { name: 'AX 적용 후', data: m.trend.after, kind: 'bar', color: 'color-effect', stack: 'm' }
            ]}
            thresholds={[{ name: '기준선 평균', value: m.trend.baselineAvg, level: 'reference' }]}
            fill
          />
        </div>
        <h2 className="rp__h">3. 사업장별 실적</h2>
        <table className="rp__table">
          <thead>
            <tr>
              {m.siteHeader.map((h, i) => (
                <th key={h} className={i ? 'rp__num' : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.siteRows.map((r, ri) => (
              <tr key={r[0]} className={ri === m.siteRows.length - 1 ? 'rp__total' : undefined}>
                {r.map((c, ci) => (
                  <td key={ci} className={ci ? 'rp__num num' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {foot(2)}
      </section>

      <section className="rp__page" id="rp-3" aria-label="3쪽 AX 효과">
        {head}
        <h2 className="rp__h">4. AX 효과와 근거</h2>
        <p className="rp__p">
          적용 후 누적 <strong className="num">{m.effect.counted} 백만 원</strong> (확정 {m.effect.confirmed} + 추정 {m.effect.estimated}) · 이번 보고 월 {m.effect.monthCounted} 백만 원 · 투자비 {m.effect.investment} 백만 원 · 누적 순효과 {m.effect.net} 백만 원 · 회수 {m.effect.payback}. 잠재 {m.effect.potential} 백만 원(연간)은 합계에 넣지 않았다.
        </p>
        <table className="rp__table">
          <thead>
            <tr>
              <th>항목</th>
              <th>분류</th>
              <th className="rp__num">누적 (백만 원)</th>
              <th className="rp__num">보고 월 (백만 원)</th>
              <th>합계</th>
            </tr>
          </thead>
          <tbody>
            {m.effect.rows.map((r) => (
              <tr key={r[0]}>
                <td>{r[0]}</td>
                <td>{r[1]}</td>
                <td className="rp__num num">{r[2]}</td>
                <td className="rp__num num">{r[3]}</td>
                <td>{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rp__chart">
          <Chart
            ariaLabel="누적 순효과와 투자비"
            unit="백만 원"
            fractionDigits={1}
            categories={m.cumulative.categories}
            series={[
              { name: '누적 순효과 (실적)', data: m.cumulative.actual, color: 'color-effect' },
              { name: '누적 순효과 (예상)', data: m.cumulative.projected, color: 'color-effect', dashed: true }
            ]}
            thresholds={m.cumulative.investment === null ? [] : [{ name: '투자비', value: m.cumulative.investment, level: 'reference' }]}
            fill
          />
        </div>
        {foot(3)}
      </section>

      <section className="rp__page" id="rp-4" aria-label="4쪽 리스크와 작성 기준">
        {head}
        <h2 className="rp__h">5. 주요 리스크</h2>
        <table className="rp__table">
          <thead>
            <tr>
              <th>등급</th>
              <th>사업장</th>
              <th>내용</th>
              <th>상세</th>
              <th className="rp__num">예상 영향 (백만 원)</th>
            </tr>
          </thead>
          <tbody>
            {m.risks.map((r) => (
              <tr key={r[2] + r[1]}>
                {r.map((c, ci) => (
                  <td key={ci} className={ci === 4 ? 'rp__num num' : ci === 3 ? 'caption' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="rp__h">작성 기준</h2>
        <ul className="rp__notes caption">
          {m.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {foot(4)}
      </section>
    </div>
  );
}
