// ファイル添付
export interface FileAttachment {
  name: string;
  size: number;
  url: string;
}

// 求人情報
export interface JobInfo {
  jobId: string;
  jobNumber: string;
  productName: string;
  jobName: string;
  publishedJobType: string;
  companyName: string;
}

// 学歴・職務経歴
export interface EducationWorkHistory {
  finalEducation: string;
  graduationYear: string;
  employmentStatus: string;
  jobChangeCount: string;
  workHistory: string;
  workHistoryOther: string;
  qualifications: string;
}

// 希望条件・動機
export interface DesiredConditions {
  preferredLocation: string;
  availableDays: string;
  availableHours: string;
  selfPr: string;
  motivation: string;
  otherQuestions: string;
}

// チャット回答
export interface ChatAnswer {
  question: string;
  answer: string;
}

// 面接希望日時
export interface PrefDateTime {
  date: string;   // YYYY-MM-DD
  time: string;   // HH:mm（空文字＝未指定）
}

// メンバー
export interface Member {
  id: number;
  name: string;
  email: string;
  phone: string;
  notifyEmail: boolean;
  notifySms: boolean;
}

// 軸別スコア
export interface AxisScore {
  axisId: string;
  axisName: string;
  score: number;          // 0-100
  weight: number;         // 評価時のウェイト
  reasons: string[];
  concerns: string[];
}

// AIスクリーニング結果
export interface ScreeningResult {
  score: number; // 0-100 総合
  recommendation: 'pass' | 'review' | 'reject';
  reasons: string[];      // 総合の加点ポイント
  concerns: string[];     // 総合の懸念ポイント
  axisScores?: AxisScore[]; // 多軸評価時のみ
  evaluatedAt: string; // ISO timestamp
  model: string;
}

// 応募者
export interface Applicant {
  id: number;
  name: string;
  furigana: string;
  email: string;
  phone: string;
  gender: string;
  age: number | string;
  birthDate: string;
  currentJob: string;
  date: string;
  job: string;
  src: string;
  stage: string;
  subStatus: string;
  base: string;
  note: string;
  needsAction: boolean;
  actionDate: string;
  actionTime: string;
  actionMemo: string;
  prefDates: PrefDateTime[];
  intResult: string;
  intMethod: string;
  active: boolean;
  duplicate: boolean;
  files: FileAttachment[];
  jobInfo: JobInfo;
  educationWorkHistory?: EducationWorkHistory;
  desiredConditions?: DesiredConditions;
  chatAnswers: ChatAnswer[];
  cancelledInterviews?: CancelledInterview[];
  screening?: ScreeningResult;
  /** ステージ変更履歴（リードタイム分析用）。新しい順または古い順（実装側で時刻順ソート）。 */
  stageHistory?: StageHistoryEntry[];

  // ============================================================
  // 分析用メタ情報（全て optional・後方互換）
  // 既存データは欠落していても画面/集計が壊れない前提。
  // 値の補完は @/utils/applicantLifecycle のヘルパで行う。
  // ============================================================
  /** 応募データ作成時刻 (ISO 8601)。未設定時は date 由来 → 現在時刻で補完。 */
  createdAt?: string;
  /** 直近の更新時刻 (ISO 8601)。Repository 経由の update で自動更新。 */
  updatedAt?: string;
  /** 直近のステータス変更時刻 (ISO 8601)。changeStage で自動更新。 */
  stageChangedAt?: string;
  /** 初回連絡時刻 (ISO 8601) */
  firstContactedAt?: string;
  /** 最終連絡時刻 (ISO 8601) */
  lastContactedAt?: string;
  /** 連絡試行回数 */
  contactAttemptCount?: number;
  /** 次回対応期限 (ISO 8601 / 日付のみ) */
  nextActionAt?: string;
  /** 担当メンバーID (Client.members[].id) */
  assignedMemberId?: number;
  /** 同一人物の過去応募ID（再応募の紐付け） */
  sourceApplicantId?: number;
  /** 求人票ID（媒体側の jobInfo.jobId とは別の社内ID） */
  jobPostId?: string;
  /** 採用キャンペーンID */
  campaignId?: string;
  /** NG理由カテゴリ */
  ngReasonCategory?: 'skill' | 'condition' | 'culture' | 'experience' | 'document' | 'other';
  /** 辞退理由カテゴリ */
  declineReasonCategory?: 'salary' | 'location' | 'other_offer' | 'family' | 'schedule' | 'other';
  /** 重複応募の本人(マスター)ID */
  duplicateOfApplicantId?: number;
  /** 個人情報利用同意ステータス */
  consentStatus?: 'pending' | 'agreed' | 'withdrawn';
  /** データ保持期限 (ISO 8601 / 日付のみ)。経過後は削除候補。 */
  dataRetentionUntil?: string;

