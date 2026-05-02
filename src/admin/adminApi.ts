/**
 * 運営管理画面用の API クライアント。
 *
 * - x-admin-secret ヘッダを付与（最小構成では VITE_API_SECRET と同値）
 * - 失敗時は throw、UI 側で catch してメッセージ表示
 */

const ADMIN_SECRET = (import.meta as any).env?.VITE_ADMIN_SECRET as string | undefined;
const FALLBACK_SECRET = (import.meta as any).env?.VITE_API_SECRET as string | undefined;

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const secret = ADMIN_SECRET || FALLBACK_SECRET;
  if (secret) headers['x-admin-secret'] = secret;
  return headers;
}

export interface ApiUsageSummary {
  totalCalls: number;
  failed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalUsd: number;
  byClient: Array<{ clientId: string; calls: number; failed: number; inputTokens: number; outputTokens: number; estimatedUsd: number }>;
  byPurpose: Array<{ purpose: string; calls: number; estimatedUsd: number }>;
  bufferSize: number;
  bufferLimit: number;
  yearMonth: string | null;
  /** 永続化先パス（未設定なら null = サーバー再起動でリセット） */
  persistencePath?: string | null;
}

export interface ApiUsageRecentEntry {
  id: number;
  calledAt: string;
  clientId: string;
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  estimatedUsd: number;
  applicantId?: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export async function fetchApiUsageSummary(yearMonth?: string): Promise<ApiUsageSummary> {
  const url = `/api/admin/api-usage${yearMonth ? `?yearMonth=${encodeURIComponent(yearMonth)}` : ''}`;
  const resp = await fetch(url, { headers: buildHeaders() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  return resp.json();
}

export async function fetchApiUsageRecent(limit = 100): Promise<ApiUsageRecentEntry[]> {
  const resp = await fetch(`/api/admin/api-usage/recent?limit=${limit}`, { headers: buildHeaders() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  const data = await resp.json();
  return data.entries || [];
}

// ─── 機能キルスイッチ ───

export type FeatureKey =
  | 'aiScreening'
  | 'recruitmentReport'
  | 'emailSend'
  | 'smsSend'
  | 'chatbot'
  | 'webhookDelivery';

export type KillSwitchFlags = Partial<Record<FeatureKey, boolean>>;

export interface KillSwitchesResponse {
  clients: Record<string, KillSwitchFlags>;
  storePath: string | null;
}

export async function fetchKillSwitches(): Promise<KillSwitchesResponse> {
  const resp = await fetch('/api/admin/kill-switches', { headers: buildHeaders() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  return resp.json();
}

export async function updateKillSwitches(clientId: string, flags: KillSwitchFlags): Promise<KillSwitchFlags> {
  const resp = await fetch(`/api/admin/kill-switches/${encodeURIComponent(clientId)}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify({ flags }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  const data = await resp.json();
  return data.flags || {};
}
