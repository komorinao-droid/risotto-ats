/**
 * リードタイム分析
 *
 * 応募→面接→内定→採用 までの所要日数を、各軸（媒体/拠点/職種）で算出する。
 *
 * データソース:
 *  - 応募日: applicantLifecycle.inferCreatedAt(applicant)
 *      = applicant.createdAt → applicant.date 由来 ISO → 現在時刻フォールバック
 *  - 面接設定日: stageHistory の interview カテゴリ最初のエントリ、
 *    または InterviewEvent のうち最も早い date、
 *    または現在のステージが interview 以降なら inferStageChangedAt
 *  - 内定日: stageHistory の offered カテゴリ最初のエントリ、
 *    または現在のステージが offered 以降なら inferStageChangedAt
 *  - 採用日: stageHistory の hired/active カテゴリ最初のエントリ、
 *    または現在のステージが hired/active なら inferStageChangedAt
 *
 * 補完は in-memory のみ。永続化への書き戻しは行わない（レポート計算時のみ使用）。
 * stageHistory が無い既存データでも、現在のステージから推定値を使えるようにフォールバックを追加。
 */
import type { Applicant, Status, InterviewEvent } from '@/types';
import type { LeadTimeStats, LeadTimeColumn, LeadTimeBreakdown } from './types';
import { getStatusCategory } from '@/utils/statusCategory';
import { inferCreatedAt, inferStageChangedAt } from '@/utils/applicantLifecycle';

const EMPTY_STATS: LeadTimeStats = {
  count: 0,
  avgDays: 0,
  medianDays: 0,
  minDays: 0,
  maxDays: 0,
  historyBasedCount: 0,
  estimatedCount: 0,
};

/** 「応募 → ステージX」「ステージX → ステージY」算出時のデータソース */
type LeadTimeSource = 'history' | 'estimated';

/** stageHistory ベースか推定フォールバックかを示すサンプル */
interface LeadTimeSample {
  days: number;
  source: LeadTimeSource;
}

/** 配列から平均/中央値/最小/最大とデータ品質内訳を計算 */
function computeStats(samples: LeadTimeSample[]): LeadTimeStats {
  if (samples.length === 0) return EMPTY_STATS;
  const sorted = [...samples].sort((a, b) => a.days - b.days);
  const sum = sorted.reduce((s, x) => s + x.days, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1].days + sorted[mid].days) / 2
    : sorted[mid].days;
  let historyBasedCount = 0;
  let estimatedCount = 0;
  for (const s of sorted) {
    if (s.source === 'history') historyBasedCount += 1;
    else estimatedCount += 1;
  }
  return {
    count: sorted.length,
    avgDays: sum / sorted.length,
    medianDays: median,
    minDays: sorted[0].days,
    maxDays: sorted[sorted.length - 1].days,
    historyBasedCount,
    estimatedCount,
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

/**
 * リードタイム計算で「カテゴリ X に到達済み」と見なす対応表。
 * interview を要求した時点で offered/hired/active も到達扱い、など包含関係を集約。
 */
function categoryReached(target: 'interview' | 'offered' | 'hired', candidate: ReturnType<typeof getStatusCategory>): boolean {
  if (target === 'interview') return candidate === 'interview' || candidate === 'offered' || candidate === 'hired' || candidate === 'active';
  if (target === 'offered')   return candidate === 'offered' || candidate === 'hired' || candidate === 'active';
  return candidate === 'hired' || candidate === 'active';
}

/** stageHistory から最初のカテゴリ到達日を取得（履歴なしの場合は null） */
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
    if (categoryReached(category, c)) return entry.changedAt;
  }
  return null;
}

/**
 * 応募基準時刻 (ISO)。
 * applicantLifecycle.inferCreatedAt 準拠: createdAt > date 由来 ISO > 現在時刻。
 */
function applicationDate(a: Applicant): string {
  return inferCreatedAt(a);
}

/** 日付＋データ源を一緒に運ぶ簡易型 */
interface ReachInfo { date: string; source: LeadTimeSource; }

