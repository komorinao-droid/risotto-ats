import React, { useState, useMemo } from 'react';
import { FileText, BarChart3, ChevronRight, ChevronDown, Calendar, Building2, Megaphone, Users, Download, Printer, Sparkles, TrendingUp, TrendingDown, Minus, ArrowLeftRight, Briefcase, Target, AlertTriangle, GitBranch, Wallet, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { DatePreset, DateRange, MatrixRow, AgeBreakdown, MonthlyBucket, StepFunnelColumn, GoalProgress } from '@/utils/reports/types';
import { presetToRange, presetLabel, formatRange, prevRangeForPreset } from '@/utils/reports/dateRange';
import { buildReport } from '@/utils/reports/aggregate';
import { downloadCSV, printReport } from '@/utils/reports/export';
import { evaluateRow, bgForLevel, fgForLevel } from '@/utils/reports/bottleneck';
import { storage } from '@/utils/storage';
import MediaCostManagement from '@/client/pages/settings/MediaCostManagement';

const card: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: '8px',
  padding: '1.25rem',
};

const sectionTitle: React.CSSProperties = {
  margin: '0 0 0.875rem',
  fontSize: '0.9375rem',
  fontWeight: 700,
  color: '#111827',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.8125rem',
};

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.625rem',
  backgroundColor: '#F9FAFB',
  color: '#6B7280',
  fontWeight: 600,
  textAlign: 'left',
  borderBottom: '1px solid #E5E7EB',
  fontSize: '0.75rem',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.625rem',
  borderBottom: '1px solid #F3F4F6',
};

const fmt = (n: number) => n.toLocaleString('ja-JP');
const pct = (n: number) => (n === 0 ? '0.00%' : `${n.toFixed(2)}%`);

const PRESETS: DatePreset[] = ['thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisHalf', 'lastHalf', 'thisYear', 'lastYear'];

interface AISummary {
  headline: string;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  model?: string;
  generatedAt?: string;
}

