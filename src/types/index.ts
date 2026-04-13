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
  chatAnswers: ChatAnswer[];
  cancelledInterviews?: CancelledInterview[];
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
  hearingTemplates: HearingTemplate[];
  slotSettings: { [baseName: string]: SlotSetting };
  chatScenarios: ChatScenario[];
  chatQuestionGroups: ChatQuestionGroup[];
}
