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
}

/** ステージ変更1件分のスナップショット */
export interface StageHistoryEntry {
  /** 変更後のステージ名 (Status.name) */
  stage: string;
  /** ISO 8601 タイムスタンプ ("2026-04-30T09:30:00.000Z") */
  changedAt: string;
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
  password: string;
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

// メールテンプレート
export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
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
  /** Webhook 配信履歴（2026-05 追加） */
  webhookLogs?: WebhookLog[];
  /** Anthropic API 呼び出し履歴（2026-05 追加）。コスト集計用 */
  apiCallLogs?: ApiCallLog[];
  /** 月次請求書履歴（2026-05 追加） */
  invoices?: InvoiceLog[];
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