/**
 * 指定カテゴリへの最初の到達時刻を解決する。
 *  1) stageHistory のエントリから最初の到達時刻を取る → source='history'
 *  2) 取れず、かつ現在のステージが同カテゴリ以降ならば inferStageChangedAt → source='estimated'
 *  3) どちらでも特定できなければ null（このカテゴリに未到達と見なす）
 *
 * 旧データ（stageHistory が空 / createdAt 等が無い）でも、現在のステージから
 * 妥当な推定を行えるようにするための薄いラッパ。
 */
function firstReachInfo(
  a: Applicant,
  category: 'interview' | 'offered' | 'hired',
  statuses?: Status[],
): ReachInfo | null {
  const fromHistory = firstReachDateByCategory(a, category, statuses);
  if (fromHistory) return { date: fromHistory, source: 'history' };
  const currentCategory = getStatusCategory(a.stage, statuses);
  if (!categoryReached(category, currentCategory)) return null;
  return { date: inferStageChangedAt(a), source: 'estimated' };
}

/**
 * 2つの ReachInfo（または応募基準）を組み合わせた区間サンプルを作る。
 * - どちらか片方でも 'estimated' なら 'estimated' に格下げ
 * - 応募基準（appDate）は inferCreatedAt なので「stageHistory ベースか」の判定では
 *   estimated 側として扱う方が誤解が少ないが、ここでは「ステージ遷移エンドポイントが
 *   stageHistory から取れたか」を品質指標として可視化する目的なので、応募側は
 *   品質判定に含めない（= 反対側の source をそのまま採用）。
 */
function makeSegment(fromDate: string | null | undefined, toInfo: ReachInfo | null): LeadTimeSample | null {
  if (!fromDate || !toInfo) return null;
  const days = daysBetween(fromDate, toInfo.date);
  if (days === null) return null;
  return { days, source: toInfo.source };
}

function makeStageSegment(from: ReachInfo | null, to: ReachInfo | null): LeadTimeSample | null {
  if (!from || !to) return null;
  const days = daysBetween(from.date, to.date);
  if (days === null) return null;
  const source: LeadTimeSource = from.source === 'history' && to.source === 'history' ? 'history' : 'estimated';
  return { days, source };
}

/** 応募者ごとに 4 区間のリードタイムサンプル（日数 + データ源）を求める */
function applicantLeadTimes(
  a: Applicant,
  events: InterviewEvent[],
  statuses?: Status[],
): {
  app2int: LeadTimeSample | null;
  int2off: LeadTimeSample | null;
  off2hire: LeadTimeSample | null;
  app2hire: LeadTimeSample | null;
} {
  // 応募基準時刻: createdAt > date 由来 ISO > フォールバック（applicantLifecycle に集約）
  const appDate = applicationDate(a);
  // 面接設定日: stageHistory > 関連 InterviewEvent の最早日 > 現在ステージからの推定
  let interviewInfo = firstReachInfo(a, 'interview', statuses);
  if (!interviewInfo) {
    const evs = events.filter((e) => e.applicantId === a.id);
    if (evs.length > 0) {
      const earliest = evs.map((e) => e.date).sort()[0];
      // InterviewEvent 経由は推定扱い
      interviewInfo = { date: earliest, source: 'estimated' };
    }
  }
  const offerInfo = firstReachInfo(a, 'offered', statuses);
  const hireInfo = firstReachInfo(a, 'hired', statuses);

  return {
    app2int: makeSegment(appDate, interviewInfo),
    int2off: makeStageSegment(interviewInfo, offerInfo),
    off2hire: makeStageSegment(offerInfo, hireInfo),
    app2hire: makeSegment(appDate, hireInfo),
  };
}

/** 単一カラムのリードタイムを計算 */
function calcLeadTimeColumn(
  label: string,
  applicants: Applicant[],
  events: InterviewEvent[],
  statuses?: Status[],
): LeadTimeColumn {
  const a2i: LeadTimeSample[] = [];
  const i2o: LeadTimeSample[] = [];
  const o2h: LeadTimeSample[] = [];
  const a2h: LeadTimeSample[] = [];
  applicants.forEach((a) => {
    const lt = applicantLeadTimes(a, events, statuses);
    if (lt.app2int) a2i.push(lt.app2int);
    if (lt.int2off) i2o.push(lt.int2off);
    if (lt.off2hire) o2h.push(lt.off2hire);
    if (lt.app2hire) a2h.push(lt.app2hire);
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
