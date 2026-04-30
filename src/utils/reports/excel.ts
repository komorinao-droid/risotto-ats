/**
 * 採用レポート Excel エクスポート
 *
 * 表紙・サマリ・月次推移・拠点別・媒体別・職種別・年代分析・ステップ別の
 * 複数シートに分けた xlsx を出力する。クライアントへの納品資料として使える書式付き。
 */
import ExcelJS from 'exceljs';
import type { RecruitmentReport, MatrixRow, AgeBreakdown, StepFunnelColumn } from './types';

// ===== スタイルプリセット =====

const titleStyle: Partial<ExcelJS.Style> = {
  font: { name: 'Yu Gothic', size: 18, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } },
  alignment: { vertical: 'middle', horizontal: 'center' },
};

const sectionStyle: Partial<ExcelJS.Style> = {
  font: { name: 'Yu Gothic', size: 12, bold: true, color: { argb: 'FF1F2937' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },
  alignment: { vertical: 'middle' },
};

const headerStyle: Partial<ExcelJS.Style> = {
  font: { name: 'Yu Gothic', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } },
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  },
};

const cellBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
};

const labelCellStyle: Partial<ExcelJS.Style> = {
  font: { name: 'Yu Gothic', size: 10 },
  alignment: { vertical: 'middle' },
  border: cellBorder,
};

const numCellStyle: Partial<ExcelJS.Style> = {
  font: { name: 'Yu Gothic', size: 10 },
  alignment: { vertical: 'middle', horizontal: 'right' },
  numFmt: '#,##0',
  border: cellBorder,
};

const pctCellStyle: Partial<ExcelJS.Style> = {
  font: { name: 'Yu Gothic', size: 10 },
  alignment: { vertical: 'middle', horizontal: 'right' },
  numFmt: '0.00%',
  border: cellBorder,
};

const overallRowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
const goodFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
const warnFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
const critFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

// ===== シート構築ヘルパ =====

/** Excel シート名の禁止文字 (\ / ? * [ ] :) を置換し、最大31文字に切り詰める */
function sanitizeSheetName(name: string, fallback = 'Sheet'): string {
  const sanitized = (name || fallback).replace(/[\\/?*[\]:]+/g, '_').trim();
  return (sanitized || fallback).slice(0, 31);
}

function setColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function addTitle(sheet: ExcelJS.Worksheet, text: string, span: number) {
  const row = sheet.addRow([text]);
  row.height = 32;
  sheet.mergeCells(row.number, 1, row.number, span);
  row.getCell(1).style = titleStyle;
}

function addSection(sheet: ExcelJS.Worksheet, text: string, span: number) {
  sheet.addRow([]);
  const row = sheet.addRow([text]);
  row.height = 24;
  sheet.mergeCells(row.number, 1, row.number, span);
  row.getCell(1).style = sectionStyle;
}

function addHeaderRow(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers);
  row.height = 22;
  row.eachCell((c) => { c.style = headerStyle; });
}

function addDataRow(sheet: ExcelJS.Worksheet, label: string, values: (number | string)[], opts: { isOverall?: boolean; rateColumns?: number[]; rateLevels?: ('good' | 'warn' | 'crit' | undefined)[] } = {}) {
  const row = sheet.addRow([label, ...values]);
  row.height = 18;
  row.eachCell((cell, colNumber) => {
    const isLabel = colNumber === 1;
    const isRateCol = opts.rateColumns?.includes(colNumber);
    cell.style = isLabel ? labelCellStyle : isRateCol ? pctCellStyle : numCellStyle;
    if (isLabel && opts.isOverall) {
      cell.style = { ...cell.style, font: { ...cell.style.font, bold: true } };
    }
    if (opts.isOverall) {
      cell.fill = overallRowFill;
    }
    // ボトルネックハイライト（rateLevels[colNumber-1] がセット時）
    const lvlIdx = opts.rateLevels && colNumber - 1;
    if (typeof lvlIdx === 'number' && opts.rateLevels && opts.rateLevels[lvlIdx]) {
      const lvl = opts.rateLevels[lvlIdx];
      cell.fill = lvl === 'good' ? goodFill : lvl === 'warn' ? warnFill : critFill;
    }
  });
}

// ===== 各シート構築 =====

