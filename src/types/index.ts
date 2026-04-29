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
export type ClientOptionKey = 'aiScreening';

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
}
