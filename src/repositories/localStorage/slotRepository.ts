import type { SlotSetting } from '@/types';
import { storage } from '@/utils/storage';
import type {
  BulkSetCapacityResult,
  RemoveBaseSlotsResult,
  SlotBulkPatch,
  SlotDayCapacity,
  SlotRepository,
} from '../types';

/**
 * 既存 storage.ts をラップする SlotRepository 実装（Phase K-1）。
 *
 * 責務:
 *  - ClientData.slotSettings (拠点 → 日付 → 時刻 → 枠数 の 3 階層 map) の CRUD
 *  - 同値書込 / 空変更を検知して saveClientData を抑制する（無駄な書込防止）
 *
 * 注意:
 *  - localStorage キー (`hireflow:client:${id}:data`) は変更しない
 *  - SlotSetting は updatedAt を持たないため値比較のみで no-op 判定が成立する
 *  - 子アカウントの拠点フィルタは AuthContext 側責務として残す（既存 Repository と同じ）
 *
 * 移行履歴:
 *  - K-1: 型 + LocalStorage 実装の追加（画面未連携）
 *  - K-2: Calendar.setSlotCapacity → setCapacity（予定）
 *  - K-3: Calendar.bulkSetAllSlots → bulkSetCapacity（予定）
 *  - K-4: Calendar.handleBulkApply → bulkSetCapacity（予定）
 *  - K-5: BaseManagement.deleteBase の slotSettings 部分 → removeBase
 *         （BaseRepository フェーズと同時。8 配列カスケードのアトミック性を維持するため）
 */
export class LocalStorageSlotRepository implements SlotRepository {
  listBase(clientId: string, baseName: string): SlotSetting {
    const data = storage.getClientData(clientId);
    return data.slotSettings?.[baseName] ?? {};
  }

  getDay(clientId: string, baseName: string, date: string): SlotDayCapacity {
    const data = storage.getClientData(clientId);
    return data.slotSettings?.[baseName]?.[date] ?? {};
  }

  getCapacity(clientId: string, baseName: string, date: string, time: string): number {
    const data = storage.getClientData(clientId);
    return data.slotSettings?.[baseName]?.[date]?.[time] ?? 0;
  }

  setCapacity(
    clientId: string,
    baseName: string,
    date: string,
    time: string,
    capacity: number,
  ): void {
    const data = storage.getClientData(clientId);
    const slotSettings = data.slotSettings ?? {};
    const baseSlots = slotSettings[baseName] ?? {};
    const daySlots = baseSlots[date] ?? {};
    const prev = daySlots[time] ?? 0;

    // 同値なら no-op（saveClientData を呼ばない）
    if (prev === capacity) return;

    storage.saveClientData(clientId, {
      ...data,
      slotSettings: {
        ...slotSettings,
        [baseName]: {
          ...baseSlots,
          [date]: {
            ...daySlots,
            [time]: capacity,
          },
        },
      },
    });
  }

  bulkSetCapacity(
    clientId: string,
    baseName: string,
    cells: SlotBulkPatch[],
  ): BulkSetCapacityResult {
    if (cells.length === 0) {
      return { updatedCellCount: 0, unchangedCellCount: 0 };
    }

    const data = storage.getClientData(clientId);
    const slotSettings = data.slotSettings ?? {};
    const baseSlots = slotSettings[baseName] ?? {};

    // 既存値を破壊しないよう日単位で shallow copy しながら patch を当てる
    // 同一 date が cells 内に複数あっても 1 つの map に集約される（最後勝ち）
    const nextBaseSlots: SlotSetting = { ...baseSlots };
    let updatedCellCount = 0;
    let unchangedCellCount = 0;

    for (const cell of cells) {
      const prevDay = nextBaseSlots[cell.date] ?? {};
      const prevCapacity = prevDay[cell.time] ?? 0;
      if (prevCapacity === cell.capacity) {
        unchangedCellCount++;
        continue;
      }
      nextBaseSlots[cell.date] = {
        ...prevDay,
        [cell.time]: cell.capacity,
      };
      updatedCellCount++;
    }

    if (updatedCellCount === 0) {
      // 全セル同値だった場合は saveClientData を呼ばない
      return { updatedCellCount: 0, unchangedCellCount };
    }

    storage.saveClientData(clientId, {
      ...data,
      slotSettings: {
        ...slotSettings,
        [baseName]: nextBaseSlots,
      },
    });
    return { updatedCellCount, unchangedCellCount };
  }

  removeBase(clientId: string, baseName: string): RemoveBaseSlotsResult {
    const data = storage.getClientData(clientId);
    const { nextSlotSettings, removedDateCount, removed } = computeRemoveBasePatch(
      data.slotSettings ?? {},
      baseName,
    );
    if (!removed) {
      return { removed: false, removedDateCount: 0 };
    }

    storage.saveClientData(clientId, {
      ...data,
      slotSettings: nextSlotSettings,
    });
    return { removed: true, removedDateCount };
  }
}

/**
 * slotSettings から指定 baseName のキーを除いた次状態を返す pure helper（Phase L-1 で追加）。
 *
 * 用途:
 *  - LocalStorageSlotRepository.removeBase の内部実装
 *  - LocalStorageBaseRepository.deleteWithCascade からも呼び出して、自身の 1 saveClientData
 *    に slotSettings 部分を組み込む（個別 saveClientData を発火させない）
 *
 * 同値時の挙動:
 *  - baseName が slotSettings に存在しない場合は removed=false, removedDateCount=0,
 *    nextSlotSettings は元の参照をそのまま返す（呼出側が saveClientData を抑制できるよう）
 */
export function computeRemoveBasePatch(
  slotSettings: { [baseName: string]: SlotSetting } | undefined,
  baseName: string,
): { nextSlotSettings: { [baseName: string]: SlotSetting }; removedDateCount: number; removed: boolean } {
  const current = slotSettings ?? {};
  const target = current[baseName];
  if (target === undefined) {
    return { nextSlotSettings: current, removedDateCount: 0, removed: false };
  }
  const removedDateCount = Object.keys(target).length;
  const nextSlotSettings: { [baseName: string]: SlotSetting } = { ...current };
  delete nextSlotSettings[baseName];
  return { nextSlotSettings, removedDateCount, removed: true };
}
