import type {
  Applicant,
  ApplicantAutomationStatus,
  ApplicantAutomationTag,
  Base,
  EmailTemplate,
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

/**
 * 自動ステータスのトーンを返す。
 *  - 未設定: ニュートラル（グレー）
 *  - filled_received: 注意喚起なので amber
 *  - excluded / interview_no_show / no_response: ニュートラル
 *  - その他: 既定の blue
 */
export function getApplicantAutomationStatusTone(status?: ApplicantAutomationStatus): AutomationBadgeTone {
  if (!status) return NEUTRAL_TONE;
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