function buildCoverSheet(wb: ExcelJS.Workbook, report: RecruitmentReport, clientName: string) {
  const sheet = wb.addWorksheet('表紙', { properties: { tabColor: { argb: 'FFF97316' } } });
  setColumnWidths(sheet, [16, 30, 16, 30]);

  // タイトル
  sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);
  const titleRow = sheet.addRow(['採用レポート']);
  titleRow.height = 48;
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 4);
  titleRow.getCell(1).style = {
    font: { name: 'Yu Gothic', size: 32, bold: true, color: { argb: 'FFF97316' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  };

  sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);

  const meta: [string, string][] = [
    ['クライアント名', clientName || '-'],
    ['対象期間', `${report.range.start} 〜 ${report.range.end}`],
    ['生成日時', new Date(report.generatedAt).toLocaleString('ja-JP')],
  ];
  meta.forEach(([k, v]) => {
    const r = sheet.addRow(['', k, v]);
    r.height = 24;
    r.getCell(2).style = { font: { name: 'Yu Gothic', size: 11, bold: true, color: { argb: 'FF6B7280' } }, alignment: { vertical: 'middle' } };
    r.getCell(3).style = { font: { name: 'Yu Gothic', size: 12 }, alignment: { vertical: 'middle' } };
  });

  sheet.addRow([]);  sheet.addRow([]);

  // ハイライト
  const highlightRow = sheet.addRow(['', 'ハイライト']);
  highlightRow.getCell(2).style = sectionStyle;
  sheet.mergeCells(highlightRow.number, 2, highlightRow.number, 4);

  const t = report.total;
  const pct = (n: number) => n.toFixed(2) + '%';
  const highlights: [string, string][] = [
    ['応募数', `${t.applications}名`],
    ['有効応募率', pct(t.validRate)],
    ['面接設定数', `${t.interviewScheduled}名`],
    ['内定数', `${t.offered}名`],
    ['採用数', `${t.hired}名`],
    ['採用率', pct(t.applicationToHireRate)],
  ];
  highlights.forEach(([k, v]) => {
    const r = sheet.addRow(['', k, v]);
    r.getCell(2).style = labelCellStyle;
    r.getCell(3).style = { ...numCellStyle, alignment: { vertical: 'middle', horizontal: 'left' }, font: { name: 'Yu Gothic', size: 11, bold: true, color: { argb: 'FF111827' } } };
  });

  if (report.goal) {
    sheet.addRow([]);
    const gr = sheet.addRow(['', '採用目標 達成状況']);
    gr.getCell(2).style = sectionStyle;
    sheet.mergeCells(gr.number, 2, gr.number, 4);
    const g = report.goal;
    [
      ['目標', `${g.targetHires}名`],
      ['実績', `${g.actualHires}名`],
      [g.isPastPeriod ? '達成率' : '着地ヨミ', g.isPastPeriod ? pct(g.achievementRate) : `${g.projectedHires}名`],
      [g.isPastPeriod ? '' : '予測達成率', g.isPastPeriod ? '' : pct(g.projectedAchievementRate)],
    ].filter(([k]) => k).forEach(([k, v]) => {
      const r = sheet.addRow(['', k, v]);
      r.getCell(2).style = labelCellStyle;
      r.getCell(3).style = { ...numCellStyle, alignment: { vertical: 'middle', horizontal: 'left' }, font: { name: 'Yu Gothic', size: 11, bold: true } };
    });
  }
}

function buildSummarySheet(wb: ExcelJS.Workbook, report: RecruitmentReport) {
  const sheet = wb.addWorksheet('サマリ');
  setColumnWidths(sheet, [22, 14, 14]);

  addTitle(sheet, '採用ファネル（全体）', 3);
  addHeaderRow(sheet, ['指標', '値', '通過率']);
  const t = report.total;
  const rate = (n: number) => n / 100;
  addDataRow(sheet, '応募数', [t.applications, ''], { rateColumns: [3] });
  addDataRow(sheet, '有効応募数', [t.validApplications, rate(t.validRate)], { rateColumns: [3] });
  addDataRow(sheet, '面接設定数', [t.interviewScheduled, rate(t.validToInterviewRate)], { rateColumns: [3] });
  addDataRow(sheet, '内定数', [t.offered, rate(t.interviewToOfferRate)], { rateColumns: [3] });
  addDataRow(sheet, '採用数', [t.hired, rate(t.applicationToHireRate)], { rateColumns: [3] });
  addDataRow(sheet, '稼働数', [t.active, rate(t.applicationToActiveRate)], { rateColumns: [3] });

  addSection(sheet, '選考NG内訳', 3);
  addHeaderRow(sheet, ['理由 / サブステータス', '人数', '割合']);
  const ng = report.ngBreakdown;
  const totalNg = ng.total || 1;
  ng.reasons.forEach((row) => {
    addDataRow(sheet, row.label, [row.count, row.count / totalNg], { rateColumns: [3] });
    row.subRows.forEach((sub) => {
      addDataRow(sheet, `  └ ${sub.subStatus}`, [sub.count, sub.count / totalNg], { rateColumns: [3] });
    });
  });
  addDataRow(sheet, '合計', [ng.total, ''], { isOverall: true });
}

