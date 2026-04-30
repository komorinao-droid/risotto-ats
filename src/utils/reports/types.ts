/**
 * 採用レポート 型定義
 */
import type { Applicant, InterviewEvent } from '@/types';

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD（含む）
}

export type DatePreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisHalf'   // 半期
  | 'lastHalf'
  | 'thisYear'
  | 'lastYear'
  | 'custom';

/** 採用ファネルの各段階 */
export interface FunnelMetrics {
  applications: number;       // 応募数（全体）
  validApplications: number;  // 有効応募数（NG除外後）
  interviewScheduled: number; // 面接設定数
  offered: number;            // 内定数
  hired: number;              // 採用数
  active: number;             // 稼働数

  // 通過率
  validRate: number;          // 応募→有効応募
  validToInterviewRate: number; // 有効応募→面接設定
  interviewToOfferRate: number; // 面接→内定
  offerToHireRate: number;    // 内定→採用
  applicationToHireRate: number; // 応募→採用
  applicationToActiveRate: number; // 応募→稼働
}

/** 選考NG内訳 */
export interface NgBreakdown {
  total: number;
  byReason: {
    age: number;          // 年齢NG
    condition: number;    // 条件不一致
    duplicate: number;    // 重複応募
    personality: number;  // 人物不適合
    other: number;
  };
}

/** 年代別集計 */
export interface AgeBreakdown {
  ageGroup: string; // '〜19歳' / '20〜29歳' / ... / '不明'
  applications: number;
  hired: number;
  applicationRate: number; // %
  hireRate: number;        // %
}

/** マトリクス1行（拠点別 or 媒体別） */
export interface MatrixRow extends FunnelMetrics {
  label: string;       // 拠点名 or 媒体名
}

/** 月次バケット（トレンド表示用） */
export interface MonthlyBucket {
  month: string;            // 'YYYY-MM'
  applications: number;
  validApplications: number;
  interviewScheduled: number;
  offered: number;
  hired: number;
}

/** 完全な採用レポート */
export interface RecruitmentReport {
  range: DateRange;
  generatedAt: string;
  total: FunnelMetrics;
  ngBreakdown: NgBreakdown;
  byBase: MatrixRow[];                           // 拠点別マトリクス
  bySource: MatrixRow[];                         // 媒体別マトリクス
  byBaseSource: { base: string; rows: MatrixRow[] }[]; // 拠点×媒体
  byAge: AgeBreakdown[];                         // 全社×年代
  byBaseAge: { base: string; rows: AgeBreakdown[] }[]; // 拠点×年代
  bySourceAge: { source: string; rows: AgeBreakdown[] }[]; // 媒体×年代
  ngAgeBreakdown: { ageGroup: string; count: number; rate: number }[];
  byMonth: MonthlyBucket[];                      // 月次推移
  byJob: MatrixRow[];                            // 職種別マトリクス
  byJobAge: { job: string; rows: AgeBreakdown[] }[]; // 職種×年代
  stepFunnel: StepFunnelData;                    // ステップ別到達率/通過率
  goal?: GoalProgress;                           // 採用目標達成率（期間内に該当目標があれば）
  cost?: CostBreakdown;                          // 媒体費用×ROI分析（費用入力済みの場合）
  leadTime: LeadTimeBreakdown;                   // リードタイム分析（応募→面接→内定→採用）
}

/** リードタイム分析: 区間ごとの平均/中央値/最速/最遅日数 */
export interface LeadTimeStats {
  /** サンプル数（その区間に到達した応募者数） */
  count: number;
  /** 平均日数 */
  avgDays: number;
  /** 中央値 */
  medianDays: number;
  /** 最速 */
  minDays: number;
  /** 最遅 */
  maxDays: number;
}

export interface LeadTimeColumn {
  label: string;
  applicationToInterview: LeadTimeStats;  // 応募 → 面接設定
  interviewToOffer: LeadTimeStats;        // 面接設定 → 内定
  offerToHired: LeadTimeStats;            // 内定 → 採用
  applicationToHired: LeadTimeStats;      // 応募 → 採用（合計）
}

export interface LeadTimeBreakdown {
  overall: LeadTimeColumn;
  bySource: LeadTimeColumn[];
  byBase: LeadTimeColumn[];
  byJob: LeadTimeColumn[];
}

/** 媒体費用×応募/採用 の費用対効果 */
export interface CostRow {
  source: string;
  cost: number;          // 期間内の合計費用(円)
  applications: number;  // 応募数
  hired: number;         // 採用数
  cpa: number;           // 応募1件あたりコスト(円) = cost / applications
  cph: number;           // 採用1名あたりコスト(円) = cost / hired
}

export interface BaseSourceCostRow {
  base: string;
  rows: CostRow[];
}

export interface CostBreakdown {
  /** 全体の媒体別費用対効果 */
  bySource: CostRow[];
  /** 拠点×媒体の費用対効果 */
  byBaseSource: BaseSourceCostRow[];
  /** 月次媒体費合計 */
  byMonth: { yearMonth: string; total: number; bySource: { [source: string]: number } }[];
  /** 全体の合計 */
  total: { cost: number; applications: number; hired: number; cpa: number; cph: number };
  /** 期間内に費用入力されている月の数（0なら全く未入力） */
  monthsWithCost: number;
}

/** ステップ別ファネル（HERPの応募経路比較レポート相当） */
export interface StepFunnelStep {
  key: 'application' | 'interview' | 'offered' | 'hired' | 'active';
  label: string;
  count: number;
  reachRate: number;       // 応募からの到達率 (%)
  conversionRate: number;  // 前ステップからの通過率 (%)
}

export interface StepFunnelColumn {
  label: string;           // 軸の値（"全体" or 媒体名 or 拠点名 or 職種名）
  steps: StepFunnelStep[];
}

export interface StepFunnelData {
  bySource: StepFunnelColumn[];   // 媒体別
  byBase: StepFunnelColumn[];     // 拠点別
  byJob: StepFunnelColumn[];      // 職種別
  overall: StepFunnelColumn;      // 全体
}

/** 採用目標進捗 */
export interface GoalProgress {
  /** 期間内の月次目標合計 */
  targetHires: number;
  /** 期間内の実績採用数 */
  actualHires: number;
  /** 着地ヨミ（経過日数から線形外挿） */
  projectedHires: number;
  /** 達成率 (%) = actual/target */
  achievementRate: number;
  /** 着地予測達成率 (%) = projected/target */
  projectedAchievementRate: number;
  /** 期間に含まれる月次目標の内訳 */
  monthly: { yearMonth: string; target: number; actual: number }[];
  /** 期間が完全に過去か（着地ヨミ = actual） */
  isPastPeriod: boolean;
}

export type SourceData = {
  applicants: Applicant[];
  events: InterviewEvent[];
};
