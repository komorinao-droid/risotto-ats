/**
 * 運営側でクライアントごとの統計を計算するヘルパー
 */
import { storage } from '@/utils/storage';
import { getClientLogs } from '@/utils/clientLog';
import type { Client, ClientData, ClientOperationLog } from '@/types';
import { smsSuccessCountThisMonth, smsOverage, smsOverageCharge } from '@/utils/sms';

export interface ClientStats {
  applicantCount: number;
  thisMonthApplicants: number;
  basesCount: number;
  jobsCount: number;
  sourcesCount: number;
  baseOverrides: number;       // 拠点別オーバーライド数（jobsByBase + sourcesByBase + emailTemplatesByBase）
  childCount: number;
  screeningEnabled: boolean;
  screeningAxesCount: number;
  screeningJobOverrides: number;
  screeningRunsTotal: number;
  screeningRunsThisMonth: number;
  // 採用レポート関連
  recruitmentGoalsCount: number;     // 目標が設定されている月数
  mediaCostMonthsCount: number;      // 媒体費が入力されている月数
  mediaCostTotal: number;            // 全期間の媒体費合計（円）
  mediaCostThisMonth: number;        // 当月の媒体費（円）
  reportPdfDownloadsTotal: number;   // 「納品資料(PDF)」「AI総評付きPDF」を開いた回数
  reportAiSummaryRunsTotal: number;  // AI総評生成回数
  // 採用パフォーマンス横断比較用
  thisMonthHired: number;            // 当月採用数
  thisMonthHireRate: number;         // 当月採用率 (採用/応募)
  thisMonthCpa: number;              // 当月CPA (媒体費/応募)
  thisMonthCph: number;              // 当月CPH (媒体費/採用)
  alertsCount: number;               // アクティブなアラート数
  // SMS送信
  smsSentTotal: number;              // 全期間の送信成功数
  smsSentThisMonth: number;          // 当月の送信成功数
  smsFailedThisMonth: number;        // 当月の送信失敗数
  smsOverageThisMonth: number;       // 当月の超過数（プラン上限超過）
  smsOverageChargeThisMonth: number; // 当月の超過課金額(円)
  lastLoginAt: string | null;     // ISO timestamp or null
  lastActionAt: string | null;
}

const todayMonthPrefix = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** 親IDを解決（子なら親ID、親なら自分） */
function resolveDataId(client: Client): string {
  return client.accountType === 'child' && client.parentId ? client.parentId : client.id;
}

export function calcClientStats(client: Client, allClients: Client[]): ClientStats {
  const dataId = resolveDataId(client);
  const data: ClientData | null = (() => {
    try {
      return storage.getClientData(dataId);
    } catch {
      return null;
    }
  })();

  const logs: ClientOperationLog[] = (() => {
    try {
      return getClientLogs(dataId);
    } catch {
      return [];
    }
  })();

  const month = todayMonthPrefix();
  const applicants = data?.applicants ?? [];
  const thisMonth = applicants.filter((a) => a.date && a.date.startsWith(month)).length;

  const screening = data?.screeningCriteria;
  const screeningRunsTotal = logs.filter((l) => l.action === 'AI評価実行').length;
  const screeningRunsThisMonth = logs.filter((l) => l.action === 'AI評価実行' && l.timestamp.startsWith(month)).length;

  // 採用レポート系
  const recruitmentGoalsCount = data?.recruitmentGoals ? Object.keys(data.recruitmentGoals).filter((k) => data.recruitmentGoals![k] > 0).length : 0;
  const mediaCostsByMonth = data?.mediaCosts || {};
  const mediaCostMonthsCount = Object.keys(mediaCostsByMonth).filter((m) => Object.values(mediaCostsByMonth[m] || {}).some((v) => Number(v) > 0)).length;
  const mediaCostTotal = Object.values(mediaCostsByMonth).reduce((sum, monthly) => sum + Object.values(monthly || {}).reduce((s: number, v) => s + (Number(v) || 0), 0), 0);
  const mediaCostThisMonth = Object.values(mediaCostsByMonth[month] || {}).reduce((s: number, v) => s + (Number(v) || 0), 0);
  const reportPdfDownloadsTotal = logs.filter((l) => l.action === 'PDF生成' || l.action === '納品資料生成' || l.action === 'AI総評付きPDF生成').length;
  const reportAiSummaryRunsTotal = logs.filter((l) => l.action === 'AI総評生成').length;

  // 当月パフォーマンス（横断比較用）
  const thisMonthApps = applicants.filter((a) => a.date && a.date.startsWith(month));
  const isHiredStage = (s: string): boolean => /採用|稼働|入社|内定承諾|内定【承諾】|面接合格|研没/.test(s);
  const thisMonthHired = thisMonthApps.filter((a) => isHiredStage(a.stage)).length;
  const thisMonthHireRate = thisMonthApps.length > 0 ? (thisMonthHired / thisMonthApps.length) * 100 : 0;
  const thisMonthCpa = thisMonthApps.length > 0 && mediaCostThisMonth > 0 ? mediaCostThisMonth / thisMonthApps.length : 0;
  const thisMonthCph = thisMonthHired > 0 && mediaCostThisMonth > 0 ? mediaCostThisMonth / thisMonthHired : 0;
  // アラート数: 当月応募が前月の半分以下、または採用0
  const prevMonthYM = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const prevMonthApps = applicants.filter((a) => a.date && a.date.startsWith(prevMonthYM));
  let alertsCount = 0;
  if (prevMonthApps.length >= 5 && thisMonthApps.length > 0 && thisMonthApps.length < prevMonthApps.length * 0.5) alertsCount += 1;
  if (thisMonthApps.length >= 5 && thisMonthHired === 0) alertsCount += 1;

  // SMS送信
  const smsLogs = data?.smsLogs || [];
  const smsSentTotal = smsLogs.filter((l) => l.status === 'success').length;
  const smsSentThisMonth = smsSuccessCountThisMonth(smsLogs, month);
  const smsFailedThisMonth = smsLogs.filter((l) => l.sentAt.startsWith(month) && l.status === 'failed').length;
  const smsOverageThisMonth = smsOverage(client.plan, smsSentThisMonth);
  const smsOverageChargeThisMonth = smsOverageCharge(client.plan, smsSentThisMonth);

  const lastLogin = logs.find((l) => l.category === 'auth' && l.action === 'ログイン');
  const lastAction = logs[0]; // logs are reverse-chronological in pushClientLog

  const children = client.accountType === 'parent'
    ? allClients.filter((c) => c.accountType === 'child' && c.parentId === client.id)
    : [];

  const baseOverrides = (data
    ? Object.keys(data.jobsByBase || {}).length
      + Object.keys(data.sourcesByBase || {}).length
      + Object.keys(data.emailTemplatesByBase || {}).length
    : 0);

  return {
    applicantCount: applicants.length,
    thisMonthApplicants: thisMonth,
    basesCount: data?.bases?.length ?? 0,
    jobsCount: data?.jobs?.length ?? 0,
    sourcesCount: data?.sources?.length ?? 0,
    baseOverrides,
    childCount: children.length,
    screeningEnabled: !!screening?.enabled,
    screeningAxesCount: screening?.axes?.length ?? 0,
    screeningJobOverrides: screening?.byJob ? Object.keys(screening.byJob).length : 0,
    screeningRunsTotal,
    screeningRunsThisMonth,
    recruitmentGoalsCount,
    mediaCostMonthsCount,
    mediaCostTotal,
    mediaCostThisMonth,
    reportPdfDownloadsTotal,
    reportAiSummaryRunsTotal,
    thisMonthHired,
    thisMonthHireRate,
    thisMonthCpa,
    thisMonthCph,
    alertsCount,
    smsSentTotal,
    smsSentThisMonth,
    smsFailedThisMonth,
    smsOverageThisMonth,
    smsOverageChargeThisMonth,
    lastLoginAt: lastLogin?.timestamp || null,
    lastActionAt: lastAction?.timestamp || null,
  };
}