function buildMonthlySheet(wb: ExcelJS.Workbook, report: RecruitmentReport) {
  if (!report.byMonth.length) return;
  const sheet = wb.addWorksheet('月次推移');
  setColumnWidths(sheet, [12, 10, 10, 10, 10, 10]);
  addTitle(sheet, '月次推移', 6);
  addHeaderRow(sheet, ['月', '応募', '有効', '面接', '内定', '採用']);
  report.byMonth.forEach((m) => {
    addDataRow(sheet, m.month, [m.applications, m.validApplications, m.interviewScheduled, m.offered, m.hired]);
  });
}

function buildMatrixSheet(wb: ExcelJS.Workbook, sheetName: string, title: string, rows: MatrixRow[], overall: MatrixRow) {
  const sheet = wb.addWorksheet(sanitizeSheetName(sheetName));
  setColumnWidths(sheet, [22, 8, 8, 8, 8, 8, 8, 12, 14, 12, 12]);
  addTitle(sheet, title, 11);
  addHeaderRow(sheet, ['対象', '応募', '有効', '面接', '内定', '採用', '稼働', '有効率', '面接設定率', '採用率', '稼働率']);

  // 全体行
  addDataRow(sheet, overall.label, [
    overall.applications, overall.validApplications, overall.interviewScheduled,
    overall.offered, overall.hired, overall.active,
    overall.validRate / 100, overall.validToInterviewRate / 100,
    overall.applicationToHireRate / 100, overall.applicationToActiveRate / 100,
  ], { isOverall: true, rateColumns: [8, 9, 10, 11] });

  // 各行（ボトルネック判定込み）
  rows.forEach((r) => {
    const evalLevel = (rate: number, baseRate: number, n: number): 'good' | 'warn' | 'crit' | undefined => {
      if (n < 3 || baseRate <= 0) return undefined;
      const ratio = rate / baseRate;
      if (ratio < 0.5) return 'crit';
      if (ratio < 0.7) return 'warn';
      if (ratio > 1.3) return 'good';
      return undefined;
    };
    const lv: ('good' | 'warn' | 'crit' | undefined)[] = [];
    lv[7] = evalLevel(r.validRate, overall.validRate, r.applications);
    lv[8] = evalLevel(r.validToInterviewRate, overall.validToInterviewRate, r.validApplications);
    lv[9] = evalLevel(r.applicationToHireRate, overall.applicationToHireRate, r.applications);
    lv[10] = evalLevel(r.applicationToActiveRate, overall.applicationToActiveRate, r.applications);

    addDataRow(sheet, r.label, [
      r.applications, r.validApplications, r.interviewScheduled,
      r.offered, r.hired, r.active,
      r.validRate / 100, r.validToInterviewRate / 100,
      r.applicationToHireRate / 100, r.applicationToActiveRate / 100,
    ], { rateColumns: [8, 9, 10, 11], rateLevels: lv });
  });
}

function buildStepFunnelSheet(wb: ExcelJS.Workbook, report: RecruitmentReport) {
  const sheet = wb.addWorksheet('ステップ別');
  const cols = report.stepFunnel.bySource.slice(0, 8);
  setColumnWidths(sheet, [14, 12, ...cols.map(() => 12)]);
  addTitle(sheet, 'ステップ別 到達率/通過率（媒体別）', 2 + cols.length);
  addHeaderRow(sheet, ['ステップ', '全体', ...cols.map((c) => c.label)]);

  report.stepFunnel.overall.steps.forEach((step, idx) => {
    const overallRate = step.conversionRate;
    const row: (string | number)[] = [step.label, step.count];
    cols.forEach((c) => {
      row.push(c.steps[idx].count);
    });
    const r = sheet.addRow(row);
    r.eachCell((cell, colNumber) => {
      cell.style = colNumber === 1 ? labelCellStyle : numCellStyle;
      if (colNumber === 2) cell.fill = overallRowFill;
      // ボトルネック着色（採用以降のステップ）
      if (colNumber > 2 && idx > 0) {
        const c = cols[colNumber - 3];
        const sample = c.steps[0]?.count || 0;
        if (sample >= 3 && overallRate > 0) {
          const ratio = c.steps[idx].conversionRate / overallRate;
          if (ratio < 0.5) cell.fill = critFill;
          else if (ratio < 0.7) cell.fill = warnFill;
          else if (ratio > 1.3) cell.fill = goodFill;
        }
      }
    });
  });

  // 通過率行
  sheet.addRow([]);
  addSection(sheet, '到達率（応募比）', 2 + cols.length);
  addHeaderRow(sheet, ['ステップ', '全体', ...cols.map((c) => c.label)]);
  report.stepFunnel.overall.steps.forEach((step, idx) => {
    const row: (string | number)[] = [step.label, step.reachRate / 100];
    cols.forEach((c) => row.push(c.steps[idx].reachRate / 100));
    const r = sheet.addRow(row);
    r.eachCell((cell, colNumber) => {
      cell.style = colNumber === 1 ? labelCellStyle : pctCellStyle;
    });
  });
}

