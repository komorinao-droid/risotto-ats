/**
 * 採用レポート エクスポート（CSV / 印刷PDF）
 */
import type { RecruitmentReport, MatrixRow, AgeBreakdown } from './types';

const csvCell = (v: string | number | undefined | null) => {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '0.00');

function matrixSection(title: string, rows: MatrixRow[]): string[] {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push(['対象', '応募', '有効', '面接', '内定', '採用', '稼働', '有効率(%)', '面接設定率(%)', '採用率(%)', '稼働率(%)'].join(','));
  rows.forEach((r) => {
    lines.push([
      csvCell(r.label),
      r.applications,
      r.validApplications,
      r.interviewScheduled,
      r.offered,
      r.hired,
      r.active,
      fmt(r.validRate),
      fmt(r.validToInterviewRate),
      fmt(r.applicationToHireRate),
      fmt(r.applicationToActiveRate),
    ].join(','));
  });
  lines.push('');
  return lines;
}

function ageSection(title: string, rows: AgeBreakdown[]): string[] {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push(['年代', '応募数', '応募割合(%)', '採用数', '採用割合(%)'].join(','));
  rows.forEach((r) => {
    lines.push([csvCell(r.ageGroup), r.applications, fmt(r.applicationRate), r.hired, fmt(r.hireRate)].join(','));
  });
  lines.push('');
  return lines;
}

/** レポート全体を1つのCSVテキストにまとめる（複数セクションを # で区切る） */
export function reportToCSV(report: RecruitmentReport): string {
  const lines: string[] = [];

  lines.push(`# 採用レポート`);
  lines.push(`期間,${report.range.start} 〜 ${report.range.end}`);
  lines.push(`生成日時,${report.generatedAt}`);
  lines.push('');

  lines.push('# 採用ファネル（全体）');
  lines.push('指標,値,通過率(%)');
  const t = report.total;
  lines.push(`応募数,${t.applications},`);
  lines.push(`有効応募数,${t.validApplications},${fmt(t.validRate)}`);
  lines.push(`面接設定数,${t.interviewScheduled},${fmt(t.validToInterviewRate)}`);
  lines.push(`内定数,${t.offered},${fmt(t.interviewToOfferRate)}`);
  lines.push(`採用数,${t.hired},${fmt(t.applicationToHireRate)}`);
  lines.push(`稼働数,${t.active},${fmt(t.applicationToActiveRate)}`);
  lines.push('');

  lines.push('# 選考NG内訳');
  lines.push('理由,人数');
  lines.push(`年齢NG,${report.ngBreakdown.byReason.age}`);
  lines.push(`条件不一致,${report.ngBreakdown.byReason.condition}`);
  lines.push(`重複応募,${report.ngBreakdown.byReason.duplicate}`);
  lines.push(`人物不適合,${report.ngBreakdown.byReason.personality}`);
  lines.push(`その他,${report.ngBreakdown.byReason.other}`);
  lines.push(`合計,${report.ngBreakdown.total}`);
  lines.push('');

  if (report.byMonth.length) {
    lines.push('# 月次推移');
    lines.push(['月', '応募', '有効', '面接', '内定', '採用'].join(','));
    report.byMonth.forEach((m) => {
      lines.push([m.month, m.applications, m.validApplications, m.interviewScheduled, m.offered, m.hired].join(','));
    });
    lines.push('');
  }

  lines.push(...matrixSection('支社別', report.byBase));
  lines.push(...matrixSection('媒体別', report.bySource));
  report.byBaseSource.forEach(({ base, rows }) => {
    if (rows.length) lines.push(...matrixSection(`支社×媒体: ${base}`, rows));
  });
  lines.push(...ageSection('全社×年代別', report.byAge));
  report.byBaseAge.forEach(({ base, rows }) => {
    if (rows.length) lines.push(...ageSection(`支社×年代: ${base}`, rows));
  });
  report.bySourceAge.forEach(({ source, rows }) => {
    if (rows.length) lines.push(...ageSection(`媒体×年代: ${source}`, rows));
  });

  return lines.join('\r\n');
}

/** CSV をダウンロード */
export function downloadCSV(report: RecruitmentReport, filename = 'recruitment-report.csv'): void {
  // BOM付きでExcelの文字化け対策
  const csv = '\uFEFF' + reportToCSV(report);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** ブラウザ印刷で PDF 出力（OS の "PDFとして保存" ダイアログを使用） */
export function printReport(): void {
  window.print();
}
