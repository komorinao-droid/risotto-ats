/**
 * 採用レポート 集計エンジン
 *
 * SPDレポートに準拠した集計指標を Applicant[] から計算する。
 *
 * 採用ステータスの分類（SPD準拠）:
 * - 採用判定: 「採用」「稼働」「入社」「内定承諾」「面接合格」「研没」を含む stage
 * - 内定: 「内定」を含む stage
 * - 面接設定: events に存在する applicant、または stage が「面接調整中」「面接確定」「面接合格」以降
 * - NG: stage に「不合格」「対象外」「辞退」「重複」「条件不一致」「連絡不通」を含む
 *
 * 各クライアントが自由にステータス名を作れるため、stage 文字列の部分一致で判定する。
 */
import type { Applicant, ClientData, Status } from '@/types';
import type {
  DateRange,
  FunnelMetrics,
  NgBreakdown,
  AgeBreakdown,
  MatrixRow,
  MonthlyBucket,
  RecruitmentReport,
  StepFunnelStep,
  StepFunnelColumn,
  StepFunnelData,
  GoalProgress,
  CostBreakdown,
  CostRow,
} from './types';
import { inRange } from './dateRange';
import { getStatusCategory } from '@/utils/statusCategory';
import { calcLeadTimeBreakdown } from './leadTime';

// =============================================================
// ステータス分類ユーティリティ
// =============================================================

/** stage が採用に該当するか（hired か active） */
export function isHired(stage: string, statuses?: Status[]): boolean {
  const c = getStatusCategory(stage, statuses);
  return c === 'hired' || c === 'active';
}

/** stage が稼働に該当するか */
export function isActive(stage: string, statuses?: Status[]): boolean {
  return getStatusCategory(stage, statuses) === 'active';
}

/** stage が内定に該当するか（承諾前後問わず: offered/hired/active を内定到達としてカウント） */
export function isOffered(stage: string, statuses?: Status[]): boolean {
  const c = getStatusCategory(stage, statuses);
  return c === 'offered' || c === 'hired' || c === 'active';
}

/** stage が「不合格・辞退」系か（NG判定） */
export function isNg(stage: string, statuses?: Status[]): boolean {
  return getStatusCategory(stage, statuses) === 'ng';
}

/** stage が面接以降に到達しているか（面接設定判定の補助） */
export function isInterviewOrLater(stage: string, statuses?: Status[]): boolean {
  const c = getStatusCategory(stage, statuses);
  return c === 'interview' || c === 'offered' || c === 'hired' || c === 'active';
}

/** NG理由のカテゴリ判定（SPD準拠の4分類 + その他）。statuses 引数は後方互換のためオプション。 */
export function ngReason(stage: string, age?: number | string, _statuses?: Status[]): NgBreakdown['byReason'] extends infer R ? keyof R : never {
  const ageNum = typeof age === 'number' ? age : age ? parseInt(String(age), 10) : NaN;
  if (!isNaN(ageNum) && (ageNum < 18 || ageNum >= 75)) {
    // 年齢NG（フィルタ条件は別途あるが、簡易判定）
  }
  if (/対象外|年齢/.test(stage)) return 'age';
  if (/重複/.test(stage)) return 'duplicate';
  if (/条件不一致|条件/.test(stage)) return 'condition';
  if (/不合格|人柄|連絡不通/.test(stage)) return 'personality';
  return 'other';
}

/** 年代グループ */
export function ageGroupOf(age: number | string | undefined): string {
  const n = typeof age === 'number' ? age : age ? parseInt(String(age), 10) : NaN;
  if (isNaN(n)) return '不明';
  if (n < 20) return '〜19歳';
  if (n < 30) return '20〜29歳';
  if (n < 40) return '30〜39歳';
  if (n < 50) return '40〜49歳';
  if (n < 60) return '50〜59歳';
  if (n < 70) return '60〜69歳';
  if (n < 80) return '70〜79歳';
  return '80歳〜';
}

