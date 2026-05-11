import type { Client } from '@/types';

/**
 * password を含まない Client。
 * AuthContext / sessionStorage / 画面側 state はすべて SafeClient を介する想定。
 *
 * 現状 (Phase I-1) では Client.password 自体は型定義に残っており、
 * clientRepository / AccountSettings 等は依然 password にアクセスしている。
 * SafeClient への完全切替は I-2 以降で AuthContext を authService 経由に寄せた後に行う。
 */
export type SafeClient = Omit<Client, 'password'>;

/**
 * AuthService が持つ "現在ログイン中のセッション" を表す。
 * 将来の Firebase Auth / JWT / Cookie 化時に accessToken / expiresAt 等を追加できるよう
 * 1 階層オブジェクトにラップしてある (SafeClient を直接返さない)。
 */
export interface AuthSession {
  client: SafeClient;
}

/**
 * login 結果。
 * 現行 LocalStorage 実装は「id+password 一致 / 不一致」しか区別できないので
 * not_found / invalid_password を分けず invalid_credentials に統合する。
 * 本番認証 (Firebase Auth 等) で区別可能になった際は reason を追加する。
 */
export type LoginResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'invalid_credentials' | 'inactive' };

/**
 * changePassword 結果。
 * - not_logged_in: セッションがない / 削除済アカウント
 * - invalid_current: 現行パスワード不一致
 * - weak_new: 新パスワードが空文字 (Phase I-1 では空チェックのみ。強度判定は呼出側 UI で実施)
 */
export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'not_logged_in' | 'invalid_current' | 'weak_new' };

/**
 * adminResetPassword 結果 (Phase M-7a)。
 * - not_found: 指定 clientId が存在しない
 * - weak_new: 新パスワードが空 / 6 文字未満 (UI 側の 6文字以上 制約と揃える)
 *
 * 運営側 (AdminApp) からの強制リセット用。super 権限チェックは呼出側責務。
 * セッションを参照せず clientId 直指定で password を更新する点が changePassword との差。
 */
export type AdminResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'weak_new' };

/**
 * 認証境界。
 *
 * Phase I-1 では `LocalStorageAuthService` が clientRepository ベースで実装する。
 * 本番化時はこの interface を満たす実装に差し替えるだけで済むよう設計している:
 *   - Firebase Auth + Firestore (signInWithEmailAndPassword + getIdToken)
 *   - 自前 API + HttpOnly Cookie (fetch('/api/auth/login') / refresh)
 *   - Google Identity Services (One Tap)
 *
 * 全メソッドが Promise を返すのは差し替え先が非同期前提のため。
 * LocalStorage 実装は同期処理だが、await 互換のため Promise でラップする。
 */
export interface AuthService {
  /** id + password で認証してセッションを開始する。成功時 sessionStorage に SafeClient を保存。 */
  login(clientId: string, password: string): Promise<LoginResult>;

  /** セッションを破棄する (sessionStorage の SafeClient を削除)。 */
  logout(): Promise<void>;

  /**
   * sessionStorage からセッションを復元する (ページ再読込時)。
   * 旧フォーマット (password 入り Client 丸ごと保存) があっても password を落として SafeClient 化する。
   * リモート問合せはしない (高速復元用)。最新化したい場合は続けて refreshSession を呼ぶ。
   */
  restoreSession(): Promise<AuthSession | null>;

  /**
   * 現在のセッションを最新化する。
   * - clientRepository から最新の Client を引き直す
   * - 子アカウントは親の options を継承し直す
   * - sessionStorage を更新する
   *
   * incrementOptionUsage 後 / 親側で options が変わった時に呼ぶ想定。
   */
  refreshSession(): Promise<AuthSession | null>;

  /**
   * パスワード変更。authService 内で現行パスワード照合と平文保存を完結させる。
   * 呼出側 (AccountSettings 等) からは Client.password を直接参照させないための境界。
   */
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResult>;

  /**
   * 運営側からの強制パスワード reset (Phase M-7a)。
   * - current password の照合は行わない (super 権限前提)
   * - 呼出側 (AdminApp) で isSuper チェック済を前提とする
   * - sessionStorage には影響しない (運営は自分のセッションではなく対象クライアントを変更)
   *
   * Firebase Auth 化時は admin SDK の updatePassword 相当に置換する想定。
   */
  adminResetPassword(
    clientId: string,
    newPassword: string,
  ): Promise<AdminResetPasswordResult>;

  // ──────────────────────────────────────────────
  // I-2a 移行用 同期 shim
  //
  // AuthContext の useState 初期化 (同期復元) と [client] useEffect (同期 persist)
  // から呼ぶための同期メソッド。LocalStorage 実装では sessionStorage 直接操作のため
  // 同期で問題ないが、本番認証 (Firebase / API + Cookie) 化時には:
  //   - restoreSessionSync: ローカルキャッシュが無いため null を返す実装に変える
  //   - persistSession / clearSession: 同期で何もしない (実体は login/logout 内で完結)
  // という形で interface を満たす。AuthContext が完全 async 化 (I-2b) した後に削除候補。
  // ──────────────────────────────────────────────

  /**
   * 同期的に sessionStorage からセッションを復元する (リモート問合せなし)。
   * 旧フォーマット (password 入り Client) があれば SafeClient で書き直す。
   */
  restoreSessionSync(): AuthSession | null;

  /**
   * 同期的に認証する。
   * AuthContext.login が boolean を同期返却する既存契約 (Login.tsx 互換) を保つための transition shim。
   * 本番認証 (Firebase / API + Cookie) では同期処理が不可能なので、この shim は
   *   - 例外を投げる
   *   - 常に { ok: false, reason: 'invalid_credentials' } を返す
   * 等の no-op 実装になる予定。AuthContext を完全 async 化した時点で削除候補。
   */
  loginSync(clientId: string, password: string): LoginResult;

  /**
   * 同期的にセッションを保存する。
   * 引数は Client (現状 password を含む型) を受けるが、内部で SafeClient に剥がして保存する。
   */
  persistSession(client: Client): void;

  /**
   * 同期的にセッションを破棄する。
   */
  clearSession(): void;
}
