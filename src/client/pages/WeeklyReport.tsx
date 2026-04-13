import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/* ============================
   WeeklyReport - 週次レポート
   ============================ */

// ---------- helpers ----------

const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isInDateRange(dateStr: string, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);
  return d >= s && d <= e;
}

function isSameDay(dateStr: string, target: Date): boolean {
  if (!dateStr) return false;
  return dateStr === fmtDate(target);
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('ja-JP').format(Math.round(n));
}

function getCpaRating(cpa: number): { label: string; color: string; bg: string } {
  if (cpa < 10000) return { label: '優秀', color: '#059669', bg: '#D1FAE5' };
  if (cpa < 30000) return { label: '良好', color: '#D97706', bg: '#FEF3C7' };
  return { label: '要見直し', color: '#DC2626', bg: '#FEE2E2' };
}

function downloadCsv(filename: string, csvContent: string) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function svgToPng(svgEl: SVGSVGElement, filename: string) {
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(pngUrl);
    }, 'image/png');
  };
  img.src = url;
}

// ---------- sub-components ----------

const SummaryCard: React.FC<{ label: string; value: number; color: string; icon: string }> = ({
  label,
  value,
  color,
  icon,
}) => (
  <div style={{ ...cardStyles.summaryCard, borderLeft: `4px solid ${color}` }}>
    <div style={cardStyles.summaryIcon}>{icon}</div>
    <div>
      <div style={cardStyles.summaryLabel}>{label}</div>
      <div style={{ ...cardStyles.summaryValue, color }}>{value}</div>
    </div>
  </div>
);

// Bar chart
interface BarChartProps {
  data: { label: string; value: number }[];
  title: string;
  barColor?: string;
  height?: number;
  svgRef?: React.Ref<SVGSVGElement>;
}