const AGE_GROUPS_ORDER = ['〜19歳', '20〜29歳', '30〜39歳', '40〜49歳', '50〜59歳', '60〜69歳', '70〜79歳', '80歳〜', '不明'];

// =============================================================
// 集計関数
// =============================================================

/** 期間でフィルタした応募者を取得 */
export function filterApplicantsByRange(applicants: Applicant[], range: DateRange): Applicant[] {
  return applicants.filter((a) => inRange(a.date, range));
}

/** ファネル指標を計算 */
export function calcFunnel(applicants: Applicant[], events: { applicantId: number; date?: string }[] = [], statuses?: Status[]): FunnelMetrics {
  const total = applicants.length;

  // 面接設定: 面接イベントが存在する applicant を集計（events をソース）
  const eventApplicantIds = new Set(events.map((e) => e.applicantId));
  // または ステータス分類が interview 以降の場合
  const interviewSet = new Set<number>();
  applicants.forEach((a) => {
    if (eventApplicantIds.has(a.id)) interviewSet.add(a.id);
    if (isInterviewOrLater(a.stage, statuses)) {
      interviewSet.add(a.id);
    }
  });
  const interviewScheduled = interviewSet.size;

  // 有効応募: NG だが面接まで進んでいる場合は「面接後にNGになった」扱いで有効に含める。
  // これにより 面接設定 ≤ 有効応募 が常に成立する。
  const ngCount = applicants.filter((a) => (isNg(a.stage, statuses) || a.duplicate) && !interviewSet.has(a.id)).length;
  const valid = total - ngCount;

  const offered = applicants.filter((a) => isOffered(a.stage, statuses)).length;
  const hired = applicants.filter((a) => isHired(a.stage, statuses)).length;
  const active = applicants.filter((a) => isActive(a.stage, statuses)).length;

  const safe = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  return {
    applications: total,
    validApplications: valid,
    interviewScheduled,
    offered,
    hired,
    active,
    validRate: safe(valid, total),
    validToInterviewRate: safe(interviewScheduled, valid),
    interviewToOfferRate: safe(offered, interviewScheduled),
    offerToHireRate: safe(hired, offered),
    applicationToHireRate: safe(hired, total),
    applicationToActiveRate: safe(active, total),
  };
}

/** 選考NG内訳 */
export function calcNgBreakdown(applicants: Applicant[], statuses?: Status[]): NgBreakdown {
  const ngs = applicants.filter((a) => isNg(a.stage, statuses) || a.duplicate);
  const byReason: NgBreakdown['byReason'] = { age: 0, condition: 0, duplicate: 0, personality: 0, other: 0 };
  // ステータス × サブステータス で集計
  const stageSubMap = new Map<string, number>(); // key: stage|||subStatus
  ngs.forEach((a) => {
    if (a.duplicate) {
      byReason.duplicate += 1;
    } else {
      const r = ngReason(a.stage, a.age);
      byReason[r] += 1;
    }
    // ステータス×サブの内訳もカウント (NGカテゴリのステータスだけ。重複応募は除外)
    if (!a.duplicate && a.stage) {
      const sub = (a.subStatus || '').trim() || '(未設定)';
      const key = `${a.stage}|||${sub}`;
      stageSubMap.set(key, (stageSubMap.get(key) || 0) + 1);
    }
  });

  const total = ngs.length;
  const byStageSub: { stage: string; subStatus: string; count: number; rate: number }[] = Array.from(stageSubMap.entries())
    .map(([key, count]) => {
      const [stage, subStatus] = key.split('|||');
      return { stage, subStatus, count, rate: total > 0 ? (count / total) * 100 : 0 };
    })
    .sort((a, b) => {
      // ステータス名でグルーピング、その中で件数の多い順
      if (a.stage !== b.stage) return a.stage.localeCompare(b.stage);
      return b.count - a.count;
    });

  return { total, byReason, byStageSub };
}

