/**
 * クライアント操作者の表示名（operator）を生成する純粋関数。
 *
 * 用途:
 *  - StageHistoryEntry.operator
 *  - logAction の操作者カラム（将来の集約候補）
 *
 * 仕様:
 *  - parent: contactName があればそれを優先、なければ companyName
 *  - child : `${companyName} / ${baseName}`（baseName が無ければ companyName のみ）
 *  - client が null/undefined または必須フィールドが空なら空文字を返す
 *
 * 注意:
 *  - companyName が空の Client はデータ異常だが、UI を落とさないため空文字 fallback。
 *  - 表示用途のみ。一意キーとしては使わない（同一拠点の複数担当者を区別できないため）。
 */
import type { Client } from '@/types';

export function getClientOperatorLabel(
  client: Pick<Client, 'accountType' | 'companyName' | 'contactName' | 'baseName'> | null | undefined,
): string {
  if (!client) return '';
  const company = client.companyName ?? '';
  if (client.accountType === 'parent') {
    return client.contactName || company;
  }
  // child
  if (!company) return client.baseName ?? '';
  return client.baseName ? `${company} / ${client.baseName}` : company;
}
