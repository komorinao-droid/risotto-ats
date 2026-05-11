import type { FilterCondition } from '@/types';
import { storage } from '@/utils/storage';
import type {
  FilterConditionRepository,
  UpdateFilterConditionResult,
} from '../types';

/**
 * 既存 storage.ts をラップする FilterConditionRepository 実装（Phase N-8 で追加）。
 *
 * 責務:
 *  - `data.filterCondition` (legacy 全社共通) の getLegacy
 *  - `data.filterConditions` (base 別) の getByBaseMap / updateForBase
 *  - fallback 解決済み effective FilterCondition の getEffective
 *
 * 設計上の特徴:
 *  - **legacy filterCondition は読み取り fallback 専用**: 書き換え API を提供しない
 *      （AdminApp の設定コピー経路は別、N-8 スコープ外）
 *  - **updateForBase は常に `filterConditions[baseName]` に書く**:
 *      legacy 側は絶対に変更しない（防衛的設計）
 *  - **current = effective**: partial merge の base は `filterConditions[baseName] || legacy || defaultFC`
 *      画面側の現挙動（FilterConditionSettings.tsx L107-116）と完全一致
 *  - **promotedToBaseOverride**: 初回 update（base override 未存在から作成）の判定を返却
 *  - **baseName 空文字は no_base_selected**: 防衛的な早期 return（UI 側でも早期 return しているが二重防御）
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - FilterCondition 型は無変更
 *  - changeStageBulk は本 Repository に取り込まない（呼出側 orchestrator パターン維持）
 *  - applicantRepository.changeStageBulk は画面側 (FilterConditionSettings.executeExclusion) が直接呼ぶ
 */

/**
 * 全 fallback が外れたときの最終 default。
 * 既存 FilterConditionSettings.tsx 内 `defaultFC` (L77-81) と同等。
 * `storage.ts` の新規 client 初期化値（ageEnabled:true / excludeStatus:'対象外' / flagAges:[18,19,50,55]）とは
 * 意図的に異なる（こちらは「何もない」状態の安全なデフォルト）。
 */
const DEFAULT_FC: FilterCondition = {
  ageEnabled: false,
  ageMin: 18,
  ageMax: 65,
  genderFilter: [],
  sourceFilter: [],
  jobFilter: [],
  excludeStatus: '',
  flagAges: [],
};

export class LocalStorageFilterConditionRepository implements FilterConditionRepository {
  getLegacy(clientId: string): FilterCondition {
    const data = storage.getClientData(clientId);
    // data.filterCondition は storage.ts で必ず初期化される前提だが防御的に defaultFC fallback
    return { ...(data.filterCondition ?? DEFAULT_FC) };
  }

  getByBaseMap(clientId: string): { [baseName: string]: FilterCondition } {
    const raw = storage.getClientData(clientId).filterConditions ?? {};
    // 2 階層 deep copy（第 1 階層を新規 + 第 2 階層を {...obj} で複製）
    const out: { [baseName: string]: FilterCondition } = {};
    for (const baseName of Object.keys(raw)) {
      out[baseName] = { ...raw[baseName] };
    }
    return out;
  }

  getEffective(clientId: string, baseName: string): FilterCondition {
    const data = storage.getClientData(clientId);
    const byBase = (data.filterConditions ?? {})[baseName];
    if (byBase) return { ...byBase };
    if (data.filterCondition) return { ...data.filterCondition };
    return { ...DEFAULT_FC };
  }

  updateForBase(
    clientId: string,
    baseName: string,
    partial: Partial<FilterCondition>
  ): UpdateFilterConditionResult {
    if (!baseName) {
      return { ok: false, reason: 'no_base_selected' };
    }
    const data = storage.getClientData(clientId);
    const existing = (data.filterConditions ?? {})[baseName];
    const promotedToBaseOverride = !existing;
    // current は existing → legacy → defaultFC の順 fallback
    const current: FilterCondition = existing
      ? existing
      : data.filterCondition
      ? data.filterCondition
      : DEFAULT_FC;
    const next: FilterCondition = { ...current, ...partial };
    storage.saveClientData(clientId, {
      ...data,
      filterConditions: {
        ...(data.filterConditions ?? {}),
        [baseName]: next,
      },
    });
    return { ok: true, next: { ...next }, promotedToBaseOverride };
  }
}