/** NG中の年代別内訳 */
export function calcNgAgeBreakdown(applicants: Applicant[], statuses?: Status[]): { ageGroup: string; count: number; rate: number }[] {
  const ngs = applicants.filter((a) => isNg(a.stage, statuses));
  const byGroup: Record<string, number> = {};
  ngs.forEach((a) => {
    const g = ageGroupOf(a.age);
    byGroup[g] = (byGroup[g] || 0) + 1;
  });
  const total = ngs.length || 1;
  return AGE_GROUPS_ORDER
    .filter((g) => byGroup[g])
    .map((g) => ({ ageGroup: g, count: byGroup[g], rate: (byGroup[g] / total) * 100 }));
}

/** 拠点別マトリクス */
export function calcByBase(applicants: Applicant[], events: { applicantId: number; date?: string }[], statuses?: Status[]): MatrixRow[] {
  const baseSet = new Set<string>();
  applicants.forEach((a) => baseSet.add(a.base || '未設定'));

  return Array.from(baseSet).map((base) => {
    const inBase = applicants.filter((a) => (a.base || '未設定') === base);
    const inBaseEvents = events.filter((e) => {
      const a = applicants.find((ap) => ap.id === e.applicantId);
      return a && (a.base || '未設定') === base;
    });
    const f = calcFunnel(inBase, inBaseEvents, statuses);
    return { label: base, ...f };
  }).sort((a, b) => b.applications - a.applications);
}

/** 媒体別マトリクス */
export function calcBySource(applicants: Applicant[], events: { applicantId: number; date?: string }[], statuses?: Status[]): MatrixRow[] {
  const set = new Set<string>();
  applicants.forEach((a) => set.add(a.src || '未設定'));
  return Array.from(set).map((src) => {
    const inSrc = applicants.filter((a) => (a.src || '未設定') === src);
    const inSrcEvents = events.filter((e) => {
      const a = applicants.find((ap) => ap.id === e.applicantId);
      return a && (a.src || '未設定') === src;
    });
    const f = calcFunnel(inSrc, inSrcEvents, statuses);
    return { label: src, ...f };
  }).sort((a, b) => b.hired - a.hired || b.applications - a.applications);
}

/** 拠点×媒体 マトリクス */
export function calcByBaseSource(applicants: Applicant[], events: { applicantId: number; date?: string }[], statuses?: Status[]): { base: string; rows: MatrixRow[] }[] {
  const baseSet = new Set<string>();
  applicants.forEach((a) => baseSet.add(a.base || '未設定'));
  return Array.from(baseSet).map((base) => {
    const inBase = applicants.filter((a) => (a.base || '未設定') === base);
    const eventsInBase = events.filter((e) => inBase.some((a) => a.id === e.applicantId));
    return { base, rows: calcBySource(inBase, eventsInBase, statuses) };
  });
}

/** 年代別集計 */
export function calcByAge(applicants: Applicant[], statuses?: Status[]): AgeBreakdown[] {
  const totalApps = applicants.length || 1;
  const totalHired = applicants.filter((a) => isHired(a.stage, statuses)).length || 1;
  const groupApps: Record<string, number> = {};
  const groupHired: Record<string, number> = {};
  applicants.forEach((a) => {
    const g = ageGroupOf(a.age);
    groupApps[g] = (groupApps[g] || 0) + 1;
    if (isHired(a.stage, statuses)) groupHired[g] = (groupHired[g] || 0) + 1;
  });
  return AGE_GROUPS_ORDER
    .filter((g) => groupApps[g] || groupHired[g])
    .map((g) => ({
      ageGroup: g,
      applications: groupApps[g] || 0,
      hired: groupHired[g] || 0,
      applicationRate: ((groupApps[g] || 0) / totalApps) * 100,
      hireRate: ((groupHired[g] || 0) / totalHired) * 100,
    }));
}

