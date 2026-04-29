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
}

export type SourceData = {
  applicants: Applicant[];
  events: InterviewEvent[];
};
