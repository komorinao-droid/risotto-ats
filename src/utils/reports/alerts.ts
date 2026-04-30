/**
 * 採用レポート アラート検出
 *
 * 当月のデータを前月/前々月と比較し、異常値を自動検出する。
 * RPO担当者がクライアントに先回りして連絡できるようにする。
 */
import type { Applicant, ClientData } from '@/types';
import { isHired } from './aggregate';
import { getStatusCategory } from '@/utils/statusCategory';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** 関連するセグメント名（媒体名/拠点名 等） */
  segment?: string;
  /** 数値: 当月実績 */
  current?: number;
  /** 数値: 比較対象の値 */
  baseline?: number;
  /** 比較対象期間のラベル */
  baselineLabel?: string;
}

interface BuildOpts {
  data: ClientData;
  /** 当月の YYYY-MM (省略時は今日基準) */
  currentMonth?: string;
}

/** 月単位の応募者を取得 */
function applicantsInMonth(applicants: Applicant[], yearMonth: string): Applicant[] {
  return applicants.filter((a) => (a.date || '').startsWith(yearMonth));
}

/** 月の経過日数 / 月の総日数 */
function monthProgressRatio(yearMonth: string, today = new Date()): number {
  const [y, m] = yearMonth.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);
  const totalDays = monthEnd.getDate();
  if (today < monthStart) return 0;
  if (today > monthEnd) return 1;
  return Math.max(1, today.getDate()) / totalDays;
}

/** 前月の YYYY-MM */
function prevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m-1-1 = m-2
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 採用目標が当月設定されているかチェック → 達成ペース確認 */
function checkGoalPace(opts: BuildOpts, currentMonth: string, today: Date): Alert | null {
  const goal = opts.data.recruitmentGoals?.[currentMonth];
  if (!goal || goal <= 0) return null;
  const apps = applicantsInMonth(opts.data.applicants || [], currentMonth);
  const hired = apps.filter((a) => isHired(a.stage, opts.data.statuses)).length;
  const progress = monthProgressRatio(currentMonth, today);
  const expected = Math.round(goal * progress);
  const projected = progress > 0 ? Math.round(hired / progress) : hired;

  // 着地予測が目標の80%未満 → critical
  if (progress >= 0.3 && projected < goal * 0.8) {
    return {
      id: `goal-pace-${currentMonth}`,
      severity: 'critical',
      title: '採用目標 未達ペース',
      detail: `${currentMonth} は目標${goal}名に対し、現時点${hired}名(${(progress * 100).toFixed(0)}%経過時点で予想${expected}名)。このペースだと着地${projected}名(${Math.round((projected / goal) * 100)}%)。早急な対策が必要。`,
      current: hired,
      baseline: expected,
      baselineLabel: `${currentMonth} 想定値`,
    };
  }
  // 着地予測が目標の60%-80% → warning
  if (progress >= 0.3 && projected < goal && projected >= goal * 0.6) {
    return {
      id: `goal-pace-${currentMonth}`,
      severity: 'warning',
      title: '採用目標 ペース注意',
      detail: `${currentMonth} の着地予測は${projected}名(目標${goal}名の${Math.round((projected / goal) * 100)}%)。ペースアップを検討。`,
      current: hired,
      baseline: expected,
      baselineLabel: `${currentMonth} 想定値`,
    };
  }
  return null;
}

/** 応募数の前月比チェック */
function checkApplicationMoM(opts: BuildOpts, currentMonth: string, today: Date): Alert | null {
  const cur = applicantsInMonth(opts.data.applicants || [], currentMonth);
  const prev = applicantsInMonth(opts.data.applicants || [], prevMonth(currentMonth));
  if (prev.length < 5) return null; // 前月のサンプルが少なすぎる

  // 経過日数で按分した想定応募数
  const progress = monthProgressRatio(currentMonth, today);
  if (progress < 0.3) return null;
  const projected = progress > 0 ? Math.round(cur.length / progress) : cur.length;
  const ratio = projected / prev.length;

  if (ratio < 0.5) {
    return {
      id: `app-mom-${currentMonth}`,
      severity: 'critical',
      title: '応募数 大幅減',
      detail: `${currentMonth} の応募ペースは前月の${Math.round(ratio * 100)}%。当月着地予測${projected}名(前月${prev.length}名)。媒体出稿状況・求人内容を要確認。`,
      current: projected,
      baseline: prev.length,
      baselineLabel: '前月実績',
    };
  }
  if (ratio < 0.7) {
    return {
      id: `app-mom-${currentMonth}`,
      severity: 'warning',
      title: '応募数 減少傾向',
      detail: `${currentMonth} の応募ペースは前月の${Math.round(ratio * 100)}%(着地予測${projected}名)。`,
      current: projected,
      baseline: prev.length,
      baselineLabel: '前月実績',
    };
  }
  return null;
}