function buildAgeSheet(wb: ExcelJS.Workbook, report: RecruitmentReport) {
  const sheet = wb.addWorksheet('年代分析');
  setColumnWidths(sheet, [14, 10, 12, 10, 12]);
  addTitle(sheet, '全社×年代別 応募/採用', 5);
  addHeaderRow(sheet, ['年代', '応募数', '応募割合', '採用数', '採用割合']);
  report.byAge.forEach((r) => {
    addDataRow(sheet, r.ageGroup, [r.applications, r.applicationRate / 100, r.hired, r.hireRate / 100], { rateColumns: [3, 5] });
  });

  if (report.ngAgeBreakdown.length) {
    addSection(sheet, '選考NGの年代内訳', 5);
    addHeaderRow(sheet, ['年代', '人数', '割合', '', '']);
    report.ngAgeBreakdown.forEach((r) => {
      addDataRow(sheet, r.ageGroup, [r.count, r.rate / 100, '', ''], { rateColumns: [3] });
    });
  }
}

function buildGoalSheet(wb: ExcelJS.Workbook, report: RecruitmentReport) {
  if (!report.goal) return;
  const sheet = wb.addWorksheet('採用目標');
  setColumnWidths(sheet, [12, 10, 10, 12]);
  addTitle(sheet, '採用目標 達成率', 4);
  const g = report.goal;
  addHeaderRow(sheet, ['月', '目標', '実績', '達成率']);
  g.monthly.forEach((m) => {
    const rate = m.target > 0 ? m.actual / m.target : 0;
    const row = sheet.addRow([m.yearMonth, m.target, m.actual, rate]);
    row.eachCell((cell, colNumber) => {
      cell.style = colNumber === 1 ? labelCellStyle : colNumber === 4 ? pctCellStyle : numCellStyle;
      if (colNumber === 4) {
        if (rate >= 1) cell.fill = goodFill;
        else if (rate >= 0.8) {
          // primary
        } else if (rate >= 0.6) cell.fill = warnFill;
        else cell.fill = critFill;
      }
    });
  });
  addDataRow(sheet, '合計', [
    g.targetHires, g.actualHires,
    g.targetHires > 0 ? g.actualHires / g.targetHires : 0,
  ], { isOverall: true, rateColumns: [4] });
}

// ===== メインエントリ =====

export async function downloadExcel(report: RecruitmentReport, clientName: string, filename = 'recruitment-report.xlsx'): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RISOTTO ATS';
  wb.created = new Date();

  buildCoverSheet(wb, report, clientName);
  buildSummarySheet(wb, report);
  buildMonthlySheet(wb, report);
  buildStepFunnelSheet(wb, report);

  const overall: MatrixRow = { label: '全体', ...report.total };
  buildMatrixSheet(wb, '拠点別', '支社別 ファネル', report.byBase, overall);
  buildMatrixSheet(wb, '媒体別', '媒体別 ファネル', report.bySource, overall);
  buildMatrixSheet(wb, '職種別', '職種別 ファネル', report.byJob, overall);

  // 拠点×職種：拠点ごとに1シート
  report.byBaseJob.forEach(({ base, rows }) => {
    if (rows.length === 0) return;
    buildMatrixSheet(wb, `拠点×職種 ${base}`, `【${base}】 職種別 ファネル`, rows, overall);
  });

  buildAgeSheet(wb, report);
  buildGoalSheet(wb, report);

  // 型インポート維持のためのvoid参照（未使用警告回避）
  void ({} as unknown as AgeBreakdown | StepFunnelColumn);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
