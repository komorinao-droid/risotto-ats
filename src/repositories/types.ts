/**
 * Repository インターフェース定義
 *
 * 目的:
 *  - 画面/フックから「保存先（localStorage / Firestore / Cloud SQL / Sheets）」を隠蔽する
 *  - 将来、別バックエンド実装に差し替えやすくする
 *
 * 注意:
 *  - 現状の戻り値型は同期 (T) のままにし、画面側の変更を最小化する
 *  - 将来 Firestore 等に切り替える際は Promise<T> に揃えるが、その時点でまとめて async/await 化する
 *  - 段階移行のため、まずは AuthContext と RecruitmentReport の参照箇所だけが利用する
 */
import type { Applicant, Base, Client, ClientData, EmailTemplate, HearingTemplate, InterviewEvent, Job, MessageLog, MessageStatus, SlotSetting, Source, StageChangeReason, Status } from '@/types';
import type { StageChangeOptions } from '@/utils/applicantLifecycle';

/**
 * 一括ステージ変更の1件分の指示。
 *  - applicantId: 対象応募者ID
 *  - toStage: 遷移先ステージ
 *  - patch: ステージ変更と同時に当てたい部分更新（例: active: false）
 *      withStageChange 適用後にスプレッドで上書きされる。
 */
export interface BulkStageChangePatch {
  applicantId: number;
  toStage: string;
  patch?: Partial<Pick<Applicant, 'active'>>;
}

/**
 * 一括ステージ変更時の共通オプション。
 *  - operator / reason は必須（誰が何の目的で動かしたか stageHistory に必ず残す）
 *  - changedAt はテストや時刻固定用途に上書き可能
 */
export interface BulkStageChangeOptions {
  operator: string;
  reason: StageChangeReason;
  changedAt?: string;
}

/**
 * 一括ステージ変更の結果。
 *  - updatedCount: 実際に stage が変わった件数
 *  - skipped: 変更しなかったエントリの理由
 *      - 'not_found': patches で指定された applicantId が現在のデータに存在しない
 *      - 'same_stage': 既に toStage と同じステージ（履歴汚染を避けるため明示的に skip）
 */
export interface BulkStageChangeResult {
  updatedCount: number;
  skipped: Array<{ applicantId: number; reason: 'not_found' | 'same_stage' }>;
}

/**
 * ステータス定義削除に伴う applicants 側カスケード処理の結果。
 *  - clearedApplicantCount: stage === deletedStatusName で stage を '' にクリアした applicant 数
 *  - cleanedHistoryCount: stageHistory から取り除いたエントリ数
 *      （h.stage === deletedStatusName または h.toStage === deletedStatusName のものを除去。
 *        h.fromStage 参照のみのエントリは「過去にそのステージから出た」事実として残す）
 */
export interface ClearStageForDeletedStatusResult {
  clearedApplicantCount: number;
  cleanedHistoryCount: number;
}

/** 応募者IDから親clientIdを解決する際などに使う共通ヘルパ */
export interface ClientIdResolver {
  /** 子アカウントの場合は親IDに変換、親はそのまま返す */
  resolveDataOwnerId(client: Client): string;
}

/**
 * `ClientRepository.delete` の戻り値（Phase M-1 で追加）。
 *
 * カスケード方針:
 *  - parent 削除時: clients 配列から自身 + 全 child アカウントを除去（既存 AdminApp.handleDelete と互換）
 *  - child 削除時: clients 配列から自身のみ除去（deletedChildAccountCount は常に 0）
 *  - clientData (`hireflow:client:{id}:data`) / operationLogs (`hireflow:client:{id}:logs`) は触らない
 *    （AdminApp orchestrator 側で `clientDataRepository.delete` と `localStorage.removeItem` を別途呼ぶ責務）
 */
export interface DeleteClientResult {
  /** clients 配列から該当 id が実際に除去されたか（不在なら false） */
  removed: boolean;
  /** 同時に除去された child アカウント数（parent 削除時のみ > 0、child 削除時は 0） */
  deletedChildAccountCount: number;
}

/**
 * `ClientRepository.detachChildBaseName` の戻り値（Phase M-1 で追加）。
 */
export interface DetachChildBaseNameResult {
  /** baseName を undefined にクリアした child アカウント数（0 なら save も呼ばれない） */
  detachedCount: number;
}

/**
 * Client（運営側のクライアント企業）の基本操作。
 *
 * 責務境界:
 *  - 本 Repository は `hireflow:clients` 配列の薄いラッパに留める（storage.getClients / saveClients のみ参照）。
 *    他 Repository は呼ばない（循環依存を作らない）。
 *  - password の照合・変更は authService の責務。`findForLogin` のみ歴史的経緯で残しているが
 *    authService 内部からのみ呼ばれ、画面コードからは利用されない。
 *  - `update` の patch は `password` を型レベルで除外する（password 変更は authService.changePassword 経由のみ）。
 *  - clientData / operationLogs / Firebase Auth ユーザーの削除は本 API では扱わない（呼出側 orchestrator の責務）。
 *
 * 段階移行（Phase M）:
 *  - M-1: 型 + LocalStorage 実装の追加（画面未連携、本フェーズ）
 *  - M-2: AccountSettings の storage.saveClients 直叩きを update 経由に
 *  - M-3: baseRepository.deleteWithCascade の child detach 部分を detachChildBaseName 経由に
 *  - M-4〜M-7: AdminApp 側 callsite を Repository / authService.adminResetPassword 経由に
 */
export interface ClientRepository {
  list(): Client[];
  findById(id: string): Client | undefined;
  /**
   * 認証用: ID + パスワード照合（現状は平文等価判定。
   * 将来は authService 側に移し、ハッシュ照合 / Firebase Auth に差し替える）。
   */
  findForLogin(id: string, password: string): Client | undefined;
  /**
   * 全件差し替え（既存互換のため M-1 でも残す）。
   *
   * 段階移行の方針:
   *  - 新規 callsite は `create` / `update` / `delete` を優先利用する
   *  - 既存 callsite (AdminApp.saveAndReload 等) は M-4〜M-7 で順次置換
   *  - 全 callsite が置換されたら本 API は撤去候補（Phase J-5 で検討）
   */
  saveAll(clients: Client[]): void;

  /**
   * 1 件追加する（Phase M-1 で追加）。
   *
   * 動作:
   *  - `client.id` が必須（呼出側が採番する。AdminApp の既存挙動互換）。
   *  - 既に同じ id が存在する場合は **既存 Client を返し、save を呼ばない**（idempotent / no-op）。
   *    AdminApp.handleSave で衝突するケースは現状ないが、防御的にこの挙動を取る。
   *  - LocalStorage 期は `client.password` を保持してよい（型上 optional）。
   *    Firestore 化（Phase J-3）時に password を Firestore に書かない設計に切替予定。
   *  - 戻り値は実際に追加された Client、または既存衝突時の既存 Client。
   *
   * Firestore マッピング:
   *  - parent: `tenants/{tid}` doc set
   *  - child: `tenants/{parentTid}/accounts/{accountId}` doc set
   *  - Firebase Auth ユーザー作成は本 API では扱わない（Cloud Functions / authService.createAccount 経由）
   */
  create(client: Client): Client;

  /**
   * 部分更新する（Phase M-1 で追加）。
   *
   * 動作:
   *  - patch は `Partial<Omit<Client, 'id' | 'password'>>`。id と password は型レベルで除外。
   *    （password 変更は authService.changePassword / adminResetPassword 経由のみ）
   *  - 該当 id が見つからなければ undefined を返す（save も呼ばない）
   *  - patch の全フィールドが既存値と一致するなら save を呼ばない（無駄な書込防止）
   *  - 戻り値は更新後 Client。既存値との一致で no-op の場合も「現在の Client」を返す
   *
   * Firestore マッピング:
   *  - `tenants/{tid}` doc または `tenants/{parentTid}/accounts/{accountId}` doc の `updateDoc(patch)`
   */
  update(
    id: string,
    patch: Partial<Omit<Client, 'id' | 'password'>>,
  ): Client | undefined;

