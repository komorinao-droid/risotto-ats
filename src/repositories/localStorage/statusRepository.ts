import type { Status } from '@/types';
import { storage } from '@/utils/storage';
import type { StatusRepository } from '../types';

/**
 * 既存 storage.ts をラップする StatusRepository 実装。
 *
 * 注意:
 *  - applicants 側のカスケード処理（stage クリア / stageHistory 掃除）は本 Repository では行わない。
 *    削除に伴うカスケードは呼び出し側で `applicantRepository.clearStageForDeletedStatus` を併用する。
 *  - 変更がない場合は localStorage への書き込みを行わない（無駄な save を避ける）。
 *  - 既存 StatusManagement の振る舞い互換のため、name ベースで参照する API を提供する。
 */
export class LocalStorageStatusRepository implements StatusRepository {
  list(clientId: string): Status[] {
    return storage.getClientData(clientId).statuses ?? [];
  }

  save(clientId: string, statuses: Status[]): void {
    const data = storage.getClientData(clientId);
    storage.saveClientData(clientId, { ...data, statuses });
  }

  upsert(clientId: string, status: Status): void {
    const data = storage.getClientData(clientId);
    const list = data.statuses ?? [];
    const idx = list.findIndex((s) => s.name === status.name);

    if (idx >= 0) {
      // 名前一致: 既存 id / order は尊重し、その他フィールドをマージ
      const current = list[idx];
      const merged: Status = {
        ...current,
        ...status,
        id: current.id,
        order: current.order,
      };
      // 内容が完全一致なら save しない
      if (
        merged.name === current.name &&
        merged.color === current.color &&
        merged.active === current.active &&
        merged.category === current.category &&
        merged.subStatuses.length === current.subStatuses.length &&
        merged.subStatuses.every((s, i) => s === current.subStatuses[i])
      ) {
        return;
      }
      const next = list.slice();
      next[idx] = merged;
      storage.saveClientData(clientId, { ...data, statuses: next });
      return;
    }

    // 新規追加: id / order は status に値があれば尊重、無ければ自動採番
    const maxId = list.reduce((m, s) => Math.max(m, s.id), 0);
    const maxOrder = list.reduce((m, s) => Math.max(m, s.order), 0);
    const newStatus: Status = {
      ...status,
      id: status.id && status.id > 0 ? status.id : maxId + 1,
      order: status.order && status.order > 0 ? status.order : maxOrder + 1,
      subStatuses: status.subStatuses ?? [],
    };
    storage.saveClientData(clientId, { ...data, statuses: [...list, newStatus] });
  }

  remove(clientId: string, name: string): void {
    const data = storage.getClientData(clientId);
    const list = data.statuses ?? [];
    const next = list.filter((s) => s.name !== name);
    if (next.length === list.length) return; // 該当なし: no-op
    storage.saveClientData(clientId, { ...data, statuses: next });
  }

  toggleActive(clientId: string, name: string): void {
    const data = storage.getClientData(clientId);
    const list = data.statuses ?? [];
    const idx = list.findIndex((s) => s.name === name);
    if (idx < 0) return; // 該当なし: no-op
    const next = list.slice();
    next[idx] = { ...next[idx], active: !next[idx].active };
    storage.saveClientData(clientId, { ...data, statuses: next });
  }

  moveOrder(clientId: string, name: string, direction: 'up' | 'down'): void {
    const data = storage.getClientData(clientId);
    const list = data.statuses ?? [];
    // 現在の order 昇順で並び替え基準を決める
    const sorted = [...list].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.name === name);
    if (idx < 0) return; // 該当なし: no-op
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return; // 端: no-op

    const target = sorted[idx];
    const swap = sorted[swapIdx];
    // 元配列の参照位置を維持したまま order だけ入れ替える
    const next = list.map((s) => {
      if (s.id === target.id) return { ...s, order: swap.order };
      if (s.id === swap.id) return { ...s, order: target.order };
      return s;
    });
    storage.saveClientData(clientId, { ...data, statuses: next });
  }

  addSubStatus(clientId: string, parentName: string, subStatus: string): void {
    const trimmed = subStatus.trim();
    if (!trimmed) return; // 空文字: no-op
    const data = storage.getClientData(clientId);
    const list = data.statuses ?? [];
    const idx = list.findIndex((s) => s.name === parentName);
    if (idx < 0) return; // 親なし: no-op
    const parent = list[idx];
    if (parent.subStatuses.includes(trimmed)) return; // 重複: no-op
    const next = list.slice();
    next[idx] = { ...parent, subStatuses: [...parent.subStatuses, trimmed] };
    storage.saveClientData(clientId, { ...data, statuses: next });
  }

  removeSubStatus(clientId: string, parentName: string, subStatus: string): void {
    const data = storage.getClientData(clientId);
    const list = data.statuses ?? [];
    const idx = list.findIndex((s) => s.name === parentName);
    if (idx < 0) return; // 親なし: no-op
    const parent = list[idx];
    if (!parent.subStatuses.includes(subStatus)) return; // 該当なし: no-op
    const next = list.slice();
    next[idx] = { ...parent, subStatuses: parent.subStatuses.filter((ss) => ss !== subStatus) };
    storage.saveClientData(clientId, { ...data, statuses: next });
  }
}