/** 拠点×年代 */
export function calcByBaseAge(applicants: Applicant[], statuses?: Status[]): { base: string; rows: AgeBreakdown[] }[] {
  const baseSet = new Set<string>();
  applicants.forEach((a) => baseSet.add(a.base || '未設定'));
  return Array.from(baseSet).map((base) => ({
    base,
    rows: calcByAge(applicants.filter((a) => (a.base || '未設定') === base), statuses),
  }));
}

/** 職種別マトリクス */
export function calcByJob(applicants: Applicant[], events: { applicantId: number; date?: string }[], statuses?: Status[]): MatrixRow[] {
  const set = new Set<string>();
  applicants.forEach((a) => set.add(a.job || '未設定'));
  return Array.from(set).map((job) => {
    const inJob = applicants.filter((a) => (a.job || '未設定') === job);
    const inJobEvents = events.filter((e) => {
      const a = applicants.find((ap) => ap.id === e.applicantId);
      return a && (a.job || '未設定') === job;
    });
    const f = calcFunnel(inJob, inJobEvents, statuses);
    return { label: job, ...f };
  }).sort((a, b) => b.hired - a.hired || b.applications - a.applications);
}

/** 職種×年代 */
export function calcByJobAge(applicants: Applicant[], statuses?: Status[]): { job: string; rows: AgeBreakdown[] }[] {
  const set = new Set<string>();
  applicants.forEach((a) => set.add(a.job || '未設定'));
  return Array.from(set).map((job) => ({
    job,
    rows: calcByAge(applicants.filter((a) => (a.job || '未設定') === job), statuses),
  })).sort((a, b) => {
    const ah = a.rows.reduce((s, r) => s + r.hired, 0);
    const bh = b.rows.reduce((s, r) => s + r.hired, 0);
    return bh - ah;
  });
}

/** 媒体×年代 */
export function calcBySourceAge(applicants: Applicant[], statuses?: Status[]): { source: string; rows: AgeBreakdown[] }[] {
  const set = new Set<string>();
  applicants.forEach((a) => set.add(a.src || '未設定'));
  return Array.from(set).map((source) => ({
    source,
    rows: calcByAge(applicants.filter((a) => (a.src || '未設定') === source), statuses),
  })).sort((a, b) => {
    const ah = a.rows.reduce((s, r) => s + r.hired, 0);
    const bh = b.rows.reduce((s, r) => s + r.hired, 0);
    return bh - ah;
  });
}

/** 月次トレンド（YYYY-MM 単位の応募/有効/面接/内定/採用） */
export function calcByMonth(applicants: Applicant[], events: { applicantId: number; date?: string }[], range: DateRange, statuses?: Status[]): MonthlyBucket[] {
  const months: string[] = [];
  const start = new Date(range.start + 'T00:00:00');
  const end = new Date(range.end + 'T00:00:00');
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const m = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    months.push(m);
    cur.setMonth(cur.getMonth() + 1);
  }

  const eventApplicantIds = new Set(events.map((e) => e.applicantId));

  const bucket: Record<string, MonthlyBucket> = {};
  months.forEach((m) => {
    bucket[m] = { month: m, applications: 0, validApplications: 0, interviewScheduled: 0, offered: 0, hired: 0 };
  });

  applicants.forEach((a) => {
    const d = a.date;
    if (!d) return;
    const m = d.slice(0, 7);
    const b = bucket[m];
    if (!b) return;
    b.applications += 1;
    const isInterview = eventApplicantIds.has(a.id) || isInterviewOrLater(a.stage, statuses);
    // 面接まで進んだ場合は NG でも valid 扱い（面接設定 ≤ 有効を保証）
    if (isInterview || (!isNg(a.stage, statuses) && !a.duplicate)) b.validApplications += 1;
    if (isInterview) b.interviewScheduled += 1;
    if (isOffered(a.stage, statuses)) b.offered += 1;
    if (isHired(a.stage, statuses)) b.hired += 1;
  });

  return months.map((m) => bucket[m]);
}