/** 媒体別の応募数 大幅減チェック */
function checkSourceDecline(opts: BuildOpts, currentMonth: string, today: Date): Alert[] {
  const alerts: Alert[] = [];
  const cur = applicantsInMonth(opts.data.applicants || [], currentMonth);
  const prev = applicantsInMonth(opts.data.applicants || [], prevMonth(currentMonth));
  const progress = monthProgressRatio(currentMonth, today);
  if (progress < 0.3) return alerts;

  const sourceSet = new Set<string>();
  prev.forEach((a) => sourceSet.add(a.src || '未設定'));

  sourceSet.forEach((src) => {
    const prevCount = prev.filter((a) => (a.src || '未設定') === src).length;
    const curCount = cur.filter((a) => (a.src || '未設定') === src).length;
    if (prevCount < 3) return; // サンプル少なすぎ
    const projected = progress > 0 ? Math.round(curCount / progress) : curCount;
    const ratio = projected / prevCount;
    if (ratio < 0.4) {
      alerts.push({
        id: `src-decline-${currentMonth}-${src}`,
        severity: 'warning',
        title: '媒体別 応募減',
        detail: `「${src}」経由の応募が前月${prevCount}名→当月${projected}名見込み(${Math.round(ratio * 100)}%)。原稿/掲載状況の確認を推奨。`,
        segment: src,
        current: projected,
        baseline: prevCount,
        baselineLabel: '前月実績',
      });
    }
  });
  return alerts;
}

/** 面接設定率の急落 */
function checkInterviewRateDecline(opts: BuildOpts, currentMonth: string): Alert | null {
  const stats = opts.data.statuses;
  const cur = applicantsInMonth(opts.data.applicants || [], currentMonth);
  const prev = applicantsInMonth(opts.data.applicants || [], prevMonth(currentMonth));
  if (prev.length < 5 || cur.length < 5) return null;

  const interviewRate = (apps: Applicant[]): number => {
    const valid = apps.filter((a) => {
      const c = getStatusCategory(a.stage, stats);
      return c !== 'ng' && !a.duplicate;
    });
    if (valid.length === 0) return 0;
    const interviewed = valid.filter((a) => {
      const c = getStatusCategory(a.stage, stats);
      return c === 'interview' || c === 'offered' || c === 'hired' || c === 'active';
    });
    return interviewed.length / valid.length;
  };

  const curRate = interviewRate(cur);
  const prevRate = interviewRate(prev);
  if (prevRate === 0) return null;
  const ratio = curRate / prevRate;
  if (ratio < 0.6) {
    return {
      id: `int-rate-${currentMonth}`,
      severity: 'warning',
      title: '面接設定率 低下',
      detail: `${currentMonth} の面接設定率は${(curRate * 100).toFixed(1)}% (前月${(prevRate * 100).toFixed(1)}%)。応募者の質低下、または対応スピードの確認を推奨。`,
      current: curRate * 100,
      baseline: prevRate * 100,
      baselineLabel: '前月',
    };
  }
  return null;
}

/** 未対応の応募者が多い */
function checkPendingApplicants(opts: BuildOpts): Alert | null {
  const apps = opts.data.applicants || [];
  const stages = opts.data.statuses;
  const screening = apps.filter((a) => {
    const c = getStatusCategory(a.stage, stages);
    return c === 'screening' && !a.duplicate;
  });
  if (screening.length < 10) return null;
  // 5日以上未対応
  const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
  const stale = screening.filter((a) => {
    const t = new Date(a.date || 0).getTime();
    return t < fiveDaysAgo;
  });
  if (stale.length >= 10) {
    return {
      id: 'pending-stale',
      severity: 'warning',
      title: '未対応応募者 多数',
      detail: `応募から5日以上経過してもステータスが「選考中」のままの応募者が${stale.length}名。対応漏れの可能性。`,
      current: stale.length,
    };
  }
  return null;
}

/** すべてのアラートを検出 */
export function detectAlerts(opts: BuildOpts): Alert[] {
  const today = new Date();
  const currentMonth = opts.currentMonth || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const alerts: Alert[] = [];

  const goal = checkGoalPace(opts, currentMonth, today);
  if (goal) alerts.push(goal);

  const mom = checkApplicationMoM(opts, currentMonth, today);
  if (mom) alerts.push(mom);

  alerts.push(...checkSourceDecline(opts, currentMonth, today));

  const intRate = checkInterviewRateDecline(opts, currentMonth);
  if (intRate) alerts.push(intRate);

  const pending = checkPendingApplicants(opts);
  if (pending) alerts.push(pending);

  // 重要度順
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