  // ============================================================
  // 自動フロー用メタ情報（手動 stage とは別軸、全て optional・後方互換）
  //  - automationStatus: 「今どの自動フロー状態にいるか」原則1つ
  //  - automationTags: 例外理由・分岐理由・エラー理由の0個以上
  // 自動付与ロジックは別フェーズで追加予定。本フェーズでは型と表示のみ。
  // ============================================================
  /** 自動フロー上の現状況。未設定なら表示上「未設定」扱い。 */
  automationStatus?: ApplicantAutomationStatus;
  /** 自動フロー上の例外理由 / 分岐理由 / エラー理由。0 個以上。 */
  automationTags?: ApplicantAutomationTag[];
}

/**
 * 応募者の自動ステータス（手動 stage とは別軸）。
 *
 * - 「今どの自動フロー状態にいるか」を表す
 * - 原則 1 つ。Applicant.automationStatus に保持
 * - 表示ラベルは src/utils/applicantAutomation.ts を参照
 */
export type ApplicantAutomationStatus =
  | 'schedule_not_sent'
  | 'scheduling'
  | 'questions_answered_no_schedule'
  | 'preferred_dates_collected'
  | 'interview_pending_confirmation'
  | 'interview_confirmed'
  | 'interview_completed'
  | 'no_response'
  | 'following_up'
  | 'interview_no_show'
  | 'filled_received'
  | 'excluded';

/**
 * 応募者の自動タグ（例外理由・分岐理由・エラー理由）。
 *
 * - 通常フローでは tags が空でもよい
 * - Applicant.automationTags に 0 個以上保持
 * - 表示ラベルは src/utils/applicantAutomation.ts を参照
 */
export type ApplicantAutomationTag =
  | 'invalid_contact'
  | 'condition_mismatch'
  | 'outside_interview_slots'
  | 'excluded_list_match'
  | 'filled_opening_application'
  | 'email_send_failed'
  | 'chat_send_failed';

/**
 * ステージ変更1件分のスナップショット。
 *
 * 後方互換: 旧形式 `{ stage, changedAt }` のみのデータも引き続き読める。
 * 追加項目は全て optional。
 */
/**
 * ステージ変更理由。
 *
 * 用途:
 *  - stageHistory に「なぜそのステージへ動いたか」の意図を残す
 *  - リードタイム集計や監査ログで、手動操作と自動処理を区別する
 *
 * 値の意味:
 *  - manual_single: 単一応募者の手動変更（一覧/詳細/カンバン）
 *  - manual_bulk: 管理画面等での明示的な一括手動変更（将来）
 *  - filter_condition_applied: フィルタ条件「対象外に移動」実行
 *  - exclusion_list_applied: 除外リスト追加に伴うマッチ済み応募者の一括移動
 *  - interview_scheduled: 面接予約に伴う「面接確定」自動遷移
 *  - csv_import: CSV インポート時の初期/上書き設定（将来）
 *  - system: 上記いずれにも該当しないフォールバック
 */
export type StageChangeReason =
  | 'manual_single'
  | 'manual_bulk'
  | 'filter_condition_applied'
  | 'exclusion_list_applied'
  | 'interview_scheduled'
  | 'csv_import'
  | 'system';

export interface StageHistoryEntry {
  /** 変更後のステージ名 (Status.name) */
  stage: string;
  /** ISO 8601 タイムスタンプ ("2026-04-30T09:30:00.000Z") */
  changedAt: string;
  /** 変更前ステージ名（任意） */
  fromStage?: string;
  /** 変更後ステージ名のスナップショット（任意。`stage` と同値） */
  toStage?: string;
  /** 操作者表示名（任意。Client.contactName 等） */
  operator?: string;
  /** 変更理由（任意） */
  reason?: StageChangeReason;
}

// キャンセルされた面接履歴
export interface CancelledInterview {
  date: string;
  start: string;
  end: string;
  base: string;
  method: string;
  cancelledAt: string; // キャンセル実施日時
}