  /**
   * 1 件削除する（Phase M-1 で追加）。
   *
   * 動作:
   *  - clients 配列から該当 id を除去
   *  - parent 削除時: 配下の child アカウント (accountType === 'child' && parentId === id) も同時に除去
   *  - child 削除時: 自身のみ除去（deletedChildAccountCount は 0）
   *  - 該当 id が存在しなければ no-op（save も呼ばない、removed: false で返す）
   *  - clientData / operationLogs / Firebase Auth ユーザーの削除は本 API では扱わない
   *    （AdminApp orchestrator 側で clientDataRepository.delete + localStorage.removeItem を呼ぶ）
   *
   * Firestore マッピング:
   *  - parent 削除: Cloud Functions で `tenants/{tid}` 配下の全 subcollection 削除（500 doc 上限超のため）
   *  - child 削除: `tenants/{parentTid}/accounts/{accountId}` doc 削除
   *  - Firebase Auth ユーザー削除は authService 経由
   */
  delete(id: string): DeleteClientResult;

  /**
   * 親 ID 一致の child アカウント一覧を返す（Phase M-1 で追加）。
   *
   * 用途:
   *  - AdminApp で「この parent 配下の子アカウント一覧」を頻繁に filter している箇所の共通化
   *  - BaseRepository.deleteWithCascade などからも参照可能（本 API 単体は read のみ）
   *
   * 動作:
   *  - clients 配列から `accountType === 'child' && parentId === parentId` を返す
   *  - 該当なしは空配列。順序は保存時のまま
   */
  listChildren(parentId: string): Client[];

  /**
   * 子アカウントの baseName を一括クリアする（Phase M-1 で追加）。
   *
   * 用途:
   *  - BaseRepository.deleteWithCascade からの呼出（拠点削除時に子アカウントの担当拠点を外す）
   *  - 現状は baseRepository.ts が storage.saveClients 直叩きで実施。M-3 で本 API 経由に置換予定
   *
   * 動作:
   *  - `accountType === 'child' && parentId === parentId && baseName === baseName` の子アカウントの
   *    baseName を undefined にする
   *  - 該当なしの場合は no-op（save を呼ばない、detachedCount: 0 で返す）
   *
   * Firestore マッピング:
   *  - 該当 child accounts doc の `updateDoc({ baseName: FieldValue.delete() })` を WriteBatch でまとめる
   *  - Firebase Auth Custom Claims の baseName 更新は Cloud Functions 経由（本 API では扱わない）
   */
  detachChildBaseName(
    parentId: string,
    baseName: string,
  ): DetachChildBaseNameResult;
}

/**
 * ClientData（応募者・イベント・設定 etc）の読み書き。
 * 子アカウントの拠点フィルタは "呼び出し側 (AuthContext)" の責務として残し、
 * Repository は素のデータを扱う（Phase 1 では責務を増やさない）。
 */
export interface ClientDataRepository {
  get(clientId: string): ClientData;
  save(clientId: string, data: ClientData): void;
  delete(clientId: string): void;
}

/**
 * 応募者の CRUD ＋ ステージ変更を Repository 経由で行うインターフェース。
 *
 * 方針:
 *  - 既存画面 (ApplicantDetail / ApplicantList / AdminApp) は引き続き
 *    AuthContext.updateClientData を使い続けて良い。Repository は段階移行用。
 *  - 書き込み系 (create/update/changeStage) は applicantLifecycle ヘルパで
 *    分析用メタ情報 (createdAt / updatedAt / stageChangedAt / stageHistory) を
 *    自然に付与する。
 *  - list/get は ClientData の applicants をそのまま返す（読み取り時の自動補完は行わない）。
 *    補完が必要な箇所は applicantLifecycle.inferCreatedAt 等で in-memory に行う。
 */
export interface ApplicantRepository {
  list(clientId: string): Applicant[];
  get(clientId: string, applicantId: number): Applicant | undefined;
  /**
   * 新規作成。createdAt/updatedAt/stageChangedAt を自動セット。
   *
   * opts.initialStageReason が指定され、かつ applicant.stage が非空のときに限り、
   * stageHistory に「初期 stage を明示的に記録した」エントリを 1 件追加する:
   *   { stage, toStage: stage, changedAt: stageChangedAt, reason, operator? }
   *
   * 注意:
   *  - opts.initialStageReason 未指定 or applicant.stage が空文字の場合は履歴を追加しない。
   *    （CSV インポートで stage が空欄 → statuses[0] にフォールバックした行を区別するため、
   *      呼び出し側で「明示行のみ」reason を渡すこと）
   *  - fromStage は付与しない（前段が無いため）。
   *  - opts.operator が空文字の場合は entry.operator を省略する（既存 withStageChange と同等の扱い）。
   */
  create(
    clientId: string,
    applicant: Applicant,
    opts?: { initialStageReason?: StageChangeReason; operator?: string },
  ): Applicant;
  /** 部分更新。updatedAt を自動更新、createdAt が無ければ補完。 */
  update(clientId: string, applicantId: number, patch: Partial<Applicant>): Applicant | undefined;
  /** ステージ変更。stageChangedAt と stageHistory を自動更新。 */
  changeStage(
    clientId: string,
    applicantId: number,
    toStage: string,
    opts?: StageChangeOptions,
  ): Applicant | undefined;
  /**
   * 一括ステージ変更。
   *
   * 用途:
   *  - フィルタ条件「対象外に移動」 / 除外リスト追加マッチ等の一括処理
   *  - 1件ずつ changeStage を呼ぶと localStorage への書き込みが N 回発生してしまうので、
   *    map 1パス + save 1回にまとめる
   *
   * 動作:
   *  - 各 patch に対し withStageChange(applicant, toStage, { operator, reason, changedAt }) を適用
   *  - patch.patch（例: { active: false }）が指定されていれば、withStageChange 適用後にマージ
   *  - fromStage === toStage は skipped 'same_stage' として記録（履歴を汚染しない）
   *  - 対応する applicantId が存在しないものは skipped 'not_found' として記録
   *  - updatedCount が 0 の場合は localStorage への書き込みを行わない（無駄な save を避ける）
   */
  changeStageBulk(
    clientId: string,
    patches: BulkStageChangePatch[],
    options: BulkStageChangeOptions,
  ): BulkStageChangeResult;
  /**
   * ステータス定義削除に伴う applicants 側カスケード処理。
   *
   * 用途:
   *  - StatusManagement.deleteStatus からの呼出。「履歴を残す」処理ではないため
   *    changeStageBulk とは別 API として分離する。
   *
   * 動作:
   *  - stage === deletedStatusName の applicant は stage を '' にクリアする
   *    （subStatus も併せてクリア。サブステータスは親ステータスに紐づくため孤立参照を防ぐ）
   *  - stageHistory から以下のエントリを除去:
   *      - h.stage === deletedStatusName
   *      - h.toStage === deletedStatusName
   *  - h.fromStage === deletedStatusName だけのエントリは残す
   *    （過去にそのステージから出た事実は履歴として保持する意義がある）
   *  - stageHistory への新規エントリ追加は行わない（履歴を残す処理ではない）
   *  - 何も変更がない場合は localStorage への書き込みを行わない
   */
  clearStageForDeletedStatus(
    clientId: string,
    deletedStatusName: string,
  ): ClearStageForDeletedStatusResult;
  /**
   * 応募者を削除する（カスケード）。
   *
   * 動作:
   *  - applicants から applicantId 一致を除去
   *  - events から applicantId 一致を全削除（関連する面接イベント）
   *  - exclusionList から applicantId 一致を全削除（除外リスト参照）
   *  - 上記 3 配列のいずれにも変更が無ければ saveClientData を呼ばない（無駄な save を避ける）
   *  - 1 回の saveClientData にまとめる（既存 handleDelete と同等のアトミック性を維持）
   *
   * 対象外:
   *  - messageLogs は ClientData 内に同居するが本 API では削除しない（既存 handleDelete と同じ挙動維持）。
   *    将来カスケード対象に含めるかは別議論。
   *
   * Firestore 化時:
   *  - runTransaction 内で applicants / events / exclusionList の 3 collection 削除に置換可能。
   */
  delete(clientId: string, applicantId: number): DeleteApplicantResult;
}

/**
 * 応募者削除（カスケード）の結果。
 *  - deletedApplicant: 該当 applicantId が applicants から実際に除去されたかどうか
 *  - deletedEventCount: events から applicantId 一致で除去された件数
 *  - clearedExclusionCount: exclusionList から applicantId 一致で除去された件数
 *
 * カスケード方針:
 *  - applicants 本体（screening/files/stageHistory/chatAnswers/cancelledInterviews は applicant 内包なので一緒に消える）
 *  - events: applicantId 一致を全削除（面接イベント）
 *  - exclusionList: applicantId 一致を全削除（除外リストの applicantId 参照エントリ）
 *  - messageLogs: ClientData.messageLogs に同居しているが意図的にカスケード対象外（既存 handleDelete と同じ挙動維持）。
 *    将来カスケード対象に含めるかは別議論。
 */
