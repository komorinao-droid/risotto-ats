import React, { useMemo, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { DateRange, MatrixRow, AgeBreakdown, MonthlyBucket, StepFunnelColumn } from '@/utils/reports/types';
import { presetToRange, formatRange, prevRangeOf } from '@/utils/reports/dateRange';
import { buildReport } from '@/utils/reports/aggregate';
import { storage } from '@/utils/storage';
import { apiPost } from '@/utils/apiClient';

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
  const prevRange = useMemo(() => prevRangeOf(range), [range]);
  const prevReport = useMemo(() => (fullData ? buildReport(fullData, prevRange) : null), [fullData, prevRange]);

  // AI 総評: ?ai=1 が付いている時のみ取得
  const wantAI = search.get('ai') === '1';
  const [aiSummary, setAiSummary] = useState<{ headline: string; highlights: string[]; concerns: string[]; recommendations: string[]; model?: string; generatedAt?: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!wantAI || !report || !client) return;
    let cancelled = false;
    setAiLoading(true);
    setAiError(null);
    // 30秒で強制タイムアウト（自動印刷時のフリーズ防止）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const ownerId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
    apiPost<any>('/api/report-summary', {
      clientId: ownerId,
      body: { report, prevReport },
      signal: controller.signal,
    })
      .then((data) => { if (!cancelled) setAiSummary(data); })
      .catch((e) => {
        if (cancelled) return;
        const msg = e.name === 'AbortError' ? '生成がタイムアウトしました(30秒)' : (e.message || 'AI要約の生成に失敗');
        setAiError(msg);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setAiLoading(false);
      });
    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort(); };
  }, [wantAI, report, prevReport]);

  // ?print=1 で自動印刷。?ai=1 の場合は AI 取得完了を待つ。
  useEffect(() => {
    if (search.get('print') !== '1' || !report) return;
    if (wantAI && aiLoading) return;
    if (wantAI && !aiSummary && !aiError) return;
    setTimeout(() => { window.print(); }, 800);
  }, [report, wantAI, aiLoading, aiSummary, aiError]);

  if (!report || !client) {
    return <div style={{ padding: '2rem' }}>データを読み込み中...</div>;
  }

  const clientName = client.companyName || 'クライアント名未設定';
  const { total, ngBreakdown, byBase, bySource, byBaseSource, byAge, byBaseAge, ngAgeBreakdown, bySourceAge, byJob, byBaseJob, byMonth, stepFunnel, cost } = report;
  const overall: MatrixRow = { label: '全体', ...total };

  // 採用数上位10媒体（媒体×年代用）
  const topSourceAge = bySourceAge.filter((s) => s.rows.reduce((a, r) => a + r.applications, 0) > 0).slice(0, 10);

  // ボトルネック検出: 採用率が全体比50%未満で母数3以上
  const bottlenecks = [...byBase, ...bySource, ...byJob]
    .filter((r) => r.applications >= 3)
    .map((r) => {
      const ratio = total.applicationToHireRate > 0 ? r.applicationToHireRate / total.applicationToHireRate : 1;
      return { row: r, ratio };
    })
    .filter((b) => b.ratio < 0.5)
    .sort((a, b) => a.ratio - b.ratio);

  // ハイライト検出: 採用率が全体比130%超で母数3以上
  const highlights = [...byBase, ...bySource, ...byJob]
    .filter((r) => r.applications >= 3 && r.hired > 0)
    .map((r) => {
      const ratio = total.applicationToHireRate > 0 ? r.applicationToHireRate / total.applicationToHireRate : 1;
      return { row: r, ratio };
    })
    .filter((h) => h.ratio > 1.3)
    .sort((a, b) => b.ratio - a.ratio);

  // 媒体ランキング(採用数TOP/コスパTOP/応募数TOP)
  const sourceRankByHired = [...bySource].filter((s) => s.applications > 0).sort((a, b) => b.hired - a.hired).slice(0, 5);
  const sourceRankByRate = [...bySource].filter((s) => s.applications >= 3).sort((a, b) => b.applicationToHireRate - a.applicationToHireRate).slice(0, 5);
  const sourceRankByApp = [...bySource].sort((a, b) => b.applications - a.applications).slice(0, 5);

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

      {/* ===== 目次 ===== */}
      <PageWrap pageNum={null} clientName={clientName} range={range}>
        <h2 className="section-h">目次</h2>
        <div className="toc">
          <TocSection num="01" title="資料概要" desc="本資料の目的・前提・データ定義" />
          <TocSection num="02" title="エグゼクティブサマリ" desc="採用ファネル全体・前期比較・ハイライト・課題" />
          <TocSection num="03" title="月次トレンド" desc="応募・採用の月次推移とパターン分析" />
          <TocSection num="04" title="ステップ別ファネル" desc="応募→面接→内定→採用 各ステップの到達率・通過率" />
          <TocSection num="05" title="支社別 / 媒体別 / 職種別" desc="セグメント別ファネル詳細" />
          <TocSection num="06" title="年代分析" desc="年代別の応募・採用の傾向" />
          <TocSection num="07" title="媒体費用×費用対効果" desc="CPA/CPH による投資効率の可視化" />
          <TocSection num="08" title="ハイライト & ボトルネック" desc="優秀セグメント・要改善セグメント" />
          <TocSection num="09" title="今後のアクション" desc="次期に向けた推奨事項" />
        </div>
      </PageWrap>

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

      {/* ===== エグゼクティブサマリ: ファネル全体 ===== */}
      <PageWrap pageNum={3} clientName={clientName} range={range}>
        <h2 className="section-h">エグゼクティブサマリ - 採用ファネル（全社）</h2>
        <p className="lead">{formatRange(range)} の採用活動全体像。前期との比較を併記。</p>
        <FunnelChart total={total} />
        {prevReport && <FunnelComparison curr={total} prev={prevReport.total} prevRange={prevRange} />}
      </PageWrap>

      {/* ===== AI 総評 (?ai=1 の時のみ) ===== */}
      {wantAI && (
        <PageWrap pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">AI 総評</h2>
          <p className="lead">
            RISOTTO AI による本期間データの自動分析結果。
          </p>
          {aiLoading && (
            <div className="ai-loading">
              <div className="ai-spinner" />
              <div>AI が分析中です...</div>
            </div>
          )}
          {aiError && (
            <div className="ai-error">
              <strong>分析エラー:</strong> {aiError}
              <div className="muted">ANTHROPIC_API_KEY が未設定の可能性があります。</div>
            </div>
          )}
          {aiSummary && (
            <div className="ai-content">
              <div className="ai-headline">
                <div className="ai-eyebrow">総評</div>
                <div className="ai-headline-text">{aiSummary.headline}</div>
              </div>
              <div className="ai-grid">
                <div className="ai-block ai-good">
                  <div className="ai-block-title">✓ ハイライト</div>
                  {aiSummary.highlights.length > 0 ? (
                    <ul>
                      {aiSummary.highlights.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  ) : (
                    <p className="muted">該当なし</p>
                  )}
                </div>
                <div className="ai-block ai-bad">
                  <div className="ai-block-title">! 懸念点</div>
                  {aiSummary.concerns.length > 0 ? (
                    <ul>
                      {aiSummary.concerns.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  ) : (
                    <p className="muted">該当なし</p>
                  )}
                </div>
                <div className="ai-block ai-action">
                  <div className="ai-block-title">→ 推奨アクション</div>
                  {aiSummary.recommendations.length > 0 ? (
                    <ul>
                      {aiSummary.recommendations.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  ) : (
                    <p className="muted">該当なし</p>
                  )}
                </div>
              </div>
              <p className="ai-disclaimer">
                ※ 本総評は AI による自動生成です。最終的な意思決定は人間の判断と組み合わせてください。
              </p>
            </div>
          )}
        </PageWrap>
      )}

      {/* ===== ハイライト & 課題サマリ ===== */}
      <PageWrap pageNum={null} clientName={clientName} range={range}>
        <h2 className="section-h">ハイライト & 課題</h2>
        <div className="row-2col">
          <div>
            <h3 className="sub-h" style={{ background: '#D1FAE5', color: '#065F46', borderColor: '#059669' }}>✓ ハイライト</h3>
            {highlights.length === 0 ? (
              <p className="muted">特筆すべきハイライトはありません（全体平均比130%超のセグメント）</p>
            ) : (
              <ul className="insight-list good">
                {highlights.slice(0, 5).map(({ row, ratio }, i) => (
                  <li key={i}>
                    <strong>{row.label}</strong>: 採用率 <span className="num-em">{pct(row.applicationToHireRate, 1)}</span>
                    <span className="muted"> (全体比 +{((ratio - 1) * 100).toFixed(0)}%)</span>
                    <div className="muted">応募{fmt(row.applications)}名 / 採用{fmt(row.hired)}名</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="sub-h" style={{ background: '#FEE2E2', color: '#991B1B', borderColor: '#DC2626' }}>! 要改善ポイント</h3>
            {bottlenecks.length === 0 ? (
              <p className="muted">大きな課題はありません（全体平均比50%未満のセグメント）</p>
            ) : (
              <ul className="insight-list bad">
                {bottlenecks.slice(0, 5).map(({ row, ratio }, i) => (
                  <li key={i}>
                    <strong>{row.label}</strong>: 採用率 <span className="num-em">{pct(row.applicationToHireRate, 1)}</span>
                    <span className="muted"> (全体比 -{((1 - ratio) * 100).toFixed(0)}%)</span>
                    <div className="muted">応募{fmt(row.applications)}名 / 採用{fmt(row.hired)}名</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PageWrap>

      {/* ===== 月次トレンド ===== */}
      {byMonth.length > 1 && (
        <PageWrap pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">月次トレンド</h2>
          <p className="lead">応募数・採用数の月別推移。トレンドの変化点や繁閑差を可視化。</p>
          <MonthlyChart data={byMonth} />
          <MonthlyTable data={byMonth} />
        </PageWrap>
      )}

      {/* ===== ステップ別ファネル ===== */}
      <PageWrap pageNum={null} clientName={clientName} range={range}>
        <h2 className="section-h">ステップ別 到達率/通過率（媒体別）</h2>
        <p className="lead">応募→面接→内定→採用の各ステップで、媒体ごとの通過率を比較。母数の少ないセグメントは判定対象外。</p>
        <StepFunnelTable overall={stepFunnel.overall} columns={stepFunnel.bySource.slice(0, 10)} />
      </PageWrap>

      <PageWrap pageNum={null} clientName={clientName} range={range}>
        <h2 className="section-h">ステップ別 到達率/通過率（拠点別）</h2>
        <p className="lead">支社単位での歩留まり比較。支社特有の課題を発見しやすい切り口。</p>
        <StepFunnelTable overall={stepFunnel.overall} columns={stepFunnel.byBase} />
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
              <tr><th>要因 / サブステータス</th><th>人数</th><th>割合</th></tr>
            </thead>
            <tbody>
              {ngBreakdown.reasons.map((row) => (
                <React.Fragment key={row.key}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{row.label}</td>
                    <td className="num">{fmt(row.count)}名</td>
                    <td className="num">{ngBreakdown.total > 0 ? `${((row.count / ngBreakdown.total) * 100).toFixed(0)}%` : '-'}</td>
                  </tr>
                  {row.subRows.map((sub) => (
                    <tr key={`${row.key}-${sub.subStatus}`}>
                      <td style={{ paddingLeft: '7mm', color: '#6b7280' }}>
                        <span style={{ color: '#d1d5db', marginRight: '1mm' }}>└</span>
                        <span style={{ display: 'inline-block', padding: '0.5mm 2mm', borderRadius: '999px', fontSize: '8pt', backgroundColor: '#fef3c7', color: '#92400e' }}>
                          {sub.subStatus}
                        </span>
                      </td>
                      <td className="num">{fmt(sub.count)}名</td>
                      <td className="num" style={{ color: '#9ca3af' }}>{sub.rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              <tr className="total-row">
                <td>合計</td>
                <td className="num">{fmt(ngBreakdown.total)}名</td>
                <td className="num">-</td>
              </tr>
            </tbody>
          </table>
        </div>
        {ngBreakdown.reasons.find((r) => r.key === 'age' && r.count > 0) && (
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

      {/* ===== 職種別ファネル ===== */}
      {byJob.length > 0 && (
        <PageWrap pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">職種別 ファネル</h2>
          <p className="lead">職種ごとの応募〜採用数。職種特性に応じた採用戦略の判断材料。<span className="muted">※採用数が多い順</span></p>
          <FunnelMatrix rows={[overall, ...byJob]} highlightFirst headerLabel="職種" />
        </PageWrap>
      )}

      {/* ===== 媒体ランキング ===== */}
      <PageWrap pageNum={null} clientName={clientName} range={range}>
        <h2 className="section-h">媒体ランキング</h2>
        <p className="lead">3つの観点（応募数・採用数・採用率）でTOP5を抽出。媒体ポートフォリオの最適化に活用。</p>
        <div className="rank-grid">
          <RankBlock title="応募数 TOP5" rows={sourceRankByApp} metricKey="applications" metricLabel="応募" color="#3B82F6" />
          <RankBlock title="採用数 TOP5" rows={sourceRankByHired} metricKey="hired" metricLabel="採用" color="#059669" />
          <RankBlock title="採用率 TOP5" rows={sourceRankByRate} metricKey="applicationToHireRate" metricLabel="採用率%" color="#F97316" isPct />
        </div>
      </PageWrap>

      {/* ===== コスト分析 (費用入力済みの場合のみ) ===== */}
      {cost && (
        <PageWrap pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">媒体費用 × 費用対効果</h2>
          <p className="lead">期間内の媒体費合計と、媒体ごとのCPA(応募1件あたりコスト)/CPH(採用1名あたりコスト)。投資効率の高い媒体を見極める指標。</p>
          <div className="cost-summary-grid">
            <div className="cost-tile" style={{ borderLeftColor: '#F97316' }}>
              <div className="cost-label">期間内 媒体費合計</div>
              <div className="cost-value">¥{cost.total.cost.toLocaleString('ja-JP')}</div>
              <div className="cost-sub">{cost.monthsWithCost}ヶ月分</div>
            </div>
            <div className="cost-tile" style={{ borderLeftColor: '#3B82F6' }}>
              <div className="cost-label">応募数</div>
              <div className="cost-value">{cost.total.applications}名</div>
            </div>
            <div className="cost-tile" style={{ borderLeftColor: '#059669' }}>
              <div className="cost-label">採用数</div>
              <div className="cost-value">{cost.total.hired}名</div>
            </div>
            <div className="cost-tile" style={{ borderLeftColor: '#0EA5E9' }}>
              <div className="cost-label">CPA</div>
              <div className="cost-value">{cost.total.cpa > 0 ? '¥' + Math.round(cost.total.cpa).toLocaleString('ja-JP') : '-'}</div>
              <div className="cost-sub">応募1件あたり</div>
            </div>
            <div className="cost-tile" style={{ borderLeftColor: '#7C3AED' }}>
              <div className="cost-label">CPH</div>
              <div className="cost-value">{cost.total.cph > 0 ? '¥' + Math.round(cost.total.cph).toLocaleString('ja-JP') : '-'}</div>
              <div className="cost-sub">採用1名あたり</div>
            </div>
          </div>
          <h3 className="sub-h" style={{ marginTop: '6mm' }}>媒体別 費用対効果（費用が高い順）</h3>
          <CostMatrixTable rows={cost.bySource} />
        </PageWrap>
      )}

      {/* 拠点×媒体 コスト分析 */}
      {cost && cost.byBaseSource.length > 1 && (() => {
        const filtered = cost.byBaseSource.filter(b => b.rows.length > 0);
        // 1ページあたりの拠点数を行数で動的に決定:
        //   - 行数(媒体数)合計 + 各拠点ヘッダー1 が 1ページの最大行数(=おおよそ12行)に収まるように分割
        //   - 最低でも2拠点/ページ(2列レイアウト)、最大4拠点/ページ
        const maxRowsPerPage = 14; // 1ページに収まるテーブル行数の目安
        const groups: typeof filtered[] = [];
        let current: typeof filtered = [];
        let currentRows = 0;
        filtered.forEach((b) => {
          const rowsThisBase = b.rows.length + 2; // ヘッダー＋合計行
          if (current.length > 0 && (currentRows + rowsThisBase > maxRowsPerPage || current.length >= 4)) {
            groups.push(current);
            current = [];
            currentRows = 0;
          }
          current.push(b);
          currentRows += rowsThisBase;
        });
        if (current.length > 0) groups.push(current);

        return groups.map((group, gIdx) => (
          <PageWrap key={`base-cost-${gIdx}`} pageNum={null} clientName={clientName} range={range}>
            <h2 className="section-h">
              拠点×媒体 費用対効果
              {groups.length > 1 ? ` (${gIdx + 1}/${groups.length})` : ''}
            </h2>
            <p className="lead">媒体費は拠点別の応募者比率で按分。拠点ごとの媒体投資効率を比較。</p>
            <div className="auto-grid lg">
              {group.map(({ base, rows }) => (
                <div key={base} className="cost-base-block">
                  <h3 className="sub-h center">{base}</h3>
                  <CostMatrixTable rows={rows} compact />
                </div>
              ))}
            </div>
          </PageWrap>
        ));
      })()}

      {/* ===== 各支社×媒体別 (各支社1ページ。表が大きいので統合せず) ===== */}
      {byBaseSource.filter(({ rows }) => rows.length > 0).map(({ base, rows }) => (
        <PageWrap key={base} pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">【{base}】支社×媒体別</h2>
          <p className="lead">{base}の応募〜採用数は下記となります。<span className="muted">※採用数が多い順</span></p>
          <FunnelMatrix rows={rows} headerLabel="求人媒体" />
        </PageWrap>
      ))}

      {/* ===== 各支社×職種別 (各支社1ページ) ===== */}
      {byBaseJob.filter(({ rows }) => rows.length > 0).map(({ base, rows }) => (
        <PageWrap key={`bj-${base}`} pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">【{base}】支社×職種別</h2>
          <p className="lead">{base}における職種ごとの応募〜採用数。<span className="muted">※採用数が多い順</span></p>
          <FunnelMatrix rows={rows} headerLabel="職種" />
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

      {/* 各支社×年代別 (1ページ最大2拠点、表が大きいため固定で2分割) */}
      {(() => {
        const groups = chunkN(byBaseAge.filter(({ rows }) => rows.length > 0), 2);
        return groups.map((group, gIdx) => (
          <PageWrap key={`base-age-${gIdx}`} pageNum={null} clientName={clientName} range={range}>
            <h2 className="section-h">支社×年代別 {groups.length > 1 ? `(${gIdx + 1}/${groups.length})` : ''}</h2>
            <div className="auto-grid lg">
              {group.map(({ base, rows }) => (
                <div key={base} className="base-age-block">
                  <h3 className="sub-h center">{base}</h3>
                  <AgeFunnelTable rows={rows} />
                  <Annotation rows={rows} entityLabel={base} />
                </div>
              ))}
            </div>
          </PageWrap>
        ));
      })()}

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

      {/* 媒体×年代別（auto-fit: ブロック幅60mm以上で並べられるだけ並べる） */}
      {chunkN(topSourceAge, 4).map((group, idx, groups) => (
        <PageWrap key={`grp-${idx}`} pageNum={null} clientName={clientName} range={range}>
          <h2 className="section-h">【媒体別】年代別に関して {groups.length > 1 ? `(${idx + 1}/${groups.length})` : ''}</h2>
          <div className="auto-grid sm">
            {group.map(({ source, rows }) => (
              <SourceAgeBlock key={source} source={source} rows={rows} />
            ))}
          </div>
        </PageWrap>
      ))}

      {/* ===== 推奨アクション ===== */}
      <PageWrap pageNum={null} clientName={clientName} range={range}>
        <h2 className="section-h">今後のアクション</h2>
        <p className="lead">本期間のデータから導かれる、次期に向けた推奨事項です。</p>
        <div className="action-grid">
          <ActionCard
            num="01"
            color="#059669"
            title="高採用率セグメントへの配分強化"
            body={
              highlights.length > 0
                ? `${highlights.slice(0, 2).map((h) => h.row.label).join('・')} は全体平均を大きく上回る採用率。次期は配信量・予算を重点配分し、採用効率の最大化を狙う。`
                : '全体平均を大きく上回るセグメントは現状ありません。媒体ポートフォリオの再点検を推奨します。'
            }
          />
          <ActionCard
            num="02"
            color="#DC2626"
            title="低採用率セグメントの要因調査"
            body={
              bottlenecks.length > 0
                ? `${bottlenecks.slice(0, 2).map((b) => b.row.label).join('・')} の採用率が著しく低調。原因（応募者の質・選考フロー・面接調整時間など）を深掘りし、撤退/改善の判断を。`
                : '大きな課題セグメントは検出されていません。良好な状態を維持してください。'
            }
          />
          <ActionCard
            num="03"
            color="#0EA5E9"
            title="ステップ別ボトルネックの解消"
            body={`応募→面接設定率は ${pct(total.validToInterviewRate, 1)}、面接→内定率は ${pct(total.applications > 0 && total.interviewScheduled > 0 ? (total.offered / total.interviewScheduled) * 100 : 0, 1)}。最も歩留まりが低いステップに焦点を当て、面接調整の自動化・選考スピード改善などの施策を検討。`}
          />
          <ActionCard
            num="04"
            color="#7C3AED"
            title="年代別マーケティング最適化"
            body={
              byAge.length > 0
                ? (() => {
                    const topApp = [...byAge].sort((a, b) => b.applications - a.applications)[0];
                    const topHired = [...byAge].filter((a) => a.hired > 0).sort((a, b) => b.hired - a.hired)[0];
                    return `応募の中心は${topApp.ageGroup}（${topApp.applicationRate.toFixed(1)}%）、採用の中心は${topHired?.ageGroup || '-'}（${topHired?.hireRate.toFixed(1) || '0'}%）。媒体ごとに刺さる年代層を見極め、ターゲティング配信を強化。`;
                  })()
                : '年代データを取得できません。応募者プロフィールの登録率を上げてください。'
            }
          />
          <ActionCard
            num="05"
            color="#F59E0B"
            title="NG要因の根本対策"
            body={(() => {
              const top = ngBreakdown.reasons[0];
              if (!top || top.count === 0) return 'NG件数は限定的です。継続して水準を維持してください。';
              const subDetail = top.subRows.length > 0
                ? `（うち${top.subRows[0].subStatus}が${top.subRows[0].count}名）`
                : '';
              return `NG要因の最多は「${top.label}」が${top.count}名${subDetail}（${ngBreakdown.total > 0 ? Math.round((top.count / ngBreakdown.total) * 100) : 0}%）。求人原稿/媒体選定/事前スクリーニング設定の見直しで、応募の質を上流から改善。`;
            })()}
          />
          <ActionCard
            num="06"
            color="#EC4899"
            title="次期レポートに向けたデータ整備"
            body="ステータス分類タグの完全設定、面接イベントの記録漏れ防止、応募者プロフィール（年代/求人）の入力率改善により、レポートの精度がさらに向上します。"
          />
        </div>
      </PageWrap>

      {/* ===== 裏表紙 ===== */}
      <PageWrap pageNum={null} clientName={clientName} range={range} chapterCover>
        <div className="chapter-content">
          <div className="chapter-eyebrow">END OF REPORT</div>
          <h1 className="chapter-title">ありがとうございました</h1>
          <p className="chapter-desc">
            本資料に関するご質問・追加分析のご要望は、<br />
            担当者までお気軽にお問い合わせください。
          </p>
          <div className="end-meta">
            <div>{clientName}</div>
            <div className="muted">採用レポート / {formatRange(range)}</div>
            <div className="muted" style={{ marginTop: '4mm' }}>powered by RISOTTO ATS</div>
          </div>
        </div>
      </PageWrap>

      <PrintStyles />
    </div>
  );
};

/* ===== サブコンポーネント ===== */

const TocSection: React.FC<{ num: string; title: string; desc: string }> = ({ num, title, desc }) => (
  <div className="toc-row">
    <div className="toc-num">{num}</div>
    <div className="toc-body">
      <div className="toc-title">{title}</div>
      <div className="toc-desc">{desc}</div>
    </div>
  </div>
);

const FunnelComparison: React.FC<{ curr: any; prev: any; prevRange: DateRange }> = ({ curr, prev, prevRange }) => {
  const items = [
    { label: '応募数', curr: curr.applications, prev: prev.applications },
    { label: '有効応募', curr: curr.validApplications, prev: prev.validApplications },
    { label: '面接設定', curr: curr.interviewScheduled, prev: prev.interviewScheduled },
    { label: '内定', curr: curr.offered, prev: prev.offered },
    { label: '採用', curr: curr.hired, prev: prev.hired },
    { label: '稼働', curr: curr.active, prev: prev.active },
  ];
  return (
    <div className="comparison-block">
      <div className="comparison-label">前期比較 ({prevRange.start} 〜 {prevRange.end})</div>
      <div className="comparison-grid">
        {items.map((it) => {
          const diff = it.curr - it.prev;
          const ratio = it.prev > 0 ? (diff / it.prev) * 100 : (it.curr > 0 ? 100 : 0);
          const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
          return (
            <div key={it.label} className={`comparison-cell ${cls}`}>
              <div className="comparison-key">{it.label}</div>
              <div className="comparison-val">{fmt(it.curr)}</div>
              <div className="comparison-diff">
                {diff > 0 ? '▲' : diff < 0 ? '▼' : '−'} {Math.abs(diff)} ({ratio > 0 ? '+' : ''}{ratio.toFixed(1)}%)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MonthlyChart: React.FC<{ data: MonthlyBucket[] }> = ({ data }) => {
  const W = 1100, H = 240, PL = 50, PR = 20, PT = 20, PB = 40;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const maxApp = Math.max(1, ...data.map((d) => d.applications));
  const slot = innerW / data.length;
  const barW = slot * 0.5;
  const xAt = (i: number) => PL + slot * i + slot / 2;
  const yAt = (v: number) => PT + innerH - (v / maxApp) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(d.hired * (maxApp / Math.max(1, ...data.map(x => x.hired)))).toFixed(1)}`).join(' ');
  const maxHired = Math.max(1, ...data.map((d) => d.hired));

  return (
    <div className="chart-wrap">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
          const y = PT + innerH * (1 - r);
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#F3F4F6" strokeWidth={1} />
              <text x={PL - 6} y={y + 3} fontSize={10} fill="#9CA3AF" textAnchor="end">{Math.round(maxApp * r)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const yTop = yAt(d.applications);
          return (
            <g key={d.month}>
              <rect x={xAt(i) - barW / 2} y={yTop} width={barW} height={Math.max(0, PT + innerH - yTop)} fill="#FB923C" opacity={0.9} rx={2} />
              {d.applications > 0 && <text x={xAt(i)} y={yTop - 4} fontSize={11} fill="#9A3412" textAnchor="middle" fontWeight={700}>{d.applications}</text>}
            </g>
          );
        })}
        <path d={linePath} fill="none" stroke="#059669" strokeWidth={2.5} />
        {data.map((d, i) => (
          <g key={`p-${d.month}`}>
            <circle cx={xAt(i)} cy={yAt(d.hired * (maxApp / maxHired))} r={4} fill="#059669" />
            {d.hired > 0 && <text x={xAt(i) + 8} y={yAt(d.hired * (maxApp / maxHired)) - 4} fontSize={11} fill="#065F46" fontWeight={700}>{d.hired}</text>}
          </g>
        ))}
        {data.map((d, i) => (
          <text key={`x-${d.month}`} x={xAt(i)} y={H - 14} fontSize={10} fill="#6B7280" textAnchor="middle">{d.month.slice(2).replace('-', '/')}</text>
        ))}
      </svg>
      <div className="chart-legend">
        <span><span className="legend-box" style={{ background: '#FB923C' }} />応募数</span>
        <span><span className="legend-line" style={{ background: '#059669' }} />採用数(右軸スケール)</span>
      </div>
    </div>
  );
};

const MonthlyTable: React.FC<{ data: MonthlyBucket[] }> = ({ data }) => {
  const totals = data.reduce((acc, d) => ({
    applications: acc.applications + d.applications,
    validApplications: acc.validApplications + d.validApplications,
    interviewScheduled: acc.interviewScheduled + d.interviewScheduled,
    offered: acc.offered + d.offered,
    hired: acc.hired + d.hired,
  }), { applications: 0, validApplications: 0, interviewScheduled: 0, offered: 0, hired: 0 });
  return (
    <table className="age-table monthly-table" style={{ marginTop: '4mm' }}>
      <thead>
        <tr><th>月</th><th>応募</th><th>有効応募</th><th>面接設定</th><th>内定</th><th>採用</th><th>採用率</th></tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.month}>
            <td>{d.month}</td>
            <td className="num">{fmt(d.applications)}</td>
            <td className="num">{fmt(d.validApplications)}</td>
            <td className="num">{fmt(d.interviewScheduled)}</td>
            <td className="num">{fmt(d.offered)}</td>
            <td className="num accent">{fmt(d.hired)}</td>
            <td className="num">{d.applications > 0 ? pct((d.hired / d.applications) * 100, 1) : '-'}</td>
          </tr>
        ))}
        <tr className="total-row">
          <td>合計</td>
          <td className="num">{fmt(totals.applications)}</td>
          <td className="num">{fmt(totals.validApplications)}</td>
          <td className="num">{fmt(totals.interviewScheduled)}</td>
          <td className="num">{fmt(totals.offered)}</td>
          <td className="num accent">{fmt(totals.hired)}</td>
          <td className="num">{totals.applications > 0 ? pct((totals.hired / totals.applications) * 100, 1) : '-'}</td>
        </tr>
      </tbody>
    </table>
  );
};

const StepFunnelTable: React.FC<{ overall: StepFunnelColumn; columns: StepFunnelColumn[] }> = ({ overall, columns }) => {
  const cols = columns;
  return (
    <table className="step-table">
      <thead>
        <tr>
          <th rowSpan={2}>ステップ</th>
          <th rowSpan={2} className="overall-col">全体</th>
          {cols.map((c) => <th key={c.label} colSpan={2}>{c.label}</th>)}
        </tr>
        <tr>
          {cols.map((c) => (
            <React.Fragment key={c.label}>
              <th className="rate-h">人数</th>
              <th className="rate-h">通過率</th>
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {overall.steps.map((step, idx) => {
          const overallRate = step.conversionRate;
          return (
            <tr key={step.key}>
              <td className="step-label">{step.label}</td>
              <td className="num overall-col">
                <div className="num-em">{fmt(step.count)}</div>
                <div className="muted">{step.reachRate.toFixed(1)}% / {step.conversionRate.toFixed(1)}%</div>
              </td>
              {cols.map((c) => {
                const s = c.steps[idx];
                const sample = c.steps[0]?.count || 0;
                let bgColor = 'transparent';
                let fgColor = '#374151';
                if (sample >= 3 && overallRate > 0 && idx > 0) {
                  const ratio = s.conversionRate / overallRate;
                  if (ratio < 0.5) { bgColor = '#FEE2E2'; fgColor = '#991B1B'; }
                  else if (ratio < 0.7) { bgColor = '#FEF3C7'; fgColor = '#92400E'; }
                  else if (ratio > 1.3) { bgColor = '#D1FAE5'; fgColor = '#065F46'; }
                }
                return (
                  <React.Fragment key={c.label}>
                    <td className="num" style={{ backgroundColor: bgColor, color: fgColor }}>{fmt(s.count)}</td>
                    <td className="num" style={{ backgroundColor: bgColor, color: fgColor }}>{idx === 0 ? '-' : `${s.conversionRate.toFixed(1)}%`}</td>
                  </React.Fragment>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const RankBlock: React.FC<{ title: string; rows: MatrixRow[]; metricKey: keyof MatrixRow; metricLabel: string; color: string; isPct?: boolean }> = ({ title, rows, metricKey, metricLabel, color, isPct }) => (
  <div className="rank-block">
    <h3 className="rank-title" style={{ background: color }}>{title}</h3>
    <ol className="rank-list">
      {rows.length === 0 ? <li className="muted">データなし</li> : rows.map((r, i) => (
        <li key={r.label}>
          <span className="rank-num" style={{ color }}>{i + 1}</span>
          <span className="rank-label">{r.label}</span>
          <span className="rank-val">{isPct ? pct(r[metricKey] as number, 1) : fmt(r[metricKey] as number)}<span className="muted" style={{ marginLeft: '0.5em', fontSize: '0.85em' }}>{!isPct && metricLabel}</span></span>
        </li>
      ))}
    </ol>
  </div>
);

const CostMatrixTable: React.FC<{ rows: import('@/utils/reports/types').CostRow[]; compact?: boolean }> = ({ rows, compact }) => {
  const yen = (n: number) => n > 0 ? '¥' + Math.round(n).toLocaleString('ja-JP') : '-';
  const totals = rows.reduce(
    (acc, r) => ({ cost: acc.cost + r.cost, applications: acc.applications + r.applications, hired: acc.hired + r.hired }),
    { cost: 0, applications: 0, hired: 0 },
  );
  const totalCpa = totals.applications > 0 ? totals.cost / totals.applications : 0;
  const totalCph = totals.hired > 0 ? totals.cost / totals.hired : 0;
  return (
    <table className={`cost-matrix ${compact ? 'compact' : ''}`}>
      <thead>
        <tr>
          <th>媒体</th>
          <th>費用</th>
          <th>応募</th>
          <th>採用</th>
          <th>CPA<br/><span style={{ fontSize: '7pt', fontWeight: 400, opacity: 0.85 }}>(応募単価)</span></th>
          <th>CPH<br/><span style={{ fontSize: '7pt', fontWeight: 400, opacity: 0.85 }}>(採用単価)</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF' }}>データなし</td></tr>
        ) : (
          <>
            {rows.map((r) => (
              <tr key={r.source}>
                <td className="cost-label-col">{r.source}</td>
                <td className="num cost-amount">{yen(r.cost)}</td>
                <td className="num">{r.applications}</td>
                <td className="num accent">{r.hired}</td>
                <td className="num cost-cpa">{yen(r.cpa)}</td>
                <td className="num cost-cph">{yen(r.cph)}</td>
              </tr>
            ))}
            <tr className="cost-total-row">
              <td className="cost-label-col">合計</td>
              <td className="num cost-amount">{yen(totals.cost)}</td>
              <td className="num">{totals.applications}</td>
              <td className="num accent">{totals.hired}</td>
              <td className="num cost-cpa">{yen(totalCpa)}</td>
              <td className="num cost-cph">{yen(totalCph)}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );
};

const ActionCard: React.FC<{ num: string; color: string; title: string; body: string }> = ({ num, color, title, body }) => (
  <div className="action-card" style={{ borderLeftColor: color }}>
    <div className="action-num" style={{ color }}>{num}</div>
    <div className="action-title">{title}</div>
    <div className="action-body">{body}</div>
  </div>
);


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
            <div className="funnel-rate">{s.sub || '\u00A0'}</div>
            <div className="funnel-num">{fmt(s.value)}</div>
            <div className="funnel-label">{s.label}</div>
          </div>
          {i < stages.length - 1 && <div className="funnel-arrow">▶</div>}
        </React.Fragment>
      ))}
    </div>
  );
};

const FunnelMatrix: React.FC<{ rows: MatrixRow[]; highlightFirst?: boolean; headerLabel: string }> = ({ rows, highlightFirst, headerLabel }) => {
  // highlightFirst が true の場合、最初の行が既に「全体」なので合計行は不要
  // それ以外（媒体別、支社×媒体別など）は合計行を末尾に追加
  const showTotal = !highlightFirst && rows.length > 0;
  const totals = showTotal ? rows.reduce(
    (acc, r) => ({
      applications: acc.applications + r.applications,
      validApplications: acc.validApplications + r.validApplications,
      interviewScheduled: acc.interviewScheduled + r.interviewScheduled,
      offered: acc.offered + r.offered,
      hired: acc.hired + r.hired,
      active: acc.active + r.active,
    }),
    { applications: 0, validApplications: 0, interviewScheduled: 0, offered: 0, hired: 0, active: 0 },
  ) : null;
  const rate = (n: number, d: number) => d > 0 ? (n / d) * 100 : 0;

  return (
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
        {totals && (
          <tr className="overall-row">
            <td className="label-col">合計</td>
            <td className="num">{fmt(totals.applications)}</td>
            <td className="num">{fmt(totals.validApplications)}</td>
            <td className="num">{fmt(totals.interviewScheduled)}</td>
            <td className="num">{fmt(totals.offered)}</td>
            <td className="num accent">{fmt(totals.hired)}</td>
            <td className="num">{fmt(totals.active)}</td>
            <td className="num rate">{pct(rate(totals.validApplications, totals.applications))}</td>
            <td className="num rate">{pct(rate(totals.interviewScheduled, totals.validApplications))}</td>
            <td className="num rate">{pct(rate(totals.offered, totals.applications))}</td>
            <td className="num rate">{pct(rate(totals.hired, totals.applications))}</td>
            <td className="num rate">{pct(rate(totals.active, totals.applications))}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

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

function chunkN<T>(arr: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
  return result;
}

/* ===== Print Styles ===== */
const PrintStyles: React.FC = () => (
  <style>{`
    @page {
      size: A4 landscape;
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
      width: 297mm;
      height: 210mm;
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
      height: 16mm;
      padding: 6mm 18mm 0;
      display: flex; justify-content: space-between;
      font-size: 9pt; color: #9ca3af;
      border-bottom: 1px solid #f3f4f6;
    }
    .page-footer {
      position: absolute; bottom: 6mm; right: 18mm;
      font-size: 9pt; color: #9ca3af;
    }
    .page-body {
      padding: 20mm 18mm 22mm;
      height: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }

    /* 表紙 */
    .cover { display: flex; flex-direction: column; padding: 0; }
    .cover-band {
      height: 45mm;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      position: relative;
    }
    .cover-band::after {
      content: '';
      position: absolute; bottom: -7mm; left: 0; right: 0;
      height: 7mm;
      background: linear-gradient(135deg, #fdba74, #fed7aa);
    }
    .cover-body {
      flex: 1;
      display: flex; flex-direction: column; justify-content: center;
      padding: 0 30mm;
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
      display: flex; align-items: stretch; justify-content: center;
      gap: 2mm;
      margin: 12mm 0;
      flex-wrap: nowrap;
    }
    .funnel-tile {
      flex: 1 1 0;
      min-width: 28mm;
      min-height: 32mm;
      background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
      border: 2px solid #f97316;
      border-radius: 3mm;
      padding: 4mm 2mm;
      text-align: center;
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      font-family: 'Yu Gothic', 'Hiragino Sans', 'Meiryo', sans-serif;
    }
    .funnel-rate {
      font-size: 11pt; font-weight: 700; color: #f97316;
      margin-bottom: 2mm;
      min-height: 13pt;
      font-family: inherit;
    }
    .funnel-num {
      font-size: 24pt; font-weight: 800; color: #1f2937;
      line-height: 1;
      font-family: inherit;
    }
    .funnel-label {
      font-size: 9pt; color: #6b7280; margin-top: 2mm;
      font-family: inherit;
    }
    .funnel-arrow {
      color: #f97316; font-size: 16pt; font-weight: 700;
      align-self: center;
      font-family: inherit;
    }

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
    .ng-bar.valid { background: #fb923c; }
    .ng-bar-label { font-size: 9pt; opacity: 0.9; font-family: inherit; }
    .ng-bar-num { font-size: 20pt; font-weight: 800; font-family: inherit; }

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

    /* 自動グリッド: 項目数に応じてCSS側で列数が決まる
       sm = 小さいブロック向け(媒体×年代等)、最小55mm幅 → 最大4-5列
       lg = 大きいブロック向け(支社×年代等)、最小125mm幅 → 最大2列
       1項目だけならカード1つ分の幅で左寄せ表示 */
    .auto-grid {
      display: grid;
      gap: 4mm;
      align-items: start;
      justify-content: start;
    }
    .auto-grid.sm { grid-template-columns: repeat(auto-fit, minmax(55mm, 1fr)); }
    .auto-grid.lg { grid-template-columns: repeat(auto-fit, minmax(125mm, 1fr)); }

    /* sm グリッド内のテーブルはコンパクト */
    .auto-grid.sm .src-age-block .age-table.compact th,
    .auto-grid.sm .src-age-block .age-table.compact td {
      padding: 1mm 1.5mm; font-size: 8pt;
    }
    .base-age-block { display: flex; flex-direction: column; }
    .base-age-block .age-table th,
    .base-age-block .age-table td { padding: 1.8mm 2.5mm; font-size: 9pt; }
    .base-age-block .annotation-box { padding: 2.5mm 3mm; margin-top: 3mm; }
    .base-age-block .annotation-box ul { font-size: 9pt; }

    /* 目次 */
    .toc { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 6mm; }
    .toc-row {
      display: flex; gap: 5mm; align-items: flex-start;
      padding: 4mm 5mm;
      background: #fff7ed; border-radius: 2mm; border-left: 4px solid #f97316;
    }
    .toc-num {
      font-size: 22pt; font-weight: 800; color: #f97316;
      min-width: 18mm; line-height: 1; font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif;
    }
    .toc-title { font-size: 13pt; font-weight: 700; color: #1f2937; margin-bottom: 1mm; }
    .toc-desc { font-size: 9pt; color: #6b7280; line-height: 1.5; }

    /* 前期比較 */
    .comparison-block { margin-top: 8mm; }
    .comparison-label {
      font-size: 10pt; color: #6b7280; margin-bottom: 3mm;
      padding: 1mm 3mm; background: #f3f4f6; border-radius: 1mm; display: inline-block;
    }
    .comparison-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3mm; }
    .comparison-cell {
      padding: 4mm; border-radius: 2mm; text-align: center;
      background: #f9fafb; border: 1px solid #e5e7eb;
    }
    .comparison-cell.up { background: #ecfdf5; border-color: #6ee7b7; }
    .comparison-cell.down { background: #fef2f2; border-color: #fca5a5; }
    .comparison-key { font-size: 9pt; color: #6b7280; }
    .comparison-val { font-size: 18pt; font-weight: 800; color: #1f2937; line-height: 1.1; margin: 1mm 0; }
    .comparison-diff { font-size: 9pt; font-weight: 600; }
    .comparison-cell.up .comparison-diff { color: #059669; }
    .comparison-cell.down .comparison-diff { color: #dc2626; }
    .comparison-cell.flat .comparison-diff { color: #9ca3af; }

    /* インサイトリスト */
    .insight-list { list-style: none; margin: 0; padding: 0; }
    .insight-list li {
      padding: 3mm 4mm; margin-bottom: 2mm;
      border-radius: 2mm; font-size: 10pt; line-height: 1.6;
    }
    .insight-list.good li { background: #ecfdf5; border-left: 3px solid #059669; }
    .insight-list.bad li { background: #fef2f2; border-left: 3px solid #dc2626; }
    .num-em { font-weight: 700; font-size: 11pt; }

    /* 月次グラフ */
    .chart-wrap { background: #fff; padding: 3mm; border: 1px solid #e5e7eb; border-radius: 2mm; }
    .chart-wrap svg { width: 100%; height: 50mm; }
    .monthly-table th, .monthly-table td { padding: 1.5mm 2mm !important; font-size: 9pt !important; }
    .chart-legend {
      display: flex; gap: 8mm; justify-content: flex-end;
      font-size: 9pt; color: #6b7280; padding-top: 2mm;
    }
    .legend-box { display: inline-block; width: 10pt; height: 10pt; margin-right: 4pt; vertical-align: middle; border-radius: 1pt; }
    .legend-line { display: inline-block; width: 14pt; height: 2pt; margin-right: 4pt; vertical-align: middle; }

    /* ステップファネルテーブル */
    .step-table {
      width: 100%; border-collapse: collapse; font-size: 9pt;
    }
    .step-table th {
      background: #f97316; color: #fff;
      padding: 2mm 1.5mm; border: 1px solid #ea580c;
      text-align: center; font-weight: 600; font-size: 8.5pt;
    }
    .step-table th.rate-h { background: #fb923c; font-size: 7.5pt; }
    .step-table th.overall-col { background: #ea580c; }
    .step-table td {
      padding: 2mm 1.5mm; border: 1px solid #fed7aa;
    }
    .step-table td.num { text-align: right; }
    .step-table td.step-label { font-weight: 600; background: #fff7ed; }
    .step-table td.overall-col { background: #ffedd5; font-weight: 600; }

    /* ランキング */
    .rank-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; }
    .rank-block { background: #fff; border: 1px solid #e5e7eb; border-radius: 2mm; overflow: hidden; }
    .rank-title {
      color: #fff; padding: 3mm 4mm; font-size: 11pt; font-weight: 700; margin: 0;
    }
    .rank-list { list-style: none; margin: 0; padding: 3mm 4mm; }
    .rank-list li {
      display: flex; align-items: center; gap: 3mm;
      padding: 2mm 0; border-bottom: 1px dashed #e5e7eb;
      font-size: 10pt;
    }
    .rank-list li:last-child { border-bottom: none; }
    .rank-num { font-size: 16pt; font-weight: 800; min-width: 8mm; font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; line-height: 1; }
    .rank-label { flex: 1; }
    .rank-val { font-weight: 700; color: #1f2937; }

    /* アクション */
    .action-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; margin-top: 4mm; }
    .action-card {
      background: #fff; padding: 4mm 5mm; border-radius: 2mm;
      border: 1px solid #e5e7eb; border-left-width: 5px;
    }
    .action-num {
      font-size: 18pt; font-weight: 800; line-height: 1;
      margin-bottom: 2mm; font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif;
    }
    .action-title { font-size: 11pt; font-weight: 700; color: #1f2937; margin-bottom: 2mm; }
    .action-body { font-size: 9pt; color: #4b5563; line-height: 1.6; }

    /* 裏表紙 */
    .end-meta { margin-top: 12mm; font-size: 11pt; color: #4b5563; }

    /* コスト分析 */
    .cost-summary-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 3mm;
      margin: 4mm 0;
    }
    .cost-tile {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-left: 4px solid #f97316;
      border-radius: 2mm;
      padding: 3mm 4mm;
    }
    .cost-label { font-size: 9pt; color: #6b7280; margin-bottom: 1mm; }
    .cost-value { font-size: 14pt; font-weight: 800; color: #1f2937; line-height: 1.1; }
    .cost-sub { font-size: 8pt; color: #9ca3af; margin-top: 1mm; }
    .cost-matrix {
      width: 100%; border-collapse: collapse; font-size: 9pt;
    }
    .cost-matrix th {
      background: #f97316; color: #fff;
      padding: 2mm 2.5mm; border: 1px solid #ea580c;
      text-align: center; font-weight: 600; font-size: 8.5pt;
    }
    .cost-matrix td {
      padding: 2mm 2.5mm; border: 1px solid #fed7aa;
    }
    .cost-matrix td.num { text-align: right; }
    .cost-matrix td.accent { color: #059669; font-weight: 700; }
    .cost-matrix td.cost-amount { color: #9a3412; font-weight: 700; }
    .cost-matrix td.cost-cpa { color: #0ea5e9; }
    .cost-matrix td.cost-cph { color: #7c3aed; font-weight: 700; }
    .cost-matrix td.cost-label-col { font-weight: 600; }
    .cost-matrix.compact th, .cost-matrix.compact td { padding: 1.5mm 2mm; font-size: 8pt; }
    .cost-matrix .cost-total-row td { background: #ffedd5; font-weight: 700; }
    .cost-matrix .cost-total-row td.cost-label-col { color: #9a3412; }
    .cost-base-block { display: flex; flex-direction: column; }

    /* AI 総評 */
    .ai-loading { padding: 30mm 0; text-align: center; color: #6b7280; }
    .ai-spinner {
      width: 12mm; height: 12mm; border: 3px solid #fed7aa;
      border-top-color: #f97316; border-radius: 50%;
      margin: 0 auto 4mm; animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .ai-error {
      padding: 6mm; background: #fef2f2; border-left: 4px solid #dc2626;
      border-radius: 2mm; color: #991b1b; font-size: 10pt;
    }
    .ai-content { display: flex; flex-direction: column; gap: 5mm; }
    .ai-headline {
      padding: 5mm 6mm;
      background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
      border: 1px solid #fed7aa;
      border-radius: 2mm;
    }
    .ai-eyebrow {
      font-size: 9pt; letter-spacing: 0.2em; color: #f97316;
      font-weight: 700; margin-bottom: 2mm;
    }
    .ai-headline-text {
      font-size: 13pt; font-weight: 700; color: #1f2937;
      line-height: 1.6;
    }
    .ai-grid {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm;
    }
    .ai-block {
      padding: 4mm 5mm;
      border-radius: 2mm;
      border: 1px solid #e5e7eb;
    }
    .ai-block.ai-good { background: #ecfdf5; border-color: #6ee7b7; }
    .ai-block.ai-bad { background: #fef2f2; border-color: #fca5a5; }
    .ai-block.ai-action { background: #eff6ff; border-color: #93c5fd; }
    .ai-block-title { font-size: 11pt; font-weight: 700; margin-bottom: 3mm; }
    .ai-good .ai-block-title { color: #065f46; }
    .ai-bad .ai-block-title { color: #991b1b; }
    .ai-action .ai-block-title { color: #1e40af; }
    .ai-block ul { margin: 0; padding-left: 5mm; }
    .ai-block li { font-size: 9.5pt; color: #1f2937; line-height: 1.7; margin-bottom: 2mm; }
    .ai-disclaimer { font-size: 8pt; color: #9ca3af; margin-top: 2mm; text-align: right; }

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
