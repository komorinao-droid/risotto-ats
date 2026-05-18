import type {
  Applicant,
  ApplicantAutomationStatus,
  ApplicantAutomationTag,
  Base,
  ClientData,
  EmailTemplate,
  ExclusionEntry,
} from '@/types';

/**
 * 自動ステータス・自動タグ表示用のユーティリティ (2026-05 追加)。
 *
 * 設計方針:
 *  - 自動ステータス = 今どの自動フロー状態にいるか。原則 1 つ。
 *  - 自動タグ = 例外理由・分岐理由・エラー理由。必要な時だけ 0 個以上。
 *  - 自動付与ロジックは別フェーズで追加予定。本ファイルはラベル + 色設定のみ提供。
 */

export const APPLICANT_AUTOMATION_STATUS_LABELS: Record<ApplicantAutomationStatus, string> = {
  new_applicant: '新規',
  schedule_not_sent: '日程調整未送信',
  scheduling: '日程調整中',
  questions_answered_no_schedule: '質問回答済・日程未回答',
  preferred_dates_collected: '希望日回収済',
  interview_pending_confirmation: '面接確定待ち',
  interview_confirmed: '面接確定済',
  interview_completed: '面接終了',
  no_response: '反応なし',
  following_up: '追いかけ中',
  interview_no_show: '面接欠席',
  filled_received: '充足受付',
  excluded: '選考対象外',
  hired: '採用',
  rejected: '不採用',
};

export const APPLICANT_AUTOMATION_TAG_LABELS: Record<ApplicantAutomationTag, string> = {
  invalid_contact: '連絡先不備',
  condition_mismatch: '応募条件外',
  outside_interview_slots: '面接枠以外を希望',
  excluded_list_match: '除外リスト該当',
  filled_opening_application: '充足求人応募',
  email_send_failed: 'メール送信失敗',
  chat_send_failed: 'チャット送信失敗',
};

export function getApplicantAutomationStatusLabel(status?: ApplicantAutomationStatus): string {
  return status ? APPLICANT_AUTOMATION_STATUS_LABELS[status] : '未設定';
}

export function getApplicantAutomationTagLabel(tag: ApplicantAutomationTag): string {
  return APPLICANT_AUTOMATION_TAG_LABELS[tag];
}

/**
 * automationTags に新しいタグを追加するときの dedup helper (2026-05 Step 2-α)。
 *
 * - 既存タグの順序を保ったまま、末尾に新規タグを追加する
 * - 既に同タグが含まれていれば配列はそのまま（重複追加しない）
 * - 入力 `tags` を mutate しない。常に新しい配列を返す
 *
 * 用途:
 *  - filled_received 付与時に filled_opening_application を 1 回だけ付ける
 *  - 将来 excluded_list_match などを追加するときも同じ helper を使う
 */
export function withAutomationTag(
  tags: ApplicantAutomationTag[] | undefined,
  tag: ApplicantAutomationTag,
): ApplicantAutomationTag[] {
  return Array.from(new Set([...(tags ?? []), tag]));
}

/**
 * 「充足受付 (filled_received)」状態の応募者かを判定する (2026-05 Step 2-β)。
 *
 * 用途:
 *  - 応募者詳細で通常の日程調整 / 面接予約導線を disabled にする
 *  - ScheduleInterview 系のハンドラ手前で軽い実行ガードを入れる
 *  - 将来の自動メール送信 / チャット送信側でも同じ判定式を使い回す
 *
 * Pick で `automationStatus` だけを要求する形にしたのは、テスト用のミニマム
 * オブジェクト渡しや、Repository 経由で取得した Partial<Applicant> でも
 * そのまま判定できるようにするため。
 */
export function isFilledReceivedApplicant(
  applicant: { automationStatus?: ApplicantAutomationStatus } | null | undefined,
): boolean {
  return applicant?.automationStatus === 'filled_received';
}

/** filled_received のブロック表示で使う共通文言。UI / alert で再利用する。 */
export const FILLED_RECEIVED_BLOCK_MESSAGE =
  'この応募は充足求人への応募のため、通常の日程調整は停止されています。';

/** disabled ボタンの title / aria-label 用の短い理由文。 */
export const FILLED_RECEIVED_BLOCK_REASON_SHORT =
  '充足求人への応募のため面接予約できません';

