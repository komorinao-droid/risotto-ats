import type { Applicant, StageChangeReason, StageHistoryEntry } from '@/types';
import { storage } from '@/utils/storage';
import {
  withCreatedMeta,
  withUpdatedMeta,
  withStageChange,
  type StageChangeOptions,
} from '@/utils/applicantLifecycle';
import type {
  ApplicantRepository,
  BulkStageChangeOptions,
  BulkStageChangePatch,
  BulkStageChangeResult,
  ClearStageForDeletedStatusResult,
  DeleteApplicantResult,
} from '../types';

/**
 * 既存 storage.ts をラップする ApplicantRepository 実装。
 *
 * 注意:
 *  - 子アカウントの拠点フィルタは AuthContext 側の責務として残す（Phase 1 同様）。
 *    ここでは clientId に対応する ClientData をそのまま操作する。
 *  - 読み取り時の自動補完／全件書き換えは行わない（ユーザー指示）。
 *    補完は更新が走るタイミングのみ。
 */
export class LocalStorageApplicantRepository implements ApplicantRepository {
  list(clientId: string): Applicant[] {
    return storage.getClientData(clientId).applicants ?? [];
  }

  get(clientId: string, applicantId: number): Applicant | undefined {
    return this.list(clientId).find((a) => a.id === applicantId);
  }

  create(
    clientId: string,
    applicant: Applicant,
    opts: { initialStageReason?: StageChangeReason; operator?: string } = {},
  ): Applicant {
    const data = storage.getClientData(clientId);
    const base = withCreatedMeta(applicant);

    // 初期 stage 履歴付与:
    //  - opts.initialStageReason が指定され、かつ stage が非空の場合のみ 1 件追加。
    //  - CSV インポートで stage 空欄 → statuses[0] にフォールバックした行は呼び出し側が
    //    opts を渡さない運用にすることで、ここで履歴は積まない。
    //  - fromStage は付与しない（前段が無いため）。
    let enriched = base;
    if (opts.initialStageReason && base.stage) {
      const entry: StageHistoryEntry = {
        stage: base.stage,
        toStage: base.stage,
        changedAt: base.stageChangedAt ?? base.createdAt!,
        reason: opts.initialStageReason,
      };
      if (opts.operator) entry.operator = opts.operator;
      enriched = {
        ...base,
        stageHistory: [...(base.stageHistory ?? []), entry],
      };
    }

    storage.saveClientData(clientId, {
      ...data,
      applicants: [...(data.applicants ?? []), enriched],
    });
    return enriched;
  }

  update(clientId: string, applicantId: number, patch: Partial<Applicant>): Applicant | undefined {
    const data = storage.getClientData(clientId);
    const list = data.applicants ?? [];
    const idx = list.findIndex((a) => a.id === applicantId);
    if (idx < 0) return undefined;
    const merged: Applicant = { ...list[idx], ...patch };
    const next = withUpdatedMeta(merged);
    const nextList = list.slice();
    nextList[idx] = next;
    storage.saveClientData(clientId, { ...data, applicants: nextList });
    return next;
  }

  changeStage(
    clientId: string,
    applicantId: number,
    toStage: string,
    opts: StageChangeOptions = {},
  ): Applicant | undefined {
    const data = storage.getClientData(clientId);
    const list = data.applicants ?? [];
    const idx = list.findIndex((a) => a.id === applicantId);
    if (idx < 0) return undefined;
    const next = withStageChange(list[idx], toStage, opts);
    if (next === list[idx]) return next; // 同一ステージへの呼び出しは no-op
    const nextList = list.slice();
    nextList[idx] = next;
    storage.saveClientData(clientId, { ...data, applicants: nextList });
    return next;
  }

  changeStageBulk(
    clientId: string,
    patches: BulkStageChangePatch[],
    options: BulkStageChangeOptions,
  ): BulkStageChangeResult {
    const data = storage.getClientData(clientId);
    const list = data.applicants ?? [];

    // patch を applicantId 単位でルックアップできるようにする
    // （重複指定があった場合は後勝ち。呼び出し側が重複を作らない前提だが、安全側に倒す）
    const patchMap = new Map<number, BulkStageChangePatch>();
    for (const p of patches) {
      patchMap.set(p.applicantId, p);
    }

    const skipped: BulkStageChangeResult['skipped'] = [];

    // not_found 判定: patches 側にあるが現データに存在しない applicantId を先に拾う
    const existingIds = new Set(list.map((a) => a.id));
    for (const p of patches) {
      if (!existingIds.has(p.applicantId)) {
        skipped.push({ applicantId: p.applicantId, reason: 'not_found' });
      }
    }

    let updatedCount = 0;
    const nextList = list.map((a) => {
      const p = patchMap.get(a.id);
      if (!p) return a;
      if (a.stage === p.toStage) {
        // 同一ステージは履歴を汚染しない
        skipped.push({ applicantId: a.id, reason: 'same_stage' });
        return a;
      }
      let next = withStageChange(a, p.toStage, {
        operator: options.operator,
        reason: options.reason,
        changedAt: options.changedAt,
      });
      if (p.patch) {
        // 例: { active: false } を同時反映。withStageChange 後に当てる。
        next = { ...next, ...p.patch };
      }
      updatedCount++;
      return next;
    });

    if (updatedCount > 0) {
      storage.saveClientData(clientId, { ...data, applicants: nextList });
    }

    return { updatedCount, skipped };
  }

