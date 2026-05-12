import type { ScoringAxis, ScreeningCriteria, ScreeningCriteriaBody } from '@/types';
import { storage } from '@/utils/storage';
import { ensureAxisImportance, migrateToAxes, normalizeWeights } from '@/utils/screeningDefaults';
import type { ScreeningRepository } from '../types';

/**
 * 既存 storage.ts をラップする ScreeningRepository 実装（Phase N-9 で追加）。
 *
 * 責務:
 *  - `data.screeningCriteria` の getGlobal（migrate + normalize 済み）
 *  - 職種別 fallback 解決済み getForJob
 *  - hasJobOverride
 *  - 全社設定の saveAll（normalize のみ、migrate しない）
 *
 * 設計上の特徴:
 *  - **未設定時は null 返却**: `defaultCriteria()` 相当を勝手に返さない（UI 責務）
 *  - **getGlobal で migrate + normalize 集約**:
 *      `migrateToAxes` → `ensureAxisImportance` → `normalizeWeights` を全社 / byJob 各 body に適用
 *      （v1 テキストのみの override も axes に昇格する）
 *  - **saveAll は normalize のみ**: UI 側 form state は既に v2 形式の前提
 *  - **deep copy**: 全階層 deep copy で mutate isolation
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - `enabled / passThreshold / rejectThreshold` は全社のみ（職種別で上書きしない）
 *  - `baseScope.ts` の `resolveScreeningCriteria` / `hasScreeningJobOverride` は本 Repository 移行後も残置
 *      （他の base-override ヘルパと同居しているため、N-10 完了後にまとめて整理検討）
 *  - `migrateToAxes` の中で `genId('ax_')` が呼ばれる（v1 テキストのみ → 1 軸生成経路）。
 *      Repository 呼出のたびに新 id が生成される副作用があるが、`saveAll` 経由で永続化されるまでは
 *      画面側 form state が握り続けるため、再 read で id が変わっても UI には影響しない。
 *      Firestore 化時もこの挙動は不変（migration はクライアント側で 1 回実行 → 保存後は安定）。
 */
export class LocalStorageScreeningRepository implements ScreeningRepository {
  getGlobal(clientId: string): ScreeningCriteria | null {
    const c = storage.getClientData(clientId).screeningCriteria;
    if (!c) return null;
    return migrateAndNormalize(c);
  }

  getForJob(clientId: string, jobName?: string): ScreeningCriteria | null {
    const c = this.getGlobal(clientId);
    if (!c) return null;
    if (!jobName) return c;
    const o = c.byJob?.[jobName];
    if (!o) return c;
    // 職種別 axes が存在し空配列でない場合のみ採用、空配列なら親 axes 継承
    const useJobAxes = o.axes && o.axes.length > 0;
    return {
      ...c,
      evaluationPoints: o.evaluationPoints,
      requiredQualities: o.requiredQualities,
      ngQualities: o.ngQualities,
      axes: useJobAxes ? o.axes!.map(cloneAxis) : (c.axes ? c.axes.map(cloneAxis) : c.axes),
    };
  }

  hasJobOverride(clientId: string, jobName: string): boolean {
    const c = storage.getClientData(clientId).screeningCriteria;
    return !!c?.byJob?.[jobName];
  }

  saveAll(clientId: string, criteria: ScreeningCriteria): ScreeningCriteria {
    const normalizedAxes = criteria.axes
      ? normalizeWeights(criteria.axes.map(cloneAxis))
      : criteria.axes;
    const normalizedByJob = criteria.byJob
      ? Object.fromEntries(
          Object.entries(criteria.byJob).map(([k, v]) => [k, normalizeBody(v)])
        )
      : criteria.byJob;
    const next: ScreeningCriteria = {
      ...criteria,
      axes: normalizedAxes,
      byJob: normalizedByJob,
    };
    const data = storage.getClientData(clientId);
    storage.saveClientData(clientId, { ...data, screeningCriteria: next });
    // 戻り値は別 deep copy（呼出側 mutate が storage に漏れない）
    return deepCopyCriteria(next);
  }
}

/**
 * 全社 + byJob を migrate + normalize して deep copy で返す。
 *  - 全社 axes: `migrateToAxes` (ensureAxisImportance 含む) → `normalizeWeights`
 *  - byJob 各 body: `migrateByJobBody` で職種別固有の継承セマンティクスを保つ
 */
function migrateAndNormalize(c: ScreeningCriteria): ScreeningCriteria {
  const axes = normalizeWeights(ensureAxisImportance(migrateToAxes(c)));
  const byJob = c.byJob
    ? Object.fromEntries(
        Object.entries(c.byJob).map(([k, v]) => [k, migrateByJobBody(v)])
      )
    : undefined;
  return { ...c, axes, byJob };
}

/**
 * byJob[jobName] の body を migrate + normalize する。
 *
 * 既存 `resolveScreeningCriteria` の継承セマンティクス (`axes && axes.length > 0 ? o.axes : criteria.axes`)
 * を維持するため、`migrateToAxes` を直接適用せず分岐する:
 *  - axes が空配列 `[]` → 「明示的に global 継承」シグナルとして空配列のまま保持
 *  - axes が非空配列 → `ensureAxisImportance` + `normalizeWeights` のみ適用（migrate 不要）
 *  - axes が undefined + v1 テキストあり → `migrateToAxes` で 1 軸に昇格（職種別 override として扱う）
 *  - axes が undefined + v1 テキスト無し → undefined のまま（global 継承）
 */
function migrateByJobBody(v: ScreeningCriteriaBody): ScreeningCriteriaBody {
  let axes: ScoringAxis[] | undefined;
  if (Array.isArray(v.axes)) {
    if (v.axes.length === 0) {
      // 空配列は global 継承シグナルとして保持
      axes = [];
    } else {
      axes = normalizeWeights(ensureAxisImportance(v.axes.map(cloneAxis)));
    }
  } else {
    const hasV1 = v.evaluationPoints || v.requiredQualities || v.ngQualities;
    if (hasV1) {
      axes = normalizeWeights(ensureAxisImportance(migrateToAxes(v)));
    } else {
      axes = undefined;
    }
  }
  return {
    evaluationPoints: v.evaluationPoints ?? '',
    requiredQualities: v.requiredQualities ?? '',
    ngQualities: v.ngQualities ?? '',
    axes,
  };
}

function normalizeBody(v: ScreeningCriteriaBody): ScreeningCriteriaBody {
  return {
    evaluationPoints: v.evaluationPoints,
    requiredQualities: v.requiredQualities,
    ngQualities: v.ngQualities,
    axes: v.axes ? normalizeWeights(v.axes.map(cloneAxis)) : v.axes,
  };
}

function cloneAxis(a: ScoringAxis): ScoringAxis {
  return {
    ...a,
    requirements: a.requirements.map((it) => ({ ...it })),
    preferences: a.preferences.map((it) => ({ ...it })),
    avoidances: a.avoidances.map((it) => ({ ...it })),
  };
}

function deepCopyCriteria(c: ScreeningCriteria): ScreeningCriteria {
  return {
    ...c,
    axes: c.axes ? c.axes.map(cloneAxis) : c.axes,
    byJob: c.byJob
      ? Object.fromEntries(
          Object.entries(c.byJob).map(([k, v]) => [
            k,
            {
              evaluationPoints: v.evaluationPoints,
              requiredQualities: v.requiredQualities,
              ngQualities: v.ngQualities,
              axes: v.axes ? v.axes.map(cloneAxis) : v.axes,
            },
          ])
        )
      : c.byJob,
  };
}
