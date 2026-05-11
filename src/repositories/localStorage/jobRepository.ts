import type { ClientData, Job } from '@/types';
import { storage } from '@/utils/storage';
import type {
  DeleteJobCascadeResult,
  JobRepository,
  RemoveJobBaseOverrideResult,
} from '../types';

/**
 * 既存 storage.ts をラップする JobRepository 実装（Phase N-1 で追加）。
 *
 * 責務:
 *  - `data.jobs` / `data.jobsByBase[baseName]` の CRUD（list / create / update）
 *  - 削除カスケード（deleteWithCascade）— 対象レイヤから削除 + applicants[].job クリアを 1 saveClientData
 *  - 拠点別オーバーライドの撤去（removeBaseOverride）
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - Job 型に baseName を追加する正規化は行わない（既存形状を維持）
 *  - 拠点別レイヤが未作成の場合は `data.jobs` をコピーして開始（既存 writeJobs と互換）
 *  - applicants[].updatedAt は touch しない（既存 deleteJob と互換）
 *  - 子アカウント呼出時の applicants 絞り込みは `opts.applicantBaseFilter` で行う
 *    （AuthContext.filterDataByBase が applicants を base 絞り込みしていた挙動の再現）
 */
export class LocalStorageJobRepository implements JobRepository {
  list(clientId: string, baseName?: string): Job[] {
    const data = storage.getClientData(clientId);
    if (baseName && data.jobsByBase?.[baseName]) {
      return data.jobsByBase[baseName];
    }
    return data.jobs ?? [];
  }

  create(clientId: string, job: Omit<Job, 'id'>, baseName?: string): Job {
    const data = storage.getClientData(clientId);
    const target = this.pickLayer(data, baseName);
    const nextId = target.reduce((mx, j) => Math.max(mx, j.id), 0) + 1;
    const created: Job = { ...job, id: nextId };
    const nextLayer = [...target, created];
    storage.saveClientData(clientId, this.writeLayer(data, nextLayer, baseName));
    return created;
  }

  update(
    clientId: string,
    jobId: number,
    patch: Partial<Omit<Job, 'id'>>,
    baseName?: string,
  ): Job | undefined {
    const data = storage.getClientData(clientId);
    // 既存 writeJobs 挙動: baseName 指定で override 未作成なら data.jobs をコピーして開始 → 編集後 override を作成。
    // この場合は patch が現状と一致していても override 作成のため saveClientData を呼ぶ必要がある。
    const overrideExists = baseName ? !!data.jobsByBase?.[baseName] : true;
    const target = this.pickLayer(data, baseName);
    const idx = target.findIndex((j) => j.id === jobId);
    if (idx < 0) return undefined;

    const current = target[idx];
    // patch に id が紛れ込んでも握りつぶす
    const { id: _ignored, ...safePatch } = patch as Partial<Job>;
    const next: Job = { ...current, ...safePatch, id: current.id };

    const changed = (Object.keys(safePatch) as Array<keyof Job>).some(
      (k) => current[k] !== next[k],
    );
    if (!changed && overrideExists) return current;

    const nextLayer = target.slice();
    nextLayer[idx] = next;
    storage.saveClientData(clientId, this.writeLayer(data, nextLayer, baseName));
    return next;
  }

  deleteWithCascade(
    clientId: string,
    jobId: number,
    opts?: { baseName?: string; applicantBaseFilter?: string },
  ): DeleteJobCascadeResult {
    const baseName = opts?.baseName;
    const applicantBaseFilter = opts?.applicantBaseFilter;
    const data = storage.getClientData(clientId);
    const target = this.pickLayer(data, baseName);
    const job = target.find((j) => j.id === jobId);
    if (!job) {
      return { removed: false, clearedApplicantJobCount: 0 };
    }

    const nextLayer = target.filter((j) => j.id !== jobId);

    const applicants = data.applicants ?? [];
    let clearedApplicantJobCount = 0;
    const nextApplicants = applicants.map((a) => {
      if (a.job !== job.name) return a;
      if (applicantBaseFilter !== undefined && a.base !== applicantBaseFilter) return a;
      clearedApplicantJobCount++;
      return { ...a, job: '' };
    });

    const nextData = this.writeLayer(data, nextLayer, baseName);
    nextData.applicants = nextApplicants;
    storage.saveClientData(clientId, nextData);

    return {
      removed: true,
      removedJobName: job.name,
      clearedApplicantJobCount,
    };
  }

  removeBaseOverride(clientId: string, baseName: string): RemoveJobBaseOverrideResult {
    const data = storage.getClientData(clientId);
    const jobsByBase = data.jobsByBase ?? {};
    if (!(baseName in jobsByBase)) {
      return { removed: false };
    }
    const next = { ...jobsByBase };
    delete next[baseName];
    storage.saveClientData(clientId, { ...data, jobsByBase: next });
    return { removed: true };
  }

  /**
   * 対象レイヤを返す内部ヘルパ。
   *  - baseName 指定 + override あり: data.jobsByBase[baseName]
   *  - baseName 未指定 or override なし: data.jobs（フォールバック）
   */
  private pickLayer(data: ClientData, baseName: string | undefined): Job[] {
    if (baseName && data.jobsByBase?.[baseName]) {
      return data.jobsByBase[baseName];
    }
    return data.jobs ?? [];
  }

  /**
   * 対象レイヤを反映した新しい ClientData を返す内部ヘルパ。
   *  - baseName 未指定: data.jobs を置き換え
   *  - baseName 指定: data.jobsByBase[baseName] を置き換え（未作成キーはここで生成 = override 新規作成）
   */
  private writeLayer(
    data: ClientData,
    nextLayer: Job[],
    baseName: string | undefined,
  ): ClientData {
    if (!baseName) {
      return { ...data, jobs: nextLayer };
    }
    return {
      ...data,
      jobsByBase: { ...(data.jobsByBase ?? {}), [baseName]: nextLayer },
    };
  }
}