const RecruitmentReport: React.FC = () => {
  const { client } = useAuth();
  const [preset, setPreset] = useState<DatePreset>('lastHalf');
  const [customRange, setCustomRange] = useState<DateRange>({ start: '', end: '' });
  const initialTab = (() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t === 'cost' || t === 'base' || t === 'source' || t === 'job' || t === 'age' || t === 'step' || t === 'leadtime') return t;
    return 'summary' as const;
  })();
  const [section, setSection] = useState<'summary' | 'base' | 'source' | 'job' | 'age' | 'step' | 'cost' | 'leadtime'>(initialTab);
  const [stepAxis, setStepAxis] = useState<'source' | 'base' | 'job'>('source');
  const [costMode, setCostMode] = useState<'analysis' | 'input'>('analysis');
  const [expandedBaseSrc, setExpandedBaseSrc] = useState<Set<string>>(new Set());
  const [expandedBaseAge, setExpandedBaseAge] = useState<Set<string>>(new Set());
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dataRev, setDataRev] = useState(0); // データ再読込トリガー

  const range: DateRange = useMemo(() => {
    if (preset === 'custom') {
      if (customRange.start && customRange.end) {
        // 逆順入力された場合は自動でスワップ
        if (customRange.start > customRange.end) {
          return { start: customRange.end, end: customRange.start };
        }
        return customRange;
      }
      return presetToRange('thisMonth');
    }
    return presetToRange(preset);
  }, [preset, customRange]);

  const prevRange: DateRange = useMemo(() => prevRangeForPreset(preset, range), [preset, range]);

  // 親アカウントのデータをそのまま使う（子アカで拠点フィルタ済みでも、レポートは全社視点で表示）
  const fullData = useMemo(() => {
    if (!client) return null;
    const dataId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
    try {
      return storage.getClientData(dataId);
    } catch {
      return null;
    }
  // dataRev を deps に含めることで目標値更新時に再フェッチ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, dataRev]);

  const report = useMemo(() => (fullData ? buildReport(fullData, range) : null), [fullData, range]);
  const prevReport = useMemo(() => (fullData && compareEnabled ? buildReport(fullData, prevRange) : null), [fullData, prevRange, compareEnabled]);

  // 期間/前期範囲/比較ON-OFF が変わったらAI要約をクリア（stale 防止）
  React.useEffect(() => {
    setAiSummary(null);
    setAiError(null);
  }, [range.start, range.end, prevRange.start, prevRange.end, compareEnabled]);

  const generateAISummary = async () => {
    if (!report) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const resp = await fetch('/api/report-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, prevReport: compareEnabled ? prevReport : null }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setAiSummary(data);
    } catch (e: any) {
      setAiError(e.message || 'AI要約の生成に失敗しました');
    } finally {
      setAiLoading(false);
    }
  };

  const toggleBaseSrc = (base: string) => setExpandedBaseSrc((s) => {
    const n = new Set(s);
    n.has(base) ? n.delete(base) : n.add(base);
    return n;
  });
  const toggleBaseAge = (base: string) => setExpandedBaseAge((s) => {
    const n = new Set(s);
    n.has(base) ? n.delete(base) : n.add(base);
    return n;
  });

  if (!report) {
    return <div style={{ padding: '2rem', color: '#6B7280' }}>データがありません。</div>;
  }

  const { total, ngBreakdown, byBase, bySource, byBaseSource, byAge, byBaseAge, bySourceAge, ngAgeBreakdown, byJob, byJobAge, stepFunnel, goal, cost, leadTime } = report;
  const overallMatrix: MatrixRow = { label: '全体', ...total };

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }} className="report-root">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={20} color="#0EA5E9" />
          採用レポート
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{formatRange(range)}</span>
          <button
            className="no-print"
            onClick={() => setCompareEnabled((v) => !v)}
            title={`前期間: ${formatRange(prevRange)}`}
            style={{
              padding: '0.375rem 0.75rem',
              border: '1px solid ' + (compareEnabled ? '#0EA5E9' : '#E5E7EB'),
              borderRadius: '6px',
              backgroundColor: compareEnabled ? '#F0F9FF' : '#fff',
              color: compareEnabled ? '#0369A1' : '#374151',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <ArrowLeftRight size={12} />
            前期比較 {compareEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            className="no-print"
            onClick={() => downloadCSV(report, `recruitment-${range.start}_${range.end}.csv`)}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Download size={12} />
            CSV
          </button>
          <button
            className="no-print"
            onClick={async () => {
              const { downloadExcel } = await import('@/utils/reports/excel');
              downloadExcel(report, client?.companyName || 'クライアント', `recruitment-${range.start}_${range.end}.xlsx`);
            }}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #059669', borderRadius: '6px', backgroundColor: '#059669', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Download size={12} />
            Excel
          </button>
          <button
            className="no-print"
            onClick={() => {
              const params = new URLSearchParams();
              if (preset === 'custom') {
                params.set('start', range.start);
                params.set('end', range.end);
              } else {
                params.set('preset', preset);
              }
              window.open(`/reports/print?${params.toString()}`, '_blank');
            }}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #F97316', borderRadius: '6px', backgroundColor: '#F97316', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Printer size={12} />
            納品資料 (PDF)
          </button>
          <button
            className="no-print"
            onClick={() => {
              const params = new URLSearchParams();
              if (preset === 'custom') {
                params.set('start', range.start);
                params.set('end', range.end);
              } else {
                params.set('preset', preset);
              }
              params.set('ai', '1');
              window.open(`/reports/print?${params.toString()}`, '_blank');
            }}
            title="AI総評ページ込みのPDFを生成"
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #7C3AED', borderRadius: '6px', backgroundColor: '#7C3AED', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Sparkles size={12} />
            AI総評付きPDF
          </button>
          <button
            className="no-print"
            onClick={printReport}
            title="この画面そのままを印刷"
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff', color: '#6B7280', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            画面印刷
          </button>
        </div>
      </div>

      {/* 期間選択 */}
      <div style={{ ...card, padding: '0.875rem 1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#6B7280', marginRight: '0.25rem' }}>期間:</span>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              style={{
                padding: '0.25rem 0.625rem',
                border: '1px solid ' + (preset === p ? '#F97316' : '#E5E7EB'),
                borderRadius: '6px',
                backgroundColor: preset === p ? '#F97316' : '#fff',
                color: preset === p ? '#fff' : '#374151',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {presetLabel(p)}
            </button>
          ))}
          <button
            onClick={() => setPreset('custom')}
            style={{
              padding: '0.25rem 0.625rem',
              border: '1px solid ' + (preset === 'custom' ? '#F97316' : '#E5E7EB'),
              borderRadius: '6px',
              backgroundColor: preset === 'custom' ? '#F97316' : '#fff',
              color: preset === 'custom' ? '#fff' : '#374151',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            カスタム
          </button>
          {preset === 'custom' && (
            <span style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center', marginLeft: '0.5rem' }}>
              <input type="date" value={customRange.start} onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })} style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.75rem' }} />
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>〜</span>
              <input type="date" value={customRange.end} onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })} style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.75rem' }} />
            </span>
          )}
        </div>
      </div>

      {/* セクション切替 */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {([
          ['summary', 'サマリ', BarChart3],
          ['step', 'ステップ別', GitBranch],
          ['base', '拠点別', Building2],
          ['source', '媒体別', Megaphone],
          ['job', '職種別', Briefcase],
          ['age', '年代分析', Users],
          ['cost', 'コスト分析', Wallet],
          ['leadtime', 'リードタイム', Clock],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            style={{
              padding: '0.5rem 0.875rem',
              border: '1px solid ' + (section === key ? '#0EA5E9' : '#E5E7EB'),
              borderRadius: '6px',
              backgroundColor: section === key ? '#F0F9FF' : '#fff',
              color: section === key ? '#0369A1' : '#374151',
              fontSize: '0.8125rem',
              fontWeight: section === key ? 600 : 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ===== サマリ ===== */}
      {section === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 採用目標 */}
          <GoalSection
            goal={goal}
            range={range}
            onUpdateGoal={(yearMonth, value) => {
              if (!client) return;
              const dataId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
              try {
                const data = storage.getClientData(dataId);
                const newGoals = { ...(data.recruitmentGoals || {}) };
                if (value > 0) newGoals[yearMonth] = value;
                else delete newGoals[yearMonth];
                storage.saveClientData(dataId, { ...data, recruitmentGoals: newGoals });
                setDataRev((v) => v + 1);
              } catch (e) { console.error(e); }
            }}
          />

          {/* AI要約 */}
          <AISummarySection
            loading={aiLoading}
            error={aiError}
            summary={aiSummary}
            onGenerate={generateAISummary}
            compareEnabled={compareEnabled}
          />

          {/* ファネル */}
          <div style={card}>
            <h3 style={sectionTitle}>
              <BarChart3 size={16} color="#0EA5E9" />
              採用ファネル（全体）
              {compareEnabled && (
                <span style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 400, marginLeft: '0.5rem' }}>
                  前期 {formatRange(prevRange)} と比較
                </span>
              )}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.625rem' }}>
              <FunnelTile label="応募数" value={total.applications} prev={prevReport?.total.applications} color="#3B82F6" />
              <FunnelTile label="有効応募数" value={total.validApplications} prev={prevReport?.total.validApplications} sub={pct(total.validRate)} color="#0891B2" />
              <FunnelTile label="面接設定数" value={total.interviewScheduled} prev={prevReport?.total.interviewScheduled} sub={pct(total.validToInterviewRate)} color="#6366F1" />
              <FunnelTile label="内定数" value={total.offered} prev={prevReport?.total.offered} sub={pct(total.interviewToOfferRate)} color="#A855F7" />
              <FunnelTile label="採用数" value={total.hired} prev={prevReport?.total.hired} sub={pct(total.applicationToHireRate) + ' (応募比)'} color="#059669" />
              <FunnelTile label="稼働数" value={total.active} prev={prevReport?.total.active} sub={pct(total.applicationToActiveRate)} color="#10B981" />
            </div>
          </div>

          {/* 月次トレンド */}
          {report.byMonth.length > 1 && (
            <div style={card}>
              <h3 style={sectionTitle}>
                <TrendingUp size={16} color="#0EA5E9" />
                月次推移
              </h3>
              <TrendChart data={report.byMonth} />
            </div>
          )}

          {/* NG内訳 */}
          <div style={card}>
            <h3 style={sectionTitle}>選考NG内訳</h3>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '0 0 220px' }}>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.25rem' }}>合計NG数</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#DC2626' }}>{fmt(ngBreakdown.total)}名</div>
                <div style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>応募 {fmt(total.applications)} 名 中</div>
              </div>
              <div style={{ flex: 1, minWidth: '300px' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>NG理由</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>人数</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>割合</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['年齢NG', ngBreakdown.byReason.age, '#F59E0B'],
                      ['条件不一致', ngBreakdown.byReason.condition, '#3B82F6'],
                      ['重複応募', ngBreakdown.byReason.duplicate, '#9CA3AF'],
                      ['人物不適合', ngBreakdown.byReason.personality, '#DC2626'],
                      ['その他', ngBreakdown.byReason.other, '#6B7280'],
                    ] as const).map(([label, count, color]) => (
                      count > 0 && (
                        <tr key={label}>
                          <td style={tdStyle}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, marginRight: '0.375rem' }} />
                            {label}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(count)}名</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{ngBreakdown.total > 0 ? `${((count / ngBreakdown.total) * 100).toFixed(1)}%` : '-'}</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ステータス×サブステータス別の詳細 */}
            {ngBreakdown.byStageSub.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 700, color: '#374151' }}>ステータス × サブステータス別 詳細</h4>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.6875rem', color: '#9CA3AF' }}>
                  「ステータス管理」で設定したサブステータス単位での内訳。NG理由の詳細傾向を把握できます。
                </p>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ステータス</th>
                      <th style={thStyle}>サブステータス</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>人数</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>NG総数比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ngBreakdown.byStageSub.map((row, i) => {
                      const prevStage = i > 0 ? ngBreakdown.byStageSub[i - 1].stage : null;
                      const isFirstOfStage = prevStage !== row.stage;
                      return (
                        <tr key={`${row.stage}|||${row.subStatus}`}>
                          <td style={{ ...tdStyle, fontWeight: isFirstOfStage ? 600 : 400, color: isFirstOfStage ? '#374151' : '#9CA3AF' }}>
                            {isFirstOfStage ? row.stage : ''}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ display: 'inline-block', padding: '0.0625rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem', backgroundColor: row.subStatus === '(未設定)' ? '#F3F4F6' : '#FEF3C7', color: row.subStatus === '(未設定)' ? '#9CA3AF' : '#92400E' }}>
                              {row.subStatus}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(row.count)}名</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{row.rate.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ステップ別 ===== */}
      {section === 'step' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={card}>
            <h3 style={sectionTitle}>
              <GitBranch size={16} color="#0EA5E9" />
              ステップ別 到達率/通過率
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 0, marginBottom: '0.75rem' }}>
              縦軸=選考ステップ。各セルに人数・到達率(応募比)・通過率(前ステップ比)を表示。HERPの応募経路比較レポート相当。
            </p>
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#6B7280', alignSelf: 'center' }}>軸:</span>
              {([
                ['source', '媒体別', Megaphone],
                ['base', '拠点別', Building2],
                ['job', '職種別', Briefcase],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setStepAxis(key)}
                  style={{
                    padding: '0.25rem 0.625rem',
                    border: '1px solid ' + (stepAxis === key ? '#0EA5E9' : '#E5E7EB'),
                    borderRadius: '6px',
                    backgroundColor: stepAxis === key ? '#F0F9FF' : '#fff',
                    color: stepAxis === key ? '#0369A1' : '#374151',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            <StepFunnelTable
              overall={stepFunnel.overall}
              columns={stepAxis === 'source' ? stepFunnel.bySource : stepAxis === 'base' ? stepFunnel.byBase : stepFunnel.byJob}
            />
          </div>
        </div>
      )}

      {/* ===== 拠点別 ===== */}
      {section === 'base' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={card}>
            <h3 style={sectionTitle}>
              <Building2 size={16} color="#0284C7" />
              支社別 ファネル
            </h3>
            <MatrixTable rows={[overallMatrix, ...byBase]} highlightFirst overall={overallMatrix} />
          </div>
          <div style={card}>
            <h3 style={sectionTitle}>支社×媒体別</h3>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 0 }}>クリックで展開</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {byBaseSource.map(({ base, rows }) => {
                const open = expandedBaseSrc.has(base);
                const baseTotal = byBase.find((b) => b.label === base);
                return (
                  <div key={base} style={{ border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                    <button
                      onClick={() => toggleBaseSrc(base)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.625rem 0.875rem', border: 'none', background: '#F9FAFB', cursor: 'pointer', borderRadius: '6px' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <strong style={{ fontSize: '0.875rem' }}>{base}</strong>
                        {baseTotal && <span style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: '0.5rem' }}>応募 {fmt(baseTotal.applications)} / 採用 {fmt(baseTotal.hired)}</span>}
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>{rows.length} 媒体</span>
                    </button>
                    {open && (
                      <div style={{ padding: '0.5rem 0.875rem' }}>
                        <MatrixTable rows={rows} overall={overallMatrix} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== 媒体別 ===== */}
      {section === 'source' && (
        <div style={card}>
          <h3 style={sectionTitle}>
            <Megaphone size={16} color="#DB2777" />
            媒体別 ファネル（採用数の多い順）
          </h3>
          <MatrixTable rows={bySource} overall={overallMatrix} />
        </div>
      )}

      {/* ===== 職種別 ===== */}
      {section === 'job' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={card}>
            <h3 style={sectionTitle}>
              <Briefcase size={16} color="#0891B2" />
              職種別 ファネル（採用数の多い順）
            </h3>
            <MatrixTable rows={[overallMatrix, ...byJob]} highlightFirst overall={overallMatrix} />
          </div>
          <div style={card}>
            <h3 style={sectionTitle}>職種 × 年代別（採用数上位）</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {byJobAge.slice(0, 10).map(({ job, rows }) => {
                const totalH = rows.reduce((s, r) => s + r.hired, 0);
                const totalA = rows.reduce((s, r) => s + r.applications, 0);
                if (totalA === 0) return null;
                return (
                  <div key={job} style={{ border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0.625rem 0.875rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{job}</span>
                      <span style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 400 }}>応募 {fmt(totalA)} / 採用 {fmt(totalH)}</span>
                    </div>
                    <AgeTable rows={rows} compact />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== 年代分析 ===== */}
      {section === 'age' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 全社×年代 */}
          <div style={card}>
            <h3 style={sectionTitle}>
              <Users size={16} color="#7C3AED" />
              全社 × 年代別 応募/採用
            </h3>
            <AgeTable rows={byAge} />
          </div>

          {/* NG年代内訳 */}
          {ngAgeBreakdown.length > 0 && (
            <div style={card}>
              <h3 style={sectionTitle}>選考NGの年代内訳</h3>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>年代</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>人数</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>割合</th>
                  </tr>
                </thead>
                <tbody>
                  {ngAgeBreakdown.map((r) => (
                    <tr key={r.ageGroup}>
                      <td style={tdStyle}>{r.ageGroup}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.count)}名</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{r.rate.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 支社×年代 */}
          <div style={card}>
            <h3 style={sectionTitle}>支社 × 年代別</h3>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 0 }}>クリックで展開</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {byBaseAge.map(({ base, rows }) => {
                const open = expandedBaseAge.has(base);
                return (
                  <div key={base} style={{ border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                    <button
                      onClick={() => toggleBaseAge(base)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.625rem 0.875rem', border: 'none', background: '#F9FAFB', cursor: 'pointer', borderRadius: '6px' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <strong style={{ fontSize: '0.875rem' }}>{base}</strong>
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: '0.5rem 0.875rem' }}>
                        <AgeTable rows={rows} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 媒体×年代 */}
          <div style={card}>
            <h3 style={sectionTitle}>媒体 × 年代別（採用数上位）</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {bySourceAge.slice(0, 10).map(({ source, rows }) => {
                const totalH = rows.reduce((s, r) => s + r.hired, 0);
                const totalA = rows.reduce((s, r) => s + r.applications, 0);
                if (totalA === 0) return null;
                return (
                  <div key={source} style={{ border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0.625rem 0.875rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{source}</span>
                      <span style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 400 }}>応募 {fmt(totalA)} / 採用 {fmt(totalH)}</span>
                    </div>
                    <AgeTable rows={rows} compact />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== リードタイム分析 ===== */}
      {section === 'leadtime' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {leadTime.overall.applicationToHired.count === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <Clock size={32} color="#0EA5E9" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>リードタイム計測には履歴データが必要です</h3>
              <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: 0, lineHeight: 1.6 }}>
                応募者のステータスを変更すると履歴が記録され、<br />
                応募→面接→内定→採用 までの平均日数が算出されます。<br />
                （今後ステータス変更を行うことで自動的にデータが蓄積されます）
              </p>
            </div>
          ) : (
            <>
              <div style={card}>
                <h3 style={sectionTitle}>
                  <Clock size={16} color="#0EA5E9" />
                  リードタイム（全体）
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 0 }}>
                  応募から各ステージ到達までの平均日数。RPO代行の「速度」を可視化する指標。
                </p>
                <LeadTimeTiles col={leadTime.overall} />
              </div>
              <div style={card}>
                <h3 style={sectionTitle}>媒体別 リードタイム</h3>
                <LeadTimeTable rows={leadTime.bySource} />
              </div>
              <div style={card}>
                <h3 style={sectionTitle}>拠点別 リードタイム</h3>
                <LeadTimeTable rows={leadTime.byBase} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== コスト分析 ===== */}
      {section === 'cost' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* サブタブ: 分析 / 費用入力 */}
          <div style={{ display: 'flex', gap: '0.375rem', padding: '0.25rem', backgroundColor: '#F3F4F6', borderRadius: '8px', width: 'fit-content' }}>
            {([['analysis', '費用対効果分析'], ['input', '媒体費用入力']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCostMode(key)}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: costMode === key ? '#fff' : 'transparent',
                  color: costMode === key ? '#F97316' : '#6B7280',
                  fontSize: '0.8125rem',
                  fontWeight: costMode === key ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: costMode === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {costMode === 'input' ? (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <MediaCostManagement />
            </div>
          ) : !cost ? (
            <div style={{ ...card, textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <Wallet size={32} color="#F97316" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>媒体費用が未入力です</h3>
              <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '0 0 1rem', lineHeight: 1.6 }}>
                上の「媒体費用入力」タブで月別の媒体費用を入力すると、<br />
                CPA(応募1件あたりコスト)/CPH(採用1名あたりコスト)が自動算出されます。
              </p>
              <button
                onClick={() => setCostMode('input')}
                style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', backgroundColor: '#F97316', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
              >
                媒体費用を入力する
              </button>
            </div>
          ) : (
            <>
              {/* 全体サマリ */}
              <div style={card}>
                <h3 style={sectionTitle}>
                  <Wallet size={16} color="#F97316" />
                  全体 コスト × 応募/採用
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.625rem' }}>
                  <CostTile label="期間内 媒体費合計" value={`¥${cost.total.cost.toLocaleString('ja-JP')}`} sub={`${cost.monthsWithCost}ヶ月分`} color="#F97316" />
                  <CostTile label="応募数" value={cost.total.applications.toLocaleString('ja-JP')} color="#3B82F6" />
                  <CostTile label="採用数" value={cost.total.hired.toLocaleString('ja-JP')} color="#059669" />
                  <CostTile label="CPA" value={cost.total.cpa > 0 ? `¥${Math.round(cost.total.cpa).toLocaleString('ja-JP')}` : '-'} sub="応募1件あたり" color="#0EA5E9" />
                  <CostTile label="CPH" value={cost.total.cph > 0 ? `¥${Math.round(cost.total.cph).toLocaleString('ja-JP')}` : '-'} sub="採用1名あたり" color="#7C3AED" />
                </div>
              </div>

              {/* 媒体別 */}
              <div style={card}>
                <h3 style={sectionTitle}>媒体別 費用対効果</h3>
                <CostTable rows={cost.bySource} />
              </div>

              {/* 拠点×媒体 */}
              {cost.byBaseSource.length > 1 && (
                <div style={card}>
                  <h3 style={sectionTitle}>拠点×媒体 費用対効果</h3>
                  <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 0 }}>媒体費は媒体全体への拠点応募者比率で按分しています。</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {cost.byBaseSource.map(({ base, rows }) => (
                      <div key={base}>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1F2937', marginBottom: '0.5rem' }}>{base}</h4>
                        <CostTable rows={rows} compact />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 月次媒体費 */}
              <div style={card}>
                <h3 style={sectionTitle}>月次媒体費</h3>
                <MonthlyCostTable byMonth={cost.byMonth} bySources={cost.bySource.map((r) => r.source)} />
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.75rem', color: '#92400E', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <Calendar size={14} />
        集計対象は 応募日（applicant.date）が選択期間内のレコードのみ。CSV/印刷/AI要約/前期比較/月次トレンド/コスト分析に対応。
      </div>

      {/* 印刷時に非表示にする要素 */}
      <style>{`
        @media print {
          aside, .sidebar, .no-print { display: none !important; }
          .report-root { padding: 0 !important; max-width: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
};

/* =============================================================
   Sub components
   ============================================================= */

const FunnelTile: React.FC<{ label: string; value: number; prev?: number; sub?: string; color: string }> = ({ label, value, prev, sub, color }) => {
  const hasPrev = typeof prev === 'number';
  const delta = hasPrev ? value - (prev as number) : 0;
  const deltaPct = hasPrev && (prev as number) > 0 ? (delta / (prev as number)) * 100 : null;
  const positive = delta > 0;
  const negative = delta < 0;
  const dColor = positive ? '#059669' : negative ? '#DC2626' : '#6B7280';
  const Arrow = positive ? TrendingUp : negative ? TrendingDown : Minus;

  return (
    <div style={{ padding: '0.75rem 0.875rem', backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px', borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginBottom: '0.125rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{fmt(value)}</div>
      {sub && <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginTop: '0.125rem' }}>{sub}</div>}
      {hasPrev && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.375rem', fontSize: '0.6875rem', color: dColor, fontWeight: 600 }}>
          <Arrow size={11} strokeWidth={2.5} />
          <span>{delta > 0 ? '+' : ''}{fmt(delta)}{deltaPct !== null ? ` (${delta > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}</span>
          <span style={{ color: '#9CA3AF', fontWeight: 400 }}>vs 前期 {fmt(prev as number)}</span>
        </div>
      )}
    </div>
  );
};

/* ---- 月次トレンド SVG チャート ---- */
const TrendChart: React.FC<{ data: MonthlyBucket[] }> = ({ data }) => {
  const W = Math.max(640, data.length * 80);
  const H = 240;
  const PAD_L = 40;
  const PAD_R = 16;
  const PAD_T = 12;
  const PAD_B = 36;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxApp = Math.max(1, ...data.map((d) => d.applications));
  const maxHire = Math.max(1, ...data.map((d) => d.hired));
  const maxAxis = Math.max(maxApp, maxHire * 5);

  const barW = (innerW / data.length) * 0.55;
  const slot = innerW / data.length;

  const xAt = (i: number) => PAD_L + slot * i + slot / 2;
  const yAt = (v: number) => PAD_T + innerH - (v / maxAxis) * innerH;

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => Math.ceil((maxAxis * i) / ticks));

  // 採用折れ線パス
  const linePath = data
    .map((d, i) => {
      const x = xAt(i);
      const y = yAt(d.hired);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* グリッド */}
        {tickValues.map((tv, i) => {
          const y = yAt(tv);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#F3F4F6" strokeWidth={1} />
              <text x={PAD_L - 6} y={y + 3} fontSize={10} fill="#9CA3AF" textAnchor="end">{tv}</text>
            </g>
          );
        })}

        {/* 応募数バー */}
        {data.map((d, i) => {
          const cx = xAt(i);
          const yTop = yAt(d.applications);
          const h = PAD_T + innerH - yTop;
          return (
            <g key={d.month}>
              <rect x={cx - barW / 2} y={yTop} width={barW} height={Math.max(0, h)} fill="#3B82F6" opacity={0.7} rx={2} />
              {/* ラベル */}
              {d.applications > 0 && (
                <text x={cx} y={yTop - 4} fontSize={10} fill="#3B82F6" textAnchor="middle" fontWeight={600}>{d.applications}</text>
              )}
            </g>
          );
        })}

        {/* 採用折れ線 */}
        <path d={linePath} fill="none" stroke="#059669" strokeWidth={2} />
        {data.map((d, i) => {
          const x = xAt(i);
          const y = yAt(d.hired);
          return (
            <g key={`p-${d.month}`}>
              <circle cx={x} cy={y} r={3.5} fill="#059669" />
              {d.hired > 0 && (
                <text x={x + 6} y={y - 4} fontSize={10} fill="#059669" fontWeight={700}>{d.hired}</text>
              )}
            </g>
          );
        })}

        {/* X軸ラベル */}
        {data.map((d, i) => (
          <text key={`x-${d.month}`} x={xAt(i)} y={H - 14} fontSize={10} fill="#6B7280" textAnchor="middle">{d.month.slice(2).replace('-', '/')}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', fontSize: '0.6875rem', color: '#6B7280', padding: '0.25rem 0.5rem' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: '#3B82F6', opacity: 0.7, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />応募</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 2, backgroundColor: '#059669', marginRight: 4, verticalAlign: 'middle' }} />採用</span>
      </div>
    </div>
  );
};

/* ---- AI 要約セクション ---- */
const AISummarySection: React.FC<{
  loading: boolean;
  error: string | null;
  summary: AISummary | null;
  onGenerate: () => void;
  compareEnabled: boolean;
}> = ({ loading, error, summary, onGenerate, compareEnabled }) => (
  <div style={{ borderRadius: '8px', padding: '1.25rem', background: 'linear-gradient(135deg, #FAF5FF 0%, #F0F9FF 100%)', border: '1px solid #DDD6FE' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
      <h3 style={{ ...sectionTitle, margin: 0 }}>
        <Sparkles size={16} color="#7C3AED" />
        AI 総評
        <span style={{ fontSize: '0.625rem', color: '#9CA3AF', fontWeight: 400, marginLeft: '0.5rem' }}>RISOTTO AI</span>
      </h3>
      <button
        className="no-print"
        onClick={onGenerate}
        disabled={loading}
        style={{
          padding: '0.375rem 0.875rem',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: loading ? '#A78BFA' : '#7C3AED',
          color: '#fff',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <Sparkles size={12} />
        {loading ? '生成中…' : summary ? '再生成' : (compareEnabled ? '前期比較込みで生成' : '要約を生成')}
      </button>
    </div>
    {error && <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.75rem', borderRadius: '4px', marginBottom: '0.5rem' }}>エラー: {error}</div>}
    {!summary && !loading && !error && (
      <div style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
        RISOTTO AI がレポートを分析し、ハイライト・懸念点・提案を要約します。「要約を生成」をクリックしてください。
      </div>
    )}
    {summary && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1F2937', lineHeight: 1.55 }}>{summary.headline}</div>
        {summary.highlights.length > 0 && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#059669', marginBottom: '0.25rem' }}>✓ ハイライト</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem', color: '#374151', lineHeight: 1.6 }}>
              {summary.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}
        {summary.concerns.length > 0 && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#DC2626', marginBottom: '0.25rem' }}>! 懸念点</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem', color: '#374151', lineHeight: 1.6 }}>
              {summary.concerns.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}
        {summary.recommendations.length > 0 && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0EA5E9', marginBottom: '0.25rem' }}>→ 推奨アクション</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem', color: '#374151', lineHeight: 1.6 }}>
              {summary.recommendations.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}
      </div>
    )}
  </div>
);

const MatrixTable: React.FC<{ rows: MatrixRow[]; highlightFirst?: boolean; overall?: MatrixRow }> = ({ rows, highlightFirst, overall }) => {
  const cellStyle = (level: ReturnType<typeof evaluateRow>['validRate']) => ({
    ...tdStyle,
    textAlign: 'right' as const,
    color: level.level === 'normal' ? '#6B7280' : fgForLevel(level.level),
    backgroundColor: bgForLevel(level.level),
    fontWeight: level.level !== 'normal' ? 600 : 400,
  });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>対象</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>応募</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>有効</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>面接</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>内定</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>採用</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>稼働</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>有効率</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>面接設定率</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>採用率</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>稼働率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isOverallRow = (highlightFirst && i === 0) || (overall && r.label === overall.label && r.applications === overall.applications);
            const bn = overall && !isOverallRow ? evaluateRow(r, overall) : null;
            return (
              <tr key={r.label} style={{ backgroundColor: highlightFirst && i === 0 ? '#F0F9FF' : 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: highlightFirst && i === 0 ? 700 : 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {bn && (bn.applicationToHireRate.level === 'critical' || bn.validToInterviewRate.level === 'critical') && (
                    <AlertTriangle size={12} color="#DC2626" />
                  )}
                  {r.label}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.applications)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.validApplications)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.interviewScheduled)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.offered)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(r.hired)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.active)}</td>
                <td style={bn ? cellStyle(bn.validRate) : { ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.validRate)}</td>
                <td style={bn ? cellStyle(bn.validToInterviewRate) : { ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.validToInterviewRate)}</td>
                <td style={bn ? cellStyle(bn.applicationToHireRate) : { ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.applicationToHireRate)}</td>
                <td style={bn ? cellStyle(bn.applicationToActiveRate) : { ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.applicationToActiveRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {overall && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.6875rem', color: '#9CA3AF' }}>
          通過率セルは全体平均との比較で着色（赤=平均の50%未満、黄=70%未満、緑=130%以上）。母数3未満は判定対象外。
        </p>
      )}
    </div>
  );
};

const AgeTable: React.FC<{ rows: AgeBreakdown[]; compact?: boolean }> = ({ rows, compact }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>年代</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>応募数</th>
          {!compact && <th style={{ ...thStyle, textAlign: 'right' }}>応募割合</th>}
          <th style={{ ...thStyle, textAlign: 'right' }}>採用数</th>
          {!compact && <th style={{ ...thStyle, textAlign: 'right' }}>採用割合</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ageGroup}>
            <td style={tdStyle}>{r.ageGroup}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.applications)}名</td>
            {!compact && <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{r.applicationRate.toFixed(2)}%</td>}
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: r.hired > 0 ? '#059669' : '#9CA3AF' }}>{fmt(r.hired)}名</td>
            {!compact && <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{r.hireRate.toFixed(2)}%</td>}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ---- ステップ別到達率/通過率テーブル ---- */
const StepFunnelTable: React.FC<{ overall: StepFunnelColumn; columns: StepFunnelColumn[] }> = ({ overall, columns }) => {
  // 軸の値が多い場合はトップ8まで表示
  const displayCols = columns.slice(0, 8);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>ステップ</th>
            <th style={{ ...thStyle, textAlign: 'right', backgroundColor: '#F0F9FF' }}>全体</th>
            {displayCols.map((c) => (
              <th key={c.label} style={{ ...thStyle, textAlign: 'right' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {overall.steps.map((step, idx) => (
            <React.Fragment key={step.key}>
              <tr style={{ borderTop: idx === 0 ? '2px solid #E5E7EB' : '1px solid #F3F4F6' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{step.label}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, backgroundColor: '#F0F9FF' }}>
                  <div>{fmt(step.count)}</div>
                  <div style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 400 }}>
                    到達{step.reachRate.toFixed(1)}% / 通過{step.conversionRate.toFixed(1)}%
                  </div>
                </td>
                {displayCols.map((c) => {
                  const s = c.steps[idx];
                  const overallRate = step.conversionRate;
                  const sampleSize = c.steps[0]?.count || 0;
                  let bgColor = 'transparent';
                  let fgColor = '#374151';
                  if (sampleSize >= 3 && overallRate > 0 && idx > 0) {
                    const ratio = s.conversionRate / overallRate;
                    if (ratio < 0.5) { bgColor = '#FEE2E2'; fgColor = '#991B1B'; }
                    else if (ratio < 0.7) { bgColor = '#FEF3C7'; fgColor = '#92400E'; }
                    else if (ratio > 1.3) { bgColor = '#D1FAE5'; fgColor = '#065F46'; }
                  }
                  return (
                    <td key={c.label} style={{ ...tdStyle, textAlign: 'right', backgroundColor: bgColor }}>
                      <div style={{ color: fgColor, fontWeight: bgColor !== 'transparent' ? 600 : 400 }}>{fmt(s.count)}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', fontWeight: 400 }}>
                        {s.reachRate.toFixed(1)}% {idx > 0 && `/ ${s.conversionRate.toFixed(1)}%`}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.6875rem', color: '#9CA3AF' }}>
        各セル: 上段=人数、下段=到達率(応募比) / 通過率(前ステップ比)。通過率セルは全体通過率との比較で着色。
        {columns.length > displayCols.length && ` 上位${displayCols.length}件のみ表示（全${columns.length}件）。`}
      </p>
    </div>
  );
};

/* ---- 採用目標ゲージ + インライン編集 ---- */
const GoalSection: React.FC<{
  goal: GoalProgress | undefined;
  range: DateRange;
  onUpdateGoal: (yearMonth: string, value: number) => void;
}> = ({ goal, range, onUpdateGoal }) => {
  const [editing, setEditing] = useState(false);
  const [tempGoals, setTempGoals] = useState<{ [m: string]: string }>({});

  // 期間内の月リスト
  const months: string[] = (() => {
    const list: string[] = [];
    const s = new Date(range.start + 'T00:00:00');
    const e = new Date(range.end + 'T00:00:00');
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      list.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  })();

  const startEdit = () => {
    const initial: { [m: string]: string } = {};
    months.forEach((m) => {
      const found = goal?.monthly.find((mm) => mm.yearMonth === m);
      initial[m] = found?.target ? String(found.target) : '';
    });
    setTempGoals(initial);
    setEditing(true);
  };

  const saveEdit = () => {
    months.forEach((m) => {
      const val = parseInt(tempGoals[m] || '0', 10) || 0;
      onUpdateGoal(m, val);
    });
    setEditing(false);
  };

  if (!goal && !editing) {
    return (
      <div style={{ borderRadius: '8px', padding: '1.25rem', background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', border: '1px solid #FDE68A' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={16} color="#D97706" />
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400E' }}>採用目標が未設定です</span>
            <span style={{ fontSize: '0.75rem', color: '#92400E' }}>月次目標を設定すると、達成率と着地ヨミが表示されます。</span>
          </div>
          <button onClick={startEdit} className="no-print" style={{ padding: '0.375rem 0.875rem', border: 'none', borderRadius: '6px', backgroundColor: '#D97706', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            目標を設定
          </button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={card}>
        <h3 style={sectionTitle}>
          <Target size={16} color="#D97706" />
          採用目標を編集
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {months.map((m) => (
            <label key={m} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{m}</span>
              <input
                type="number"
                min={0}
                value={tempGoals[m] || ''}
                onChange={(e) => setTempGoals((g) => ({ ...g, [m]: e.target.value }))}
                placeholder="0"
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.875rem' }}
              />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={() => setEditing(false)} style={{ padding: '0.375rem 0.875rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontSize: '0.75rem', cursor: 'pointer' }}>キャンセル</button>
          <button onClick={saveEdit} style={{ padding: '0.375rem 0.875rem', border: 'none', borderRadius: '6px', backgroundColor: '#D97706', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>保存</button>
        </div>
      </div>
    );
  }

  if (!goal) return null;

  // ゲージ用のパス計算
  const gaugeRate = Math.min(100, goal.projectedAchievementRate);
  const gaugeColor = gaugeRate >= 100 ? '#059669' : gaugeRate >= 80 ? '#0EA5E9' : gaugeRate >= 60 ? '#F59E0B' : '#DC2626';

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3 style={{ ...sectionTitle, margin: 0 }}>
          <Target size={16} color="#D97706" />
          採用目標 達成率 {goal.isPastPeriod ? '' : '/ 着地ヨミ'}
        </h3>
        <button onClick={startEdit} className="no-print" style={{ padding: '0.25rem 0.625rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff', color: '#6B7280', fontSize: '0.6875rem', cursor: 'pointer' }}>
          編集
        </button>
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <Gauge value={gaugeRate} color={gaugeColor} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
          <Stat label="目標" value={`${goal.targetHires}名`} color="#6B7280" />
          <Stat label="実績" value={`${goal.actualHires}名`} color="#059669" />
          {!goal.isPastPeriod && <Stat label="着地ヨミ" value={`${goal.projectedHires}名`} color="#0EA5E9" />}
          <Stat
            label={goal.isPastPeriod ? '達成率' : '予測達成率'}
            value={`${(goal.isPastPeriod ? goal.achievementRate : goal.projectedAchievementRate).toFixed(1)}%`}
            color={gaugeColor}
          />
        </div>
      </div>
      {goal.monthly.length > 1 && (
        <div style={{ marginTop: '0.875rem' }}>
          <table style={{ ...tableStyle, fontSize: '0.75rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>月</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>目標</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>実績</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>達成率</th>
              </tr>
            </thead>
            <tbody>
              {goal.monthly.map((m) => {
                const rate = m.target > 0 ? (m.actual / m.target) * 100 : 0;
                const c = rate >= 100 ? '#059669' : rate >= 80 ? '#0EA5E9' : rate >= 60 ? '#F59E0B' : '#DC2626';
                return (
                  <tr key={m.yearMonth}>
                    <td style={tdStyle}>{m.yearMonth}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{m.target}名</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#059669' }}>{m.actual}名</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: c }}>{m.target > 0 ? rate.toFixed(1) + '%' : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Gauge: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const radius = 56;
  const circumference = Math.PI * radius;
  const dash = (Math.min(100, value) / 100) * circumference;
  return (
    <div style={{ position: 'relative', width: 140, height: 80 }}>
      <svg width={140} height={80} viewBox="0 0 140 80">
        <path d={`M 14 70 A ${radius} ${radius} 0 0 1 126 70`} fill="none" stroke="#E5E7EB" strokeWidth={12} strokeLinecap="round" />
        <path d={`M 14 70 A ${radius} ${radius} 0 0 1 126 70`} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color, lineHeight: 1 }}>{value.toFixed(0)}<span style={{ fontSize: '0.875rem' }}>%</span></div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginBottom: '0.125rem' }}>{label}</div>
    <div style={{ fontSize: '1.125rem', fontWeight: 700, color }}>{value}</div>
  </div>
);

/* ---- リードタイム関連サブコンポーネント ---- */
const LeadTimeTiles: React.FC<{ col: import('@/utils/reports/types').LeadTimeColumn }> = ({ col }) => {
  const tiles: { label: string; stats: import('@/utils/reports/types').LeadTimeStats; color: string }[] = [
    { label: '応募 → 面接設定', stats: col.applicationToInterview, color: '#3B82F6' },
    { label: '面接設定 → 内定', stats: col.interviewToOffer, color: '#A855F7' },
    { label: '内定 → 採用', stats: col.offerToHired, color: '#059669' },
    { label: '応募 → 採用 (合計)', stats: col.applicationToHired, color: '#F97316' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.625rem' }}>
      {tiles.map(({ label, stats, color }) => (
        <div key={label} style={{ padding: '0.875rem 1rem', backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px', borderLeft: `3px solid ${color}` }}>
          <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginBottom: '0.25rem' }}>{label}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
            {stats.count > 0 ? `${stats.avgDays.toFixed(1)}日` : '-'}
          </div>
          {stats.count > 0 && (
            <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
              中央値 {stats.medianDays}日 / 最速 {stats.minDays}日 / 最遅 {stats.maxDays}日 (n={stats.count})
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const LeadTimeTable: React.FC<{ rows: import('@/utils/reports/types').LeadTimeColumn[] }> = ({ rows }) => {
  const fmtDays = (s: import('@/utils/reports/types').LeadTimeStats) => s.count > 0 ? `${s.avgDays.toFixed(1)}日 (n=${s.count})` : '-';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>対象</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>応募→面接</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>面接→内定</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>内定→採用</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>応募→採用</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#9CA3AF' }}>データなし</td></tr>
          ) : rows.map((r) => (
            <tr key={r.label}>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', fontWeight: 500 }}>{r.label}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right' }}>{fmtDays(r.applicationToInterview)}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right' }}>{fmtDays(r.interviewToOffer)}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right' }}>{fmtDays(r.offerToHired)}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right', fontWeight: 600, color: '#F97316' }}>{fmtDays(r.applicationToHired)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ---- コスト関連サブコンポーネント ---- */
const CostTile: React.FC<{ label: string; value: string; sub?: string; color: string }> = ({ label, value, sub, color }) => (
  <div style={{ padding: '0.75rem 0.875rem', backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px', borderLeft: `3px solid ${color}` }}>
    <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginBottom: '0.125rem' }}>{label}</div>
    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginTop: '0.125rem' }}>{sub}</div>}
  </div>
);

const CostTable: React.FC<{ rows: import('@/utils/reports/types').CostRow[]; compact?: boolean }> = ({ rows, compact }) => {
  const yen = (n: number) => n > 0 ? `¥${Math.round(n).toLocaleString('ja-JP')}` : '-';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? '0.75rem' : '0.8125rem' }}>
        <thead>
          <tr>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>媒体</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>費用</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>応募</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>採用</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>CPA(応募単価)</th>
            <th style={{ padding: '0.5rem 0.625rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>CPH(採用単価)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: '#9CA3AF' }}>データなし</td></tr>
          ) : rows.map((r) => (
            <tr key={r.source}>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', fontWeight: 500 }}>{r.source}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right', color: '#9A3412', fontWeight: 600 }}>{yen(r.cost)}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right' }}>{r.applications}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{r.hired}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right', color: '#0EA5E9' }}>{yen(r.cpa)}</td>
              <td style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right', color: '#7C3AED', fontWeight: 600 }}>{yen(r.cph)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MonthlyCostTable: React.FC<{ byMonth: { yearMonth: string; total: number; bySource: { [s: string]: number } }[]; bySources: string[] }> = ({ byMonth, bySources }) => {
  const yen = (n: number) => n > 0 ? `¥${Math.round(n).toLocaleString('ja-JP')}` : '-';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
        <thead>
          <tr>
            <th style={{ padding: '0.5rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>月</th>
            {bySources.slice(0, 8).map((s) => (
              <th key={s} style={{ padding: '0.5rem', backgroundColor: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>{s}</th>
            ))}
            <th style={{ padding: '0.5rem', backgroundColor: '#FFF7ED', color: '#9A3412', fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>月合計</th>
          </tr>
        </thead>
        <tbody>
          {byMonth.map((m) => (
            <tr key={m.yearMonth}>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #F3F4F6', fontWeight: 500 }}>{m.yearMonth}</td>
              {bySources.slice(0, 8).map((s) => (
                <td key={s} style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right' }}>{yen(m.bySource[s] || 0)}</td>
              ))}
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right', backgroundColor: '#FFF7ED', color: '#9A3412', fontWeight: 700 }}>{yen(m.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RecruitmentReport;