/**
 * 除外リスト該当応募者かを判定する (2026-05 Step 4)。
 *
 * 用途:
 *  - filled_received と同じく、通常の日程調整／面接予約導線を停止する
 *  - 充足返信メールボタンは表示しない（excluded 専用導線は別フェーズ）
 */
export function isExcludedApplicant(
  applicant: { automationStatus?: ApplicantAutomationStatus } | null | undefined,
): boolean {
  return applicant?.automationStatus === 'excluded';
}

/**
 * 通常の日程調整／面接予約導線を停止すべき応募者かを判定する (2026-05 Step 4)。
 *
 * 現状: filled_received もしくは excluded で停止。
 * 既存 `isFilledReceivedApplicant` は残しているが、面接予約停止の判定は本 helper に寄せる。
 */
export function isInterviewSchedulingBlockedApplicant(
  applicant: { automationStatus?: ApplicantAutomationStatus } | null | undefined,
): boolean {
  return (
    applicant?.automationStatus === 'filled_received' ||
    applicant?.automationStatus === 'excluded'
  );
}

/** 警告パネル本文（除外リスト該当）。 */
export const EXCLUDED_BLOCK_MESSAGE =
  'この応募者は除外リストに該当するため、通常の日程調整は停止されています。';

/** disabled ボタンの title / aria-label 用の短い理由文（除外リスト該当）。 */
export const EXCLUDED_BLOCK_REASON_SHORT = '除外リスト該当のため面接予約できません';

/** 警告パネル本文（応募条件フィルタ該当, Step 5）。 */
export const CONDITION_MISMATCH_BLOCK_MESSAGE =
  'この応募者は応募条件外として判定されたため、通常の日程調整は停止されています。';

/** disabled ボタンの短い理由文（応募条件フィルタ該当, Step 5）。 */
export const CONDITION_MISMATCH_BLOCK_REASON_SHORT = '応募条件外のため面接予約できません';

type BlockedSource =
  | { automationStatus?: ApplicantAutomationStatus; automationTags?: ApplicantAutomationTag[] }
  | null
  | undefined;

/** 面接予約停止の理由文を automationStatus / automationTags に応じて返す。 */
export function getInterviewSchedulingBlockedMessage(applicant: BlockedSource): string {
  if (applicant?.automationStatus === 'excluded') {
    // excluded は「除外リスト」or「応募条件フィルタ」のどちらか。tag で識別する。
    // 両方付いている異常ケースは excluded_list_match を優先（より強い理由）。
    if (applicant.automationTags?.includes('excluded_list_match')) return EXCLUDED_BLOCK_MESSAGE;
    if (applicant.automationTags?.includes('condition_mismatch')) return CONDITION_MISMATCH_BLOCK_MESSAGE;
    return EXCLUDED_BLOCK_MESSAGE;
  }
  return FILLED_RECEIVED_BLOCK_MESSAGE;
}

/** disabled ボタンの短い理由文を automationStatus / automationTags に応じて返す。 */
export function getInterviewSchedulingBlockedReasonShort(applicant: BlockedSource): string {
  if (applicant?.automationStatus === 'excluded') {
    if (applicant.automationTags?.includes('excluded_list_match')) return EXCLUDED_BLOCK_REASON_SHORT;
    if (applicant.automationTags?.includes('condition_mismatch')) return CONDITION_MISMATCH_BLOCK_REASON_SHORT;
    return EXCLUDED_BLOCK_REASON_SHORT;
  }
  return FILLED_RECEIVED_BLOCK_REASON_SHORT;
}

/**
 * 除外リスト一致判定 (2026-05 Step 4) — 共通 source-of-truth。
 *
 * 判定種別:
 *  - email: 両側 trim + toLowerCase 後一致
 *  - phone: 両側 `[-\s]` を除去後一致
 *  - name_birth: name 完全一致 + birthDate 完全一致
 *  - 値が空のエントリ / 応募者値が空の組合せは一致扱いしない
 *
 * 戻り値: 一致した ExclusionEntry とアラート表示用ラベルの配列。
 *  - 0 件なら空配列
 *  - alert 文言は既存 `AddApplicantModal.checkExclusion` の表記をそのまま採用
 *
 * 用途:
 *  - `isExcludedListMatch` (boolean 版) のバックエンド
 *  - 手動応募追加の alert メッセージ (`checkExclusion`)
 *  - 自動ステータス／自動タグ自動付与 (AddApplicantModal / ApplicantList CSV)
 *
 * 重要: 判定ロジックは本 helper に集約する。複製しない。
 */
