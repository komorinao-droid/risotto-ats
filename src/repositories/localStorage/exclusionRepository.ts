import type { ExclusionEntry } from '@/types';
import { storage } from '@/utils/storage';
import type { ExclusionAddResult, ExclusionRepository } from '../types';

/**
 * 既存 storage.ts をラップする ExclusionRepository 実装（Phase N-6 で追加）。
 *
 * 責務:
 *  - `data.exclusionList` の list / add / remove
 *  - dedup 判定の Repository 内集約（画面側に再実装させない）
 *
 * 設計上の特徴:
 *  - **base-override なし**（tenant 全体で 1 リスト共有 / 子アカも親と同じ exclusionList を参照）
 *      → `pickLayer`/`writeLayer`/`removeBaseOverride` を持たない / `applicantBaseFilter` opt も不要
 *  - **changeStageBulk は本 Repository に取り込まない**:
 *      add 成功後の「該当 applicant の一括除外」は `applicantRepository.changeStageBulk` を呼出側で続けて呼ぶ責務。
 *      Firestore 化時に 1 transaction 化を別 API として検討予定（firestore-design §4.1）
 *  - **applicantRepository.delete の cleanup は据え置き**:
 *      `applicantRepository.delete` 内の `(ex as { applicantId?: number }).applicantId === applicantId` 一致 cascade は
 *      既存 Repository に閉じ込め継続。本 Repository には cleanupByApplicantId 等は作らない
 *  - **add は dedup ヒット時に saveClientData を呼ばない**:
 *      `{ok:false, reason:'duplicate'}` を返すのみで localStorage 書込ゼロ（無駄 save 回避）
 *  - **remove は該当なし時に saveClientData を呼ばない**: 無駄 save 回避
 *
 * dedup 正規化ルール:
 *  - email: 両側 `.toLowerCase()` 後一致
 *  - phone: 両側 `/[-\s]/g` で除去後一致
 *  - name_birth: name + birthDate 完全一致
 *  - type が異なるエントリ同士は別物として扱う
 *  - 既存 ExclusionList.addEntry の判定ロジックと完全一致（移植元）
 *
 * id 採番:
 *  - `max(...existing.map(e => e.id))` + 1。空配列時は reduce 初期値 0 → 新規 id=1
 *  - 既存 ExclusionList.addEntry と完全一致
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - ExclusionEntry 型への `applicantId?` 追加は行わない（旧データ互換の隠しフィールドとして既存挙動維持）
 *  - 入力 entry の trim / null 除去は呼出側責務（既存 ExclusionList が UI 入力時に trim 済の値を渡してくる前提）
 */
export class LocalStorageExclusionRepository implements ExclusionRepository {
  list(clientId: string): ExclusionEntry[] {
    return [...(storage.getClientData(clientId).exclusionList ?? [])];
  }

  add(clientId: string, entry: Omit<ExclusionEntry, 'id'>): ExclusionAddResult {
    const data = storage.getClientData(clientId);
    const list = data.exclusionList ?? [];

    const duplicate = list.find((e) => isDuplicate(e, entry));
    if (duplicate) {
      return { ok: false, reason: 'duplicate' };
    }

    const maxId = list.reduce((m, e) => Math.max(m, e.id), 0);
    const created: ExclusionEntry = { id: maxId + 1, ...entry };
    storage.saveClientData(clientId, { ...data, exclusionList: [...list, created] });
    return { ok: true, entry: created };
  }

  remove(clientId: string, id: number): void {
    const data = storage.getClientData(clientId);
    const list = data.exclusionList ?? [];
    const next = list.filter((e) => e.id !== id);
    if (next.length === list.length) {
      // 該当なし: no-op で save しない
      return;
    }
    storage.saveClientData(clientId, { ...data, exclusionList: next });
  }
}

/**
 * dedup 判定（Repository 内部のみで使用）。
 * type が異なる entry 同士は常に false。
 */
function isDuplicate(existing: ExclusionEntry, candidate: Omit<ExclusionEntry, 'id'>): boolean {
  if (existing.type !== candidate.type) return false;
  if (candidate.type === 'email') {
    return (existing.email ?? '').toLowerCase() === (candidate.email ?? '').toLowerCase();
  }
  if (candidate.type === 'phone') {
    const norm = (s: string | undefined) => (s ?? '').replace(/[-\s]/g, '');
    return norm(existing.phone) === norm(candidate.phone);
  }
  // name_birth
  return existing.name === candidate.name && existing.birthDate === candidate.birthDate;
}
