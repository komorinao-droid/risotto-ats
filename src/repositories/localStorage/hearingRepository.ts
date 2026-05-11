import type { HearingTemplate } from '@/types';
import { storage } from '@/utils/storage';
import type { HearingRepository } from '../types';

/**
 * 既存 storage.ts をラップする HearingRepository 実装（Phase N-4 で追加）。
 *
 * 責務:
 *  - `data.hearingTemplates` の list / upsert（jobName キー）
 *
 * 設計上の特徴:
 *  - HearingTemplate は **id を持たない / jobName 文字列がキー**
 *      → API は `upsert(clientId, jobName, templateBody)` の単一エントリポイント
 *  - **base-override なし**（`AuthContext.filterDataByBase` は hearingTemplates を触らないため、
 *    `data.hearingTemplatesByBase` は存在しない / 追加もしない）
 *      → `pickLayer`/`writeLayer`/`removeBaseOverride` を持たない
 *  - **削除カスケードなし**（applicants にヒアリング参照フィールドが存在しない）
 *      → `applicantBaseFilter` opt も不要
 *  - **削除 API は提供しない**（HearingManagement に削除 UI がない / Job 削除カスケード連携は別フェーズ）
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - HearingTemplate 型への id / baseName 追加正規化は行わない（既存形状を維持）
 *  - debounce auto-save / 手動保存ボタン / saveState UX は呼出側 (HearingManagement.tsx) の責務。
 *    Repository は同期 API のまま
 *  - 既存 HearingManagement.doSave 互換:
 *      - 一致あり + template 同値: 既存も `data.hearingTemplates` を slice したうえで同値書込 → save 経路に進んでいた。
 *        Repository 化に伴い完全一致時のみ saveClientData を呼ばない最適化を入れる
 *        （データ的には等価で、無駄な書込が消える方向の差分のみ）
 *      - 一致なし: 末尾 push（既存挙動と完全一致）
 *      - applicants は触らない（既存挙動と一致）
 */
export class LocalStorageHearingRepository implements HearingRepository {
  list(clientId: string): HearingTemplate[] {
    return storage.getClientData(clientId).hearingTemplates ?? [];
  }

  upsert(clientId: string, jobName: string, templateBody: string): HearingTemplate {
    const data = storage.getClientData(clientId);
    const list = data.hearingTemplates ?? [];
    const idx = list.findIndex((h) => h.jobName === jobName);

    if (idx >= 0) {
      const current = list[idx];
      if (current.template === templateBody) {
        // no-op 短絡: 完全一致時は saveClientData を呼ばない
        return current;
      }
      const next: HearingTemplate = { ...current, template: templateBody };
      const nextList = list.slice();
      nextList[idx] = next;
      storage.saveClientData(clientId, { ...data, hearingTemplates: nextList });
      return next;
    }

    const created: HearingTemplate = { jobName, template: templateBody };
    storage.saveClientData(clientId, { ...data, hearingTemplates: [...list, created] });
    return created;
  }
}