export interface ExclusionListMatch {
  entry: ExclusionEntry;
  label: string;
}

export function findExclusionListMatches(
  clientData: ClientData | null | undefined,
  applicant: Partial<Pick<Applicant, 'email' | 'phone' | 'name' | 'birthDate'>>,
): ExclusionListMatch[] {
  if (!clientData?.exclusionList?.length) return [];
  const rawEmail = applicant.email || '';
  const email = rawEmail.trim().toLowerCase();
  const phone = (applicant.phone || '').replace(/[-\s]/g, '');
  const name = applicant.name || '';
  const birthDate = applicant.birthDate || '';

  const matches: ExclusionListMatch[] = [];
  for (const entry of clientData.exclusionList as ExclusionEntry[]) {
    if (entry.type === 'email') {
      if (!entry.email || !email) continue;
      if (entry.email.trim().toLowerCase() === email) {
        matches.push({ entry, label: `メール(${rawEmail})が除外リストに該当します` });
      }
    } else if (entry.type === 'phone') {
      if (!entry.phone || !phone) continue;
      if (entry.phone.replace(/[-\s]/g, '') === phone) {
        matches.push({ entry, label: '電話番号が除外リストに該当します' });
      }
    } else {
      // name_birth
      if (!entry.name || !entry.birthDate || !name || !birthDate) continue;
      if (entry.name === name && entry.birthDate === birthDate) {
        matches.push({ entry, label: '氏名+生年月日が除外リストに該当します' });
      }
    }
  }
  return matches;
}

/**
 * 除外リスト一致判定 (boolean 版)。
 *
 * `findExclusionListMatches` のラッパで、判定ロジックは複製しない。
 * automationStatus 自動付与など、true/false のみ必要な箇所で使う。
 */
export function isExcludedListMatch(
  clientData: ClientData | null | undefined,
  applicant: Partial<Pick<Applicant, 'email' | 'phone' | 'name' | 'birthDate'>>,
): boolean {
  return findExclusionListMatches(clientData, applicant).length > 0;
}

/**
 * 応募条件フィルタ不一致判定 (2026-05 Step 5) — 共通 source-of-truth。
 *
 * 既存 `AddApplicantModal.checkExclusion` の filter-condition 判定と完全一致させる:
 *  - age: `fc.ageEnabled && age && (age < fc.ageMin || age > fc.ageMax)`
 *  - gender: `fc.genderFilter.length > 0 && gender && !fc.genderFilter.includes(gender)`
 *  - source: `fc.sourceFilter.length > 0 && src && !fc.sourceFilter.includes(src)`
 *  - job: `fc.jobFilter.length > 0 && job && !fc.jobFilter.includes(job)`
 *  - 参照する設定は `clientData.filterCondition` (legacy global)。
 *    `clientData.filterConditions` (拠点別) は intake 経路では従来から参照していないため踏襲。
 *
 * 戻り値: 不一致内容の配列。alert 表示用 label と判定種別 kind を含む。
 *  - 0 件なら空配列
 *  - alert 文言は既存 `checkExclusion` の表記をそのまま採用
 *
 * 用途:
 *  - `isFilterConditionMismatch` (boolean) のバックエンド
 *  - 手動応募追加の alert メッセージ (`checkExclusion`)
 *  - 自動ステータス／自動タグ自動付与 (AddApplicantModal / ApplicantList CSV)
 *
 * 重要: 判定ロジックは本 helper に集約する。複製しない。
 */
export interface ConditionMismatchEntry {
  kind: 'age' | 'gender' | 'source' | 'job';
  label: string;
}

