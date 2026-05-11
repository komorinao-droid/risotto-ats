import { storage } from '@/utils/storage';
import type {
  MediaCostRepository,
  RemoveMediaCostSourceResult,
  SaveMediaCostDraftResult,
} from '../types';

/**
 * 既存 storage.ts をラップする MediaCostRepository 実装（Phase N-7 で追加）。
 *
 * 責務:
 *  - `data.mediaCosts` (ネストマップ `[ym][src] -> number`) の getAll / saveDraft / removeSource
 *  - parseAmount のルール集約（画面側に再実装させない）
 *  - 月キー pruning の単一実装点
 *
 * 設計上の特徴:
 *  - **base-override なし**（tenant 全体で 1 リスト共有 / 子アカも親と同じ mediaCosts を参照）
 *      → `pickLayer`/`writeLayer`/`removeBaseOverride` を持たない
 *  - **saveDraft は partial merge**: draft に含まれない月/cell は触らない（全置換ではない）
 *  - **全 cell no-op の場合は saveClientData を呼ばない**（無駄 save 回避）
 *  - **removeSource 該当なし時も saveClientData を呼ばない**（無駄 save 回避）
 *  - **getAll は 2 階層 deep copy**: 第 1 階層を `Object.entries().reduce` で展開しつつ各月マップを `{...inner}` で複製
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - `ClientData.mediaCosts` 型は無変更（optional `{ [ym]: { [src]: number } }`）
 *  - Source rename / delete と mediaCosts の連動は本 Repository では行わない（pre-existing orphan、別フェーズ）
 */

/** 1 億円超は誤入力扱い（現実的にあり得ない月次媒体費）。本ファイル内の単一定義点。 */
const MAX_AMOUNT = 100_000_000;
/** 0 / 負数 / 1 億円超 / 数字以外は invalid。本ファイル内の単一定義点。 */
const MIN_AMOUNT = 1;

/**
 * 入力文字列を金額 number に正規化する。
 *  - 全角数字 `０-９` を半角に変換
 *  - カンマ・空白を除去 (`/[,\s]/g`)
 *  - `parseInt(..., 10)`
 *  - `MIN_AMOUNT <= n <= MAX_AMOUNT` のみ valid（それ以外は null）
 *
 * 既存 MediaCostManagement.parseAmount と完全同一ロジック（移植元）。
 */
function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const halfWidth = raw.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const cleaned = halfWidth.replace(/[,\s]/g, '');
  const num = parseInt(cleaned, 10);
  if (!Number.isFinite(num)) return null;
  if (num < MIN_AMOUNT) return null;
  if (num > MAX_AMOUNT) return null;
  return num;
}

export class LocalStorageMediaCostRepository implements MediaCostRepository {
  getAll(clientId: string): { [yearMonth: string]: { [sourceName: string]: number } } {
    const raw = storage.getClientData(clientId).mediaCosts ?? {};
    // 2 階層 deep copy（呼出側 mutate が localStorage に漏れないように）
    const out: { [ym: string]: { [src: string]: number } } = {};
    for (const ym of Object.keys(raw)) {
      out[ym] = { ...(raw[ym] || {}) };
    }
    return out;
  }

  saveDraft(
    clientId: string,
    draft: { [yearMonth: string]: { [sourceName: string]: string } }
  ): SaveMediaCostDraftResult {
    const data = storage.getClientData(clientId);
    const current = data.mediaCosts ?? {};
    // 1 階層目を新規にしつつ、書込対象月のみ第 2 階層も新規化する
    const next: { [ym: string]: { [src: string]: number } } = {};
    for (const ym of Object.keys(current)) {
      next[ym] = { ...(current[ym] || {}) };
    }

    let invalidCount = 0;
    let appliedCells = 0;

    for (const ym of Object.keys(draft)) {
      const monthly = draft[ym] || {};
      const targetMonth = next[ym] ? { ...next[ym] } : {};
      for (const src of Object.keys(monthly)) {
        const raw = monthly[src];
        const trimmed = (raw ?? '').trim();
        const before = targetMonth[src];

        if (trimmed === '') {
          // 明示的クリア: entry が存在していたなら delete + applied++
          if (before !== undefined) {
            delete targetMonth[src];
            appliedCells += 1;
          }
          continue;
        }

        const num = parseAmount(trimmed);
        if (num === null) {
          // invalid: 既存値を削除 + invalidCount++（既存挙動と一致）
          if (before !== undefined) {
            delete targetMonth[src];
            appliedCells += 1;
          }
          invalidCount += 1;
          continue;
        }

        if (before === num) {
          // 既存値と同値: no-op（appliedCells に含めない）
          continue;
        }
        targetMonth[src] = num;
        appliedCells += 1;
      }

      if (Object.keys(targetMonth).length > 0) {
        next[ym] = targetMonth;
      } else {
        // 月内 entry が 0 件: 月キーごと delete（pruning）
        delete next[ym];
      }
    }

    const changed = appliedCells > 0;
    if (changed) {
      storage.saveClientData(clientId, { ...data, mediaCosts: next });
    }

    return { invalidCount, appliedCells, changed };
  }

  removeSource(clientId: string, sourceName: string): RemoveMediaCostSourceResult {
    const data = storage.getClientData(clientId);
    const current = data.mediaCosts ?? {};

    const next: { [ym: string]: { [src: string]: number } } = {};
    let affectedMonths = 0;

    for (const ym of Object.keys(current)) {
      const monthly = current[ym] || {};
      if (!(sourceName in monthly)) {
        // 触らない（既存月マップを参照のまま残す）
        next[ym] = monthly;
        continue;
      }
      affectedMonths += 1;
      const targetMonth = { ...monthly };
      delete targetMonth[sourceName];
      if (Object.keys(targetMonth).length > 0) {
        next[ym] = targetMonth;
      } else {
        // 月内 entry が 0 件: 月キーごと delete（pruning）
      }
    }

    if (affectedMonths === 0) {
      // 該当なし: no-op で save しない
      return { affectedMonths: 0 };
    }

    storage.saveClientData(clientId, { ...data, mediaCosts: next });
    return { affectedMonths };
  }
}
