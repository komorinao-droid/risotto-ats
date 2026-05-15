import type { Base } from '@/types';
import { storage } from '@/utils/storage';
import type {
  BaseRepository,
  DeleteBaseCascadeResult,
} from '../types';
import { computeRemoveBasePatch } from './slotRepository';
import { LocalStorageClientRepository } from './clientRepository';

/**
 * 既存 storage.ts をラップする BaseRepository 実装（Phase L-1 で追加）。
 *
 * 責務:
 *  - bases 配列の CRUD（list / get / findByName / create / update）
 *  - 拠点削除カスケード（deleteWithCascade）— 8 配列 + child アカウント baseName の片付けを集約
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data` と clients）
 *  - rename カスケード（name 変更時の関連配列追従）は行わない（既存 BaseManagement と互換）
 *  - applicants[].base クリア時に updatedAt は touch しない（既存 deleteBase と互換）
 *  - 子アカウントの baseName クリアは clientRepository.detachChildBaseName 経由
 *    （ClientRepository は他 Repository を呼ばないため循環依存は発生しない）
 *
 * 移行履歴:
 *  - L-1: 型 + LocalStorage 実装の追加（画面未連携）
 *  - L-2: BaseManagement.save / Calendar.saveBaseSettings → create / update（予定）
 *  - L-3: BaseManagement.deleteBase → deleteWithCascade（予定）
 *  - M-3: child account baseName クリアを clientRepository.detachChildBaseName 経由に置換
 */
export class LocalStorageBaseRepository implements BaseRepository {
  // ClientRepository は storage しか触らない薄いラッパなので循環依存なし。
  // インスタンスはシングルトン (src/repositories/index.ts) と別だが、状態を持たないため副作用なし。
  private readonly clientRepo = new LocalStorageClientRepository();

  list(clientId: string): Base[] {
    return storage.getClientData(clientId).bases ?? [];
  }

  get(clientId: string, baseId: number): Base | undefined {
    return this.list(clientId).find((b) => b.id === baseId);
  }

  findByName(clientId: string, baseName: string): Base | undefined {
    return this.list(clientId).find((b) => b.name === baseName);
  }

  create(clientId: string, base: Omit<Base, 'id'>): Base {
    const data = storage.getClientData(clientId);
    const list = data.bases ?? [];
    const nextId = list.reduce((mx, b) => Math.max(mx, b.id), 0) + 1;
    const created: Base = { ...base, id: nextId };
    storage.saveClientData(clientId, {
      ...data,
      bases: [...list, created],
    });
    return created;
  }

  update(
    clientId: string,
    baseId: number,
    patch: Partial<Omit<Base, 'id'>>,
  ): Base | undefined {
    const data = storage.getClientData(clientId);
    const list = data.bases ?? [];
    const idx = list.findIndex((b) => b.id === baseId);
    if (idx < 0) return undefined;

    const current = list[idx];
    // patch に id が紛れ込んでも握りつぶす
    const { id: _ignored, ...safePatch } = patch as Partial<Base>;
    const next: Base = { ...current, ...safePatch, id: current.id };

    // 同値判定: 全フィールド一致なら saveClientData を呼ばない
    const changed = (Object.keys(safePatch) as Array<keyof Base>).some(
      (k) => current[k] !== next[k],
    );
    if (!changed) return current;

    const nextList = list.slice();
    nextList[idx] = next;
    storage.saveClientData(clientId, {
      ...data,
      bases: nextList,
    });
    return next;
  }