export function findConditionMismatches(
  clientData: ClientData | null | undefined,
  applicant: Partial<Pick<Applicant, 'age' | 'gender' | 'src' | 'job'>>,
): ConditionMismatchEntry[] {
  const fc = clientData?.filterCondition;
  if (!fc) return [];
  const out: ConditionMismatchEntry[] = [];

  if (fc.ageEnabled && applicant.age) {
    const ageNum =
      typeof applicant.age === 'string' ? parseInt(applicant.age, 10) : (applicant.age as number);
    if (typeof ageNum === 'number' && !Number.isNaN(ageNum) && (ageNum < fc.ageMin || ageNum > fc.ageMax)) {
      out.push({ kind: 'age', label: `年齢(${ageNum}歳)がフィルタ条件外です` });
    }
  }
  if (fc.genderFilter.length > 0 && applicant.gender) {
    if (!fc.genderFilter.includes(applicant.gender)) {
      out.push({ kind: 'gender', label: `性別(${applicant.gender})がフィルタ条件外です` });
    }
  }
  if (fc.sourceFilter.length > 0 && applicant.src) {
    if (!fc.sourceFilter.includes(applicant.src)) {
      out.push({ kind: 'source', label: `応募媒体(${applicant.src})がフィルタ条件外です` });
    }
  }
  if (fc.jobFilter.length > 0 && applicant.job) {
    if (!fc.jobFilter.includes(applicant.job)) {
      out.push({ kind: 'job', label: `職種(${applicant.job})がフィルタ条件外です` });
    }
  }
  return out;
}

/**
 * 応募条件フィルタ不一致判定 (boolean 版)。
 *
 * `findConditionMismatches` のラッパで、判定ロジックは複製しない。
 * automationStatus 自動付与など、true/false のみ必要な箇所で使う。
 */
export function isFilterConditionMismatch(
  clientData: ClientData | null | undefined,
  applicant: Partial<Pick<Applicant, 'age' | 'gender' | 'src' | 'job'>>,
): boolean {
  return findConditionMismatches(clientData, applicant).length > 0;
}

/**
 * 反応なし候補の判定結果 (2026-05 Step 6-B)。
 *
 * - 表示専用の derived state。応募者の `automationStatus` は書き換えない。
 * - 自動付与 / 自動更新は本フェーズでは行わない。
 */
export type NoResponseCandidateResult = {
  isCandidate: boolean;
  daysSinceLastContact: number | null;
  thresholdDays: number;
  lastContactedAt: string | null;
};

/**
 * 応募者の「最終連絡日時」を返す (Step 6-B)。
 * - `lastContactedAt` を優先、なければ `firstContactedAt` にフォールバック
 * - どちらも空 / 未設定なら null
 */
export function getApplicantLastContactedAt(
  applicant: Pick<Applicant, 'lastContactedAt' | 'firstContactedAt'>,
): string | null {
  return applicant.lastContactedAt || applicant.firstContactedAt || null;
}

/**
 * 「反応なし候補」かどうかを判定する (Step 6-B)。
 *
 * 判定ルール（短絡）:
 *  - automationStatus が filled_received / excluded / no_response / following_up → false
 *  - lastContactedAt / firstContactedAt がない → false
 *  - 日時パース失敗 → false
 *  - now - lastContactedAt が thresholdDays 未満 → false
 *  - thresholdDays 以上 → true
 *
 * 戻り値の `daysSinceLastContact` は連絡日時が解釈可能な場合のみ
 * `Math.floor(ms / 86400000)` で日数化する（負数は 0 にクランプ）。
 */
export function getNoResponseCandidate(
  applicant: Pick<Applicant, 'automationStatus' | 'lastContactedAt' | 'firstContactedAt'>,
  thresholdDays: number,
  now: Date = new Date(),
): NoResponseCandidateResult {
  const lastContactedAt = getApplicantLastContactedAt(applicant);
  const base: NoResponseCandidateResult = {
    isCandidate: false,
    daysSinceLastContact: null,
    thresholdDays,
    lastContactedAt,
  };

  const status = applicant.automationStatus;
  if (
    status === 'filled_received' ||
    status === 'excluded' ||
    status === 'no_response' ||
    status === 'following_up'
  ) {
    return base;
  }

  if (!lastContactedAt) return base;
  const ts = Date.parse(lastContactedAt);
  if (Number.isNaN(ts)) return base;

  const diffMs = now.getTime() - ts;
  const days = diffMs < 0 ? 0 : Math.floor(diffMs / 86400000);
  return {
    ...base,
    daysSinceLastContact: days,
    isCandidate: days >= thresholdDays,
  };
}

/**
 * 反応なし／追いかけ中の手動切替を許容するかを判定する (Step 6-C)。
 *
 * - filled_received / excluded は通常追客対象外のため操作不可
 * - 通常応募者 (automationStatus undefined) / no_response / following_up は操作可
 *   → undefined と no_response/following_up 間で自由に切替可能
 */