// イベント（面接）
export interface InterviewEvent {
  id: number;
  applicantId: number;
  date: string;
  start: string;
  end: string;
  title: string;
  color: string;
  base: string;
  method: string;
}

// ステータス
export type StatusCategory =
  | 'screening' // 選考中（応募/書類選考 等）
  | 'interview' // 面接調整中・面接確定
  | 'offered'   // 内定（承諾前）
  | 'hired'     // 採用決定（内定承諾済 等、まだ稼働前）
  | 'active'    // 稼働・入社済み
  | 'ng';       // 不合格・辞退・対象外・重複 等

export interface Status {
  id: number;
  name: string;
  color: string;
  active: boolean;
  order: number;
  subStatuses: string[];
  /** レポート集計の分類タグ。未設定なら名前から推定。 */
  category?: StatusCategory;
}

// 応募媒体
export interface Source {
  id: number;
  name: string;
  color: string;
  monthlyCost: number;
  loginId: string;
  password: string;
  url: string;
}

// 拠点
export interface Base {
  id: number;
  name: string;
  nameKana: string;
  address: string;
  phone: string;
  matchingCondition: string;
  notes: string;
  registeredDate: string;
  color: string;
  slotInterval: number;
  startTime: string;
  endTime: string;
}

// 職種
export interface Job {
  id: number;
  name: string;
  color: string;
}

// 募集状況（拠点×職種ごと）
export type RecruitmentOpeningStatus = 'open' | 'filled';

/**
 * 拠点×職種 単位の募集状況。
 * 未登録の (baseName, jobName) は 'open' 扱い（呼び出し側でフォールバック）。
 * id は makeOpeningId(baseName, jobName) で生成し Firestore doc id に流用する。
 */
export interface RecruitmentOpening {
  /** `${baseSlug}__${jobSlug}` 形式の natural key */
  id: string;
  baseName: string;
  jobName: string;
  status: RecruitmentOpeningStatus;
  /** 拠点×職種ごとに充足返信メールテンプレを差し替えたい場合（Step 3 で利用予定） */
  filledMessageTemplateId?: number;
  /** filled に切り替えた時刻 ISO 8601 */
  filledAt?: string;
  /** filled に切り替えた操作者表示名 */
  filledBy?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// クライアント操作ログ
export interface ClientOperationLog {
  id: string;
  timestamp: string;
  operator: string;
  category: 'applicant' | 'email' | 'auth' | 'setting' | 'other';
  action: string;
  target: string;
  detail?: string;
}

// クライアント権限
export interface ClientPermissions {
  status: boolean;
  source: boolean;
  base: boolean;
  job: boolean;
  hearing: boolean;
  filtercond: boolean;
  mailtemplate: boolean;
  exclusion: boolean;
  chatbot: boolean;
}

// クライアントオプション
export type ClientOptionKey = 'aiScreening' | 'recruitmentReport';

export type ClientOptionStatus = 'active' | 'paused' | 'cancelled';

export interface ClientOption {
  key: ClientOptionKey;
  status: ClientOptionStatus;
  startedAt?: string;       // 契約開始日 YYYY-MM-DD
  endedAt?: string;         // 解約日 YYYY-MM-DD（契約終了時のみ）
  monthlyFee?: number;      // 月額（円）
  monthlyLimit?: number | null;  // 月間使用上限（null/未設定 = 無制限）
  // 当月の使用カウント（YYYY-MM がキー、AI評価実行回数）
  usageByMonth?: { [yearMonth: string]: number };
  memo?: string;
}

// クライアント
export interface Client {
  id: string;
  companyName: string;
  /**
   * I-5: AuthContext.client (画面側 state) では password を保持しないため optional 化。
   * password を持つのは clientRepository から直接取得した時だけ (認証照合 / 管理画面表示用)。
   * 画面側で `client.password` を直接読まないこと。パスワード変更は authService.changePassword 経由のみ。
   */
  password?: string;
  accountType: 'parent' | 'child';
  parentId?: string;
  baseName?: string;
  plan: 'trial' | 'standard' | 'professional' | 'enterprise';
  status: 'active' | 'inactive';
  contractStart?: string;
  contractEnd?: string;
  contactName?: string;
  contactEmail?: string;
  memo?: string;
  permissions: ClientPermissions;
  members: Member[];
  notificationEmail?: string;
  smsPhone?: string;
  // オプション契約
  options?: { [key in ClientOptionKey]?: ClientOption };

