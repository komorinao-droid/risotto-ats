import type { MessageLog, MessageStatus } from '@/types';
import { storage } from '@/utils/storage';
import type { MessageRepository } from '../types';

/**
 * LocalStorage ベースの MessageRepository 実装（2026-05 追加）。
 *
 * 方針:
 *  - ClientData.messageLogs に push する形で保持
 *  - 既存の smsLogs / emailLogs は触らない（後方互換維持）
 *  - 実際の SMS / メール送信処理はここで行わない（外部プロバイダ呼び出しなし）
 *  - 将来 Firestore / Cloud SQL に切り替える際は本クラスを差し替える
 */
export class LocalStorageMessageRepository implements MessageRepository {
  listByApplicant(clientId: string, applicantId: number): MessageLog[] {
    const data = storage.getClientData(clientId);
    const logs = data.messageLogs ?? [];
    return logs
      .filter((m) => m.applicantId === applicantId)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  create(
    clientId: string,
    log: Omit<MessageLog, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<MessageLog, 'id' | 'createdAt' | 'updatedAt'>>,
  ): MessageLog {
    const data = storage.getClientData(clientId);
    const now = new Date().toISOString();
    const enriched: MessageLog = {
      ...log,
      id: log.id ?? generateId(),
      createdAt: log.createdAt ?? now,
      updatedAt: log.updatedAt ?? now,
    };
    storage.saveClientData(clientId, {
      ...data,
      messageLogs: [...(data.messageLogs ?? []), enriched],
    });
    return enriched;
  }

  updateStatus(
    clientId: string,
    messageId: string,
    status: MessageStatus,
    patch?: Partial<MessageLog>,
  ): MessageLog | undefined {
    const data = storage.getClientData(clientId);
    const list = data.messageLogs ?? [];
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx < 0) return undefined;
    const now = new Date().toISOString();
    const merged: MessageLog = {
      ...list[idx],
      ...(patch ?? {}),
      // patch で id / createdAt が上書きされないようにガード
      id: list[idx].id,
      createdAt: list[idx].createdAt,
      status,
      updatedAt: now,
    };
    const next = list.slice();
    next[idx] = merged;
    storage.saveClientData(clientId, { ...data, messageLogs: next });
    return merged;
  }

  listRecent(clientId: string, limit = 50): MessageLog[] {
    const data = storage.getClientData(clientId);
    const logs = data.messageLogs ?? [];
    return logs
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(0, limit));
  }
}

/**
 * 連絡ログ用の簡易 ID 生成。
 * 衝突確率は実用上十分低い（時刻 + ランダム）。
 * Firestore 等に移行する際は採番方式を差し替える。
 */
function generateId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `msg_${Date.now().toString(36)}_${rand}`;
}