export function canSetResponseTrackingStatus(
  applicant: { automationStatus?: ApplicantAutomationStatus } | null | undefined,
): boolean {
  const status = applicant?.automationStatus;
  return status !== 'filled_received' && status !== 'excluded';
}

/** 反応なし／追いかけ中のいずれかの「追客トラッキング状態」かを判定する (Step 6-C)。 */
export function isResponseTrackingStatus(
  status: ApplicantAutomationStatus | undefined,
): boolean {
  return status === 'no_response' || status === 'following_up';
}

/**
 * 面接終了／面接欠席の手動切替を許容するかを判定する (Step 8)。
 *
 * - filled_received / excluded は通常選考対象外のため操作不可
 * - 通常応募者 / no_response / following_up / interview_completed / interview_no_show は操作可
 *   → 反応なし／追いかけ中状態の応募者を面接結果ステータスに切替えるケースも許容する
 *
 * canSetResponseTrackingStatus と判定基準は同じだが、将来面接結果固有の
 * 制約（例: 面接イベントの有無で操作可否を分岐）を加えやすいよう別 helper に分けている。
 */
export function canSetInterviewOutcomeStatus(
  applicant: { automationStatus?: ApplicantAutomationStatus } | null | undefined,
): boolean {
  const status = applicant?.automationStatus;
  return status !== 'filled_received' && status !== 'excluded';
}

/** 面接終了／面接欠席のいずれかの「面接結果ステータス」かを判定する (Step 8)。 */
export function isInterviewOutcomeStatus(
  status: ApplicantAutomationStatus | undefined,
): boolean {
  return status === 'interview_completed' || status === 'interview_no_show';
}

/**
 * 面接確定時に automationStatus を 'interview_confirmed' へ上書きしてよいかを判定する。
 *
 * 上書きしない（強い終端状態 + 既に interview_confirmed）:
 *  - filled_received（充足受付）
 *  - excluded（選考対象外）
 *  - hired（採用）
 *  - rejected（不採用）
 *  - interview_no_show（面接欠席）
 *  - interview_confirmed（既に同値、不要な更新を避ける）
 *
 * 上書きしてOK（中間状態 / 未設定）:
 *  - undefined / schedule_not_sent / scheduling / questions_answered_no_schedule /
 *    preferred_dates_collected / interview_pending_confirmation / interview_completed /
 *    no_response / following_up
 */
export function canOverwriteAutomationStatusForInterviewConfirmed(
  status: ApplicantAutomationStatus | undefined,
): boolean {
  if (!status) return true;
  return (
    status !== 'filled_received' &&
    status !== 'excluded' &&
    status !== 'hired' &&
    status !== 'rejected' &&
    status !== 'interview_no_show' &&
    status !== 'interview_confirmed'
  );
}

/** バッジ表示用の色トーン。既存 inline style 流儀に合わせた hex 値ペア。 */
export interface AutomationBadgeTone {
  bg: string;
  fg: string;
  border: string;
}