  // ─── 解約・データ保持ポリシー（2026-05 追加） ───
  /** 解約予約日（YYYY-MM-DD）。未到来なら有効、到来後は status='inactive' へ自動遷移を想定 */
  cancellationDate?: string;
  /** 解約申請を受け付けた日時（ISO timestamp）。問い合わせ履歴用 */
  cancellationRequestedAt?: string;
  /** 解約理由（自由記述） */
  cancellationReason?: string;
  /** データ削除予定日（YYYY-MM-DD）。これを過ぎたらバッチで物理削除候補 */
  dataRetentionUntil?: string;
  /** 復元期限（保持期間内は復元可。dataRetentionUntil と同義で使ってもよい） */
  restorableUntil?: string;

  // ─── 緊急 kill switch（2026-05 追加） ───
  /**
   * 機能個別の停止フラグ。true = 一時停止中。クライアント側 UI / API の各経路でチェック。
   * 既存の status: 'inactive' は全停止だが、これは部分停止用。
   */
  featureKillSwitches?: {
    aiScreening?: boolean;        // AI スクリーニング実行を停止
    recruitmentReport?: boolean;  // 採用レポート集計・配信を停止
    emailSend?: boolean;          // メール送信全般を停止
    smsSend?: boolean;            // SMS 送信全般を停止
    chatbot?: boolean;            // チャットボット応答を停止
    webhookDelivery?: boolean;    // Webhook 配信を停止
  };
  /** 強制ログアウト指示（このタイムスタンプより前に発行されたセッションを無効化） */
  sessionInvalidatedAt?: string;
}

// メールテンプレート カテゴリ (2026-05 Step 3 追加)。
//  - general: 汎用（既存テンプレート互換のデフォルト）
//  - interview: 面接案内
//  - rejection: 不採用通知
//  - fulfillment: 充足返信（filled_received 応募者向け）
// 既存テンプレートに category が無い場合は general 扱い。
export type EmailTemplateCategory =
  | 'general'
  | 'interview'
  | 'rejection'
  | 'fulfillment';

// メールテンプレート
export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  /** カテゴリ（未指定は 'general' 扱い）。Step 3 で追加 */
  category?: EmailTemplateCategory;
}

// 除外リスト
export interface ExclusionEntry {
  id: number;
  type: 'email' | 'phone' | 'name_birth';
  email?: string;
  phone?: string;
  name?: string;
  birthDate?: string;
}

// フィルタ条件
export interface FilterCondition {
  ageEnabled: boolean;
  ageMin: number;
  ageMax: number;
  genderFilter: string[];
  sourceFilter: string[];
  jobFilter: string[];
  excludeStatus: string;
  flagAges: number[];
}

// ヒアリング
export interface HearingTemplate {
  jobName: string;
  template: string;
}

// 面接枠
export interface SlotSetting {
  [dateKey: string]: {
    [timeKey: string]: number;
  };
}

// ─── チャット設定（リード）新設計 ────────────────────────────────────────────

export interface ChatLeadChoice {
  id: number;
  label: string;
  judgment: 'ok' | 'ng';
  action: 'next' | 'ng_immediate';
}

export interface ChatLeadQuestion {
  id: number;
  content: string;
  answerType: 'single' | 'multiple' | 'freetext';
  choices: ChatLeadChoice[];
}

export interface ChatInterviewCalendar {
  id: number;
  baseName: string;
  methods: string[];
  /** 日程確定方式。'instant_booking'=即時面接設定（チャット内で枠提示して確定） /
   *  'request_candidates'=面接希望回収（第1〜第3希望を集めて運用側で手動確定）。
   *  未設定（既存データ）は 'request_candidates' として扱う。 */
  scheduleMode?: 'instant_booking' | 'request_candidates';
  preDateMessage: string;
  chatEndMessage: string;
  confirmedMessage: string;
  methodDecidedMessage: string;
}

export interface ChatLeadSetting {
  id: number;
  baseName: string;
  leadName: string;
  startMessage: string;
  questions: ChatLeadQuestion[];
  ngMessageImmediate: string;
  ngMessageAfterAll: string;
  interviewCalendars: ChatInterviewCalendar[];
}

// チャットボット
export interface ChatButton {
  label: string;
  nextScenarioId?: number;
}

export interface ChatMessage {
  id: number;
  text: string;
  buttons: ChatButton[];
}

