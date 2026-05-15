import type { RecruitmentOpening, RecruitmentOpeningStatus } from '@/types';
import { storage } from '@/utils/storage';
import { makeOpeningId } from '@/utils/recruitmentOpening';
import type { RecruitmentOpeningRepository } from '../types';

/**
 * 拠点×職種 募集状況 (`RecruitmentOpening`) の LocalStorage 実装 (2026-05 追加, Step 1)。
 *
 * 仕様:
 *  - 1 client 配下の `ClientData.recruitmentOpenings: RecruitmentOpening[]` に対する CRUD を集約
 *  - id は natural key (`${baseSlug}__${jobSlug}`)。重複は (baseName, jobName) 厳密一致で抑止
 *  - 未登録の (baseName, jobName) に対する `getStatus` は `'open'` を返す
 *  - `setStatus` / `bulkSetStatus` は status === 'filled' に遷移する瞬間のみ
 *    filledAt / filledBy を更新する（'filled' のまま再保存しても filledAt は維持）
 *  - 拠点 / 職種削除カスケード用に `removeForBase` / `removeForJob` を提供
 *
 * Firestore マッピング:
 *  - clients/{clientId}/recruitmentOpenings/{openingId}
 *  - openingId は本実装の `id` と完全同一
 */
export class LocalStorageRecruitmentOpeningRepository implements RecruitmentOpeningRepository {
  list(clientId: string): RecruitmentOpening[] {
    const data = storage.getClientData(clientId);
    return (data.recruitmentOpenings || []).map((o) => ({ ...o }));
  }

  get(clientId: string, baseName: string, jobName: string): RecruitmentOpening | undefined {
    const data = storage.getClientData(clientId);
    const found = (data.recruitmentOpenings || []).find(
      (o) => o.baseName === baseName && o.jobName === jobName,
    );
    return found ? { ...found } : undefined;
  }

  getById(clientId: string, id: string): RecruitmentOpening | undefined {
    const data = storage.getClientData(clientId);
    const found = (data.recruitmentOpenings || []).find((o) => o.id === id);
    return found ? { ...found } : undefined;
  }

  getStatus(clientId: string, baseName: string, jobName: string): RecruitmentOpeningStatus {
    const found = this.get(clientId, baseName, jobName);
    return found ? found.status : 'open';
  }

  setStatus(
    clientId: string,
    input: {
      baseName: string;
      jobName: string;
      status: RecruitmentOpeningStatus;
      filledMessageTemplateId?: number;
      operator?: string;
      note?: string;
    },
  ): RecruitmentOpening {
    const data = storage.getClientData(clientId);
    const current = data.recruitmentOpenings || [];
    const now = new Date().toISOString();
    const id = makeOpeningId(input.baseName, input.jobName);

    const idx = current.findIndex(
      (o) => o.baseName === input.baseName && o.jobName === input.jobName,
    );

    let next: RecruitmentOpening;
    let nextList: RecruitmentOpening[];
    if (idx >= 0) {
      const prev = current[idx];
      const transitioningToFilled = prev.status !== 'filled' && input.status === 'filled';
      next = {
        ...prev,
        id, // 既存 id は base/job の slug ベースで一致するはずだが防御的に再計算
        baseName: input.baseName,
        jobName: input.jobName,
        status: input.status,
        filledMessageTemplateId:
          input.filledMessageTemplateId !== undefined
            ? input.filledMessageTemplateId
            : prev.filledMessageTemplateId,
        note: input.note !== undefined ? input.note : prev.note,
        filledAt: transitioningToFilled ? now : prev.filledAt,
        filledBy: transitioningToFilled ? input.operator : prev.filledBy,
        updatedAt: now,
      };
      nextList = current.slice();
      nextList[idx] = next;
    } else {
      next = {
        id,
        baseName: input.baseName,
        jobName: input.jobName,
        status: input.status,
        filledMessageTemplateId: input.filledMessageTemplateId,
        note: input.note,
        filledAt: input.status === 'filled' ? now : undefined,
        filledBy: input.status === 'filled' ? input.operator : undefined,
        createdAt: now,
        updatedAt: now,
      };
      nextList = [...current, next];
    }

    storage.saveClientData(clientId, { ...data, recruitmentOpenings: nextList });
    return { ...next };
  }

  bulkSetStatus(
    clientId: string,
    inputs: Array<{
      baseName: string;
      jobName: string;
      status: RecruitmentOpeningStatus;
      filledMessageTemplateId?: number;
      note?: string;
    }>,
    operator?: string,
  ): RecruitmentOpening[] {
    const data = storage.getClientData(clientId);
    const now = new Date().toISOString();
    const map = new Map<string, RecruitmentOpening>();
    for (const o of data.recruitmentOpenings || []) {
      map.set(`${o.baseName}\u0000${o.jobName}`, o);
    }

    const result: RecruitmentOpening[] = [];
    for (const input of inputs) {
      const key = `${input.baseName}\u0000${input.jobName}`;
      const id = makeOpeningId(input.baseName, input.jobName);
      const prev = map.get(key);
      let next: RecruitmentOpening;
      if (prev) {
        const transitioningToFilled = prev.status !== 'filled' && input.status === 'filled';
        next = {
          ...prev,
          id,
          baseName: input.baseName,
          jobName: input.jobName,
          status: input.status,
          filledMessageTemplateId:
            input.filledMessageTemplateId !== undefined
              ? input.filledMessageTemplateId
              : prev.filledMessageTemplateId,
          note: input.note !== undefined ? input.note : prev.note,
          filledAt: transitioningToFilled ? now : prev.filledAt,
          filledBy: transitioningToFilled ? operator : prev.filledBy,
          updatedAt: now,
        };
      } else {
        next = {
          id,
          baseName: input.baseName,
          jobName: input.jobName,
          status: input.status,
          filledMessageTemplateId: input.filledMessageTemplateId,
          note: input.note,
          filledAt: input.status === 'filled' ? now : undefined,
          filledBy: input.status === 'filled' ? operator : undefined,
          createdAt: now,
          updatedAt: now,
        };
      }
      map.set(key, next);
      result.push(next);
    }

    const nextList = Array.from(map.values());
    storage.saveClientData(clientId, { ...data, recruitmentOpenings: nextList });
    return result.map((o) => ({ ...o }));
  }

  removeForBase(clientId: string, baseName: string): { removed: number } {
    const data = storage.getClientData(clientId);
    const current = data.recruitmentOpenings || [];
    const nextList = current.filter((o) => o.baseName !== baseName);
    const removed = current.length - nextList.length;
    if (removed > 0) {
      storage.saveClientData(clientId, { ...data, recruitmentOpenings: nextList });
    }
    return { removed };
  }

  removeForJob(
    clientId: string,
    jobName: string,
    opts?: { baseName?: string },
  ): { removed: number } {
    const data = storage.getClientData(clientId);
    const current = data.recruitmentOpenings || [];
    const nextList = current.filter((o) => {
      if (o.jobName !== jobName) return true;
      if (opts?.baseName !== undefined && o.baseName !== opts.baseName) return true;
      return false;
    });
    const removed = current.length - nextList.length;
    if (removed > 0) {
      storage.saveClientData(clientId, { ...data, recruitmentOpenings: nextList });
    }
    return { removed };
  }
}
