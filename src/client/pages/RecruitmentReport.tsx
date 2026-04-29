import React, { useState, useMemo } from 'react';
import { FileText, BarChart3, ChevronRight, ChevronDown, Calendar, Building2, Megaphone, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { DatePreset, DateRange, MatrixRow, AgeBreakdown } from '@/utils/reports/types';
import { presetToRange, presetLabel, formatRange } from '@/utils/reports/dateRange';
import { buildReport } from '@/utils/reports/aggregate';
import { storage } from '@/utils/storage';

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

const RecruitmentReport: React.FC = () => {
  const { client } = useAuth();
  const [preset, setPreset] = useState<DatePreset>('lastHalf');
  const [customRange, setCustomRange] = useState<DateRange>({ start: '', end: '' });
  const [section, setSection] = useState<'summary' | 'base' | 'source' | 'age'>('summary');
  const [expandedBaseSrc, setExpandedBaseSrc] = useState<Set<string>>(new Set());
  const [expandedBaseAge, setExpandedBaseAge] = useState<Set<string>>(new Set());

  const range: DateRange = useMemo(() => {
    if (preset === 'custom') {
      return customRange.start && customRange.end ? customRange : presetToRange('thisMonth');
    }
    return presetToRange(preset);
  }, [preset, customRange]);

  // 親アカウントのデータをそのまま使う（子アカで拠点フィルタ済みでも、レポートは全社視点で表示）
  const fullData = useMemo(() => {
    if (!client) return null;
    const dataId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
    try {
      return storage.getClientData(dataId);
    } catch {
      return null;
    }
  }, [client]);

  const report = useMemo(() => (fullData ? buildReport(fullData, range) : null), [fullData, range]);

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

  const { total, ngBreakdown, byBase, bySource, byBaseSource, byAge, byBaseAge, bySourceAge, ngAgeBreakdown } = report;

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={20} color="#0EA5E9" />
          採用レポート
        </h2>
        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{formatRange(range)}</div>
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
          ['base', '拠点別', Building2],
          ['source', '媒体別', Megaphone],
          ['age', '年代分析', Users],
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
          {/* ファネル */}
          <div style={card}>
            <h3 style={sectionTitle}>
              <BarChart3 size={16} color="#0EA5E9" />
              採用ファネル（全体）
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.625rem' }}>
              <FunnelTile label="応募数" value={total.applications} color="#3B82F6" />
              <FunnelTile label="有効応募数" value={total.validApplications} sub={pct(total.validRate)} color="#0891B2" />
              <FunnelTile label="面接設定数" value={total.interviewScheduled} sub={pct(total.validToInterviewRate)} color="#6366F1" />
              <FunnelTile label="内定数" value={total.offered} sub={pct(total.interviewToOfferRate) + ' / 応募 ' + pct(total.applications > 0 ? (total.offered / total.applications) * 100 : 0)} color="#A855F7" />
              <FunnelTile label="採用数" value={total.hired} sub={pct(total.applicationToHireRate) + ' (応募比)'} color="#059669" />
              <FunnelTile label="稼働数" value={total.active} sub={pct(total.applicationToActiveRate)} color="#10B981" />
            </div>
          </div>

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
            <MatrixTable rows={[{ label: '全体', ...total }, ...byBase]} highlightFirst />
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
                        <MatrixTable rows={rows} />
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
          <MatrixTable rows={bySource} />
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

      <div style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.75rem', color: '#92400E', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <Calendar size={14} />
        集計対象は 応募日（applicant.date）が選択期間内のレコードのみ。次フェーズで PDF/Excel 出力に対応予定。
      </div>
    </div>
  );
};

/* =============================================================
   Sub components
   ============================================================= */

const FunnelTile: React.FC<{ label: string; value: number; sub?: string; color: string }> = ({ label, value, sub, color }) => (
  <div style={{ padding: '0.75rem 0.875rem', backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px', borderLeft: `3px solid ${color}` }}>
    <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginBottom: '0.125rem' }}>{label}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{fmt(value)}</div>
    {sub && <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginTop: '0.125rem' }}>{sub}</div>}
  </div>
);

const MatrixTable: React.FC<{ rows: MatrixRow[]; highlightFirst?: boolean }> = ({ rows, highlightFirst }) => (
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
        {rows.map((r, i) => (
          <tr key={r.label} style={{ backgroundColor: highlightFirst && i === 0 ? '#F0F9FF' : 'transparent' }}>
            <td style={{ ...tdStyle, fontWeight: highlightFirst && i === 0 ? 700 : 500 }}>{r.label}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.applications)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.validApplications)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.interviewScheduled)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.offered)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(r.hired)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(r.active)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.validRate)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.validToInterviewRate)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.applicationToHireRate)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', color: '#6B7280' }}>{pct(r.applicationToActiveRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

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

export default RecruitmentReport;