export interface ChatScenario {
  id: number;
  name: string;
  messages: ChatMessage[];
}

export interface ChatQuestion {
  id: number;
  text: string;
}

export interface ChatQuestionGroup {
  id: number;
  name: string;
  questions: ChatQuestion[];
}

// 評価軸の重要度（★1〜★3）
export type CriteriaImportance = 1 | 2 | 3;

// チェック項目のタイプ
export type CriteriaItemType = 'check' | 'number' | 'text';

// チェック項目
export interface CriteriaItem {
  id: string;
  label: string;                       // 例: 法人営業経験
  type: CriteriaItemType;
  importance?: CriteriaImportance;     // 必須要件では未使用、望ましい/避けたいで使用
  // type=number 用
  numberValue?: number;
  numberOperator?: 'gte' | 'lte' | 'eq';
  numberUnit?: string;                 // 例: 年
  // type=text 用
  textValue?: string;
}

// 軸の重要度（1-5、シンボルモード用）
export type AxisImportance = 1 | 2 | 3 | 4 | 5;

// 評価軸
export interface ScoringAxis {
  id: string;
  name: string;                        // 例: 経験・スキル
  description?: string;                // 軸の説明（UI用）
  weight: number;                      // 0-100（軸全体で合計100%）
  importance?: AxisImportance;         // ★1-★5。シンボルモード時はこれから weight を自動計算
  guidance?: string;                   // AIへの追加指示（フリーテキスト）

  requirements: CriteriaItem[];        // 必須要件（importance不使用）
  preferences: CriteriaItem[];         // 望ましい要件（旧:加点）
  avoidances: CriteriaItem[];          // 避けたい要件（旧:減点）
}

// AIスクリーニング設定 - 職種別オーバーライドの本体（しきい値・enabledは全社共通）
export interface ScreeningCriteriaBody {
  // v1 互換用（旧形式・マイグレーション元）
  evaluationPoints: string;
  requiredQualities: string;
  ngQualities: string;
  // v2 多軸形式（推奨）
  axes?: ScoringAxis[];
}

// AIスクリーニング設定
export interface ScreeningCriteria extends ScreeningCriteriaBody {
  enabled: boolean;
  passThreshold: number; // 推奨「合格」のスコア下限
  rejectThreshold: number; // 推奨「不合格」のスコア上限
  // 職種別オーバーライド（継承モデル：未設定なら全社デフォルトを使用）
  byJob?: { [jobName: string]: ScreeningCriteriaBody };
}

// ストレージに保存するデータ全体
export interface ClientData {
  applicants: Applicant[];
  events: InterviewEvent[];
  statuses: Status[];
  sources: Source[];
  bases: Base[];
  jobs: Job[];
  emailTemplates: EmailTemplate[];
  exclusionList: ExclusionEntry[];
  filterCondition: FilterCondition;
  filterConditions?: { [baseName: string]: FilterCondition };
  hearingTemplates: HearingTemplate[];
  slotSettings: { [baseName: string]: SlotSetting };
  chatScenarios: ChatScenario[];
  chatQuestionGroups: ChatQuestionGroup[];
  chatLeadSettings?: ChatLeadSetting[];
  // 拠点別オーバーライド（継承モデル：未設定なら全社共通を使用）
  jobsByBase?: { [baseName: string]: Job[] };
  sourcesByBase?: { [baseName: string]: Source[] };
  emailTemplatesByBase?: { [baseName: string]: EmailTemplate[] };
  screeningCriteria?: ScreeningCriteria;
  /** 月次採用目標（YYYY-MM → 採用目標人数）。レポートの達成率/着地ヨミ計算に使用。 */
  recruitmentGoals?: { [yearMonth: string]: number };
  /** 媒体別月次費用（YYYY-MM → 媒体名 → 費用円）。レポートのCPA/CPH計算に使用。 */
  mediaCosts?: { [yearMonth: string]: { [sourceName: string]: number } };
  /** レポート定期配信設定 */
  reportSchedule?: ReportScheduleSetting;
  /** SMS送信履歴。月単位の集計用に保持。 */
  smsLogs?: SmsLog[];
  /** メール送信履歴（2026-05 追加） */
  emailLogs?: EmailLog[];
  /**
   * 統合連絡ログ（2026-05 追加）。
   * SMS/メールを将来別サービス化する前提のチャネル抽象ログ。
   * 既存の smsLogs / emailLogs は当面残す（破壊的変更を避けるため）。
   */
  messageLogs?: MessageLog[];
  /** Webhook 配信履歴（2026-05 追加） */
  webhookLogs?: WebhookLog[];
  /** Anthropic API 呼び出し履歴（2026-05 追加）。コスト集計用 */
  apiCallLogs?: ApiCallLog[];
  /** 月次請求書履歴（2026-05 追加） */
  invoices?: InvoiceLog[];
  /**
   * 拠点×職種ごとの募集状況 (2026-05 追加, Step 1)。
   * 未登録の組み合わせは 'open' 扱い。
   * id は `${baseSlug}__${jobSlug}` の natural key で重複を防ぐ。
   */
  recruitmentOpenings?: RecruitmentOpening[];
}

