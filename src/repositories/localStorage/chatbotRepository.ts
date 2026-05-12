import type { ChatLeadSetting, ChatQuestionGroup, ChatScenario } from '@/types';
import { storage } from '@/utils/storage';
import type { ChatbotRepository } from '../types';

/**
 * 既存 storage.ts をラップする ChatbotRepository 実装（Phase N-10 で追加）。
 *
 * 責務:
 *  - `data.chatScenarios` / `data.chatQuestionGroups` / `data.chatLeadSettings` の 3 配列を集約管理
 *  - 全 getter で `?? []` フォールバック + 全階層 deep copy
 *  - LeadSettings は CRUD（create / update / delete）、Scenarios / QuestionGroups は save 全件型
 *
 * 設計上の特徴:
 *  - **未設定時は `[]` 返却**: null は返さない（chatScenarios / chatQuestionGroups は型上必須、
 *      chatLeadSettings は optional だが UI 側で `|| []` で受けるため契約を統一）
 *  - **migrate / normalize なし**: 形式変遷を持たないため Repository 内に変換ロジック不要
 *  - **id 採番なし**: UI 既存の `newId(items)` で採番後に `createLeadSetting` に渡す前提
 *  - **deep copy**:
 *      - `cloneScenario`: messages → buttons まで（2 階層）
 *      - `cloneQuestionGroup`: questions まで（1 階層、要素は primitive のみ）
 *      - `cloneLead`: questions → choices / interviewCalendars → methods まで（2 階層）
 *  - **no-op 検査**:
 *      - `updateLeadSetting`: id 不在なら `saveClientData` を呼ばず `null` 返却
 *      - `deleteLeadSetting`: 削除対象なしなら `saveClientData` を呼ばず `false` 返却
 *
 * 注意:
 *  - localStorage キーは変更しない（`hireflow:client:${id}:data`）
 *  - base 削除カスケード（chatLeadSettings.baseName / chatInterviewCalendars.baseName の orphan cleanup）は
 *    本 Repository ではしない（pre-existing、後続フェーズで baseRepository 拡張時に検討）
 *  - AdminApp の copyItems に chat 系を追加するのは別フェーズ（N-10 では現状維持）
 */
export class LocalStorageChatbotRepository implements ChatbotRepository {
  // ===== Scenarios =====
  getScenarios(clientId: string): ChatScenario[] {
    const d = storage.getClientData(clientId);
    return (d.chatScenarios ?? []).map(cloneScenario);
  }

  saveScenarios(clientId: string, scenarios: ChatScenario[]): ChatScenario[] {
    const d = storage.getClientData(clientId);
    const next = scenarios.map(cloneScenario);
    storage.saveClientData(clientId, { ...d, chatScenarios: next });
    return next.map(cloneScenario);
  }

  // ===== QuestionGroups =====
  getQuestionGroups(clientId: string): ChatQuestionGroup[] {
    const d = storage.getClientData(clientId);
    return (d.chatQuestionGroups ?? []).map(cloneQuestionGroup);
  }

  saveQuestionGroups(clientId: string, groups: ChatQuestionGroup[]): ChatQuestionGroup[] {
    const d = storage.getClientData(clientId);
    const next = groups.map(cloneQuestionGroup);
    storage.saveClientData(clientId, { ...d, chatQuestionGroups: next });
    return next.map(cloneQuestionGroup);
  }

  // ===== LeadSettings =====
  listLeadSettings(clientId: string): ChatLeadSetting[] {
    const d = storage.getClientData(clientId);
    return (d.chatLeadSettings ?? []).map(cloneLead);
  }

  createLeadSetting(clientId: string, lead: ChatLeadSetting): ChatLeadSetting {
    const d = storage.getClientData(clientId);
    const cur = d.chatLeadSettings ?? [];
    const next = [...cur, cloneLead(lead)];
    storage.saveClientData(clientId, { ...d, chatLeadSettings: next });
    return cloneLead(lead);
  }

  updateLeadSetting(clientId: string, lead: ChatLeadSetting): ChatLeadSetting | null {
    const d = storage.getClientData(clientId);
    const cur = d.chatLeadSettings ?? [];
    const idx = cur.findIndex((l) => l.id === lead.id);
    if (idx < 0) return null;
    const next = cur.slice();
    next[idx] = cloneLead(lead);
    storage.saveClientData(clientId, { ...d, chatLeadSettings: next });
    return cloneLead(lead);
  }

  deleteLeadSetting(clientId: string, leadId: number): boolean {
    const d = storage.getClientData(clientId);
    const cur = d.chatLeadSettings ?? [];
    const next = cur.filter((l) => l.id !== leadId);
    if (next.length === cur.length) return false;
    storage.saveClientData(clientId, { ...d, chatLeadSettings: next });
    return true;
  }
}

/**
 * `ChatScenario` の 2 階層 deep copy。
 *  - messages 配列 + 各 message.buttons 配列まで clone
 */
function cloneScenario(s: ChatScenario): ChatScenario {
  return {
    ...s,
    messages: s.messages.map((m) => ({
      ...m,
      buttons: m.buttons.map((b) => ({ ...b })),
    })),
  };
}

/**
 * `ChatQuestionGroup` の 1 階層 deep copy。
 *  - questions 配列を clone（要素は id/text のみで primitive）
 */
function cloneQuestionGroup(g: ChatQuestionGroup): ChatQuestionGroup {
  return {
    ...g,
    questions: g.questions.map((q) => ({ ...q })),
  };
}

/**
 * `ChatLeadSetting` の 2 階層 deep copy。
 *  - questions → choices まで clone
 *  - interviewCalendars → methods 配列まで clone
 */
function cloneLead(l: ChatLeadSetting): ChatLeadSetting {
  return {
    ...l,
    questions: l.questions.map((q) => ({
      ...q,
      choices: q.choices.map((c) => ({ ...c })),
    })),
    interviewCalendars: l.interviewCalendars.map((c) => ({
      ...c,
      methods: [...c.methods],
    })),
  };
}
