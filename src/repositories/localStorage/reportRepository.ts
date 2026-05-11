import type { ReportScheduleSetting } from '@/types';
import { storage } from '@/utils/storage';
import type { ReportRepository } from '../types';

/**
 * 採用レポート関連の永続化操作。
 * 現状は recruitmentGoals と reportSchedule を管理（既存 ClientData 内に格納）。
 *
 * N-5 で reportSchedule の get/save を追加（singleton 設定型 / 保存ボタン式 / debounce なし）。
 *
 * 将来:
 *  - monthlyStats キャッシュを clients/{id}/monthlyStats/{ym} 構造で持たせる
 *  - その際 Repository を Firestore 実装に差し替えるだけで済むよう、
 *    画面側は updateRecruitmentGoal() / getRecruitmentGoals() / getReportSchedule() / saveReportSchedule() 経由で完結させる
 *  - lastRun* 専用 API（markRunSuccess / markRunFailure）は配信エンジン稼働時に追加候補
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

  getReportSchedule(clientId: string): ReportScheduleSetting | undefined {
    return storage.getClientData(clientId).reportSchedule;
  }

  saveReportSchedule(clientId: string, setting: ReportScheduleSetting): void {
    const data = storage.getClientData(clientId);
    storage.saveClientData(clientId, { ...data, reportSchedule: setting });
  }
}
