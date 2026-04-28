/**
 * 運営側でクライアントごとの統計を計算するヘルパー
 */
import { storage } from '@/utils/storage';
import { getClientLogs } from '@/utils/clientLog';
import type { Client, ClientData, ClientOperationLog } from '@/types';

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
}

export function calcAdminAggregates(clients: Client[], statsMap: { [id: string]: ClientStats }): AdminAggregates {
  const parents = clients.filter((c) => c.accountType === 'parent');
  let totalApplicants = 0;
  let thisMonthApplicants = 0;
  let totalScreeningRuns = 0;
  let thisMonthScreeningRuns = 0;
  let totalChildAccounts = 0;
  let enabledScreening = 0;

  parents.forEach((p) => {
    const s = statsMap[p.id];
    if (!s) return;
    totalApplicants += s.applicantCount;
    thisMonthApplicants += s.thisMonthApplicants;
    totalScreeningRuns += s.screeningRunsTotal;
    thisMonthScreeningRuns += s.screeningRunsThisMonth;
    totalChildAccounts += s.childCount;
    if (s.screeningEnabled) enabledScreening += 1;
  });

  return {
    totalApplicants,
    thisMonthApplicants,
    totalScreeningRuns,
    thisMonthScreeningRuns,
    totalChildAccounts,
    enabledScreening,
    parentCount: parents.length,
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