export interface DeleteApplicantResult {
  deletedApplicant: boolean;
  deletedEventCount: number;
  clearedExclusionCount: number;
}

/**
 * ステータス定義 (Status) の CRUD / 並び替え / サブステータス操作。
 *
 * 方針:
 *  - applicants 側のカスケード処理（stage クリア / stageHistory 掃除）は本 API に含めない。
 *    呼び出し側で `applicantRepository.clearStageForDeletedStatus` を併用する。
 *    （履歴を残す処理 vs 掃除する処理は意味が逆なので分離）
 *  - 変更がない場合は localStorage への書き込みを行わない（無駄な save を避ける）
 *  - applyTemplate は本フェーズでは未実装（次フェーズで検討）
 *
 * 各メソッドの引数は「name による参照」を基本とする。
 *  - StatusManagement の既存実装は id ベースだが、Repository では
 *    applicants との連携 (stage は名前で保持) と整合させるため name ベースに揃える。
 *  - 同名 Status の重複は upsert / addSubStatus 内で防ぐ。
 */
export interface StatusRepository {
  /** 現在のステータス一覧を返す（順序は保存時のまま、ソートは呼び出し側責務） */
  list(clientId: string): Status[];
  /**
   * ステータス配列を丸ごと差し替える。
   * テンプレート一括適用 / 並び替え結果の一括保存などで使う想定。
   * 内容が現状と一致していても save する（呼び出し側が「差し替え」を意図しているため）。
   */
  save(clientId: string, statuses: Status[]): void;
  /**
   * 1 件追加 or 名前一致更新。
   *  - 同名ステータスが既に存在すれば、その entry を `status` でマージ更新する
   *    （id / order は既存値を尊重し、color / active / subStatuses / category 等が更新される）
   *  - 存在しなければ新規追加。id / order は既存最大値 + 1 を自動採番（status.id / status.order に値があれば優先）
   *  - 変更がなければ save しない
   */
  upsert(clientId: string, status: Status): void;
  /**
   * 名前一致でステータス定義を削除する。
   *  - applicants 側の stage / stageHistory 掃除は呼ばない（責務分離）
   *  - 該当が見つからなければ no-op（save も呼ばない）
   */
  remove(clientId: string, name: string): void;
  /**
   * active / inactive を反転する。
   *  - 該当が見つからなければ no-op
   */
  toggleActive(clientId: string, name: string): void;
  /**
   * 並び替え。隣接する Status と order を入れ替える。
   *  - 並びは現在の order 昇順を基準に判定
   *  - 端（先頭で 'up' / 末尾で 'down'）の場合は no-op（save しない）
   *  - 該当が見つからなければ no-op
   */
  moveOrder(clientId: string, name: string, direction: 'up' | 'down'): void;
  /**
   * 親ステータスにサブステータスを追加する。
   *  - 親が見つからなければ no-op
   *  - 既に同名のサブステータスがあれば no-op（重複追加しない）
   *  - 空文字 / 前後空白のみは no-op（呼び出し側で trim 推奨）
   */
  addSubStatus(clientId: string, parentName: string, subStatus: string): void;
  /**
   * 親ステータスからサブステータスを削除する。
   *  - 親 / サブともに見つからなければ no-op
   *  - applicants の subStatus 参照は本 API では掃除しない（責務分離）
   */
  removeSubStatus(clientId: string, parentName: string, subStatus: string): void;
}

/**
 * 統合連絡ログの永続化操作（2026-05 追加）。
 *
 * 方針:
 *  - 実際の SMS / メール送信処理は ATS 内で持たない（将来別サービス化）
 *  - このリポジトリは ATS 側の「ログ箱」のみ提供する
 *  - create / updateStatus 時に id / createdAt / updatedAt を自動付与・更新
 *  - 既存の smsLogs / emailLogs は当面残し、破壊的変更は行わない
 */
export interface MessageRepository {
  /** 応募者単位で連絡ログを返す（時系列の昇順を想定） */
  listByApplicant(clientId: string, applicantId: number): MessageLog[];
  /**
   * 連絡ログを新規作成。
   * 呼び出し側は id/createdAt/updatedAt を渡さなくてよい（自動補完）。
   */
  create(
    clientId: string,
    log: Omit<MessageLog, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<MessageLog, 'id' | 'createdAt' | 'updatedAt'>>,
  ): MessageLog;
  /**
   * ステータス更新。patch でタイムスタンプ系（deliveredAt 等）も同時更新できる。
   * 該当 ID が無ければ undefined。
   */
  updateStatus(
    clientId: string,
    messageId: string,
    status: MessageStatus,
    patch?: Partial<MessageLog>,
  ): MessageLog | undefined;
  /** 直近の連絡ログを N 件まで返す（時系列降順を想定） */
  listRecent(clientId: string, limit?: number): MessageLog[];
}

/**
 * 面接イベント関連の戻り値型（Phase H-1 で追加）。
 */

/** `EventRepository.listByDateRange` の query パラメータ */
export interface ListEventsByDateRangeParams {
  /** 開始日（YYYY-MM-DD、含む）。未指定なら下限なし */
  fromDate?: string;
  /** 終了日（YYYY-MM-DD、含む）。未指定なら上限なし */
  toDate?: string;
  /** 拠点名フィルタ。未指定なら全拠点 */
  baseName?: string;
}

/** `EventRepository.remove` の戻り値 */
export interface RemoveEventResult {
  /** events から実際に除去されたかどうか */
  removed: boolean;
}

/** `EventRepository.removeWithCancelRecord` の戻り値 */
export interface RemoveWithCancelRecordResult {
  /** events から該当 eventId が除去されたか */
  removedEvent: boolean;
  /** applicant の cancelledInterviews に履歴エントリが追加されたか */
  updatedApplicant: boolean;
}

/** `EventRepository.scheduleInterview` の戻り値 */
export interface ScheduleInterviewResult {
  /** 採番 + 追加された InterviewEvent */
  createdEvent: InterviewEvent;
  /**
   * stage 遷移後の Applicant スナップショット。
   * 既に '面接確定' だった場合は changeStage が no-op となるため undefined を返す
   * （= stage 変更なし）。
   */
  updatedApplicant?: Applicant;
}

/**
 * 面接イベント (InterviewEvent) の CRUD ＋ 応募者連動操作（Phase H-1 で追加）。
 *
 * 想定する後続移行（H-1 自身では画面差し替えはしない）:
 *  - `Calendar.tsx` (handleBook / handleCancelEvent)
 *      → `create` / `remove` (H-2 で置換予定)
 *  - `ApplicantDetail.tsx` (handleReschedule)
 *      → `remove` (H-3 で置換予定)
 *  - `ApplicantDetail.tsx` (handleCancelEvent)
 *      → `removeWithCancelRecord` (H-4 で置換予定)
 *  - `ApplicantDetail.tsx` (handleScheduled)
 *      → `scheduleInterview` (H-5 で置換予定)
 *
 * 方針:
 *  - `create` は id 未指定時に既存 events の最大 id + 1 で採番（Calendar.handleBook 既存挙動と互換）
 *  - `remove` / `removeWithCancelRecord` / `scheduleInterview` は内部で必要最小回数の saveClientData
 *    にまとめる（Firestore 化時は runTransaction / WriteBatch に置換）
 *  - `scheduleInterview` は events.push と applicant.stage 変更の **2 配列更新を 1 メソッドに集約**
 *    し、Firestore 化時の runTransaction 候補とする。LocalStorage では既存挙動互換のため
 *    内部実装は 2 段 save のままで構わない（同期 API なので事実上アトミック）
 *  - update（既存 event の patch）は本フェーズでは提供しない。日時変更は remove + create で実現する
 *    既存パターンを維持する。
 *
 * スコープ外:
 *  - slotSettings は別 SlotRepository（別フェーズ）。本 API では扱わない
 *  - applicantRepository.delete 内の events filter は本 API に置換しない（H-6 以降の責務集約候補）
 */