/** SMS送信1件の記録 */
export interface SmsLog {
  id: number;
  /** ISO timestamp */
  sentAt: string;
  /** 送信先電話番号 */
  to: string;
  /** 関連応募者ID（任意） */
  applicantId?: number;
  /** 本文の先頭(プレビュー用) */
  preview: string;
  /** 送信ステータス: success/failed/pending */
  status: 'success' | 'failed' | 'pending';
  /** 失敗時のエラーメッセージ */
  errorMessage?: string;
  /** 操作者(クライアント側のメンバー名) */
  sentBy?: string;
}

/** メール送信1件の記録（2026-05 追加） */
export interface EmailLog {
  id: number;
  sentAt: string;        // ISO timestamp
  to: string;            // 宛先
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** 本文プレビュー（先頭 200 文字程度） */
  preview: string;
  applicantId?: number;
  /** テンプレート ID（手動送信なら未設定） */
  templateId?: number;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
  sentBy?: string;
  /** 何度目の送信か。リトライ時に増える */
  attempt?: number;
}

/**
 * 連絡チャネル。将来 LINE / 電話 等を増やす場合はここに追加する。
 */
export type MessageChannel = 'email' | 'sms';

/**
 * 連絡方向。outbound = 自社→応募者、inbound = 応募者→自社（返信受信）。
 */
export type MessageDirection = 'outbound' | 'inbound';

/**
 * 連絡ステータス。プロバイダ側のイベントを統一表現するための語彙。
 *  - draft: 下書き（未送信）
 *  - queued: キュー投入済み（プロバイダ送信待ち）
 *  - sent: プロバイダに送信完了（受信側到達は未確認）
 *  - delivered: 受信側端末/MTA まで到達確認
 *  - failed: 送信失敗
 *  - opened: 開封確認（メール）
 *  - clicked: リンククリック確認
 *  - replied: 返信あり
 *  - bounced: バウンス
 *  - cancelled: 送信前にキャンセル
 */
export type MessageStatus =
  | 'draft'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'cancelled';

/**
 * 統合連絡ログ（2026-05 追加）。
 *
 * 設計方針:
 *  - SMS/メール/将来チャネルを単一スキーマで扱う
 *  - 実際の送信処理は ATS 内ではまだ持たない。将来別サービス（mailer/smsr）が
 *    プロバイダ呼び出しを担い、このログを生成・更新する想定
 *  - externalMessageId は Twilio SID / SendGrid X-Message-Id 等の外部 ID
 *  - bodyPreview は本文の先頭プレビュー（全文は将来 BLOB ストレージ等へ）
 */
export interface MessageLog {
  /** 文字列 ID（UUID 風）。Repository 側で自動生成。 */
  id: string;
  /** 関連応募者 ID */
  applicantId: number;
  channel: MessageChannel;
  direction: MessageDirection;
  status: MessageStatus;
  /** 使用したテンプレート ID（手動送信なら未設定） */
  templateId?: number;
  /** 外部プロバイダ側のメッセージ ID（Twilio SID 等） */
  externalMessageId?: string;
  /** プロバイダ識別子: 'twilio' | 'sendgrid' | 'gmail' | ... */
  provider?: string;
  /** メール件名（SMS の場合は未設定） */
  subject?: string;
  /** 本文プレビュー（先頭 200 文字程度） */
  bodyPreview?: string;
  /** 送信時刻 (ISO 8601) */
  sentAt?: string;
  /** プロバイダ delivered イベント時刻 */
  deliveredAt?: string;
  /** 開封イベント時刻 */
  openedAt?: string;
  /** クリックイベント時刻 */
  clickedAt?: string;
  /** 返信受信時刻 */
  repliedAt?: string;
  /** 失敗時刻 */
  failedAt?: string;
  /** 失敗時のエラーメッセージ */
  errorMessage?: string;
  /** ログ作成時刻 (ISO 8601)。Repository 経由で自動付与。 */
  createdAt: string;
  /** ログ最終更新時刻 (ISO 8601)。Repository 経由で自動付与。 */
  updatedAt: string;
  /** 操作者表示名（クライアント側メンバー名 等） */
  createdBy?: string;
}

