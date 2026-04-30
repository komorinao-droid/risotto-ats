/**
 * SMS送信に関する共通定数とヘルパー
 */
import type { Client, SmsLog } from '@/types';

/** プラン別 月間SMS送信上限（無制限は -1）。今後設定変更可能にする想定。 */
export const SMS_MONTHLY_LIMIT: Record<Client['plan'], number> = {
  trial: 100,
  standard: 500,
  professional: 3000,
  enterprise: -1, // 無制限
};

/** 上限超過分の単価（円/通） */
export const SMS_OVERAGE_UNIT_PRICE = 15;

/** プラン別 上限ラベル */
export function smsLimitLabel(plan: Client['plan']): string {
  const limit = SMS_MONTHLY_LIMIT[plan];
  return limit < 0 ? '無制限' : `${limit.toLocaleString('ja-JP')}通/月`;
}

/** YYYY-MM プレフィックスでログをフィルタ */
export function smsLogsInMonth(logs: SmsLog[] | undefined, yearMonth: string): SmsLog[] {
  if (!logs) return [];
  return logs.filter((l) => l.sentAt.startsWith(yearMonth));
}

/** 当月の送信成功数 */
export function smsSuccessCountThisMonth(logs: SmsLog[] | undefined, yearMonth: string): number {
  return smsLogsInMonth(logs, yearMonth).filter((l) => l.status === 'success').length;
}

/** プランの上限を超過した数（マイナスなら未到達） */
export function smsOverage(plan: Client['plan'], successCount: number): number {
  const limit = SMS_MONTHLY_LIMIT[plan];
  if (limit < 0) return 0; // 無制限
  return Math.max(0, successCount - limit);
}

/** 超過課金額 (円) */
export function smsOverageCharge(plan: Client['plan'], successCount: number): number {
  return smsOverage(plan, successCount) * SMS_OVERAGE_UNIT_PRICE;
}

/** 当月の YYYY-MM */
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