export interface EventRepository {
  /**
   * 応募者単位で面接イベント一覧を返す。
   * 並び順は保存順そのまま（呼び出し側でソート）。
   */
  listByApplicant(clientId: string, applicantId: number): InterviewEvent[];
  /**
   * 日付範囲 / 拠点で面接イベントを絞り込んで返す。
   *  - fromDate / toDate は YYYY-MM-DD 文字列比較で判定（ev.date と lexicographic に比較）
   *  - 全パラメータ optional。未指定なら全件返す
   *  - 並び順は保存順そのまま
   */
  listByDateRange(clientId: string, params?: ListEventsByDateRangeParams): InterviewEvent[];
  /**
   * 面接イベントを 1 件追加する。
   *  - `event.id` が未指定 / 0 / NaN の場合は既存 events の最大 id + 1 で採番（Calendar.handleBook 互換）
   *  - `event.id` が正の数値で指定されている場合はその値を尊重（既に同 id がある場合の重複検査は
   *    呼び出し側責務。本 API は黙って push する）
   *  - applicant 側の stage / cancelledInterviews は触らない（連動が必要なら scheduleInterview 経由）
   */
  create(clientId: string, event: Omit<InterviewEvent, 'id'> & Partial<Pick<InterviewEvent, 'id'>>): InterviewEvent;
  /**
   * 面接イベントを 1 件削除する。
   *  - 該当 eventId が存在しなければ no-op（saveClientData も呼ばない）
   *  - applicant 側との連動（cancelledInterviews append）が必要な場合は removeWithCancelRecord を使う
   */
  remove(clientId: string, eventId: number): RemoveEventResult;
  /**
   * 面接イベント削除と応募者の cancelledInterviews 履歴追加を 1 メソッドに集約する。
   *
   * 動作:
   *  - events から eventId 一致を 1 件除去
   *  - 対応する InterviewEvent の date/start/end/base/method を CancelledInterview として
   *    `applicants[applicantId].cancelledInterviews` に append（cancelledAt は実行時刻を `ja-JP` 形式で保存）
   *  - 上記 2 配列の更新を 1 saveClientData にまとめる（既存 ApplicantDetail.handleCancelEvent と同じアトミック性）
   *  - 該当 event が見つからない場合は cancelledInterviews も追加しない（removedEvent: false）
   *  - 該当 applicantId が見つからない場合は events だけ削除し updatedApplicant: false で返す
   *
   * 既存挙動互換:
   *  - applicant.updatedAt は touch しない（既存 handleCancelEvent と同じ）
   *  - method が空文字 / undefined の場合は CancelledInterview.method を `''` で記録
   *
   * Firestore 化:
   *  - events doc 削除と applicant doc 更新の runTransaction 候補
   */
  removeWithCancelRecord(
    clientId: string,
    eventId: number,
    applicantId: number,
  ): RemoveWithCancelRecordResult;
  /**
   * 面接予約と stage 遷移を 1 メソッドに集約する。
   *
   * 動作:
   *  - 内部で `create(clientId, event)` を呼んで events に push（id 採番含む）
   *  - その後 `applicantRepository.changeStage(clientId, applicantId, '面接確定', { operator, reason })`
   *    を呼んで stage を遷移させる（stageHistory / stageChangedAt / updatedAt が自動付与）
   *  - 既に applicant.stage が '面接確定' だった場合 changeStage は no-op となり、戻り値の
   *    `updatedApplicant` は undefined（= stage 変更なし）になる
   *  - applicant 自体が見つからない場合も `updatedApplicant: undefined` で返す
   *    （createdEvent は採番済みで返す = events への push は完了している）
   *
   * Firestore 化:
   *  - events 追加と applicant.stage 更新の **runTransaction 必須**（途中失敗で「面接予約はあるが
   *    stage は前のまま」状態を防ぐ）
   *  - 本 LocalStorage 実装では 2 段 save のままだが、呼出側 (handleScheduled) からは 1 メソッド呼出に見える
   */
  scheduleInterview(
    clientId: string,
    applicantId: number,
    event: Omit<InterviewEvent, 'id'> & Partial<Pick<InterviewEvent, 'id'>>,
    options: { operator: string; reason: 'interview_scheduled' },
  ): ScheduleInterviewResult;
}

/**
 * 面接枠設定 (slotSettings) 関連の型（Phase K-1 で追加）。
 */

/** 1 日分の枠設定: time(HH:MM) → capacity(枠数) のマップ */
export type SlotDayCapacity = { [time: string]: number };

/** `SlotRepository.bulkSetCapacity` に渡す 1 セル分の更新指示 */
export interface SlotBulkPatch {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  /** 設定したい枠数（0 以上の整数想定。検証は呼出側責務） */
  capacity: number;
}

/** `SlotRepository.bulkSetCapacity` の戻り値 */
export interface BulkSetCapacityResult {
  /** 実際に値が変わったセル数 */
  updatedCellCount: number;
  /** 既存値と同じだったため変更しなかったセル数 */
  unchangedCellCount: number;
}

/** `SlotRepository.removeBase` の戻り値 */
export interface RemoveBaseSlotsResult {
  /** slotSettings から baseName キーが除去されたか */
  removed: boolean;
  /** 削除前にその base が保持していた日付エントリ数 */
  removedDateCount: number;
}

/**
 * 拠点別の面接枠定義 (slotSettings) を扱う Repository（Phase K-1 で追加）。
 *
 * 想定する後続移行（K-1 自身では画面差し替えはしない）:
 *  - `Calendar.tsx` (setSlotCapacity)        → `setCapacity`        (K-2 で置換予定)
 *  - `Calendar.tsx` (bulkSetAllSlots)        → `bulkSetCapacity`    (K-3 で置換予定)
 *  - `Calendar.tsx` (handleBulkApply)        → `bulkSetCapacity`    (K-4 で置換予定)
 *  - `BaseManagement.deleteBase`             → `removeBase`         (K-5 / BaseRepository フェーズで置換予定)
 *
 * 方針:
 *  - `setCapacity` は同値の場合 saveClientData を呼ばない（無駄な書込を避ける）
 *  - `bulkSetCapacity` は変更セルが 0 件なら saveClientData を呼ばない。1 件以上あれば 1 回だけ呼ぶ
 *  - `removeBase` は slotSettings[baseName] が存在しない場合は no-op（saveClientData を呼ばない）
 *  - SlotSetting は updatedAt を持たないため、変更検知は値比較のみで判定可能（履歴も無し）
 *
 * スコープ外:
 *  - events は別 EventRepository（既に Phase H-1 で導入済）
 *  - 子アカウントの拠点フィルタは AuthContext 側責務として残す（既存 Repository と同じ）
 */
export interface SlotRepository {
  /**
   * 拠点 1 件分の slotSettings を返す（date → time → capacity の 2 階層 map）。
   *  - 該当 base が未登録の場合は空 object を返す（呼出側で null/undefined チェック不要）
   */
  listBase(clientId: string, baseName: string): SlotSetting;
  /**
   * 拠点 + 日付の枠定義を返す（time → capacity のマップ）。
   *  - 該当 base / date が未登録の場合は空 object を返す
   */
  getDay(clientId: string, baseName: string, date: string): SlotDayCapacity;
  /**
   * 拠点 + 日付 + 時刻のセル枠数を返す。
   *  - 該当エントリが無ければ 0 を返す（既存 Calendar.getCapacity と互換）
   */
  getCapacity(clientId: string, baseName: string, date: string, time: string): number;
  /**
   * 1 セル分の枠数を設定する。
   *  - 既存値と同値なら no-op（saveClientData を呼ばない）
   *  - base / date キーが未登録なら自動生成
   */
  setCapacity(
    clientId: string,
    baseName: string,
    date: string,
    time: string,
    capacity: number,
  ): void;
  /**
   * 複数セル分の枠数を一括設定する。
   *  - cells が空配列なら updatedCellCount: 0, unchangedCellCount: 0 で no-op
   *  - 変更セルが 1 件以上ある場合のみ saveClientData を 1 回だけ呼ぶ
   *  - 同一 base/date/time が cells 内で重複している場合は最後の指定値が優先（呼出側で重複排除推奨）
   */
  bulkSetCapacity(
    clientId: string,
    baseName: string,
    cells: SlotBulkPatch[],
  ): BulkSetCapacityResult;
  /**
   * 拠点 1 件分の slotSettings をまるごと削除する（拠点削除カスケード用）。
   *  - 該当 base が未登録なら no-op（saveClientData を呼ばない）
   *  - K-5 / BaseRepository フェーズで BaseManagement.deleteBase から呼ぶ予定
   */
  removeBase(clientId: string, baseName: string): RemoveBaseSlotsResult;
}

