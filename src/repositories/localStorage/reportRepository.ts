import { storage } from '@/utils/storage';
import type { ReportRepository } from '../types';

/**
 * 採用レポート関連の永続化操作。
 * 現状は recruitmentGoals のみ管理（既存 ClientData 内に格納）。
 *
 * 将来:
 *  - monthlyStats キャッシュを clients/{id}/monthlyStats/{ym} 構造で持たせる
 *  - その際 Repository を Firestore 実装に差し替えるだけで済むよう、
 *    画面側は updateRecruitmentGoal() / getRecruitmentGoals() 経由で完結させる
 */
export class LocalStorageReportRepository implements ReportRepository {
  getRecruitmentGoals(clientId: string): Record<string, number> {
    const data = storage.getClientData(clientId);
    return { ...(data.recruitmentGoals || {}) };
  }

  updateRecruitmentGoal(clientId: string, yearMonth: string, value: number): void {
    const data = storage.getClientData(clientId);
    const next = { ...(data.recruitmentGoals || {}) };
    if (value > 0) {
      next[yearMonth] = value;
    } else {
      delete next[yearMonth];
    }
    storage.saveClientData(clientId, { ...data, recruitmentGoals: next });
  }
}
