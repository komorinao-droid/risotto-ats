import type { ApplicantAutomationStatus, ApplicantAutomationTag } from '@/types';

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