/**
 * 拠点 (Base) の CRUD ＋ 削除カスケード戻り値（Phase L-1 で追加）。
 *
 * deleteWithCascade が触る配列:
 *  - bases                          : 該当 baseId を除去
 *  - applicants[].base              : 該当 baseName を '' にクリア（応募者本体は残す。履歴保持目的）
 *  - events                         : 該当 baseName を全削除（未来面接の意味が無くなるため）
 *  - slotSettings[baseName]         : キーごと削除
 *  - jobsByBase[baseName]           : キーごと削除
 *  - sourcesByBase[baseName]        : キーごと削除
 *  - emailTemplatesByBase[baseName] : キーごと削除
 *  - filterConditions[baseName]     : キーごと削除
 *  - clients[].baseName             : 自テナント配下の child アカウント (parentId === clientId) のみクリア
 *
 * カスケード対象外（既存挙動互換）:
 *  - messageLogs / smsLogs / emailLogs : 拠点紐付けで残す（応募者紐付けで管理）
 *  - applicants の stageHistory / cancelledInterviews / chatAnswers / files : applicant 内包なので一緒に残る
 *  - operationLogs                     : 監査保持
 */
export interface DeleteBaseCascadeResult {
  /** bases 配列から実際に削除されたか（baseId 不一致なら false） */
  removed: boolean;
  /** 削除した base 名。removed=false の場合は undefined */
  removedBaseName?: string;
  /** applicants[].base === removedBaseName を '' にクリアした件数 */
  clearedApplicantBaseCount: number;
  /** events から base 一致で除去された件数 */
  removedEventCount: number;
  /** slotSettings[baseName] が保持していた日付エントリ数（slotRepository.computeRemoveBasePatch 由来） */
  removedSlotDateCount: number;
  /** jobsByBase[baseName] が存在して削除されたか */
  removedJobsByBase: boolean;
  /** sourcesByBase[baseName] が存在して削除されたか */
  removedSourcesByBase: boolean;
  /** emailTemplatesByBase[baseName] が存在して削除されたか */
  removedEmailTemplatesByBase: boolean;
  /** filterConditions[baseName] が存在して削除されたか */
  removedFilterCondition: boolean;
  /** child アカウント (accountType === 'child' && parentId === clientId && baseName === removedBaseName) の baseName をクリアした件数 */
  detachedChildAccountCount: number;
}

/**
 * 拠点 (Base) の CRUD ＋ 削除カスケードを扱う Repository（Phase L-1 で追加）。
 *
 * 想定する後続移行（L-1 自身では画面差し替えはしない）:
 *  - `BaseManagement.tsx` (save 追加/編集)   → `create` / `update` (L-2 で置換予定)
 *  - `Calendar.tsx` (saveBaseSettings)        → `update`             (L-2 で置換予定)
 *  - `BaseManagement.tsx` (deleteBase)        → `deleteWithCascade`  (L-3 で置換予定)
 *
 * 方針:
 *  - `create` は id 未指定の前提（Omit<Base, 'id'>）。内部で `max(bases.id) + 1` 採番（既存挙動互換）
 *  - `update` は patch 形式。rename（name 変更）時の applicants/events/*ByBase 追従は行わない
 *    （既存 BaseManagement の編集は name 変更カスケードを実装していないため、その挙動を踏襲）
 *  - `deleteWithCascade` は ClientData 側 7 配列を 1 saveClientData にまとめ、別 storage の
 *    clients[].baseName クリアは clientRepository.saveAll で 1 回呼ぶ（合計 2 段 save）。
 *    LocalStorage 同期 API のため事実上アトミック。Firestore 化時は runTransaction
 *    または Cloud Functions で 1 atomic 化（500 doc 上限超のリスクあり）
 *  - slotSettings 部分は `slotRepository` の pure helper `computeRemoveBasePatch` を呼んで
 *    次状態を計算し、自身の 1 saveClientData に組み込む（K-1 のロジックを集約利用）
 *
 * スコープ外:
 *  - 子アカウントの拠点フィルタは AuthContext 側責務として残す（既存 Repository と同じ）
 *  - rename カスケード（name 変更時の関連配列追従）は本 API では実装しない
 *  - messageLogs / operationLogs などログ系は touch しない
 */
export interface BaseRepository {
  /** 拠点一覧を返す（順序は保存時のまま、ソートは呼び出し側責務） */
  list(clientId: string): Base[];
  /** baseId 一致で 1 件取得。該当なしは undefined */
  get(clientId: string, baseId: number): Base | undefined;
  /** 拠点名一致で 1 件取得（rename 検知や重複登録の事前チェック用）。該当なしは undefined */
  findByName(clientId: string, baseName: string): Base | undefined;
  /**
   * 拠点を 1 件追加する。
   *  - id は内部で `max(bases.id) + 1` 採番（既存 BaseManagement.save と互換）
   *  - 重複名チェックは行わない（呼出側責務。findByName で事前検知可能）
   */
  create(clientId: string, base: Omit<Base, 'id'>): Base;
  /**
   * 既存拠点を部分更新する。
   *  - baseId 一致がなければ no-op で undefined を返す（saveClientData も呼ばない）
   *  - patch に id を含めても無視（型レベルで Omit してあるが防御的に）
   *  - rename（name 変更）時に applicants/events/*ByBase は **追従しない**（既存挙動互換）
   *  - 変更内容が現状と完全一致なら saveClientData を呼ばない（無駄な書込を避ける）
   */
  update(
    clientId: string,
    baseId: number,
    patch: Partial<Omit<Base, 'id'>>,
  ): Base | undefined;
  /**
   * 拠点削除と 8 配列カスケードを 1 メソッドに集約する。
   *
   * 動作:
   *  - bases から baseId 一致を除去
   *  - applicants[].base === removedBaseName を '' にクリア（updatedAt は touch しない。既存挙動互換）
   *  - events から base 一致を全削除
   *  - slotSettings[baseName] / jobsByBase[baseName] / sourcesByBase[baseName]
   *    / emailTemplatesByBase[baseName] / filterConditions[baseName] を delete
   *  - 上記 7 配列の更新を 1 saveClientData にまとめる
   *  - child アカウント (accountType === 'child' && parentId === clientId && baseName === removedBaseName)
   *    の baseName を undefined にクリアし、clientRepository.saveAll で別 storage に保存
   *  - baseId 不一致の場合は何もせず removed: false で返す（save も呼ばない）
   *
   * Firestore 化:
   *  - runTransaction（500 doc 以下なら）または Cloud Functions（500 doc 超）で 1 atomic 化
   *  - clients[].baseName クリアは Firestore 上では accounts doc 更新 + Custom Claims 更新の
   *    2 系統に跨るため Cloud Functions 経由が現実的
   */
  deleteWithCascade(clientId: string, baseId: number): DeleteBaseCascadeResult;
}

/**
 * レポート関連の永続化操作。
 * 現状は採用目標 (recruitmentGoals) のみ。将来は monthlyStats キャッシュも追加する。
 */
export interface ReportRepository {
  /** 月次採用目標を取得 */
  getRecruitmentGoals(clientId: string): Record<string, number>;
  /**
   * 月次採用目標を更新。
   * value <= 0 の場合は当該 yearMonth のキーを削除する。
   * 既存の他フィールドは破壊しない。
   */
  updateRecruitmentGoal(clientId: string, yearMonth: string, value: number): void;
}

/**
 * `JobRepository.deleteWithCascade` の戻り値（Phase N-1 で追加）。
 *
 * カスケード方針:
 *  - 対象レイヤ (jobs または jobsByBase[baseName]) から jobId 一致を除去
 *  - applicants[].job === removedJobName を '' にクリア
 *      - opts.applicantBaseFilter 指定時はその base 一致 applicants のみ対象
 *      - 未指定時は全 applicants 横断（既存 JobManagement.deleteJob の挙動を維持）
 *  - applicants[].updatedAt は touch しない（既存 deleteJob 互換）
 *  - 上記 2 配列の更新を 1 saveClientData にまとめる
 *  - jobId 不一致なら no-op で removed: false を返す（saveClientData も呼ばない）
 */
export interface DeleteJobCascadeResult {
  /** 対象レイヤから jobId が実際に除去されたか */
  removed: boolean;
  /** 除去した job の name（applicants クリア判定に使用した値）。removed=false なら undefined */
  removedJobName?: string;
  /** applicants[].job === removedJobName を '' にクリアした件数 */
  clearedApplicantJobCount: number;
}

/** `JobRepository.removeBaseOverride` の戻り値（Phase N-1 で追加）。 */
export interface RemoveJobBaseOverrideResult {
  /** jobsByBase[baseName] キーが存在して削除されたか（不在なら false / save も呼ばない） */
  removed: boolean;
}

