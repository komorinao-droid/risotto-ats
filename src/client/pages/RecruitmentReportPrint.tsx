import React, { useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { DateRange, MatrixRow, AgeBreakdown } from '@/utils/reports/types';
import { presetToRange, formatRange } from '@/utils/reports/dateRange';
import { buildReport } from '@/utils/reports/aggregate';
import { storage } from '@/utils/storage';

/**
 * 採用レポート 印刷専用ビュー
 *
 * SPD様の振り返り資料準拠の章構成。クエリパラメータで期間を指定可能:
 *   /reports/print?preset=lastHalf
 *   /reports/print?start=2025-04-01&end=2025-09-30
 *
 * ブラウザの印刷ダイアログ→「PDFとして保存」で本番納品資料として出力可能。
 */

const fmt = (n: number) => n.toLocaleString('ja-JP');
const pct = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) + '%' : '-');

const RecruitmentReportPrint: React.FC = () => {
  const { client } = useAuth();

  // クエリパラメータ
  const search = new URLSearchParams(window.location.search);
  const preset = (search.get('preset') as any) || 'lastHalf';
  const customStart = search.get('start') || '';
  const customEnd = search.get('end') || '';

  const range: DateRange = useMemo(() => {
    if (customStart && customEnd) return { start: customStart, end: customEnd };
    return presetToRange(preset);
  }, [preset, customStart, customEnd]);

  const fullData = useMemo(() => {
    if (!client) return null;
    const dataId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
    try { return storage.getClientData(dataId); } catch { return null; }
  }, [client]);

  const report = useMemo(() => (fullData ? buildReport(fullData, range) : null), [fullData, range]);

  // ?print=1 で自動印刷
  useEffect(() => {
    if (search.get('print') === '1' && report) {
      setTimeout(() => { window.print(); }, 800);
    }
  }, [report]);

  if (!report || !client) {
    return <div style={{ padding: '2rem' }}>データを読み込み中...</div>;
  }

  const clientName = client.companyName || 'クライアント名未設定';
  const { total, ngBreakdown, byBase, bySource, byBaseSource, byAge, byBaseAge, ngAgeBreakdown, bySourceAge } = report;

  // 採用数上位10媒体（媒体×年代用）
  const topSourceAge = bySourceAge.filter((s) => s.rows.reduce((a, r) => a + r.applications, 0) > 0).slice(0, 10);

  return (
    <div className="print-root">
      {/* 操作バー（印刷時は非表示） */}
      <div className="op-bar no-print">
        <div>
          <strong>{clientName}</strong> 採用レポート / {formatRange(range)}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => window.history.back()}>← 戻る</button>
          <button onClick={() => window.print()} className="primary">PDFとして保存 / 印刷</button>
        </div>
      </div>

      {/* ===== p.1 表紙 ===== */}
      <section className="page cover">
        <div className="cover-band" />
        <div className="cover-body">
          <div className="cover-eyebrow">RECRUITMENT REPORT</div>
          <h1 className="cover-title">採用レポート</h1>
          <div className="cover-period">{range.start.replace(/-/g, '.')} 〜 {range.end.replace(/-/g, '.')}</div>
          <div className="cover-period-jp">応募〜採用数</div>
        </div>
        <div className="cover-footer">
          <div className="cover-client">{clientName}</div>
          <div className="cover-meta">
            <span>RISOTTO ATS</span>
            <span>generated: {new Date(report.generatedAt).toLocaleDateString('ja-JP')}</span>
          </div>
        </div>
      </section>

      {/* ===== p.2 振り返り資料について ===== */}
      <PageWrap pageNum={2} clientName={clientName} range={range}>
        <h2 className="section-h">振り返り資料について</h2>
        <p className="lead">本資料は下記の前提で作成しました。予めご了承ください。</p>
        <h3 className="sub-h">本資料の目的</h3>
        <p className="body-text">
          {range.start.slice(0, 7).replace('-', '年') + '月'} 〜 {range.end.slice(0, 7).replace('-', '年') + '月'}の採用活動を定量的に振り返ることで、今後の採用をより効率的にすること。
        </p>
        <h3 className="sub-h">前提</h3>
        <table className="info-table">
          <tbody>
            <tr><th>参照データ</th><td>RISOTTO ATS の応募者データより</td></tr>
            <tr><th>集計期間</th><td>{range.start} 〜 {range.end}</td></tr>
            <tr><th>データ取得日</th><td>{new Date(report.generatedAt).toLocaleDateString('ja-JP')} 時点</td></tr>
            <tr><th>採用数の定義</th><td>ステータスが「採用」「稼働」「入社」「内定承諾」「面接合格」のいずれかの応募者</td></tr>
            <tr><th>有効応募の定義</th><td>「不合格」「対象外」「重複」「辞退」等のNGステータス（面接前判定）を除いた応募者数</td></tr>
            <tr><th>面接設定の定義</th><td>面接イベントが存在、またはステータスが面接以降に進んだ応募者</td></tr>
          </tbody>
        </table>
      </PageWrap>

      {/* ===== p.3 採用ファネル全体 ===== */}
      <PageWrap pageNum={3} clientName={clientName} range={range}>
        <h2 className="section-h">{formatRange(range)}：応募〜採用数</h2>
        <p className="lead">{formatRange(range)}：応募〜採用数（全社分）</p>
        <FunnelChart total={total} />
      </PageWrap>

      {/* ===== p.4 数字の定義と注意点 ===== */}
      <PageWrap pageNum={4} clientName={clientName} range={range}>
        <h2 className="section-h">{formatRange(range)}：応募〜採用数</h2>
        <h3 className="sub-h">数字の定義と注意点</h3>
        <ul className="check-list">
          <li>採用数は「ステータス」が下記のものを抽出しました。<br />→ 採用 / 稼働 / 入社 / 内定承諾 / 面接合格<br /><span className="muted">※ 内定辞退は採用に入れておりません。</span></li>
          <li>有効応募数は、不合格(書類)・対象外・重複・条件不一致など、面接前にNGとなった応募者を除いた数値です。</li>
          <li>面接設定数は、面接イベントが存在するか、ステータスが面接以降に進んだ応募者の合計です。</li>
        </ul>
      </PageWrap>

      {/* ===== p.5 選考NGの内訳 ===== */}
      <PageWrap pageNum={5} clientName={clientName} range={range}>
        <h2 className="section-h">{formatRange(range)}：選考NGの詳細</h2>
        <p className="lead">選考NGの内訳は下記となります。</p>
        <div className="row-2col">
          <div className="ng-summary">
            <div className="ng-arrow">-{fmt(ngBreakdown.total)}名</div>
            <div className="ng-stack">
              <div className="ng-bar app">
                <div className="ng-bar-label">応募数</div>
                <div className="ng-bar-num">{fmt(total.applications)}</div>
              </div>
              <div className="ng-bar valid">
                <div className="ng-bar-label">有効応募数</div>
                <div className="ng-bar-num">{fmt(total.validApplications)}</div>
              </div>
            </div>
          </div>
          <table className="ng-table">
            <thead>
              <tr><th>要因</th><th>人数</th><th>割合</th></tr>
            </thead>
            <tbody>
              {[
                ['年齢NG', ngBreakdown.byReason.age],
                ['条件不一致', ngBreakdown.byReason.condition],
                ['重複応募', ngBreakdown.byReason.duplicate],
                ['人物不適合', ngBreakdown.byReason.personality],
                ['その他', ngBreakdown.byReason.other],
              ].filter(([, v]) => (v as number) > 0).map(([label, count]) => (
                <tr key={label as string}>
                  <td>{label}</td>
                  <td className="num">{fmt(count as number)}名</td>
                  <td className="num">{ngBreakdown.total > 0 ? `${(((count as number) / ngBreakdown.total) * 100).toFixed(0)}%` : '-'}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>合計</td>
                <td className="num">{fmt(ngBreakdown.total)}名</td>
                <td className="num">-</td>
              </tr>
            </tbody>
          </table>
        </div>
        {ngBreakdown.byReason.age > 0 && (
          <p className="annotation">最も割合の多い「年齢NG」の詳細は後半ページに記載しました。</p>
        )}
      </PageWrap>

      {/* ===== p.6 支社別ファネル ===== */}
      <PageWrap pageNum={6} clientName={clientName} range={range}>
        <h2 className="section-h">{formatRange(range)}：支社別</h2>
        <p className="lead">支社別の応募〜採用数は下記となります。</p>
        <FunnelMatrix rows={[{ label: '全体', ...total }, ...byBase]} highlightFirst headerLabel="支社別" />
      </PageWrap>

      {/* ===== p.7 媒体別ファネル ===== */}
      <PageWrap pageNum={7} clientName={clientName} range={range}>
        <h2 className="section-h">{formatRange(range)}：求人媒体別</h2>
        <p className="lead">求人媒体別の応募〜採用数は下記となります。<span className="muted">※採用数が多い順</span></p>
        <FunnelMatrix rows={bySource} headerLabel="求人媒体" />
      </PageWrap>

      {/* ===== 各支社×媒体別 ===== */}
      {byBaseSource.filter(({ rows }) => rows.length > 0).map(({ base, rows }, idx) => (
        <PageWrap key={base} pageNum={8 + idx} clientName={clientName} range={range}>
          <h2 className="section-h">【{base}】支社×媒体別</h2>
          <p className="lead">{base}の応募〜採用数は下記となります。<span className="muted">※採用数が多い順</span></p>
          <FunnelMatrix rows={rows} headerLabel="求人媒体" />
        </PageWrap>
      ))}

      {/* ===== 章扉: 詳細分析:年齢 ===== */}
      <PageWrap pageNum={null} clientName={clientName} range={range} chapterCover>
        <div className="chapter-content">
          <div className="chapter-eyebrow">CHAPTER</div>
          <h1 className="chapter-title">詳細分析<br /><span className="chapter-subtitle">年代</span></h1>
          <ol className="chapter-toc">
            <li>① 選考NGの年齢詳細</li>
            <li>② 全社×年代別</li>
            <li>③ 支社×年代別</li>
            <li>④ 媒体×年代別</li>
          </ol>
        </div>
      </PageWrap>

      {/* 選考NG年齢内訳 */}
      {ngAgeBreakdown.length > 0 && (
        <PageWrap pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">【選考NG】年齢の内訳</h2>
          <table className="age-table">
            <thead>
              <tr><th>年齢層</th><th>人数</th><th>割合</th></tr>
            </thead>
            <tbody>
              {ngAgeBreakdown.map((r) => (
                <tr key={r.ageGroup}>
                  <td>{r.ageGroup}</td>
                  <td className="num">{fmt(r.count)}名</td>
                  <td className="num">{r.rate.toFixed(2)}%</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>合計</td>
                <td className="num">{fmt(ngAgeBreakdown.reduce((s, r) => s + r.count, 0))}名</td>
                <td className="num">-</td>
              </tr>
            </tbody>
          </table>
        </PageWrap>
      )}

      {/* 全社×年代別 */}
      <PageWrap pageNum={null} clientName={clientName} range={range}>
        <h2 className="section-h">【全社】支社×年代別</h2>
        <AgeFunnelTable rows={byAge} />
        <Annotation rows={byAge} entityLabel="全社" />
      </PageWrap>

      {/* 各支社×年代別 */}
      {byBaseAge.filter(({ rows }) => rows.length > 0).map(({ base, rows }) => (
        <PageWrap key={base} pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">【{base}】支社×年代別</h2>
          <AgeFunnelTable rows={rows} />
          <Annotation rows={rows} entityLabel={base} />
        </PageWrap>
      ))}

      {/* 章扉: 媒体×年代 */}
      <PageWrap pageNum={null} clientName={clientName} range={range} chapterCover>
        <div className="chapter-content">
          <div className="chapter-eyebrow">DETAIL</div>
          <h1 className="chapter-title">媒体 × 年代別</h1>
          <p className="chapter-desc">
            「採用数」が多い上位{topSourceAge.length}媒体に関して、<br />
            年代別の応募/採用数を以下に記載いたします。
          </p>
          <ul className="chapter-list">
            {topSourceAge.map(({ source }) => <li key={source}>{source}</li>)}
          </ul>
        </div>
      </PageWrap>

      {/* 媒体×年代別（2媒体ペア） */}
      {chunkPairs(topSourceAge).map((pair, idx) => (
        <PageWrap key={`pair-${idx}`} pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">【媒体別】年代別に関して</h2>
          <div className="row-2col">
            {pair.map(({ source, rows }) => (
              <SourceAgeBlock key={source} source={source} rows={rows} />
            ))}
            {pair.length === 1 && <div />}
          </div>
        </PageWrap>
      ))}

      <PrintStyles />
    </div>
  );
};

/* ===== サブコンポーネント ===== */

const PageWrap: React.FC<{
  pageNum: number | null;
  clientName: string;
  range: DateRange;
  chapterCover?: boolean;
  children: React.ReactNode;
}> = ({ pageNum, clientName, range, chapterCover, children }) => (
  <section className={`page ${chapterCover ? 'chapter' : ''}`}>
    <header className="page-header">
      <span>採用レポート</span>
      <span>{formatRange(range)}</span>
      <span>{clientName}</span>
    </header>
    <div className="page-body">{children}</div>
    {pageNum !== null && <footer className="page-footer">{pageNum}</footer>}
  </section>
);

const FunnelChart: React.FC<{ total: any }> = ({ total }) => {
  const stages = [
    { label: '応募数',     value: total.applications,        sub: '' },
    { label: '有効応募数', value: total.validApplications,   sub: pct(total.validRate, 0) },
    { label: '面接設定数', value: total.interviewScheduled,  sub: pct(total.validToInterviewRate, 0) },
    { label: '採用数',     value: total.hired,                sub: pct(total.applicationToHireRate, 1) },
    { label: '稼働数',     value: total.active,               sub: pct(total.applicationToActiveRate, 2) },
  ];
  return (
    <div className="funnel">
      {stages.map((s, i) => (
        <React.Fragment key={s.label}>
          <div className="funnel-tile">
            {s.sub && <div className="funnel-rate">{s.sub}</div>}
            <div className="funnel-num">{fmt(s.value)}</div>
            <div className="funnel-label">{s.label}</div>
          </div>
          {i < stages.length - 1 && <div className="funnel-arrow">▶</div>}
        </React.Fragment>
      ))}
    </div>
  );
};

const FunnelMatrix: React.FC<{ rows: MatrixRow[]; highlightFirst?: boolean; headerLabel: string }> = ({ rows, highlightFirst, headerLabel }) => (
  <table className="funnel-matrix">
    <thead>
      <tr>
        <th rowSpan={2} className="label-col">{headerLabel}</th>
        <th rowSpan={2}>応募数</th>
        <th rowSpan={2}>有効応募数</th>
        <th rowSpan={2}>面接設定数</th>
        <th rowSpan={2}>内定数</th>
        <th rowSpan={2}>採用数</th>
        <th rowSpan={2}>稼働数</th>
        <th colSpan={5} className="rate-group-h">通過率</th>
      </tr>
      <tr>
        <th>応募〜<br />有効応募率</th>
        <th>有効応募〜<br />面接設定率</th>
        <th>応募〜<br />内定数</th>
        <th>応募〜<br />採用率</th>
        <th>応募〜<br />稼働率</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={r.label} className={highlightFirst && i === 0 ? 'overall-row' : ''}>
          <td className="label-col">{r.label}</td>
          <td className="num">{fmt(r.applications)}</td>
          <td className="num">{fmt(r.validApplications)}</td>
          <td className="num">{fmt(r.interviewScheduled)}</td>
          <td className="num">{fmt(r.offered)}</td>
          <td className="num accent">{fmt(r.hired)}</td>
          <td className="num">{fmt(r.active)}</td>
          <td className="num rate">{pct(r.validRate)}</td>
          <td className="num rate">{pct(r.validToInterviewRate)}</td>
          <td className="num rate">{pct(r.applications > 0 ? (r.offered / r.applications) * 100 : 0)}</td>
          <td className="num rate">{pct(r.applicationToHireRate)}</td>
          <td className="num rate">{pct(r.applicationToActiveRate)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const AgeFunnelTable: React.FC<{ rows: AgeBreakdown[] }> = ({ rows }) => {
  const totalApps = rows.reduce((s, r) => s + r.applications, 0);
  const totalHired = rows.reduce((s, r) => s + r.hired, 0);
  return (
    <table className="age-table">
      <thead>
        <tr><th>年齢</th><th>応募数</th><th>割合</th><th>採用数</th><th>割合</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ageGroup}>
            <td>{r.ageGroup}</td>
            <td className="num">{fmt(r.applications)}名</td>
            <td className="num">{r.applicationRate.toFixed(1)}%</td>
            <td className="num accent">{fmt(r.hired)}名</td>
            <td className="num">{r.hireRate.toFixed(1)}%</td>
          </tr>
        ))}
        <tr className="total-row">
          <td>合計</td>
          <td className="num">{fmt(totalApps)}名</td>
          <td className="num">-</td>
          <td className="num">{fmt(totalHired)}名</td>
          <td className="num">-</td>
        </tr>
      </tbody>
    </table>
  );
};

const SourceAgeBlock: React.FC<{ source: string; rows: AgeBreakdown[] }> = ({ source, rows }) => {
  const totalApps = rows.reduce((s, r) => s + r.applications, 0);
  const totalHired = rows.reduce((s, r) => s + r.hired, 0);
  return (
    <div className="src-age-block">
      <h3 className="sub-h center">{source}</h3>
      <table className="age-table compact">
        <thead>
          <tr><th>年齢</th><th>応募数</th><th>採用数</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ageGroup}>
              <td>{r.ageGroup}</td>
              <td className="num">{fmt(r.applications)}名</td>
              <td className="num accent">{fmt(r.hired)}名</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>合計</td>
            <td className="num">{fmt(totalApps)}名</td>
            <td className="num">{fmt(totalHired)}名</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

/** 自動コメント生成（最も応募/採用が多い年代） */
const Annotation: React.FC<{ rows: AgeBreakdown[]; entityLabel: string }> = ({ rows, entityLabel }) => {
  if (rows.length === 0) return null;
  const topApp = [...rows].sort((a, b) => b.applications - a.applications)[0];
  const topHired = [...rows].filter((r) => r.hired > 0).sort((a, b) => b.hired - a.hired)[0];
  if (!topApp.applications) return null;
  return (
    <div className="annotation-box">
      <div className="ann-label">{entityLabel}</div>
      <ul>
        <li>応募数: <strong>{topApp.ageGroup}</strong> が最も多い ({fmt(topApp.applications)}名 / {topApp.applicationRate.toFixed(1)}%)</li>
        {topHired && <li>採用数: <strong>{topHired.ageGroup}</strong> が最も多い ({fmt(topHired.hired)}名 / {topHired.hireRate.toFixed(1)}%)</li>}
      </ul>
    </div>
  );
};

function chunkPairs<T>(arr: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) result.push(arr.slice(i, i + 2));
  return result;
}

/* ===== Print Styles ===== */
const PrintStyles: React.FC = () => (
  <style>{`
    @page {
      size: A4;
      margin: 0;
    }
    .print-root {
      background: #f3f4f6;
      min-height: 100vh;
      font-family: 'Yu Gothic', 'Hiragino Sans', 'Meiryo', sans-serif;
      color: #1f2937;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .op-bar {
      position: sticky; top: 0; z-index: 100;
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.75rem 1.5rem;
      background: #1f2937; color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .op-bar button {
      padding: 0.5rem 1rem;
      border: 1px solid rgba(255,255,255,0.3);
      background: transparent;
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
    }
    .op-bar button.primary { background: #f97316; border-color: #f97316; font-weight: 600; }

    .page {
      width: 210mm;
      height: 297mm;
      margin: 1rem auto;
      background: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      position: relative;
      padding: 0;
      overflow: hidden;
      page-break-after: always;
      box-sizing: border-box;
    }
    .page:last-child { page-break-after: auto; }

    .page-header {
      position: absolute; top: 0; left: 0; right: 0;
      height: 22mm;
      padding: 8mm 15mm 0;
      display: flex; justify-content: space-between;
      font-size: 9pt; color: #9ca3af;
      border-bottom: 1px solid #f3f4f6;
    }
    .page-footer {
      position: absolute; bottom: 8mm; right: 15mm;
      font-size: 9pt; color: #9ca3af;
    }
    .page-body {
      padding: 28mm 15mm 18mm;
      height: 100%;
      box-sizing: border-box;
    }

    /* 表紙 */
    .cover { display: flex; flex-direction: column; padding: 0; }
    .cover-band {
      height: 60mm;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      position: relative;
    }
    .cover-band::after {
      content: '';
      position: absolute; bottom: -10mm; left: 0; right: 0;
      height: 10mm;
      background: linear-gradient(135deg, #fdba74, #fed7aa);
    }
    .cover-body {
      flex: 1;
      display: flex; flex-direction: column; justify-content: center;
      padding: 0 25mm;
    }
    .cover-eyebrow {
      font-size: 11pt; letter-spacing: 0.3em; color: #f97316;
      margin-bottom: 4mm; font-weight: 600;
    }
    .cover-title {
      font-size: 48pt; font-weight: 900;
      margin: 0 0 8mm; color: #1f2937;
      letter-spacing: -0.02em;
    }
    .cover-period {
      font-size: 22pt; color: #f97316; font-weight: 700;
      margin-bottom: 4mm;
    }
    .cover-period-jp { font-size: 14pt; color: #6b7280; }
    .cover-footer {
      padding: 15mm 25mm 25mm;
      border-top: 4px solid #f97316;
    }
    .cover-client {
      font-size: 18pt; font-weight: 700; color: #1f2937;
      margin-bottom: 8mm;
    }
    .cover-meta {
      display: flex; justify-content: space-between;
      font-size: 10pt; color: #9ca3af;
    }

    /* セクション見出し */
    .section-h {
      font-size: 16pt; font-weight: 700; color: #1f2937;
      margin: 0 0 4mm;
      padding-bottom: 2mm;
      border-bottom: 3px solid #f97316;
      position: relative;
    }
    .section-h::before {
      content: '';
      position: absolute; left: 0; bottom: -3px;
      width: 30mm; height: 3px; background: #1f2937;
    }
    .sub-h {
      font-size: 12pt; font-weight: 700; color: #f97316;
      margin: 6mm 0 3mm;
      padding-left: 3mm;
      border-left: 3px solid #f97316;
    }
    .sub-h.center { text-align: center; padding-left: 0; border-left: none; padding: 2mm; background: #ffedd5; border-radius: 2mm; }
    .lead { font-size: 10pt; color: #4b5563; margin: 0 0 6mm; }
    .body-text { font-size: 10pt; color: #1f2937; margin: 0 0 4mm; line-height: 1.7; }
    .muted { color: #9ca3af; font-size: 0.9em; }
    .annotation {
      margin-top: 6mm;
      padding: 3mm 4mm;
      background: #ffedd5;
      border-left: 3px solid #f97316;
      font-size: 10pt;
      color: #9a3412;
      border-radius: 1mm;
    }

    /* 情報テーブル */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
    }
    .info-table th {
      background: #fff7ed;
      color: #9a3412;
      font-weight: 600;
      text-align: left;
      padding: 3mm 4mm;
      width: 35mm;
      border: 1px solid #fed7aa;
    }
    .info-table td {
      padding: 3mm 4mm;
      border: 1px solid #fed7aa;
      background: #fff;
    }

    /* チェックリスト */
    .check-list { list-style: none; padding: 0; margin: 0; }
    .check-list li {
      padding: 3mm 0 3mm 8mm;
      position: relative;
      border-bottom: 1px dashed #fed7aa;
      font-size: 10pt;
      line-height: 1.7;
    }
    .check-list li::before {
      content: '✓';
      position: absolute; left: 0; top: 3mm;
      color: #f97316; font-weight: 700; font-size: 14pt;
    }

    /* ファネル */
    .funnel {
      display: flex; align-items: center; justify-content: center;
      gap: 2mm;
      margin: 12mm 0;
      flex-wrap: nowrap;
    }
    .funnel-tile {
      flex: 1;
      min-width: 28mm;
      background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
      border: 2px solid #f97316;
      border-radius: 3mm;
      padding: 4mm 2mm;
      text-align: center;
    }
    .funnel-rate {
      font-size: 11pt; font-weight: 700; color: #f97316;
      margin-bottom: 2mm;
    }
    .funnel-num {
      font-size: 22pt; font-weight: 800; color: #1f2937;
      line-height: 1;
    }
    .funnel-label { font-size: 9pt; color: #6b7280; margin-top: 2mm; }
    .funnel-arrow { color: #f97316; font-size: 16pt; font-weight: 700; }

    /* NG セクション */
    .row-2col {
      display: grid;
      grid-template-columns: 1fr 1.4fr;
      gap: 8mm;
      align-items: start;
    }
    .ng-summary { display: flex; flex-direction: column; gap: 3mm; }
    .ng-arrow {
      text-align: center;
      color: #dc2626; font-weight: 700; font-size: 14pt;
    }
    .ng-stack { display: flex; flex-direction: column; gap: 2mm; }
    .ng-bar {
      padding: 4mm; border-radius: 2mm; color: #fff;
      display: flex; flex-direction: column; align-items: center;
    }
    .ng-bar.app { background: #f97316; }
    .ng-bar.valid { background: #fb923c; margin-left: 8mm; margin-right: 8mm; }
    .ng-bar-label { font-size: 9pt; opacity: 0.9; }
    .ng-bar-num { font-size: 20pt; font-weight: 800; }

    .ng-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .ng-table th, .ng-table td {
      padding: 2.5mm 3mm; border: 1px solid #fed7aa; text-align: left;
    }
    .ng-table th { background: #f97316; color: #fff; font-weight: 600; }
    .ng-table td.num { text-align: right; }
    .ng-table .total-row td { background: #ffedd5; font-weight: 700; }

    /* ファネルマトリクス */
    .funnel-matrix {
      width: 100%; border-collapse: collapse; font-size: 8pt;
    }
    .funnel-matrix th {
      background: #f97316; color: #fff;
      padding: 2mm 1.5mm; border: 1px solid #ea580c;
      text-align: center; font-weight: 600; font-size: 7.5pt;
      vertical-align: middle;
    }
    .funnel-matrix th.label-col { width: 24mm; }
    .funnel-matrix th.rate-group-h { background: #ea580c; }
    .funnel-matrix td {
      padding: 2mm 1.5mm; border: 1px solid #fed7aa;
      text-align: left;
    }
    .funnel-matrix td.label-col { font-weight: 600; }
    .funnel-matrix td.num { text-align: right; }
    .funnel-matrix td.accent { color: #c2410c; font-weight: 700; }
    .funnel-matrix td.rate { color: #6b7280; background: #fffbeb; }
    .funnel-matrix tr.overall-row td { background: #ffedd5; font-weight: 700; }
    .funnel-matrix tr.overall-row td.rate { background: #fed7aa; }

    /* 年代テーブル */
    .age-table {
      width: 100%; border-collapse: collapse; font-size: 10pt;
    }
    .age-table th {
      background: #f97316; color: #fff;
      padding: 2.5mm 3mm; border: 1px solid #ea580c;
      text-align: center; font-weight: 600;
    }
    .age-table td {
      padding: 2.5mm 3mm; border: 1px solid #fed7aa;
    }
    .age-table td.num { text-align: right; }
    .age-table td.accent { color: #c2410c; font-weight: 700; }
    .age-table .total-row td { background: #ffedd5; font-weight: 700; }
    .age-table.compact th, .age-table.compact td { padding: 1.5mm 2mm; font-size: 9pt; }

    .annotation-box {
      margin-top: 6mm;
      padding: 4mm 5mm;
      background: #ffedd5;
      border: 1px solid #fed7aa;
      border-radius: 2mm;
    }
    .ann-label {
      font-size: 10pt; font-weight: 700; color: #9a3412;
      margin-bottom: 2mm;
    }
    .annotation-box ul { margin: 0; padding-left: 5mm; font-size: 10pt; line-height: 1.8; }
    .annotation-box strong { color: #c2410c; }

    /* 章扉 */
    .page.chapter .page-body {
      display: flex; align-items: center; justify-content: center;
      flex-direction: column;
    }
    .chapter-content {
      text-align: center;
      max-width: 140mm;
    }
    .chapter-eyebrow {
      font-size: 11pt; letter-spacing: 0.3em; color: #f97316;
      margin-bottom: 8mm; font-weight: 600;
    }
    .chapter-title {
      font-size: 36pt; font-weight: 900; color: #1f2937;
      line-height: 1.2; margin: 0 0 12mm;
    }
    .chapter-subtitle { color: #f97316; }
    .chapter-toc, .chapter-list {
      list-style: none; padding: 0; margin: 0;
      font-size: 13pt; color: #4b5563; line-height: 2;
    }
    .chapter-list li {
      display: inline-block; margin: 1mm 2mm; padding: 1mm 4mm;
      background: #ffedd5; color: #9a3412;
      border-radius: 999px; font-size: 11pt;
    }
    .chapter-desc {
      font-size: 11pt; color: #6b7280;
      line-height: 1.8; margin-bottom: 8mm;
    }

    /* 媒体×年代ペア */
    .src-age-block { display: flex; flex-direction: column; }

    /* 印刷時 */
    @media print {
      .no-print { display: none !important; }
      .print-root { background: #fff; }
      .page {
        margin: 0;
        box-shadow: none;
        page-break-after: always;
        width: 100%;
        height: 100vh;
      }
    }
  `}</style>
);

export default RecruitmentReportPrint;