const BarChart: React.FC<BarChartProps> = ({ data, title, barColor = '#8B5CF6', height = 240, svgRef }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const gridLines = 5;
  const marginLeft = 48;
  const marginRight = 16;
  const marginTop = 40;
  const marginBottom = 40;
  const chartW = Math.max(data.length * 72 + marginLeft + marginRight, 300);
  const chartH = height;
  const plotH = chartH - marginTop - marginBottom;
  const plotW = chartW - marginLeft - marginRight;
  const barWidth = Math.min(44, plotW / data.length - 12);

  const niceMax = Math.ceil(maxVal / gridLines) * gridLines || gridLines;

  return (
    <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
        {title}
      </div>
      <svg
        ref={svgRef}
        width={chartW}
        height={chartH}
        viewBox={`0 0 ${chartW} ${chartH}`}
        style={{ display: 'block', fontFamily: 'inherit', backgroundColor: '#fff' }}
      >
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const y = marginTop + plotH - (plotH * i) / gridLines;
          const val = Math.round((niceMax * i) / gridLines);
          return (
            <g key={i}>
              <line
                x1={marginLeft}
                y1={y}
                x2={marginLeft + plotW}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray={i === 0 ? 'none' : '4,3'}
              />
              <text x={marginLeft - 8} y={y + 4} textAnchor="end" fill="#9CA3AF" fontSize="11">
                {val}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const barH = (d.value / niceMax) * plotH;
          const x = marginLeft + (plotW / data.length) * i + (plotW / data.length - barWidth) / 2;
          const y = marginTop + plotH - barH;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={3}
                fill={barColor}
                opacity={0.85}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => {
                  (e.target as SVGRectElement).setAttribute('opacity', '1');
                  setTooltip({ x: x + barWidth / 2, y: y - 8, text: `${d.label}: ${d.value}件` });
                }}
                onMouseLeave={(e) => {
                  (e.target as SVGRectElement).setAttribute('opacity', '0.85');
                  setTooltip(null);
                }}
              />
              {d.value > 0 && (
                <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fill="#374151" fontSize="11" fontWeight="600">
                  {d.value}
                </text>
              )}
              <text
                x={marginLeft + (plotW / data.length) * i + plotW / data.length / 2}
                y={chartH - marginBottom + 18}
                textAnchor="middle"
                fill="#6B7280"
                fontSize="11"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {tooltip && (
          <g>
            <rect
              x={tooltip.x - 50}
              y={tooltip.y - 24}
              width={100}
              height={22}
              rx={4}
              fill="#1F2937"
              opacity={0.9}
            />
            <text x={tooltip.x} y={tooltip.y - 10} textAnchor="middle" fill="#fff" fontSize="11">
              {tooltip.text}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

// CPA horizontal bar chart
interface CpaBarChartProps {
  data: { name: string; cpa: number; color: string }[];
  title: string;
  svgRef?: React.Ref<SVGSVGElement>;
}

const CpaBarChart: React.FC<CpaBarChartProps> = ({ data, title, svgRef }) => {
  const maxCpa = Math.max(...data.map((d) => d.cpa), 1);
  const barH = 28;
  const gap = 8;
  const marginLeft = 120;
  const marginRight = 80;
  const marginTop = 36;
  const marginBottom = 32;
  const chartW = 600;
  const plotW = chartW - marginLeft - marginRight;
  const chartH = marginTop + data.length * (barH + gap) + marginBottom;
  const gridLines = 4;
  const niceMax = Math.ceil(maxCpa / 10000) * 10000 || 10000;

  return (
    <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
        {title}
      </div>
      <svg
        ref={svgRef}
        width={chartW}
        height={chartH}
        viewBox={`0 0 ${chartW} ${chartH}`}
        style={{ display: 'block', fontFamily: 'inherit', backgroundColor: '#fff' }}
      >
        <text x={chartW / 2} y={20} textAnchor="middle" fill="#374151" fontSize="13" fontWeight="600">
          {title}
        </text>

        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const x = marginLeft + (plotW * i) / gridLines;
          const val = Math.round((niceMax * i) / gridLines);
          return (
            <g key={i}>
              <line x1={x} y1={marginTop} x2={x} y2={chartH - marginBottom} stroke="#E5E7EB" strokeDasharray="4,3" />
              <text x={x} y={chartH - marginBottom + 16} textAnchor="middle" fill="#9CA3AF" fontSize="10">
                {val >= 10000 ? `${val / 10000}万` : formatMoney(val)}
              </text>
            </g>
          );
        })}

        {[10000, 30000].map((th) => {
          if (th > niceMax) return null;
          const x = marginLeft + (th / niceMax) * plotW;
          return (
            <g key={th}>
              <line x1={x} y1={marginTop} x2={x} y2={chartH - marginBottom} stroke={th === 10000 ? '#059669' : '#DC2626'} strokeDasharray="6,3" strokeWidth={1.5} opacity={0.5} />
              <text x={x} y={marginTop - 6} textAnchor="middle" fill={th === 10000 ? '#059669' : '#DC2626'} fontSize="9">
                {th === 10000 ? '1万' : '3万'}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const y = marginTop + i * (barH + gap);
          const w = (d.cpa / niceMax) * plotW;
          const rating = getCpaRating(d.cpa);
          return (
            <g key={i}>
              <text x={marginLeft - 8} y={y + barH / 2 + 4} textAnchor="end" fill="#374151" fontSize="11">
                {d.name.length > 12 ? d.name.slice(0, 12) + '..' : d.name}
              </text>
              <rect x={marginLeft} y={y} width={Math.max(w, 2)} height={barH} rx={4} fill={rating.color} opacity={0.75} />
              <text x={marginLeft + w + 8} y={y + barH / 2 + 4} fill="#374151" fontSize="11" fontWeight="600">
                {d.cpa > 0 ? `\u00A5${formatMoney(d.cpa)}` : '-'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---------- Main component ----------

type TabType = 'overview' | 'cpa';

const WeeklyReport: React.FC = () => {
  const { clientData } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const cpaChartRef = useRef<SVGSVGElement>(null);
  const mainChartRef = useRef<SVGSVGElement>(null);
  const [dlMenuOpen, setDlMenuOpen] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const goPrev = useCallback(() => setWeekStart((s) => addDays(s, -7)), []);
  const goNext = useCallback(() => setWeekStart((s) => addDays(s, 7)), []);

  const weekLabel = useMemo(() => {
    const sy = weekStart.getFullYear();
    const sm = weekStart.getMonth() + 1;
    const sd = weekStart.getDate();
    const em = weekEnd.getMonth() + 1;
    const ed = weekEnd.getDate();
    return `${sy}年${sm}月${sd}日 - ${em}月${ed}日`;
  }, [weekStart, weekEnd]);

  // Filtered applicants
  const weekApplicants = useMemo(() => {
    if (!clientData) return [];
    return clientData.applicants.filter((a) => isInDateRange(a.date, weekStart, weekEnd));
  }, [clientData, weekStart, weekEnd]);

  // Summary
  const summary = useMemo(() => {
    let interview = 0;
    let passed = 0;
    let offered = 0;
    let rejected = 0;
    for (const a of weekApplicants) {
      const s = a.stage;
      if (s === '面接調整中' || s === '面接確定' || s === '一次面接調整中') interview++;
      if (s === '面接合格') passed++;
      if (s === '内定' || s === '内定【承諾】' || s === '入社') offered++;
      if (s.startsWith('不合格')) rejected++;
    }
    return {
      total: weekApplicants.length,
      interview,
      passed,
      offered,
      rejected,
    };
  }, [weekApplicants]);

  // Daily breakdown
  const dailyData = useMemo(() => {
    return days.map((d, i) => ({
      label: `${fmtShort(d)}(${DAY_NAMES[i]})`,
      value: weekApplicants.filter((a) => isSameDay(a.date, d)).length,
    }));
  }, [days, weekApplicants]);

  // Sources
  const sources = useMemo(() => (clientData ? clientData.sources : []), [clientData]);

  // Source x day table data
  const sourceDayData = useMemo(() => {
    return sources.map((src) => {
      const dayCounts = days.map(
        (d) => weekApplicants.filter((a) => a.src === src.name && isSameDay(a.date, d)).length
      );
      const total = dayCounts.reduce((s, v) => s + v, 0);
      return { name: src.name, dayCounts, total };
    });
  }, [sources, days, weekApplicants]);

  // CPA - use parent month's data for cost context
  const cpaData = useMemo(() => {
    // For weekly, prorate monthly cost by 7/daysInMonth
    const y = weekStart.getFullYear();
    const m = weekStart.getMonth();
    const daysInMo = new Date(y, m + 1, 0).getDate();
    const ratio = 7 / daysInMo;

    return sources
      .map((src) => {
        const count = weekApplicants.filter((a) => a.src === src.name).length;
        const weeklyCost = src.monthlyCost * ratio;
        const cpa = count > 0 ? weeklyCost / count : 0;
        return { name: src.name, count, cost: weeklyCost, monthlyCost: src.monthlyCost, cpa, color: src.color };
      })
      .filter((d) => d.monthlyCost > 0 || d.count > 0);
  }, [sources, weekApplicants, weekStart]);

  // CSV export - overview
  const exportOverviewCsv = useCallback(() => {
    const dayHeaders = days.map((d, i) => `${fmtShort(d)}(${DAY_NAMES[i]})`);
    const header = ['媒体名', ...dayHeaders, '合計'].join(',');
    const rows = sourceDayData.map(
      (d) => [d.name, ...d.dayCounts, d.total].join(',')
    );
    const totalRow = [
      '合計',
      ...days.map((_, i) => sourceDayData.reduce((s, d) => s + d.dayCounts[i], 0)),
      sourceDayData.reduce((s, d) => s + d.total, 0),
    ].join(',');
    const csv = [header, ...rows, totalRow].join('\n');
    downloadCsv(`週次レポート_${fmtDate(weekStart)}.csv`, csv);
  }, [days, sourceDayData, weekStart]);

  // CSV export - CPA
  const exportCpaCsv = useCallback(() => {
    const header = '媒体名,応募数,週間費用(按分),CPA,評価';
    const rows = cpaData.map((d) => {
      const rating = d.cpa > 0 ? getCpaRating(d.cpa).label : '-';
      return [d.name, d.count, Math.round(d.cost), Math.round(d.cpa), rating].join(',');
    });
    const csv = [header, ...rows].join('\n');
    downloadCsv(`CPA分析_${fmtDate(weekStart)}.csv`, csv);
  }, [cpaData, weekStart]);

  // PNG export
  const exportCpaPng = useCallback(() => {
    if (cpaChartRef.current) {
      svgToPng(cpaChartRef.current, `CPA分析_${fmtDate(weekStart)}.png`);
    }
  }, [weekStart]);

  // Main chart PNG export
  const exportMainChartPng = useCallback(() => {
    if (mainChartRef.current) {
      svgToPng(mainChartRef.current, `日別応募数_${fmtDate(weekStart)}.png`);
    }
  }, [weekStart]);

  if (!clientData) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>データを読み込み中...</div>;
  }

  return (
    <div style={pageStyles.container}>
      {/* Header */}
      <div style={pageStyles.header}>
        <h2 style={pageStyles.title}>週次レポート</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDlMenuOpen((v) => !v)}
              style={pageStyles.dlBtn}
            >
              レポートダウンロード ▾
            </button>
            {dlMenuOpen && (
              <div style={pageStyles.dlMenu}>
                <button
                  style={pageStyles.dlMenuItem}
                  onClick={() => { exportMainChartPng(); setDlMenuOpen(false); }}
                >
                  &#128202; グラフ画像（PNG）
                </button>
                <button
                  style={pageStyles.dlMenuItem}
                  onClick={() => { exportOverviewCsv(); setDlMenuOpen(false); }}
                >
                  &#128196; 集計データ（CSV）
                </button>
              </div>
            )}
          </div>
          <div style={pageStyles.nav}>
            <button onClick={goPrev} style={pageStyles.navBtn}>&lt;</button>
            <span style={pageStyles.navLabel}>{weekLabel}</span>
            <button onClick={goNext} style={pageStyles.navBtn}>&gt;</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={pageStyles.tabRow}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            ...pageStyles.tab,
            ...(activeTab === 'overview' ? pageStyles.tabActive : {}),
          }}
        >
          概要・媒体別
        </button>
        <button
          onClick={() => setActiveTab('cpa')}
          style={{
            ...pageStyles.tab,
            ...(activeTab === 'cpa' ? pageStyles.tabActive : {}),
          }}
        >
          CPA分析
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Summary cards */}
          <div style={pageStyles.summaryGrid}>
            <SummaryCard label="応募数" value={summary.total} color="#3B82F6" icon="&#128203;" />
            <SummaryCard label="面接調整数" value={summary.interview} color="#F59E0B" icon="&#128197;" />
            <SummaryCard label="合格数" value={summary.passed} color="#06B6D4" icon="&#9989;" />
            <SummaryCard label="内定数" value={summary.offered} color="#EC4899" icon="&#127942;" />
            <SummaryCard label="不合格数" value={summary.rejected} color="#EF4444" icon="&#10060;" />
          </div>

          {/* Daily bar chart */}
          <div style={pageStyles.section}>
            <BarChart svgRef={mainChartRef} data={dailyData} title="日別応募数" />
          </div>

          {/* Source x day table */}
          <div style={pageStyles.section}>
            <div style={pageStyles.sectionHeader}>
              <span style={pageStyles.sectionTitle}>媒体別集計</span>
              <button onClick={exportOverviewCsv} style={pageStyles.exportBtn}>
                CSVエクスポート
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>媒体名</th>
                    {days.map((d, i) => (
                      <th key={i} style={{ textAlign: 'center' }}>
                        {fmtShort(d)}<br />({DAY_NAMES[i]})
                      </th>
                    ))}
                    <th style={{ textAlign: 'center' }}>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceDayData.map((d) => (
                    <tr key={d.name}>
                      <td>{d.name}</td>
                      {d.dayCounts.map((c, i) => (
                        <td key={i} style={{ textAlign: 'center' }}>{c}</td>
                      ))}
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{d.total}</td>
                    </tr>
                  ))}
                  {sourceDayData.length === 0 && (
                    <tr>
                      <td colSpan={days.length + 2} style={{ textAlign: 'center', color: '#9ca3af' }}>
                        データがありません
                      </td>
                    </tr>
                  )}
                  {sourceDayData.length > 0 && (
                    <tr style={{ fontWeight: 600, backgroundColor: '#F9FAFB' }}>
                      <td>合計</td>
                      {days.map((_, i) => (
                        <td key={i} style={{ textAlign: 'center' }}>
                          {sourceDayData.reduce((s, d) => s + d.dayCounts[i], 0)}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center' }}>
                        {sourceDayData.reduce((s, d) => s + d.total, 0)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'cpa' && (
        <>
          {/* CPA table */}
          <div style={pageStyles.section}>
            <div style={pageStyles.sectionHeader}>
              <span style={pageStyles.sectionTitle}>媒体別CPA（週間按分）</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={exportCpaCsv} style={pageStyles.exportBtn}>
                  CSVエクスポート
                </button>
                <button onClick={exportCpaPng} style={{ ...pageStyles.exportBtn, backgroundColor: '#8B5CF6' }}>
                  PNGダウンロード
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>媒体名</th>
                    <th style={{ textAlign: 'center' }}>応募数</th>
                    <th style={{ textAlign: 'right' }}>週間費用(按分)</th>
                    <th style={{ textAlign: 'right' }}>CPA</th>
                    <th style={{ textAlign: 'center' }}>評価</th>
                  </tr>
                </thead>
                <tbody>
                  {cpaData.map((d) => {
                    const rating = d.cpa > 0 ? getCpaRating(d.cpa) : null;
                    return (
                      <tr key={d.name}>
                        <td>{d.name}</td>
                        <td style={{ textAlign: 'center' }}>{d.count}</td>
                        <td style={{ textAlign: 'right' }}>&yen;{formatMoney(d.cost)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {d.cpa > 0 ? `\u00A5${formatMoney(d.cpa)}` : '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {rating && (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.125rem 0.625rem',
                                borderRadius: '9999px',
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                color: rating.color,
                                backgroundColor: rating.bg,
                              }}
                            >
                              {rating.label}
                            </span>
                          )}
                          {!rating && '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {cpaData.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af' }}>
                        データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CPA chart */}
          {cpaData.length > 0 && (
            <div style={pageStyles.section}>
              <CpaBarChart
                svgRef={cpaChartRef}
                data={cpaData.map((d) => ({ name: d.name, cpa: d.cpa, color: d.color }))}
                title={`CPA分析 - ${fmtDate(weekStart)}週`}
              />
            </div>
          )}

          {/* CPA Legend */}
          <div style={pageStyles.section}>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <span>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#059669', marginRight: 4, verticalAlign: 'middle' }} />
                優秀: CPA &lt; &yen;10,000
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#D97706', marginRight: 4, verticalAlign: 'middle' }} />
                良好: CPA &lt; &yen;30,000
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#DC2626', marginRight: 4, verticalAlign: 'middle' }} />
                要見直し: CPA &ge; &yen;30,000
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ---------- styles ----------

const cardStyles: Record<string, React.CSSProperties> = {
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: '#fff',
    borderRadius: '10px',
    padding: '1rem 1.25rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #E5E7EB',
  },
  summaryIcon: {
    fontSize: '1.5rem',
    lineHeight: 1,
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#6B7280',
    marginBottom: '0.125rem',
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
};

const pageStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: '1.5rem',
    maxWidth: '1100px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.25rem',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#111827',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  navBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    backgroundColor: '#fff',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#374151',
    minWidth: '200px',
    textAlign: 'center',
  },
  tabRow: {
    display: 'flex',
    gap: '0.25rem',
    marginBottom: '1.25rem',
    borderBottom: '2px solid #E5E7EB',
  },
  tab: {
    padding: '0.5rem 1.25rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: '#6B7280',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    marginBottom: '-2px',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: '#3B82F6',
    borderBottomColor: '#3B82F6',
    fontWeight: 600,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  section: {
    marginBottom: '1.5rem',
    backgroundColor: '#fff',
    borderRadius: '10px',
    border: '1px solid #E5E7EB',
    padding: '1.25rem',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
  },
  exportBtn: {
    padding: '0.375rem 0.875rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#3B82F6',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  dlBtn: {
    padding: '0.5rem 1rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#10B981',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  dlMenu: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: '0.25rem',
    backgroundColor: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 50,
    minWidth: '200px',
    overflow: 'hidden',
  },
  dlMenuItem: {
    display: 'block',
    width: '100%',
    padding: '0.625rem 1rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: '#374151',
    backgroundColor: 'transparent',
    border: 'none',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
};

export default WeeklyReport;