/**
 * 求人 (Job) 設定の CRUD ＋ 拠点別オーバーライド ＋ 削除カスケードを扱う Repository（Phase N-1 で追加）。
 *
 * 想定する移行先:
 *  - `JobManagement.tsx` の updateClientData 直更新を本 API 経由に置換
 *
 * 方針:
 *  - 既存データ形状を維持する（Job 型に baseName を追加する正規化は本フェーズで行わない）
 *      - `data.jobs`               : 全社共通レイヤ
 *      - `data.jobsByBase[baseName]` : 拠点別オーバーライドレイヤ
 *  - baseName 未指定 = 全社共通レイヤを対象
 *  - baseName 指定 = 拠点別レイヤを対象
 *      - 対象レイヤ未作成時は `data.jobs` をコピーして開始（既存 writeJobs と互換、編集すると override が新規作成される）
 *  - deleteWithCascade は対象レイヤの更新と applicants[].job クリアを 1 saveClientData にまとめる
 *  - 子アカウント呼出時は opts.applicantBaseFilter で「自拠点 applicants のみ」絞り込みを可能にする
 *    （AuthContext.filterDataByBase が applicants を base 絞り込みしていた挙動の再現）
 *
 * スコープ外:
 *  - Job 型への baseName 追加（Firestore 化時に再設計）
 *  - rename / 並び替え / 並列重複名チェック（必要になったら別フェーズで検討）
 *  - SourceRepository / EmailTemplateRepository / FilterConditionRepository（Phase N-2 以降）
 *
 * Firestore マッピング:
 *  - 全社共通レイヤ: `/tenants/{tid}/jobs/{jobId}` doc（baseName フィールドなし or null）
 *  - 拠点別レイヤ: `/tenants/{tid}/jobs/{jobId}` doc（baseName フィールド指定）or
 *    `/tenants/{tid}/baseOverrides/{baseName}/jobs/{jobId}`（設計判断は Phase J 時に確定）
 *  - deleteWithCascade は jobs collection の doc 削除 + applicants collection の対象 doc 更新を
 *    runTransaction / WriteBatch で 1 atomic 化
 */
export interface JobRepository {
  /**
   * 求人一覧を返す。
   *  - baseName 未指定: `data.jobs`（全社共通）
   *  - baseName 指定 + `data.jobsByBase[baseName]` あり: `data.jobsByBase[baseName]`
   *  - baseName 指定 + `data.jobsByBase[baseName]` 未作成: `data.jobs`（フォールバック、既存 UI 表示互換）
   *  - 並び順は保存時のまま
   */
  list(clientId: string, baseName?: string): Job[];
  /**
   * 求人を 1 件追加する。
   *  - id は対象レイヤの `max(j.id) + 1` で採番（既存 JobManagement.save と互換。
   *    既存挙動: 0 件レイヤなら id=1 から開始）
   *  - baseName 指定 + 対象レイヤ未作成: `data.jobs` をコピーして開始 → 末尾に追加し
   *    `data.jobsByBase[baseName]` として保存（既存 writeJobs 互換、override 新規作成）
   *  - 重複名チェックは行わない（呼出側責務）
   *  - 戻り値は採番後の Job
   */
  create(
    clientId: string,
    job: Omit<Job, 'id'>,
    baseName?: string,
  ): Job;
  /**
   * 求人を部分更新する。
   *  - 対象 jobId が見つからなければ undefined を返す（saveClientData を呼ばない）
   *  - patch に id が混入しても無視（id は不変）
   *  - 対象レイヤが既存 + 全フィールドが現状と一致なら saveClientData を呼ばない（無駄な書込防止）
   *  - 対象レイヤが未作成 (= baseName 指定で `data.jobsByBase[baseName]` が無い) の場合:
   *      patch 内容が現状と一致しても saveClientData を呼んで override を新規作成する
   *      （既存 writeJobs 挙動互換: 「base 未設定で編集 = override 作成」）
   *  - 戻り値は更新後 Job（または既存値一致時の current）
   */
  update(
    clientId: string,
    jobId: number,
    patch: Partial<Omit<Job, 'id'>>,
    baseName?: string,
  ): Job | undefined;
  /**
   * 求人削除と applicants[].job クリアを 1 saveClientData に集約する。
   *
   * 動作:
   *  - 対象レイヤ (`data.jobs` または `data.jobsByBase[baseName]`) から jobId 一致を除去
   *      - baseName 指定 + 対象レイヤ未作成: `data.jobs` をコピーして開始 → 削除（既存 writeJobs/deleteJob 互換）
   *  - 対象 jobId が見つからなければ no-op で `removed: false` を返す（saveClientData も呼ばない）
   *  - applicants[].job === removedJobName を '' にクリア
   *      - `opts.applicantBaseFilter` 指定時: `a.base === applicantBaseFilter` のみ対象
   *      - 未指定時: 全 applicants 横断（既存 JobManagement.deleteJob の挙動を維持）
   *  - applicants[].updatedAt は touch しない（既存 deleteJob 互換）
   *  - 上記 2 配列の更新を 1 saveClientData にまとめる
   *
   * 既知の挙動メモ:
   *  - 親アカウント + base scope での削除も `applicantBaseFilter` 未指定で呼ぶことで「全 applicants 横断クリア」
   *    という現行挙動を維持する（base override のみ削除しても applicants の job 参照は全社で消える）。
   *    意味論的なリファクタは Phase J 以降で再検討。
   */
  deleteWithCascade(
    clientId: string,
    jobId: number,
    opts?: {
      /** 対象レイヤ。undefined = 全社共通 / 指定 = 拠点別 */
      baseName?: string;
      /** applicants[].job クリア対象の base 絞り込み。undefined = 全 applicants 横断 */
      applicantBaseFilter?: string;
    },
  ): DeleteJobCascadeResult;
  /**
   * 拠点別求人オーバーライドレイヤをまるごと削除する（既存 JobManagement.removeOverride 互換）。
   *  - `data.jobsByBase[baseName]` キーを delete
   *  - キー不在なら no-op で `removed: false` を返す（saveClientData も呼ばない）
   *  - applicants は触らない（override を消すと全社共通レイヤにフォールバックする = 名前一致は維持される）
   */
  removeBaseOverride(clientId: string, baseName: string): RemoveJobBaseOverrideResult;
}

/**
 * `SourceRepository.deleteWithCascade` の戻り値（Phase N-2 で追加）。
 *
 * カスケード方針:
 *  - 対象レイヤ (sources または sourcesByBase[baseName]) から sourceId 一致を除去
 *  - applicants[].src === removedSourceName を '' にクリア
 *      - opts.applicantBaseFilter 指定時はその base 一致 applicants のみ対象
 *      - 未指定時は全 applicants 横断（既存 SourceManagement.deleteSource の挙動を維持）
 *  - applicants[].updatedAt は touch しない（既存 deleteSource 互換）
 *  - 上記 2 配列の更新を 1 saveClientData にまとめる
 *  - sourceId 不一致なら no-op で removed: false を返す（saveClientData も呼ばない）
 */
export interface DeleteSourceCascadeResult {
  /** 対象レイヤから sourceId が実際に除去されたか */
  removed: boolean;
  /** 除去した source の name（applicants クリア判定に使用した値）。removed=false なら undefined */
  removedSourceName?: string;
  /** applicants[].src === removedSourceName を '' にクリアした件数 */
  clearedApplicantSrcCount: number;
}

/** `SourceRepository.removeBaseOverride` の戻り値（Phase N-2 で追加）。 */
export interface RemoveSourceBaseOverrideResult {
  /** sourcesByBase[baseName] キーが存在して削除されたか（不在なら false / save も呼ばない） */
  removed: boolean;
}

