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
} from './types';
import { inRange } from './dateRange';
import { getStatusCategory } from '@/utils/statusCategory';

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
  ngs.forEach((a) => {
    if (a.duplicate) {
      byReason.duplicate += 1;
      return;
    }
    const r = ngReason(a.stage, a.age);
    byReason[r] += 1;
  });
  return { total: ngs.length, byReason };
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
  };
}