// =============================================================
// ステップ別到達率/通過率（HERP応募経路比較相当）
// =============================================================

/** 単一カラム（指定された応募者群）のステップファネル行を計算 */
export function calcStepFunnelColumn(
  label: string,
  applicants: Applicant[],
  events: { applicantId: number; date?: string }[],
  statuses?: Status[],
): StepFunnelColumn {
  const total = applicants.length;
  const eventApplicantIds = new Set(events.map((e) => e.applicantId));

  // 各ステップに「到達した」応募者数（累計）
  const reached = {
    application: total,
    interview: 0,
    offered: 0,
    hired: 0,
    active: 0,
  };

  applicants.forEach((a) => {
    const cat = getStatusCategory(a.stage, statuses);
    const reachedInterview = eventApplicantIds.has(a.id) || cat === 'interview' || cat === 'offered' || cat === 'hired' || cat === 'active';
    if (reachedInterview) reached.interview += 1;
    if (cat === 'offered' || cat === 'hired' || cat === 'active') reached.offered += 1;
    if (cat === 'hired' || cat === 'active') reached.hired += 1;
    if (cat === 'active') reached.active += 1;
  });

  const safeRate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  const stepDefs: { key: StepFunnelStep['key']; label: string; count: number }[] = [
    { key: 'application', label: '応募',     count: reached.application },
    { key: 'interview',   label: '面接到達', count: reached.interview },
    { key: 'offered',     label: '内定',     count: reached.offered },
    { key: 'hired',       label: '採用',     count: reached.hired },
    { key: 'active',      label: '稼働',     count: reached.active },
  ];

  const steps: StepFunnelStep[] = stepDefs.map((s, i) => {
    const prevCount = i === 0 ? s.count : stepDefs[i - 1].count;
    return {
      key: s.key,
      label: s.label,
      count: s.count,
      reachRate: safeRate(s.count, total),
      conversionRate: i === 0 ? 100 : safeRate(s.count, prevCount),
    };
  });

  return { label, steps };
}

/** 全体 + 軸別のステップファネルをまとめて計算 */
export function calcStepFunnel(
  applicants: Applicant[],
  events: { applicantId: number; date?: string }[],
  statuses?: Status[],
): StepFunnelData {
  const overall = calcStepFunnelColumn('全体', applicants, events, statuses);

  // 軸別の応募者をグルーピング + イベントを applicantId で索引化（O(N²) → O(N)）
  const groupBy = (key: 'src' | 'base' | 'job'): Map<string, Applicant[]> => {
    const map = new Map<string, Applicant[]>();
    applicants.forEach((a) => {
      const k = (a[key] as string) || '未設定';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    });
    return map;
  };
  const bySrc = groupBy('src');
  const byBaseMap = groupBy('base');
  const byJobMap = groupBy('job');

  const buildColumns = (groupMap: Map<string, Applicant[]>): StepFunnelColumn[] => {
    return Array.from(groupMap.entries()).map(([label, apps]) => {
      const ids = new Set(apps.map((a) => a.id));
      const inEvents = events.filter((e) => ids.has(e.applicantId));
      return calcStepFunnelColumn(label, apps, inEvents, statuses);
    }).sort((a, b) => (b.steps[0]?.count || 0) - (a.steps[0]?.count || 0));
  };

  return {
    overall,
    bySource: buildColumns(bySrc),
    byBase: buildColumns(byBaseMap),
    byJob: buildColumns(byJobMap),
  };
}

// =============================================================
// 採用目標達成率/着地ヨミ
// =============================================================

