/**
 * 期間プリセット計算
 */
import type { DateRange, DatePreset } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 月初・月末 */
function monthStart(y: number, m: number) {
  return new Date(y, m, 1);
}
function monthEnd(y: number, m: number) {
  return new Date(y, m + 1, 0);
}

/** 四半期 (1=1-3, 2=4-6, 3=7-9, 4=10-12) */
function quarterRange(y: number, q: number): DateRange {
  const startMonth = (q - 1) * 3;
  return {
    start: fmt(monthStart(y, startMonth)),
    end: fmt(monthEnd(y, startMonth + 2)),
  };
}

function currentQuarter(now: Date): { y: number; q: number } {
  const m = now.getMonth();
  return { y: now.getFullYear(), q: Math.floor(m / 3) + 1 };
}

function previousQuarter(now: Date): { y: number; q: number } {
  const cur = currentQuarter(now);
  if (cur.q === 1) return { y: cur.y - 1, q: 4 };
  return { y: cur.y, q: cur.q - 1 };
}

/** 半期: 1-6月 or 7-12月（日本の上半期/下半期に近い、4-9/10-3の会計年度パターンも対応） */
function halfRange(y: number, half: 1 | 2): DateRange {
  if (half === 1) {
    // 4月〜9月（上期）
    return { start: fmt(new Date(y, 3, 1)), end: fmt(monthEnd(y, 8)) };
  }
  // 10月〜翌年3月（下期）
  return { start: fmt(new Date(y, 9, 1)), end: fmt(monthEnd(y + 1, 2)) };
}

function currentHalf(now: Date): { y: number; half: 1 | 2 } {
  const m = now.getMonth();
  // 4-9月 → 上期、10-3月 → 下期
  if (m >= 3 && m <= 8) return { y: now.getFullYear(), half: 1 };
  if (m >= 9) return { y: now.getFullYear(), half: 2 };
  // 1-3月は前年の下期
  return { y: now.getFullYear() - 1, half: 2 };
}

function previousHalf(now: Date): { y: number; half: 1 | 2 } {
  const cur = currentHalf(now);
  if (cur.half === 1) return { y: cur.y - 1, half: 2 };
  return { y: cur.y, half: 1 };
}

export function presetToRange(preset: DatePreset, today = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'thisMonth':
      return { start: fmt(monthStart(y, m)), end: fmt(monthEnd(y, m)) };
    case 'lastMonth': {
      const last = new Date(y, m - 1, 1);
      return { start: fmt(last), end: fmt(monthEnd(last.getFullYear(), last.getMonth())) };
    }
    case 'thisQuarter': {
      const { y: cy, q } = currentQuarter(today);
      return quarterRange(cy, q);
    }
    case 'lastQuarter': {
      const { y: py, q } = previousQuarter(today);
      return quarterRange(py, q);
    }
    case 'thisHalf': {
      const { y: hy, half } = currentHalf(today);
      return halfRange(hy, half);
    }
    case 'lastHalf': {
      const { y: hy, half } = previousHalf(today);
      return halfRange(hy, half);
    }
    case 'thisYear':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'lastYear':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    case 'custom':
    default:
      return { start: fmt(monthStart(y, m)), end: fmt(today) };
  }
}

/** 与えられた range の「前期間」を返す（同じ長さ分だけ前倒し） */
export function prevRangeOf(range: DateRange): DateRange {
  const s = new Date(range.start + 'T00:00:00');
  const e = new Date(range.end + 'T00:00:00');
  const diffMs = e.getTime() - s.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1;
  const prevEnd = new Date(s.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start: fmt(prevStart), end: fmt(prevEnd) };
}

/** プリセットの場合は意味的に対応する前期間（先月→先々月、今期→前期 等）。 custom はカレンダー差分。 */
export function prevRangeForPreset(preset: DatePreset, current: DateRange, today = new Date()): DateRange {
  switch (preset) {
    case 'thisMonth':
      return presetToRange('lastMonth', today);
    case 'lastMonth': {
      const t = new Date(today);
      t.setMonth(t.getMonth() - 1);
      return presetToRange('lastMonth', t);
    }
    case 'thisQuarter':
      return presetToRange('lastQuarter', today);
    case 'lastQuarter': {
      const t = new Date(today);
      t.setMonth(t.getMonth() - 3);
      return presetToRange('lastQuarter', t);
    }
    case 'thisHalf':
      return presetToRange('lastHalf', today);
    case 'lastHalf': {
      const t = new Date(today);
      t.setMonth(t.getMonth() - 6);
      return presetToRange('lastHalf', t);
    }
    case 'thisYear':
      return presetToRange('lastYear', today);
    case 'lastYear': {
      const t = new Date(today);
      t.setFullYear(t.getFullYear() - 1);
      return presetToRange('lastYear', t);
    }
    case 'custom':
    default:
      return prevRangeOf(current);
  }
}

export function presetLabel(preset: DatePreset): string {
  return {
    thisMonth: '今月',
    lastMonth: '先月',
    thisQuarter: '今四半期',
    lastQuarter: '前四半期',
    thisHalf: '今期（半期）',
    lastHalf: '前期（半期）',
    thisYear: '今年',
    lastYear: '前年',
    custom: 'カスタム',
  }[preset];
}

/** 期間の表示用フォーマット */
export function formatRange(r: DateRange): string {
  return `${r.start} 〜 ${r.end}`;
}

/** 日付が範囲内か（YYYY-MM-DD 文字列比較で十分） */
export function inRange(date: string | undefined | null, range: DateRange): boolean {
  if (!date) return false;
  return date >= range.start && date <= range.end;
}
