import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { Applicant } from '@/types';

/* ------------------------------------------------------------------ */
/*  Helper                                                            */
/* ------------------------------------------------------------------ */

function currentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

type DistPeriod = 'all' | 'thisYear' | '6months' | '3months' | 'lastMonth' | 'thisMonth';

const DIST_PERIOD_OPTIONS: { value: DistPeriod; label: string }[] = [
  { value: 'all',       label: '全期間' },
  { value: 'thisYear',  label: '今年' },
  { value: '6months',   label: '6ヶ月' },
  { value: '3months',   label: '3ヶ月' },
  { value: 'lastMonth', label: '先月' },
  { value: 'thisMonth', label: '今月' },
];

function getPeriodStartDate(period: DistPeriod): string | null {
  const now = new Date();
  switch (period) {
    case 'all': return null;
    case 'thisMonth': {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    case 'lastMonth': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    case 'thisYear': {
      return `${now.getFullYear()}-01-01`;
    }
    case '3months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().slice(0, 10);
    }
    case '6months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d.toISOString().slice(0, 10);
    }
  }
}

function getPeriodEndDate(period: DistPeriod): string | null {
  if (period !== 'lastMonth') return null;
  const now = new Date();
  // 先月の末日
  const d = new Date(now.getFullYear(), now.getMonth(), 0);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(date: string, start: string): string {
  if (!date) return '-';
  const parts = date.split('-');
  return `${parts[1]}/${parts[2]} ${start || ''}`.trim();
}

function findApplicantName(applicants: Applicant[], id: number): string {
  const a = applicants.find((ap) => ap.id === id);
  return a ? a.name : `応募者#${id}`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

interface SummaryCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, color, bgColor }) => (
  <div style={{ ...cardStyles.summaryCard, borderTop: `3px solid ${color}` }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={cardStyles.summaryLabel}>{label}</div>
        <div style={{ ...cardStyles.summaryValue, color }}>{value}</div>
      </div>
      <div style={{ ...cardStyles.summaryIconWrap, backgroundColor: bgColor, color }}>{icon}</div>
    </div>
  </div>
);

/* Status Bar Chart (SVG) */
const StatusBarChart: React.FC<{ data: { name: string; count: number; color: string }[] }> = ({
  data,
}) => {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barH = 28;
  const gap = 6;
  const labelW = 130;
  const chartW = 400;
  const totalH = data.length * (barH + gap);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={labelW + chartW + 50}
        height={Math.max(totalH, 60)}
        style={{ display: 'block' }}
      >
        {data.map((d, i) => {
          const y = i * (barH + gap);
          const barW = maxCount > 0 ? (d.count / maxCount) * chartW : 0;
          return (
            <g key={d.name}>
              <text
                x={labelW - 8}
                y={y + barH / 2 + 1}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="12"
                fill="#4B5563"
              >
                {d.name}
              </text>
              <rect
                x={labelW}
                y={y + 2}
                width={Math.max(barW, 2)}
                height={barH - 4}
                rx="4"
                fill={d.color}
                opacity={0.85}
              />
              <text
                x={labelW + Math.max(barW, 2) + 6}
                y={y + barH / 2 + 1}
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="600"
                fill="#374151"
              >
                {d.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                    */
/* ------------------------------------------------------------------ */

const Dashboard: React.FC = () => {
  const { clientData } = useAuth();
  const navigate = useNavigate();

  const applicants = clientData?.applicants ?? [];
  const events = clientData?.events ?? [];
  const statuses = clientData?.statuses ?? [];
  const sources = clientData?.sources ?? [];

  const ym = currentYearMonth();

  // 分布セクションの期間フィルタ
  const [distPeriod, setDistPeriod] = useState<DistPeriod>('all');

  /* Summary calculations */
  const summary = useMemo(() => {
    const thisMonth = applicants.filter((a) => a.date.startsWith(ym)).length;

    const activeStatusNames = statuses.filter((s) => s.active).map((s) => s.name);
    const activeCount = applicants.filter((a) => activeStatusNames.includes(a.stage)).length;

    const acceptedCount = applicants.filter((a) => a.stage === '内定【承諾】').length;

    const interviewCount = events.length;

    const needsActionCount = applicants.filter((a) => a.needsAction).length;

    return { thisMonth, activeCount, acceptedCount, interviewCount, needsActionCount };
  }, [applicants, events, statuses, ym]);

  /* 分布用フィルタ済み応募者 */
  const distApplicants = useMemo(() => {
    const start = getPeriodStartDate(distPeriod);
    const end = getPeriodEndDate(distPeriod);
    return applicants.filter((a) => {
      if (!a.date) return distPeriod === 'all';
      if (start && a.date < start) return false;
      if (end && a.date > end) return false;
      return true;
    });
  }, [applicants, distPeriod]);

  /* Status distribution */
  const statusDistribution = useMemo(() => {
    const countMap = new Map<string, number>();
    distApplicants.forEach((a) => {
      countMap.set(a.stage, (countMap.get(a.stage) || 0) + 1);
    });
    return statuses
      .filter((s) => countMap.has(s.name))
      .map((s) => ({ name: s.name, count: countMap.get(s.name) || 0, color: s.color }))
      .sort((a, b) => b.count - a.count);
  }, [distApplicants, statuses]);

  /* Upcoming interviews (sorted by date+start) */
  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return [...events]
      .filter((e) => e.date >= today)
      .sort((a, b) => {
        const da = `${a.date}${a.start}`;
        const db = `${b.date}${b.start}`;
        return da.localeCompare(db);
      })
      .slice(0, 8);
  }, [events]);

  /* Needs action list */
  const needsActionList = useMemo(() => {
    return applicants.filter((a) => a.needsAction).slice(0, 10);
  }, [applicants]);

  /* Source distribution */
  const sourceDistribution = useMemo(() => {
    const countMap = new Map<string, number>();
    distApplicants.forEach((a) => {
      if (a.src) countMap.set(a.src, (countMap.get(a.src) || 0) + 1);
    });
    return sources
      .filter((s) => countMap.has(s.name))
      .map((s) => ({ name: s.name, count: countMap.get(s.name) || 0, color: s.color }))
      .sort((a, b) => b.count - a.count);
  }, [distApplicants, sources]);

  /* ---- Render ---- */
  return (
    <div style={pageStyles.container}>
      {/* Page Header */}
      <div style={pageStyles.header}>
        <h2 style={pageStyles.title}>ダッシュボード</h2>
        <span style={pageStyles.date}>
          {new Date().toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>

      {/* Summary Cards */}
      <div style={pageStyles.summaryGrid}>
        <SummaryCard
          label="今月の応募"
          value={summary.thisMonth}
          color="#F97316"
          bgColor="#FFF7ED"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          }
        />
        <SummaryCard
          label="対応中"
          value={summary.activeCount}
          color="#F59E0B"
          bgColor="#FFFBEB"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <SummaryCard
          label="内定"
          value={summary.acceptedCount}
          color="#10B981"
          bgColor="#ECFDF5"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
        <SummaryCard
          label="面接予定"
          value={summary.interviewCount}
          color="#8B5CF6"
          bgColor="#F5F3FF"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <SummaryCard
          label="要対応"
          value={summary.needsActionCount}
          color="#EF4444"
          bgColor="#FEF2F2"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
      </div>

      {/* Two-column layout: Status + Source with shared period filter */}
      <div style={{ ...pageStyles.section, padding: 0, overflow: 'hidden' }}>
        {/* 期間セレクター（共通ヘッダー） */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderBottom: '1px solid #F3F4F6', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>📊 分布集計期間</span>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {DIST_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDistPeriod(opt.value)}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: distPeriod === opt.value ? 700 : 400,
                  border: `1px solid ${distPeriod === opt.value ? '#F97316' : '#E5E7EB'}`,
                  backgroundColor: distPeriod === opt.value ? '#FFF7ED' : '#fff',
                  color: distPeriod === opt.value ? '#F97316' : '#6B7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            対象: {distApplicants.length}名
          </span>
        </div>

        <div style={pageStyles.twoCol}>
          {/* Left: Status Distribution */}
          <div style={{ padding: '1rem 1.25rem' }}>
            <h3 style={{ ...pageStyles.sectionTitle, marginBottom: '0.75rem' }}>ステータス別分布</h3>
            {statusDistribution.length > 0 ? (
              <StatusBarChart data={statusDistribution} />
            ) : (
              <p style={pageStyles.empty}>該当する応募者データがありません</p>
            )}
          </div>

          {/* Right: Source Distribution */}
          <div style={{ padding: '1rem 1.25rem', borderLeft: '1px solid #F3F4F6' }}>
            <h3 style={{ ...pageStyles.sectionTitle, marginBottom: '0.75rem' }}>媒体別応募状況</h3>
            {sourceDistribution.length > 0 ? (
              <div style={pageStyles.sourceGrid}>
                {sourceDistribution.map((s) => (
                  <div
                    key={s.name}
                    style={{
                      ...pageStyles.sourceCard,
                      borderLeft: `4px solid ${s.color}`,
                    }}
                  >
                    <div style={pageStyles.sourceCount}>{s.count}</div>
                    <div style={pageStyles.sourceName}>{s.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={pageStyles.empty}>該当する媒体データがありません</p>
            )}
          </div>
        </div>
      </div>

      {/* Interview Schedule */}
      <div style={pageStyles.section}>
        <h3 style={pageStyles.sectionTitle}>直近の面接予定</h3>
        {upcomingEvents.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={pageStyles.table}>
              <thead>
                <tr>
                  <th style={pageStyles.th}>応募者名</th>
                  <th style={pageStyles.th}>日時</th>
                  <th style={pageStyles.th}>拠点</th>
                  <th style={pageStyles.th}>面接方法</th>
                </tr>
              </thead>
              <tbody>
                {upcomingEvents.map((ev) => (
                  <tr
                    key={ev.id}
                    style={{ ...pageStyles.tr, cursor: 'pointer' }}
                    onClick={() => navigate(`/applicant?applicant=${ev.applicantId}`)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '';
                    }}
                  >
                    <td style={pageStyles.td}>
                      {findApplicantName(applicants, ev.applicantId)}
                    </td>
                    <td style={pageStyles.td}>{formatDateTime(ev.date, ev.start)}</td>
                    <td style={pageStyles.td}>
                      <span style={{ ...pageStyles.badge, backgroundColor: ev.color || '#E5E7EB' }}>
                        {ev.base || '-'}
                      </span>
                    </td>
                    <td style={pageStyles.td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        {ev.method === 'WEB' || ev.method === 'web' || ev.method === 'オンライン' ? (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                              <line x1="8" y1="21" x2="16" y2="21" />
                              <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                            <span style={{ color: '#8B5CF6', fontSize: '0.8125rem', fontWeight: 500 }}>WEB</span>
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            <span style={{ color: '#3B82F6', fontSize: '0.8125rem', fontWeight: 500 }}>対面</span>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={pageStyles.empty}>直近の面接予定はありません</p>
        )}
      </div>

      {/* Needs Action List */}
      <div style={pageStyles.section}>
        <h3 style={pageStyles.sectionTitle}>
          要対応リスト
          {summary.needsActionCount > 0 && (
            <span style={pageStyles.countBadge}>{summary.needsActionCount}</span>
          )}
        </h3>
        {needsActionList.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={pageStyles.table}>
              <thead>
                <tr>
                  <th style={pageStyles.th}>応募者名</th>
                  <th style={pageStyles.th}>ステータス</th>
                  <th style={pageStyles.th}>対応日時</th>
                  <th style={pageStyles.th}>対応メモ</th>
                </tr>
              </thead>
              <tbody>
                {needsActionList.map((a) => {
                  const statusObj = statuses.find((s) => s.name === a.stage);
                  return (
                    <tr
                      key={a.id}
                      style={{ ...pageStyles.tr, cursor: 'pointer' }}
                      onClick={() => navigate(`/applicant?applicant=${a.id}`)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = '';
                      }}
                    >
                      <td style={pageStyles.td}>
                        <span style={{ fontWeight: 500, color: '#1F2937' }}>{a.name}</span>
                      </td>
                      <td style={pageStyles.td}>
                        <span
                          style={{
                            ...pageStyles.badge,
                            backgroundColor: statusObj?.color || '#E5E7EB',
                          }}
                        >
                          {a.stage}
                        </span>
                      </td>
                      <td style={pageStyles.td}>
                        {a.actionDate
                          ? `${a.actionDate} ${a.actionTime || ''}`
                          : '-'}
                      </td>
                      <td style={{ ...pageStyles.td, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {a.actionMemo || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={pageStyles.empty}>要対応の応募者はいません</p>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const cardStyles: Record<string, React.CSSProperties> = {
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.25rem 1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    minWidth: 0,
  },
  summaryLabel: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#6B7280',
    marginBottom: '0.375rem',
    letterSpacing: '0.02em',
  },
  summaryValue: {
    fontSize: '1.75rem',
    fontWeight: 700,
    lineHeight: 1.1,
  },
  summaryIconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
};

const pageStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: '1.5rem 2rem 2rem',
    maxWidth: '1200px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  },
  title: {
    margin: 0,
    fontSize: '1.375rem',
    fontWeight: 700,
    color: '#111827',
  },
  date: {
    fontSize: '0.8125rem',
    color: '#6B7280',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: '1.5rem',
    marginBottom: '1.5rem',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.25rem 1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    margin: '0 0 1rem',
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  countBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    padding: '0 6px',
    borderRadius: '11px',
    backgroundColor: '#EF4444',
    color: '#fff',
    fontSize: '0.6875rem',
    fontWeight: 700,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '0.8125rem',
  },
  th: {
    padding: '0.625rem 0.75rem',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: '#6B7280',
    fontSize: '0.75rem',
    borderBottom: '1px solid #E5E7EB',
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.02em',
  },
  tr: {
    borderBottom: '1px solid #F3F4F6',
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '0.625rem 0.75rem',
    color: '#374151',
    whiteSpace: 'nowrap' as const,
  },
  badge: {
    display: 'inline-block',
    padding: '0.2rem 0.625rem',
    borderRadius: '999px',
    color: '#fff',
    fontSize: '0.6875rem',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  sourceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '0.625rem',
  },
  sourceCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: '8px',
    padding: '0.875rem 1rem',
  },
  sourceCount: {
    fontSize: '1.375rem',
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1.1,
    marginBottom: '0.25rem',
  },
  sourceName: {
    fontSize: '0.75rem',
    color: '#6B7280',
    fontWeight: 500,
  },
  empty: {
    color: '#9CA3AF',
    fontSize: '0.8125rem',
    textAlign: 'center' as const,
    padding: '2rem 0',
    margin: 0,
  },
};

export default Dashboard;