  deleteWithCascade(clientId: string, baseId: number): DeleteBaseCascadeResult {
    const data = storage.getClientData(clientId);
    const list = data.bases ?? [];
    const target = list.find((b) => b.id === baseId);
    if (!target) {
      return {
        removed: false,
        clearedApplicantBaseCount: 0,
        removedEventCount: 0,
        removedSlotDateCount: 0,
        removedJobsByBase: false,
        removedSourcesByBase: false,
        removedEmailTemplatesByBase: false,
        removedFilterCondition: false,
        detachedChildAccountCount: 0,
        removedRecruitmentOpeningCount: 0,
      };
    }

    const baseName = target.name;

    // ── ClientData 側 8 配列を 1 saveClientData にまとめる (Step 1 で recruitmentOpenings 追加) ──
    const nextBases = list.filter((b) => b.id !== baseId);

    // applicants[].base === baseName を '' にクリア（updatedAt は touch しない）
    const applicants = data.applicants ?? [];
    let clearedApplicantBaseCount = 0;
    const nextApplicants = applicants.map((a) => {
      if (a.base === baseName) {
        clearedApplicantBaseCount++;
        return { ...a, base: '' };
      }
      return a;
    });

    // events から base 一致を全削除
    const events = data.events ?? [];
    const nextEvents = events.filter((e) => e.base !== baseName);
    const removedEventCount = events.length - nextEvents.length;

    // slotSettings は pure helper を経由（K-1 のロジックを集約利用）
    const { nextSlotSettings, removedDateCount: removedSlotDateCount } =
      computeRemoveBasePatch(data.slotSettings, baseName);

    // *ByBase / filterConditions: キー存在チェック → 削除
    const jobsByBase = data.jobsByBase ?? {};
    const removedJobsByBase = baseName in jobsByBase;
    const nextJobsByBase = { ...jobsByBase };
    delete nextJobsByBase[baseName];

    const sourcesByBase = data.sourcesByBase ?? {};
    const removedSourcesByBase = baseName in sourcesByBase;
    const nextSourcesByBase = { ...sourcesByBase };
    delete nextSourcesByBase[baseName];

    const emailTemplatesByBase = data.emailTemplatesByBase ?? {};
    const removedEmailTemplatesByBase = baseName in emailTemplatesByBase;
    const nextEmailTemplatesByBase = { ...emailTemplatesByBase };
    delete nextEmailTemplatesByBase[baseName];

    const filterConditions = data.filterConditions ?? {};
    const removedFilterCondition = baseName in filterConditions;
    const nextFilterConditions = { ...filterConditions };
    delete nextFilterConditions[baseName];

    // recruitmentOpenings から baseName 一致を除去 (Step 1, 2026-05 追加)
    const recruitmentOpenings = data.recruitmentOpenings ?? [];
    const nextRecruitmentOpenings = recruitmentOpenings.filter((o) => o.baseName !== baseName);
    const removedRecruitmentOpeningCount =
      recruitmentOpenings.length - nextRecruitmentOpenings.length;

    storage.saveClientData(clientId, {
      ...data,
      bases: nextBases,
      applicants: nextApplicants,
      events: nextEvents,
      slotSettings: nextSlotSettings,
      jobsByBase: nextJobsByBase,
      sourcesByBase: nextSourcesByBase,
      emailTemplatesByBase: nextEmailTemplatesByBase,
      filterConditions: nextFilterConditions,
      recruitmentOpenings: nextRecruitmentOpenings,
    });

    // ── 別 storage: 子アカウント baseName のクリア ──
    // ownerId = clientId（呼出側 = 親テナント前提。子アカウントから呼ばれる場合は
    //   AuthContext 側で resolveDataOwnerId して渡す責務）
    // M-3: clientRepository.detachChildBaseName 経由に置換。
    //   - 該当 0 件なら save を呼ばない挙動は ClientRepository 側に内包済み
    //   - parentId / accountType / baseName 一致判定の責務を ClientRepository に集約
    const { detachedCount: detachedChildAccountCount } =
      this.clientRepo.detachChildBaseName(clientId, baseName);

    return {
      removed: true,
      removedBaseName: baseName,
      clearedApplicantBaseCount,
      removedEventCount,
      removedSlotDateCount,
      removedJobsByBase,
      removedSourcesByBase,
      removedEmailTemplatesByBase,
      removedFilterCondition,
      detachedChildAccountCount,
      removedRecruitmentOpeningCount,
    };
  }
}
