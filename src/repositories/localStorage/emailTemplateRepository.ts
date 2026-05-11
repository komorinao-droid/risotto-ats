import type { ClientData, EmailTemplate } from '@/types';
import { storage } from '@/utils/storage';
import type {
  DeleteEmailTemplateResult,
  EmailTemplateRepository,
  RemoveEmailTemplateBaseOverrideResult,
} from '../types';

/**
 * 既存 storage.ts をラップする EmailTemplateRepository 実装（Phase N-3 で追加）。
 *
 * Phase N-1 JobRepository / N-2 SourceRepository の base-override 型を機械的に横展開した実装。
 * 差分:
 *  - `jobs` / `jobsByBase` → `emailTemplates` / `emailTemplatesByBase`
 *  - **削除カスケードなし**（applicants にテンプレート参照フィールドがないため）
 *      → API は `delete`（`deleteWithCascade` ではない）、`applicantBaseFilter` opt も不要
 *
 * 責務:
 *  - `data.emailTemplates` / `data.emailTemplatesByBase[baseName]` の CRUD（list / create / update / delete）
 *  - 拠点別オーバーライドの撤去（removeBaseOverride）
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - EmailTemplate 型に baseName を追加する正規化は行わない（既存形状を維持）
 *  - 拠点別レイヤが未作成の場合は `data.emailTemplates` をコピーして開始（既存 writeTemplates と互換）
 *  - debounce auto-save は呼出側 (EmailTemplateManagement.tsx) の責務。Repository は同期 API のまま
 */
export class LocalStorageEmailTemplateRepository implements EmailTemplateRepository {
  list(clientId: string, baseName?: string): EmailTemplate[] {
    const data = storage.getClientData(clientId);
    if (baseName && data.emailTemplatesByBase?.[baseName]) {
      return data.emailTemplatesByBase[baseName];
    }
    return data.emailTemplates ?? [];
  }

  create(clientId: string, template: Omit<EmailTemplate, 'id'>, baseName?: string): EmailTemplate {
    const data = storage.getClientData(clientId);
    const target = this.pickLayer(data, baseName);
    const nextId = target.reduce((mx, t) => Math.max(mx, t.id), 0) + 1;
    const created: EmailTemplate = { ...template, id: nextId };
    const nextLayer = [...target, created];
    storage.saveClientData(clientId, this.writeLayer(data, nextLayer, baseName));
    return created;
  }

  update(
    clientId: string,
    templateId: number,
    patch: Partial<Omit<EmailTemplate, 'id'>>,
    baseName?: string,
  ): EmailTemplate | undefined {
    const data = storage.getClientData(clientId);
    // 既存 writeTemplates 挙動: baseName 指定で override 未作成なら data.emailTemplates をコピーして開始 → 編集後 override を作成。
    // この場合は patch が現状と一致していても override 作成のため saveClientData を呼ぶ必要がある。
    const overrideExists = baseName ? !!data.emailTemplatesByBase?.[baseName] : true;
    const target = this.pickLayer(data, baseName);
    const idx = target.findIndex((t) => t.id === templateId);
    if (idx < 0) return undefined;

    const current = target[idx];
    // patch に id が紛れ込んでも握りつぶす
    const { id: _ignored, ...safePatch } = patch as Partial<EmailTemplate>;
    const next: EmailTemplate = { ...current, ...safePatch, id: current.id };

    const changed = (Object.keys(safePatch) as Array<keyof EmailTemplate>).some(
      (k) => current[k] !== next[k],
    );
    if (!changed && overrideExists) return current;

    const nextLayer = target.slice();
    nextLayer[idx] = next;
    storage.saveClientData(clientId, this.writeLayer(data, nextLayer, baseName));
    return next;
  }

  delete(clientId: string, templateId: number, baseName?: string): DeleteEmailTemplateResult {
    const data = storage.getClientData(clientId);
    const target = this.pickLayer(data, baseName);
    const template = target.find((t) => t.id === templateId);
    if (!template) {
      return { removed: false };
    }
    const nextLayer = target.filter((t) => t.id !== templateId);
    storage.saveClientData(clientId, this.writeLayer(data, nextLayer, baseName));
    return {
      removed: true,
      removedTemplateName: template.name,
    };
  }

  removeBaseOverride(clientId: string, baseName: string): RemoveEmailTemplateBaseOverrideResult {
    const data = storage.getClientData(clientId);
    const emailTemplatesByBase = data.emailTemplatesByBase ?? {};
    if (!(baseName in emailTemplatesByBase)) {
      return { removed: false };
    }
    const next = { ...emailTemplatesByBase };
    delete next[baseName];
    storage.saveClientData(clientId, { ...data, emailTemplatesByBase: next });
    return { removed: true };
  }

  /**
   * 対象レイヤを返す内部ヘルパ。
   *  - baseName 指定 + override あり: data.emailTemplatesByBase[baseName]
   *  - baseName 未指定 or override なし: data.emailTemplates（フォールバック）
   */
  private pickLayer(data: ClientData, baseName: string | undefined): EmailTemplate[] {
    if (baseName && data.emailTemplatesByBase?.[baseName]) {
      return data.emailTemplatesByBase[baseName];
    }
    return data.emailTemplates ?? [];
  }

  /**
   * 対象レイヤを反映した新しい ClientData を返す内部ヘルパ。
   *  - baseName 未指定: data.emailTemplates を置き換え
   *  - baseName 指定: data.emailTemplatesByBase[baseName] を置き換え（未作成キーはここで生成 = override 新規作成）
   */
  private writeLayer(
    data: ClientData,
    nextLayer: EmailTemplate[],
    baseName: string | undefined,
  ): ClientData {
    if (!baseName) {
      return { ...data, emailTemplates: nextLayer };
    }
    return {
      ...data,
      emailTemplatesByBase: { ...(data.emailTemplatesByBase ?? {}), [baseName]: nextLayer },
    };
  }
}
