/**
 * リードタイム分析
 *
 * 応募→面接→内定→採用 までの所要日数を、各軸（媒体/拠点/職種）で算出する。
 *
 * データソース:
 *  - 応募日: applicant.date
 *  - 面接設定日: stageHistory のうち interview カテゴリの最初のエントリ、
 *    または InterviewEvent のうち最も早い date
 *  - 内定日: stageHistory のうち offered カテゴリの最初のエントリ
 *  - 採用日: stageHistory のうち hired/active カテゴリの最初のエントリ
 *
 * stageHistory が無い既存データは応募日(date)からの推定はできないので集計対象外。
 */
import type { Applicant, Status, InterviewEvent } from '@/types';
import type { LeadTimeStats, LeadTimeColumn, LeadTimeBreakdown } from './types';
import { getStatusCategory } from '@/utils/statusCategory';

const EMPTY_STATS: LeadTimeStats = { count: 0, avgDays: 0, medianDays: 0, minDays: 0, maxDays: 0 };

/** 配列から平均/中央値/最小/最大を計算 */
function computeStats(days: number[]): LeadTimeStats {
  if (days.length === 0) return EMPTY_STATS;
  const sorted = [...days].sort((a, b) => a - b);
  const sum = sorted.reduce((s, d) => s + d, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    count: sorted.length,
    avgDays: sum / sorted.length,
    medianDays: median,
    minDays: sorted[0],
    maxDays: sorted[sorted.length - 1],
  };
}

/** 2つの日付文字列の差分を「日数」で返す。負数や invalid は null */
function daysBetween(from: string | undefined | null, to: string | undefined | null): number | null {
  if (!from || !to) return null;
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  if (!Number.isFinite(f) || !Number.isFinite(t)) return null;
  const days = Math.floor((t - f) / (24 * 60 * 60 * 1000));
  if (days < 0) return null;
  return days;
}

/** stageHistory から最初のカテゴリ到達日を取得 */
function firstReachDateByCategory(
  applicant: Applicant,
  category: 'interview' | 'offered' | 'hired',
  statuses?: Status[],
): string | null {
  const history = applicant.stageHistory;
  if (!history || history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  for (const entry of sorted) {
    const c = getStatusCategory(entry.stage, statuses);
    if (category === 'interview' && (c === 'interview' || c === 'offered' || c === 'hired' || c === 'active')) {
      return entry.changedAt;
    }
    if (category === 'offered' && (c === 'offered' || c === 'hired' || c === 'active')) {
      return entry.changedAt;
    }
    if (category === 'hired' && (c === 'hired' || c === 'active')) {
      return entry.changedAt;
    }
  }
  return null;
}

/** 応募者ごとに 4 区間のリードタイム日数を求める */
function applicantLeadTimes(
  a: Applicant,
  events: InterviewEvent[],
  statuses?: Status[],
): { app2int: number | null; int2off: number | null; off2hire: number | null; app2hire: number | null } {
  const appDate = a.date;
  // 面接設定日: stageHistory > 関連 InterviewEvent の最早日
  let interviewDate = firstReachDateByCategory(a, 'interview', statuses);
  if (!interviewDate) {
    const evs = events.filter((e) => e.applicantId === a.id);
    if (evs.length > 0) {
      interviewDate = evs.map((e) => e.date).sort()[0];
    }
  }
  const offerDate = firstReachDateByCategory(a, 'offered', statuses);
  const hireDate = firstReachDateByCategory(a, 'hired', statuses);

  return {
    app2int: daysBetween(appDate, interviewDate),
    int2off: daysBetween(interviewDate, offerDate),
    off2hire: daysBetween(offerDate, hireDate),
    app2hire: daysBetween(appDate, hireDate),
  };
}

/** 単一カラムのリードタイムを計算 */
function calcLeadTimeColumn(
  label: string,
  applicants: Applicant[],
  events: InterviewEvent[],
  statuses?: Status[],
): LeadTimeColumn {
  const a2i: number[] = [];
  const i2o: number[] = [];
  const o2h: number[] = [];
  const a2h: number[] = [];
  applicants.forEach((a) => {
    const lt = applicantLeadTimes(a, events, statuses);
    if (lt.app2int !== null) a2i.push(lt.app2int);
    if (lt.int2off !== null) i2o.push(lt.int2off);
    if (lt.off2hire !== null) o2h.push(lt.off2hire);
    if (lt.app2hire !== null) a2h.push(lt.app2hire);
  });
  return {
    label,
    applicationToInterview: computeStats(a2i),
    interviewToOffer: computeStats(i2o),
    offerToHired: computeStats(o2h),
    applicationToHired: computeStats(a2h),
  };
}

/** メインエントリ */
export function calcLeadTimeBreakdown(
  applicants: Applicant[],
  events: InterviewEvent[],
  statuses?: Status[],
): LeadTimeBreakdown {
  const overall = calcLeadTimeColumn('全体', applicants, events, statuses);

  const groupBy = (key: 'src' | 'base' | 'job'): Map<string, Applicant[]> => {
    const map = new Map<string, Applicant[]>();
    applicants.forEach((a) => {
      const k = (a[key] as string) || '未設定';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    });
    return map;
  };

  const buildColumns = (groupMap: Map<string, Applicant[]>): LeadTimeColumn[] => {
    return Array.from(groupMap.entries()).map(([label, apps]) => {
      const ids = new Set(apps.map((a) => a.id));
      const inEvents = events.filter((e) => ids.has(e.applicantId));
      return calcLeadTimeColumn(label, apps, inEvents, statuses);
    }).sort((a, b) => (b.applicationToHired.count - a.applicationToHired.count));
  };

  return {
    overall,
    bySource: buildColumns(groupBy('src')),
    byBase: buildColumns(groupBy('base')),
    byJob: buildColumns(groupBy('job')),
  };
}