/** 期間内の月のリスト（YYYY-MM）を返す */
function monthsInRange(range: DateRange): string[] {
  const months: string[] = [];
  const start = new Date(range.start + 'T00:00:00');
  const end = new Date(range.end + 'T00:00:00');
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/** 採用目標達成率/着地ヨミを計算 */
export function calcGoalProgress(
  applicants: Applicant[],
  range: DateRange,
  goals: { [yearMonth: string]: number } | undefined,
  statuses?: Status[],
  today: Date = new Date(),
): GoalProgress | undefined {
  if (!goals) return undefined;
  const months = monthsInRange(range);
  const monthly = months.map((m) => ({
    yearMonth: m,
    target: goals[m] || 0,
    actual: applicants.filter((a) => (a.date || '').startsWith(m) && isHired(a.stage, statuses)).length,
  }));
  const targetHires = monthly.reduce((s, m) => s + m.target, 0);
  if (targetHires === 0) return undefined;
  const actualHires = monthly.reduce((s, m) => s + m.actual, 0);

  // 期間が完全に過去なら projected = actual
  const end = new Date(range.end + 'T23:59:59');
  const start = new Date(range.start + 'T00:00:00');
  const isPastPeriod = today.getTime() > end.getTime();
  const todayClamp = today < start ? start : today < end ? today : end;
  const elapsedMs = todayClamp.getTime() - start.getTime() + 24 * 60 * 60 * 1000;
  const totalMs = end.getTime() - start.getTime() + 1000;
  const elapsedRatio = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 1;
  const projectedHires = isPastPeriod
    ? actualHires
    : elapsedRatio > 0
      ? Math.round(actualHires / elapsedRatio)
      : actualHires;

  return {
    targetHires,
    actualHires,
    projectedHires,
    achievementRate: targetHires > 0 ? (actualHires / targetHires) * 100 : 0,
    projectedAchievementRate: targetHires > 0 ? (projectedHires / targetHires) * 100 : 0,
    monthly,
    isPastPeriod,
  };
}

// =============================================================
// 媒体費用 × 費用対効果
// =============================================================

/** 期間内の媒体別費用合計を返す（月単位の費用設定を期間で合算） */
export function sumMediaCostsInRange(
  costs: { [yearMonth: string]: { [sourceName: string]: number } } | undefined,
  range: DateRange,
): { bySource: { [source: string]: number }; total: number; monthsWithCost: number } {
  const result: { [source: string]: number } = {};
  let total = 0;
  let monthsWithCost = 0;
  if (!costs) return { bySource: {}, total: 0, monthsWithCost: 0 };

  const months = monthsInRange(range);
  months.forEach((m) => {
    const monthly = costs[m];
    if (!monthly) return;
    let monthSum = 0;
    Object.entries(monthly).forEach(([src, val]) => {
      const v = Number(val) || 0;
      if (v > 0) {
        result[src] = (result[src] || 0) + v;
        total += v;
        monthSum += v;
      }
    });
    if (monthSum > 0) monthsWithCost += 1;
  });

  return { bySource: result, total, monthsWithCost };
}

/** 期間内の媒体費用×応募/採用の費用対効果を計算 */
export function calcCostBreakdown(
  applicants: Applicant[],
  range: DateRange,
  costs: { [yearMonth: string]: { [sourceName: string]: number } } | undefined,
  statuses?: Status[],
): CostBreakdown | undefined {
  if (!costs) return undefined;
  const summary = sumMediaCostsInRange(costs, range);
  if (summary.total === 0) return undefined;

  const buildRow = (source: string, cost: number, apps: Applicant[]): CostRow => {
    const applications = apps.length;
    const hired = apps.filter((a) => isHired(a.stage, statuses)).length;
    return {
      source,
      cost,
      applications,
      hired,
      cpa: applications > 0 ? cost / applications : 0,
      cph: hired > 0 ? cost / hired : 0,
    };
  };

  // 全体の媒体別
  const bySource: CostRow[] = Object.keys(summary.bySource).map((src) => {
    const apps = applicants.filter((a) => (a.src || '未設定') === src);
    return buildRow(src, summary.bySource[src], apps);
  }).sort((a, b) => b.cost - a.cost);

  // 拠点×媒体: 媒体費を「全社のその媒体経由の応募者に対する、拠点経由応募者の比率」で按分
  //   - 全社応募0の媒体（つまり費用は入力されてるが期間内に応募0） → 按分不能なので0円扱い
  //   - 該当媒体に応募者がいる拠点だけ表示（全媒体0応募の拠点は表示するが行は空）
  const baseSet = new Set<string>();
  applicants.forEach((a) => baseSet.add(a.base || '未設定'));
  // 媒体ごとに、応募者IDとその拠点を一度だけ計算してキャッシュ
  const srcToApps = new Map<string, Applicant[]>();
  Object.keys(summary.bySource).forEach((src) => {
    srcToApps.set(src, applicants.filter((a) => (a.src || '未設定') === src));
  });

  const byBaseSource = Array.from(baseSet).map((base) => {
    const rows: CostRow[] = Object.keys(summary.bySource).map((src) => {
      const allSrcApps = srcToApps.get(src) || [];
      const inSrc = allSrcApps.filter((a) => (a.base || '未設定') === base);
      // 全社応募0の媒体は按分不能 → 0円
      const allocCost = allSrcApps.length > 0
        ? summary.bySource[src] * (inSrc.length / allSrcApps.length)
        : 0;
      return buildRow(src, allocCost, inSrc);
    }).filter((r) => r.applications > 0 || r.cost > 0).sort((a, b) => b.cost - a.cost);
    return { base, rows };
  });

  // 月次媒体費
  const months = monthsInRange(range);
  const byMonth = months.map((m) => {
    const monthly = costs[m] || {};
    const total = Object.values(monthly).reduce((s, v) => s + (Number(v) || 0), 0);
    return { yearMonth: m, total, bySource: { ...monthly } };
  });

  const totalApps = applicants.length;
  const totalHired = applicants.filter((a) => isHired(a.stage, statuses)).length;

  return {
    bySource,
    byBaseSource,
    byMonth,
    total: {
      cost: summary.total,
      applications: totalApps,
      hired: totalHired,
      cpa: totalApps > 0 ? summary.total / totalApps : 0,
      cph: totalHired > 0 ? summary.total / totalHired : 0,
    },
    monthsWithCost: summary.monthsWithCost,
  };
}

// =============================================================
// メインエントリ
// =============================================================

/** ClientData + 期間からレポートを構築 */
export function buildReport(data: ClientData, range: DateRange): RecruitmentReport {
  const applicants = filterApplicantsByRange(data.applicants || [], range);
  const events = (data.events || []).filter((e) => inRange(e.date, range));
  const statuses = data.statuses || [];

  return {
    range,
    generatedAt: new Date().toISOString(),
    total: calcFunnel(applicants, events, statuses),
    ngBreakdown: calcNgBreakdown(applicants, statuses),
    byBase: calcByBase(applicants, events, statuses),
    bySource: calcBySource(applicants, events, statuses),
    byBaseSource: calcByBaseSource(applicants, events, statuses),
    byAge: calcByAge(applicants, statuses),
    byBaseAge: calcByBaseAge(applicants, statuses),
    bySourceAge: calcBySourceAge(applicants, statuses),
    ngAgeBreakdown: calcNgAgeBreakdown(applicants, statuses),
    byMonth: calcByMonth(applicants, events, range, statuses),
    byJob: calcByJob(applicants, events, statuses),
    byJobAge: calcByJobAge(applicants, statuses),
    stepFunnel: calcStepFunnel(applicants, events, statuses),
    goal: calcGoalProgress(applicants, range, data.recruitmentGoals, statuses),
    cost: calcCostBreakdown(applicants, range, data.mediaCosts, statuses),
    leadTime: calcLeadTimeBreakdown(applicants, events, statuses),
  };
}
