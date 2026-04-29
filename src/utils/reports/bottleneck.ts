/**
 * ボトルネック自動検出
 *
 * マトリクステーブルの各行(媒体/拠点/職種)を全体平均と比較し、
 * 通過率が大きく劣後/優越しているセルをハイライトする。
 */
import type { MatrixRow } from './types';

export type BottleneckLevel = 'critical' | 'warning' | 'normal' | 'good';

export interface BottleneckHighlight {
  level: BottleneckLevel;
  /** 全体平均との比 (1.0 = 平均, < 1 = 劣後) */
  ratio: number;
}

/** 個別セルの評価。 母集団が小さすぎる場合は 'normal' を返す。 */
export function evaluateRate(rowRate: number, overallRate: number, sampleSize: number): BottleneckHighlight {
  if (sampleSize < 3) return { level: 'normal', ratio: 1 };
  if (overallRate <= 0) return { level: 'normal', ratio: 1 };
  const ratio = rowRate / overallRate;
  let level: BottleneckLevel = 'normal';
  if (ratio < 0.5) level = 'critical';
  else if (ratio < 0.7) level = 'warning';
  else if (ratio > 1.3) level = 'good';
  return { level, ratio };
}

/** 行の各レートに対するハイライト判定をまとめて返す */
export interface RowBottleneck {
  validRate: BottleneckHighlight;
  validToInterviewRate: BottleneckHighlight;
  applicationToHireRate: BottleneckHighlight;
  applicationToActiveRate: BottleneckHighlight;
}

export function evaluateRow(row: MatrixRow, overall: MatrixRow): RowBottleneck {
  const n = row.applications;
  return {
    validRate:                 evaluateRate(row.validRate, overall.validRate, n),
    validToInterviewRate:      evaluateRate(row.validToInterviewRate, overall.validToInterviewRate, row.validApplications),
    applicationToHireRate:     evaluateRate(row.applicationToHireRate, overall.applicationToHireRate, n),
    applicationToActiveRate:   evaluateRate(row.applicationToActiveRate, overall.applicationToActiveRate, n),
  };
}

/** ハイライトレベルに応じた背景色 */
export function bgForLevel(level: BottleneckLevel): string {
  switch (level) {
    case 'critical': return '#FEE2E2'; // 赤
    case 'warning':  return '#FEF3C7'; // 黄
    case 'good':     return '#D1FAE5'; // 緑
    case 'normal':
    default:         return 'transparent';
  }
}

export function fgForLevel(level: BottleneckLevel): string {
  switch (level) {
    case 'critical': return '#991B1B';
    case 'warning':  return '#92400E';
    case 'good':     return '#065F46';
    case 'normal':
    default:         return '#6B7280';
  }
}