/** 全クライアントの統計を一気に計算
 *  - 子アカウントは親と同じ ClientData を参照するためスキップ（無駄な計算回避）
 *  - 子アカの統計が必要な箇所では calcClientStats(child, allClients) を直接呼ぶこと
 */
export function calcAllClientStats(clients: Client[]): { [clientId: string]: ClientStats } {
  const result: { [id: string]: ClientStats } = {};
  clients.forEach((c) => {
    if (c.accountType === 'child') return;
    result[c.id] = calcClientStats(c, clients);
  });
  return result;
}

/** 全社合計を計算（運営ダッシュボード用） */
export interface AdminAggregates {
  totalApplicants: number;
  thisMonthApplicants: number;
  totalScreeningRuns: number;
  thisMonthScreeningRuns: number;
  totalChildAccounts: number;
  enabledScreening: number;     // スクリーニング有効化済の本部数
  parentCount: number;
  // SMS送信
  smsSentThisMonth: number;
  smsFailedThisMonth: number;
  smsOverageThisMonth: number;
  smsOverageChargeThisMonth: number;
  smsClientsOver: number;       // 上限超過しているクライアント数
}

export function calcAdminAggregates(clients: Client[], statsMap: { [id: string]: ClientStats }): AdminAggregates {
  const parents = clients.filter((c) => c.accountType === 'parent');
  let totalApplicants = 0;
  let thisMonthApplicants = 0;
  let totalScreeningRuns = 0;
  let thisMonthScreeningRuns = 0;
  let totalChildAccounts = 0;
  let enabledScreening = 0;
  let smsSentThisMonth = 0;
  let smsFailedThisMonth = 0;
  let smsOverageThisMonth = 0;
  let smsOverageChargeThisMonth = 0;
  let smsClientsOver = 0;

  parents.forEach((p) => {
    const s = statsMap[p.id];
    if (!s) return;
    totalApplicants += s.applicantCount;
    thisMonthApplicants += s.thisMonthApplicants;
    totalScreeningRuns += s.screeningRunsTotal;
    thisMonthScreeningRuns += s.screeningRunsThisMonth;
    totalChildAccounts += s.childCount;
    if (s.screeningEnabled) enabledScreening += 1;
    smsSentThisMonth += s.smsSentThisMonth;
    smsFailedThisMonth += s.smsFailedThisMonth;
    smsOverageThisMonth += s.smsOverageThisMonth;
    smsOverageChargeThisMonth += s.smsOverageChargeThisMonth;
    if (s.smsOverageThisMonth > 0) smsClientsOver += 1;
  });

  return {
    totalApplicants,
    thisMonthApplicants,
    totalScreeningRuns,
    thisMonthScreeningRuns,
    totalChildAccounts,
    enabledScreening,
    parentCount: parents.length,
    smsSentThisMonth,
    smsFailedThisMonth,
    smsOverageThisMonth,
    smsOverageChargeThisMonth,
    smsClientsOver,
  };
}

/** 日時をJSTで「YYYY/M/D HH:mm」表示。null時は "—" */
export function formatJpDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** 相対表示「3日前」「1時間前」 */
export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (isNaN(d)) return iso;
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}日前`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}ヶ月前`;
  const yr = Math.floor(mon / 12);
  return `${yr}年前`;
}