  clearStageForDeletedStatus(
    clientId: string,
    deletedStatusName: string,
  ): ClearStageForDeletedStatusResult {
    const data = storage.getClientData(clientId);
    const list = data.applicants ?? [];

    let clearedApplicantCount = 0;
    let cleanedHistoryCount = 0;

    const nextList = list.map((a) => {
      const isMatchedStage = a.stage === deletedStatusName;
      const origHistory = a.stageHistory ?? [];
      const filteredHistory = origHistory.filter((h) => {
        const drop = h.stage === deletedStatusName || h.toStage === deletedStatusName;
        if (drop) cleanedHistoryCount++;
        return !drop;
      });
      const historyChanged = filteredHistory.length !== origHistory.length;
      if (!isMatchedStage && !historyChanged) return a;
      if (isMatchedStage) clearedApplicantCount++;
      return {
        ...a,
        ...(isMatchedStage ? { stage: '', subStatus: '' } : {}),
        stageHistory: filteredHistory,
      };
    });

    if (clearedApplicantCount > 0 || cleanedHistoryCount > 0) {
      storage.saveClientData(clientId, { ...data, applicants: nextList });
    }

    return { clearedApplicantCount, cleanedHistoryCount };
  }

  markDuplicateByMatch(
    clientId: string,
    matcher: { name?: string; phone?: string },
    scope: { baseName: string | null },
  ): { markedCount: number } {
    const matchName = matcher.name?.trim() || '';
    const matchPhone = (matcher.phone || '').replace(/[-\s]/g, '');
    if (!matchName && !matchPhone) return { markedCount: 0 };

    const data = storage.getClientData(clientId);
    const list = data.applicants ?? [];

    let markedCount = 0;
    const next = list.map((a) => {
      // 子アカウントの権限境界: scope.baseName 指定時は自拠点のみ更新（他拠点 applicants は触らない）
      if (scope.baseName !== null && a.base !== scope.baseName) return a;
      // 既に duplicate なら skip（updatedAt を汚さない方針と整合）
      if (a.duplicate) return a;
      const aPhone = (a.phone || '').replace(/[-\s]/g, '');
      const hit =
        (matchName && a.name === matchName) ||
        (matchPhone && aPhone === matchPhone);
      if (!hit) return a;
      markedCount++;
      // withUpdatedMeta は付与しない: duplicate は CSV cache であり updatedAt を汚さない方針
      return { ...a, duplicate: true };
    });

    if (markedCount > 0) {
      storage.saveClientData(clientId, { ...data, applicants: next });
    }
    return { markedCount };
  }

  delete(clientId: string, applicantId: number): DeleteApplicantResult {
    const data = storage.getClientData(clientId);
    const applicants = data.applicants ?? [];
    const events = data.events ?? [];
    const exclusionList = data.exclusionList ?? [];

    const nextApplicants = applicants.filter((a) => a.id !== applicantId);
    const nextEvents = events.filter((e) => e.applicantId !== applicantId);
    // exclusionList の applicantId 参照エントリを除去。
    // 旧データ互換のため optional access にする（applicantId フィールドが無いエントリは残す）。
    const nextExclusion = exclusionList.filter(
      (ex) => (ex as { applicantId?: number } | null | undefined)?.applicantId !== applicantId,
    );

    const deletedApplicant = nextApplicants.length !== applicants.length;
    const deletedEventCount = events.length - nextEvents.length;
    const clearedExclusionCount = exclusionList.length - nextExclusion.length;

    if (deletedApplicant || deletedEventCount > 0 || clearedExclusionCount > 0) {
      storage.saveClientData(clientId, {
        ...data,
        applicants: nextApplicants,
        events: nextEvents,
        exclusionList: nextExclusion,
      });
    }

    return { deletedApplicant, deletedEventCount, clearedExclusionCount };
  }
}
