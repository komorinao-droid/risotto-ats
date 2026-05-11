import type { ClientData, Source } from '@/types';
import { storage } from '@/utils/storage';
import type {
  DeleteSourceCascadeResult,
  RemoveSourceBaseOverrideResult,
  SourceRepository,
} from '../types';

/**
 * 既存 storage.ts をラップする SourceRepository 実装（Phase N-2 で追加）。
 *
 * Phase N-1 の `LocalStorageJobRepository` を機械的に横展開した実装。
 * 差分:
 *  - `jobs` / `jobsByBase` → `sources` / `sourcesByBase`
 *  - `applicants[].job` → `applicants[].src`
 *  - 結果型: `removedJobName` → `removedSourceName`, `clearedApplicantJobCount` → `clearedApplicantSrcCount`
 *
 * 責務:
 *  - `data.sources` / `data.sourcesByBase[baseName]` の CRUD（list / create / update）
 *  - 削除カスケード（deleteWithCascade）— 対象レイヤから削除 + applicants[].src クリアを 1 saveClientData
 *  - 拠点別オーバーライドの撤去（removeBaseOverride）
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - Source 型に baseName を追加する正規化は行わない（既存形状を維持）
 *  - 拠点別レイヤが未作成の場合は `data.sources` をコピーして開始（既存 writeSources と互換）
 *  - applicants[].updatedAt は touch しない（既存 deleteSource と互換）
 *  - 子アカウント呼出時の applicants 絞り込みは `opts.applicantBaseFilter` で行う
 *    （AuthContext.filterDataByBase が applicants を base 絞り込みしていた挙動の再現）
 *  - Source.password は本フェーズでは平文のまま流通させる（既存仕様維持）
 */
export class LocalStorageSourceRepository implements SourceRepository {
  list(clientId: string, baseName?: string): Source[] {
    const data = storage.getClientData(clientId);
    if (baseName && data.sourcesByBase?.[baseName]) {
      return data.sourcesByBase[baseName];
    }
    return data.sources ?? [];
  }

  create(clientId: string, source: Omit<Source, 'id'>, baseName?: string): Source {
    const data = storage.getClientData(clientId);
    const target = this.pickLayer(data, baseName);
    const nextId = target.reduce((mx, s) => Math.max(mx, s.id), 0) + 1;
    const created: Source = { ...source, id: nextId };
    const nextLayer = [...target, created];
    storage.saveClientData(clientId, this.writeLayer(data, nextLayer, baseName));
    return created;
  }

  update(
    clientId: string,
    sourceId: number,
    patch: Partial<Omit<Source, 'id'>>,
    baseName?: string,
  ): Source | undefined {
    const data = storage.getClientData(clientId);
    // 既存 writeSources 挙動: baseName 指定で override 未作成なら data.sources をコピーして開始 → 編集後 override を作成。
    // この場合は patch が現状と一致していても override 作成のため saveClientData を呼ぶ必要がある。
    const overrideExists = baseName ? !!data.sourcesByBase?.[baseName] : true;
    const target = this.pickLayer(data, baseName);
    const idx = target.findIndex((s) => s.id === sourceId);
    if (idx < 0) return undefined;

    const current = target[idx];
    // patch に id が紛れ込んでも握りつぶす
    const { id: _ignored, ...safePatch } = patch as Partial<Source>;
    const next: Source = { ...current, ...safePatch, id: current.id };

    const changed = (Object.keys(safePatch) as Array<keyof Source>).some(
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
    sourceId: number,
    opts?: { baseName?: string; applicantBaseFilter?: string },
  ): DeleteSourceCascadeResult {
    const baseName = opts?.baseName;
    const applicantBaseFilter = opts?.applicantBaseFilter;
    const data = storage.getClientData(clientId);
    const target = this.pickLayer(data, baseName);
    const source = target.find((s) => s.id === sourceId);
    if (!source) {
      return { removed: false, clearedApplicantSrcCount: 0 };
    }

    const nextLayer = target.filter((s) => s.id !== sourceId);

    const applicants = data.applicants ?? [];
    let clearedApplicantSrcCount = 0;
    const nextApplicants = applicants.map((a) => {
      if (a.src !== source.name) return a;
      if (applicantBaseFilter !== undefined && a.base !== applicantBaseFilter) return a;
      clearedApplicantSrcCount++;
      return { ...a, src: '' };
    });

    const nextData = this.writeLayer(data, nextLayer, baseName);
    nextData.applicants = nextApplicants;
    storage.saveClientData(clientId, nextData);

    return {
      removed: true,
      removedSourceName: source.name,
      clearedApplicantSrcCount,
    };
  }

  removeBaseOverride(clientId: string, baseName: string): RemoveSourceBaseOverrideResult {
    const data = storage.getClientData(clientId);
    const sourcesByBase = data.sourcesByBase ?? {};
    if (!(baseName in sourcesByBase)) {
      return { removed: false };
    }
    const next = { ...sourcesByBase };
    delete next[baseName];
    storage.saveClientData(clientId, { ...data, sourcesByBase: next });
    return { removed: true };
  }

  /**
   * 対象レイヤを返す内部ヘルパ。
   *  - baseName 指定 + override あり: data.sourcesByBase[baseName]
   *  - baseName 未指定 or override なし: data.sources（フォールバック）
   */
  private pickLayer(data: ClientData, baseName: string | undefined): Source[] {
    if (baseName && data.sourcesByBase?.[baseName]) {
      return data.sourcesByBase[baseName];
    }
    return data.sources ?? [];
  }

  /**
   * 対象レイヤを反映した新しい ClientData を返す内部ヘルパ。
   *  - baseName 未指定: data.sources を置き換え
   *  - baseName 指定: data.sourcesByBase[baseName] を置き換え（未作成キーはここで生成 = override 新規作成）
   */
  private writeLayer(
    data: ClientData,
    nextLayer: Source[],
    baseName: string | undefined,
  ): ClientData {
    if (!baseName) {
      return { ...data, sources: nextLayer };
    }
    return {
      ...data,
      sourcesByBase: { ...(data.sourcesByBase ?? {}), [baseName]: nextLayer },
    };
  }
}