/** Webhook 配信1件の記録（2026-05 追加） */
export interface WebhookLog {
  id: number;
  firedAt: string;        // ISO timestamp
  /** Webhook 種別キー（applicant.created など） */
  event: string;
  /** 配信先 URL */
  url: string;
  /** HTTP ステータスコード（接続失敗なら null） */
  responseStatus: number | null;
  /** 応答ボディ先頭プレビュー */
  responsePreview?: string;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
  attempt?: number;
  /** 次回再送予定時刻（リトライ予定時） */
  nextRetryAt?: string;
}

/**
 * Anthropic API 呼び出し1件の記録（2026-05 追加）。
 * クライアント別月次コスト集計に使う。
 * サーバー側で呼び出し完了時に作成し、ClientData に push する想定。
 */
export interface ApiCallLog {
  id: number;
  /** ISO timestamp */
  calledAt: string;
  /** 用途キー: 'screening' | 'reportSummary' | 'jobpost' など */
  purpose: 'screening' | 'reportSummary' | 'jobpost' | 'other';
  /** モデル ID（claude-opus-4-6 など） */
  model: string;
  /** 入力トークン */
  inputTokens: number;
  /** 出力トークン */
  outputTokens: number;
  /** Cache 読み込み（Anthropic prompt caching を使った場合） */
  cacheReadTokens?: number;
  /** Cache 作成 */
  cacheCreationTokens?: number;
  /** USD 推定コスト（小数。為替変換は別レイヤ） */
  estimatedUsd: number;
  /** 関連応募者 ID（screening の場合） */
  applicantId?: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/** 月次請求書（2026-05 追加） */
export interface InvoiceLog {
  id: number;
  /** YYYY-MM。請求対象月 */
  yearMonth: string;
  /** 発行日 ISO */
  issuedAt: string;
  /** 小計（税抜・円）。lines の合計と一致。2026-05-04 追加 */
  subtotal?: number;
  /** 消費税率（小数。例 0.10）。2026-05-04 追加 */
  taxRate?: number;
  /** 消費税額（円）。2026-05-04 追加 */
  tax?: number;
  /** 請求金額（円、税込） */
  totalAmount: number;
  /** 内訳行（各行の金額は税抜） */
  lines: InvoiceLine[];
  /** PDF を生成済みなら data URL or 保存パス */
  pdfUrl?: string;
  /** メール送付済みフラグ */
  emailedAt?: string;
  /** 入金確認日 */
  paidAt?: string;
  /** ステータス */
  status: 'draft' | 'issued' | 'sent' | 'paid' | 'void';
  memo?: string;
}

export interface InvoiceLine {
  /** 'plan' | 'option:aiScreening' | 'sms-overage' | 'custom' など */
  kind: string;
  description: string;
  /** 単価（円） */
  unitPrice: number;
  /** 数量（基本 1。SMS 超過件数など） */
  quantity: number;
  /** 行合計（unitPrice * quantity） */
  amount: number;
}

/** レポート定期配信設定 */
export interface ReportScheduleSetting {
  enabled: boolean;
  /** 配信頻度 */
  frequency: 'monthly' | 'biweekly' | 'weekly';
  /** 月次配信の場合の日付 (1-28)。週次/隔週は曜日 (0=日, 1=月, ...) */
  dayOfMonth?: number;
  dayOfWeek?: number;
  /** 配信時刻 'HH:MM' */
  time?: string;
  /** 配信先メールアドレス（複数可） */
  recipients: string[];
  /** 配信時に使う期間プリセット */
  rangePreset: 'lastMonth' | 'lastQuarter' | 'lastHalf';
  /** AI総評を含めるか */
  includeAi: boolean;
  /** 直近の配信実行履歴 */
  lastRunAt?: string;        // ISO timestamp
  lastRunStatus?: 'success' | 'failed';
  lastRunError?: string;
}
