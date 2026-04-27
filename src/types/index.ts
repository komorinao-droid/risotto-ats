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

// AIスクリーニング結果
export interface ScreeningResult {
  score: number; // 0-100
  recommendation: 'pass' | 'review' | 'reject';
  reasons: string[];
  concerns: string[];
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
export interface Status {
  id: number;
  name: string;
  color: string;
  active: boolean;
  order: number;
  subStatuses: string[];
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
  category: 'applicant' | 'email' | 'auth' | 'other';
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

// AIスクリーニング設定 - 職種別オーバーライドの本体（しきい値・enabledは全社共通）
export interface ScreeningCriteriaBody {
  evaluationPoints: string; // 評価観点（フリーテキスト）
  requiredQualities: string; // 必須要件
  ngQualities: string; // NG要件
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
}