/**
 * 応募媒体 (Source) 設定の CRUD ＋ 拠点別オーバーライド ＋ 削除カスケードを扱う Repository（Phase N-2 で追加）。
 *
 * 想定する移行先:
 *  - `SourceManagement.tsx` の updateClientData 直更新を本 API 経由に置換
 *
 * 方針:
 *  - Phase N-1 JobRepository の base-override 型を機械的に横展開した実装
 *  - 既存データ形状を維持する（Source 型に baseName を追加する正規化は本フェーズで行わない）
 *      - `data.sources`               : 全社共通レイヤ
 *      - `data.sourcesByBase[baseName]` : 拠点別オーバーライドレイヤ
 *  - baseName 未指定 = 全社共通レイヤを対象
 *  - baseName 指定 = 拠点別レイヤを対象
 *      - 対象レイヤ未作成時は `data.sources` をコピーして開始（既存 writeSources と互換、編集すると override が新規作成される）
 *  - deleteWithCascade は対象レイヤの更新と applicants[].src クリアを 1 saveClientData にまとめる
 *  - 子アカウント呼出時は opts.applicantBaseFilter で「自拠点 applicants のみ」絞り込みを可能にする
 *    （AuthContext.filterDataByBase が applicants を base 絞り込みしていた挙動の再現）
 *
 * 既存挙動メモ:
 *  - SourceManagement.deleteSource は applicants[].src クリア時に base 絞り込みをしていなかったが、
 *    子アカ時は AuthContext.filterDataByBase が applicants を自拠点のみに絞っているため
 *    結果的に「見えている applicants = 自拠点のみ」となり実害なし。
 *    Repository 化に際しては JobRepository に揃え applicantBaseFilter opt を提供。
 *    呼出側 (SourceManagement.tsx) は child account のみ applicantBaseFilter を渡す。
 *
 * スコープ外:
 *  - Source 型への baseName 追加（Firestore 化時に再設計）
 *  - Source.password の暗号化 / 秘匿化（既存仕様維持）
 *  - rename / 並び替え / 並列重複名チェック（必要になったら別フェーズで検討）
 *  - EmailTemplateRepository / FilterConditionRepository（Phase N-3 以降）
 *
 * Firestore マッピング:
 *  - 全社共通レイヤ: `/tenants/{tid}/sources/{sourceId}` doc（baseName フィールドなし or null）
 *  - 拠点別レイヤ: `/tenants/{tid}/sources/{sourceId}` doc（baseName フィールド指定）or
 *    `/tenants/{tid}/baseOverrides/{baseName}/sources/{sourceId}`（設計判断は Phase J 時に確定）
 *  - deleteWithCascade は sources collection の doc 削除 + applicants collection の対象 doc 更新を
 *    runTransaction / WriteBatch で 1 atomic 化
 */
export interface SourceRepository {
  /**
   * 応募媒体一覧を返す。
   *  - baseName 未指定: `data.sources`（全社共通）
   *  - baseName 指定 + `data.sourcesByBase[baseName]` あり: `data.sourcesByBase[baseName]`
   *  - baseName 指定 + `data.sourcesByBase[baseName]` 未作成: `data.sources`（フォールバック、既存 UI 表示互換）
   *  - 並び順は保存時のまま
   */
  list(clientId: string, baseName?: string): Source[];
  /**
   * 応募媒体を 1 件追加する。
   *  - id は対象レイヤの `max(s.id) + 1` で採番（既存 SourceManagement.addSource と互換。
   *    既存挙動: 0 件レイヤなら id=1 から開始）
   *  - baseName 指定 + 対象レイヤ未作成: `data.sources` をコピーして開始 → 末尾に追加し
   *    `data.sourcesByBase[baseName]` として保存（既存 writeSources 互換、override 新規作成）
   *  - 重複名チェックは行わない（呼出側責務）
   *  - 戻り値は採番後の Source
   */
  create(
    clientId: string,
    source: Omit<Source, 'id'>,
    baseName?: string,
  ): Source;
  /**
   * 応募媒体を部分更新する。
   *  - 対象 sourceId が見つからなければ undefined を返す（saveClientData を呼ばない）
   *  - patch に id が混入しても無視（id は不変）
   *  - 対象レイヤが既存 + 全フィールドが現状と一致なら saveClientData を呼ばない（無駄な書込防止）
   *  - 対象レイヤが未作成 (= baseName 指定で `data.sourcesByBase[baseName]` が無い) の場合:
   *      patch 内容が現状と一致しても saveClientData を呼んで override を新規作成する
   *      （既存 writeSources 挙動互換: 「base 未設定で編集 = override 作成」）
   *  - 戻り値は更新後 Source（または既存値一致時の current）
   */
  update(
    clientId: string,
    sourceId: number,
    patch: Partial<Omit<Source, 'id'>>,
    baseName?: string,
  ): Source | undefined;
  /**
   * 応募媒体削除と applicants[].src クリアを 1 saveClientData に集約する。
   *
   * 動作:
   *  - 対象レイヤ (`data.sources` または `data.sourcesByBase[baseName]`) から sourceId 一致を除去
   *      - baseName 指定 + 対象レイヤ未作成: `data.sources` をコピーして開始 → 削除（既存 writeSources/deleteSource 互換）
   *  - 対象 sourceId が見つからなければ no-op で `removed: false` を返す（saveClientData も呼ばない）
   *  - applicants[].src === removedSourceName を '' にクリア
   *      - `opts.applicantBaseFilter` 指定時: `a.base === applicantBaseFilter` のみ対象
   *      - 未指定時: 全 applicants 横断（既存 SourceManagement.deleteSource の挙動を維持）
   *  - applicants[].updatedAt は touch しない（既存 deleteSource 互換）
   *  - 上記 2 配列の更新を 1 saveClientData にまとめる
   */
  deleteWithCascade(
    clientId: string,
    sourceId: number,
    opts?: {
      /** 対象レイヤ。undefined = 全社共通 / 指定 = 拠点別 */
      baseName?: string;
      /** applicants[].src クリア対象の base 絞り込み。undefined = 全 applicants 横断 */
      applicantBaseFilter?: string;
    },
  ): DeleteSourceCascadeResult;
  /**
   * 拠点別応募媒体オーバーライドレイヤをまるごと削除する（既存 SourceManagement.removeOverride 互換）。
   *  - `data.sourcesByBase[baseName]` キーを delete
   *  - キー不在なら no-op で `removed: false` を返す（saveClientData も呼ばない）
   *  - applicants は触らない（override を消すと全社共通レイヤにフォールバックする = 名前一致は維持される）
   */
  removeBaseOverride(clientId: string, baseName: string): RemoveSourceBaseOverrideResult;
}

/**
 * `EmailTemplateRepository.delete` の戻り値（Phase N-3 で追加）。
 *
 * カスケード方針:
 *  - **cascade なし**。applicants は触らない（既存 EmailTemplateManagement.deleteTemplate と互換）
 *  - 対象レイヤ (emailTemplates または emailTemplatesByBase[baseName]) から templateId 一致を除去
 *  - templateId 不一致なら no-op で removed: false を返す（saveClientData も呼ばない）
 */
export interface DeleteEmailTemplateResult {
  /** 対象レイヤから templateId が実際に除去されたか */
  removed: boolean;
  /** 除去した template の name。removed=false なら undefined */
  removedTemplateName?: string;
}

/** `EmailTemplateRepository.removeBaseOverride` の戻り値（Phase N-3 で追加）。 */
export interface RemoveEmailTemplateBaseOverrideResult {
  /** emailTemplatesByBase[baseName] キーが存在して削除されたか（不在なら false / save も呼ばない） */
  removed: boolean;
}

/**
 * メールテンプレート (EmailTemplate) 設定の CRUD ＋ 拠点別オーバーライドを扱う Repository（Phase N-3 で追加）。
 *
 * 想定する移行先:
 *  - `EmailTemplateManagement.tsx` の updateClientData 直更新を本 API 経由に置換
 *
 * 方針:
 *  - Phase N-1 JobRepository / N-2 SourceRepository の base-override 型を機械的に横展開した実装
 *  - 既存データ形状を維持する（EmailTemplate 型に baseName を追加する正規化は本フェーズで行わない）
 *      - `data.emailTemplates`               : 全社共通レイヤ
 *      - `data.emailTemplatesByBase[baseName]` : 拠点別オーバーライドレイヤ
 *  - baseName 未指定 = 全社共通レイヤを対象
 *  - baseName 指定 = 拠点別レイヤを対象
 *      - 対象レイヤ未作成時は `data.emailTemplates` をコピーして開始（既存 writeTemplates と互換、編集すると override が新規作成される）
 *
 * N-1/N-2 との差分:
 *  - **削除カスケードなし**（applicants にテンプレート参照フィールドが存在しない）
 *      → API は `delete` で十分（`deleteWithCascade` ではない）。`applicantBaseFilter` opt も不要
 *  - 呼出側 (EmailTemplateManagement.tsx) は **1000ms debounce auto-save** を持つが、
 *    debounce は呼出側の責務で、Repository は同期 API のまま（既存挙動を維持）
 *
 * スコープ外:
 *  - EmailTemplate 型への baseName 追加（Firestore 化時に再設計）
 *  - rename / 並び替え / 並列重複名チェック（必要になったら別フェーズで検討）
 *  - debounce / アンマウント時 flush の改善（既存挙動維持）
 *  - HearingRepository / FilterConditionRepository / Screening / Chatbot 等（Phase N-4 以降）
 *
 * Firestore マッピング:
 *  - 全社共通レイヤ: `/tenants/{tid}/emailTemplates/{templateId}` doc（baseName フィールドなし or null）
 *  - 拠点別レイヤ: `/tenants/{tid}/emailTemplates/{templateId}` doc（baseName フィールド指定）or
 *    `/tenants/{tid}/baseOverrides/{baseName}/emailTemplates/{templateId}`（設計判断は Phase J 時に確定）
 *  - body が長文化しやすいため、必要に応じて collection 分離（quota / 転送量観点）
 *  - delete は単純な `doc().delete()`（cascade なし）
 *  - update は Phase J で `Promise<EmailTemplate>` に変更、画面側は async/await + saveState を Promise 完了まで延長
 */
