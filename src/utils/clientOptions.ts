/**
 * クライアントオプション関連ヘルパー
 *
 * オプションは現状 AIスクリーニング1種のみ。型は拡張可能な形で持つ。
 */
import type { Client, ClientOption, ClientOptionKey } from '@/types';

export const OPTION_LABELS: Record<ClientOptionKey, string> = {
  aiScreening: 'AIスクリーニング',
};

export const OPTION_DEFAULTS: Record<ClientOptionKey, Partial<ClientOption>> = {
  aiScreening: {
    monthlyFee: 10000,
    monthlyLimit: 100,
  },
};

/** 親IDを解決（オプションは親側で管理） */
export function resolveOptionOwnerId(client: Client): string {
  return client.accountType === 'child' && client.parentId ? client.parentId : client.id;
}

/** 指定オプションが有効（active）かどうか */
export function hasActiveOption(client: Client | null | undefined, key: ClientOptionKey): boolean {
  if (!client) return false;
  const opt = client.options?.[key];
  return opt?.status === 'active';
}

/** 当月のYYYY-MM */
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 当月の使用回数を取得 */
export function getOptionUsageThisMonth(option: ClientOption | undefined): number {
  if (!option) return 0;
  return option.usageByMonth?.[currentYearMonth()] || 0;
}

/** 当月の使用回数が上限に達しているか */
export function isOptionLimitReached(option: ClientOption | undefined): boolean {
  if (!option) return false;
  const limit = option.monthlyLimit;
  if (limit == null || limit <= 0) return false; // 上限なし
  return getOptionUsageThisMonth(option) >= limit;
}

/** 残り回数（無制限なら null） */
export function getOptionRemaining(option: ClientOption | undefined): number | null {
  if (!option) return 0;
  if (option.monthlyLimit == null || option.monthlyLimit <= 0) return null;
  return Math.max(0, option.monthlyLimit - getOptionUsageThisMonth(option));
}

/**
 * 当月の使用回数を+1して storage に保存
 * 子アカウントは親側のオプションをカウントアップする
 */
export async function incrementOptionUsage(client: Client, key: ClientOptionKey): Promise<void> {
  const ownerId = resolveOptionOwnerId(client);
  // dynamic import を避けるため呼び出し元で storage を渡す方式にしてもよいが、
  // ここは依存を集約するため直接 import
  const { storage } = await import('@/utils/storage');
  const all = storage.getClients();
  const idx = all.findIndex((c) => c.id === ownerId);
  if (idx < 0) return;
  const target = all[idx];
  const opt: ClientOption = target.options?.[key]
    ? { ...target.options[key]! }
    : { key, status: 'active', usageByMonth: {} };
  const ym = currentYearMonth();
  const usage = { ...(opt.usageByMonth || {}) };
  usage[ym] = (usage[ym] || 0) + 1;
  opt.usageByMonth = usage;
  all[idx] = { ...target, options: { ...(target.options || {}), [key]: opt } };
  storage.saveClients(all);
}