const BLUE_TONE: AutomationBadgeTone = { bg: '#EFF6FF', fg: '#1D4ED8', border: '#DBEAFE' };
const NEUTRAL_TONE: AutomationBadgeTone = { bg: '#F3F4F6', fg: '#4B5563', border: '#E5E7EB' };
const AMBER_TONE: AutomationBadgeTone = { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' };
const RED_TONE: AutomationBadgeTone = { bg: '#FEE2E2', fg: '#B91C1C', border: '#FECACA' };
const PURPLE_TONE: AutomationBadgeTone = { bg: '#F3E8FF', fg: '#6B21A8', border: '#E9D5FF' };
const GREEN_TONE: AutomationBadgeTone = { bg: '#DCFCE7', fg: '#15803D', border: '#86EFAC' };

/**
 * 自動ステータスのトーンを返す。
 *  - 未設定: ニュートラル（グレー）
 *  - hired: green（採用成功）
 *  - rejected: red（不採用）
 *  - filled_received: 注意喚起なので amber
 *  - excluded / interview_no_show / no_response: ニュートラル
 *  - その他: 既定の blue
 */
export function getApplicantAutomationStatusTone(status?: ApplicantAutomationStatus): AutomationBadgeTone {
  if (!status) return NEUTRAL_TONE;
  if (status === 'hired') return GREEN_TONE;
  if (status === 'rejected') return RED_TONE;
  if (status === 'filled_received') return AMBER_TONE;
  if (status === 'excluded' || status === 'interview_no_show' || status === 'no_response') {
    return NEUTRAL_TONE;
  }
  return BLUE_TONE;
}

/**
 * 充足返信用 EmailTemplate を 1 件選ぶ (2026-05 Step 3)。
 *
 * - category === 'fulfillment' のテンプレートを先頭から探す
 * - 複数あれば最初の 1 件
 * - 拠点別オーバーライドを使う場合は、呼び出し側で base スコープに絞った
 *   templates 配列を渡すこと（このヘルパは絞り込みを行わない）
 */
export function findFulfillmentEmailTemplate(
  templates: EmailTemplate[] | undefined | null,
): EmailTemplate | undefined {
  if (!templates) return undefined;
  return templates.find((t) => t.category === 'fulfillment');
}

/**
 * メールテンプレ差し込み変数のレンダリング (2026-05 Step 3)。
 *
 * 既存テンプレ管理画面 (EmailTemplateManagement.tsx VARIABLES) の変数:
 *   {{氏名}} / {{職種}} / {{応募日}} / {{拠点}} / {{拠点住所}} / {{確定面接日}} / {{応募媒体}}
 * Step 3 で別名として下記もサポート（仕様書互換）:
 *   {{応募者名}} = {{氏名}}, {{拠点名}} = {{拠点}}, {{職種名}} = {{職種}}, {{会社名}}
 *
 * - 未取得の変数は空文字に置換（残置しない）
 * - 単純な文字列置換のみ。条件分岐 / loop はサポートしない
 */
export interface EmailTemplateRenderContext {
  applicant: Pick<
    Applicant,
    'name' | 'base' | 'job' | 'date' | 'src'
  >;
  /** 応募者の拠点に対応する Base（住所差し込み用）。無ければ undefined で OK */
  base?: Pick<Base, 'address'> | null;
  /** 自社情報。useAuth().client.companyName を渡す想定 */
  companyName?: string;
  /** 確定面接日（formatDateJP 等で整形済の文字列）。無ければ空 */
  confirmedInterviewDate?: string;
}

export function renderEmailTemplate(
  text: string,
  ctx: EmailTemplateRenderContext,
): string {
  const applicantName = ctx.applicant.name ?? '';
  const baseName = ctx.applicant.base ?? '';
  const jobName = ctx.applicant.job ?? '';
  const baseAddress = ctx.base?.address ?? '';
  const applicationDate = ctx.applicant.date ?? '';
  const source = ctx.applicant.src ?? '';
  const confirmed = ctx.confirmedInterviewDate ?? '';
  const company = ctx.companyName ?? '';

  const map: Record<string, string> = {
    '{{氏名}}': applicantName,
    '{{応募者名}}': applicantName,
    '{{職種}}': jobName,
    '{{職種名}}': jobName,
    '{{拠点}}': baseName,
    '{{拠点名}}': baseName,
    '{{拠点住所}}': baseAddress,
    '{{応募日}}': applicationDate,
    '{{応募媒体}}': source,
    '{{確定面接日}}': confirmed,
    '{{会社名}}': company,
  };

  let out = text;
  for (const [key, value] of Object.entries(map)) {
    // 単純な split/join で全置換（RegExp の特殊文字エスケープ不要）
    if (out.indexOf(key) >= 0) out = out.split(key).join(value);
  }
  return out;
}

/**
 * 自動タグのトーンを返す。
 *  - email_send_failed / chat_send_failed: red（送信失敗の注意喚起）
 *  - filled_opening_application / outside_interview_slots / invalid_contact: amber
 *  - excluded_list_match / condition_mismatch: purple
 */
export function getApplicantAutomationTagTone(tag: ApplicantAutomationTag): AutomationBadgeTone {
  switch (tag) {
    case 'email_send_failed':
    case 'chat_send_failed':
      return RED_TONE;
    case 'filled_opening_application':
    case 'outside_interview_slots':
    case 'invalid_contact':
      return AMBER_TONE;
    case 'excluded_list_match':
    case 'condition_mismatch':
      return PURPLE_TONE;
    default:
      return NEUTRAL_TONE;
  }
}