export interface EmailTemplateRepository {
  /**
   * メールテンプレート一覧を返す。
   *  - baseName 未指定: `data.emailTemplates`（全社共通）
   *  - baseName 指定 + `data.emailTemplatesByBase[baseName]` あり: `data.emailTemplatesByBase[baseName]`
   *  - baseName 指定 + `data.emailTemplatesByBase[baseName]` 未作成: `data.emailTemplates`（フォールバック、既存 UI 表示互換）
   *  - 並び順は保存時のまま
   */
  list(clientId: string, baseName?: string): EmailTemplate[];
  /**
   * メールテンプレートを 1 件追加する。
   *  - id は対象レイヤの `max(t.id) + 1` で採番（既存 EmailTemplateManagement.addTemplate と互換。
   *    既存挙動: 0 件レイヤなら id=1 から開始）
   *  - baseName 指定 + 対象レイヤ未作成: `data.emailTemplates` をコピーして開始 → 末尾に追加し
   *    `data.emailTemplatesByBase[baseName]` として保存（既存 writeTemplates 互換、override 新規作成）
   *  - 重複名チェックは行わない（呼出側責務）
   *  - 戻り値は採番後の EmailTemplate
   */
  create(
    clientId: string,
    template: Omit<EmailTemplate, 'id'>,
    baseName?: string,
  ): EmailTemplate;
  /**
   * メールテンプレートを部分更新する（auto-save 経路の呼出を想定）。
   *  - 対象 templateId が見つからなければ undefined を返す（saveClientData を呼ばない）
   *  - patch に id が混入しても無視（id は不変）
   *  - 対象レイヤが既存 + 全フィールドが現状と一致なら saveClientData を呼ばない（無駄な書込防止）
   *  - 対象レイヤが未作成 (= baseName 指定で `data.emailTemplatesByBase[baseName]` が無い) の場合:
   *      patch 内容が現状と一致しても saveClientData を呼んで override を新規作成する
   *      （既存 writeTemplates 挙動互換: 「base 未設定で編集 = override 作成」）
   *  - 戻り値は更新後 EmailTemplate（または既存値一致時の current）
   */
  update(
    clientId: string,
    templateId: number,
    patch: Partial<Omit<EmailTemplate, 'id'>>,
    baseName?: string,
  ): EmailTemplate | undefined;
  /**
   * メールテンプレートを削除する（cascade なし）。
   *
   * 動作:
   *  - 対象レイヤ (`data.emailTemplates` または `data.emailTemplatesByBase[baseName]`) から templateId 一致を除去
   *      - baseName 指定 + 対象レイヤ未作成: `data.emailTemplates` をコピーして開始 → 削除（既存 writeTemplates/deleteTemplate 互換）
   *  - 対象 templateId が見つからなければ no-op で `removed: false` を返す（saveClientData も呼ばない）
   *  - **applicants は触らない**（applicants 側にテンプレート参照フィールドが存在しないため。既存 deleteTemplate 互換）
   */
  delete(
    clientId: string,
    templateId: number,
    /** 対象レイヤ。undefined = 全社共通 / 指定 = 拠点別 */
    baseName?: string,
  ): DeleteEmailTemplateResult;
  /**
   * 拠点別メールテンプレートオーバーライドレイヤをまるごと削除する（既存 EmailTemplateManagement.removeOverride 互換）。
   *  - `data.emailTemplatesByBase[baseName]` キーを delete
   *  - キー不在なら no-op で `removed: false` を返す（saveClientData も呼ばない）
   *  - applicants は触らない
   */
  removeBaseOverride(clientId: string, baseName: string): RemoveEmailTemplateBaseOverrideResult;
}

/**
 * ヒアリングテンプレ (HearingTemplate) の最小 CRUD を扱う Repository（Phase N-4 で追加）。
 *
 * 想定する移行先:
 *  - `HearingManagement.tsx` の updateClientData 直更新を本 API 経由に置換
 *
 * 方針:
 *  - HearingTemplate は **id を持たず jobName 文字列がキー**（Job/Source/EmailTemplate の numeric id 型と異なる）
 *  - **base-override なし**（`AuthContext.filterDataByBase` は hearingTemplates を触らず、子アカも全社共通を参照）
 *      → `data.hearingTemplatesByBase` のような拠点別レイヤは存在しない / 追加もしない
 *  - 既存データ形状を維持する（HearingTemplate 型への id / baseName 追加は本フェーズで行わない）
 *  - 呼出側 (HearingManagement.tsx) は **800ms debounce auto-save + 手動保存ボタン** を持つが、
 *    debounce / Manual 保存ボタンは呼出側の責務で、Repository は同期 API のまま（既存挙動を維持）
 *
 * N-1/N-2/N-3 との差分:
 *  - **削除カスケードなし**（applicants にヒアリング参照フィールドが存在しない）
 *  - **削除 API なし**（HearingManagement に削除 UI がない / Job 削除カスケード連携は別フェーズ）
 *      → API は `list` + `upsert` のみ。`removeByJob` は将来用にコメント化
 *  - **base-override なし**（`pickLayer`/`writeLayer`/`removeBaseOverride` 不要 / `applicantBaseFilter` opt も不要）
 *  - キーが numeric id ではなく jobName 文字列のため `upsert` API（create/update を統合）が自然
 *
 * スコープ外:
 *  - HearingTemplate 型への id / baseName 追加（Firestore 化時に再設計）
 *  - 削除 API (`removeByJob`) 実装（UI が来た時に追加）
 *  - Job rename/delete カスケード連携（JobRepository.deleteWithCascade との連動は別フェーズ）
 *  - Job 切替時の未 flush 改善（既存挙動として維持）
 *  - debounce / アンマウント時 flush の改善（既存挙動維持）
 *  - ScreeningRepository / ChatRepository / MediaCostRepository / ExclusionRepository /
 *    ReportScheduleRepository / FilterConditionRepository 等（Phase N-5 以降）
 *
 * Firestore マッピング:
 *  - `/tenants/{tid}/hearingTemplates/{docId}` doc（docId = sanitized jobName or random id + jobName field、設計判断は Phase J 時に確定）
 *  - 全社共通のみ（base-override コレクションなし）
 *  - upsert は Phase J で `Promise<HearingTemplate>` に変更、画面側は async/await + saveState を Promise 完了まで延長
 */
export interface HearingRepository {
  /**
   * ヒアリングテンプレ一覧を返す（base-override なし）。
   *  - `data.hearingTemplates` をそのまま返す（未定義時は `[]`）
   *  - 並び順は保存時のまま
   */
  list(clientId: string): HearingTemplate[];
  /**
   * jobName をキーに upsert する。
   *  - jobName 一致あり + template が完全一致: no-op で current を返す（saveClientData を呼ばない）
   *  - jobName 一致あり + template 差分あり: 該当 entry の template を差替えて save
   *  - jobName 一致なし: 末尾に `{ jobName, template }` を push して save
   *  - 戻り値は upsert 後の HearingTemplate（または no-op 時の current）
   *  - applicants は触らない（参照フィールドが存在しないため）
   */
  upsert(clientId: string, jobName: string, templateBody: string): HearingTemplate;
  /**
   * 将来予約: jobName 単位の削除（HearingManagement に削除 UI が来た時 / jobRepository.deleteWithCascade との連携時）。
   * Phase N-4 では未実装 / 未呼出。
   */
  // removeByJob?(clientId: string, jobName: string): { removed: boolean };
}
