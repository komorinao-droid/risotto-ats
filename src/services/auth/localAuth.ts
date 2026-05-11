import type { Client } from '@/types';
import { clientRepository } from '@/repositories';
import type {
  AdminResetPasswordResult,
  AuthService,
  AuthSession,
  ChangePasswordResult,
  LoginResult,
  SafeClient,
} from './types';

/**
 * LocalStorage / clientRepository ベースの AuthService 実装。
 *
 * Phase I-1 では呼出側 (AuthContext / Login / AccountSettings) は未連携。
 * 既存挙動を維持したまま境界だけ立ち上げる目的のクラス。
 *
 * 設計メモ:
 *  - sessionStorage キーは AuthContext の `SESSION_KEY` と同一 ('risotto-client-session')。
 *    画面側を I-2 で寄せる時に、既ログイン状態のまま無停止で切り替えられるようにするため。
 *  - 旧フォーマット (password 入り Client 丸ごと保存) で sessionStorage に残っているケースを
 *    restoreSession 時に検出し、SafeClient で書き直す (パスワード平文残骸の除去)。
 *  - 子アカウントの親オプション継承ロジック (login / refreshSession) は AuthContext と同じ。
 *    I-2 で AuthContext から重複削除する。
 *  - 全メソッド Promise 戻り。LocalStorage 実装は同期処理だが、Firebase / API 差し替え時に
 *    interface を変えずに済むよう Promise.resolve でラップする。
 */
const SESSION_KEY = 'risotto-client-session';

export class LocalStorageAuthService implements AuthService {
  async login(clientId: string, password: string): Promise<LoginResult> {
    return this.loginSync(clientId, password);
  }

  async logout(): Promise<void> {
    this.clearSession();
  }

  async restoreSession(): Promise<AuthSession | null> {
    return this.restoreSessionSync();
  }

  async refreshSession(): Promise<AuthSession | null> {
    const current = this.readRawSession();
    if (!current) return null;

    const fresh = clientRepository.findById(current.id);
    if (!fresh) return null;

    const safe = this.applyParentOptions(fresh);
    this.writeSafeSession(safe);
    return { client: safe };
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResult> {
    const current = this.readRawSession();
    if (!current) return { ok: false, reason: 'not_logged_in' };
    if (!newPassword) return { ok: false, reason: 'weak_new' };

    const all = clientRepository.list();
    const idx = all.findIndex((c) => c.id === current.id);
    if (idx < 0) return { ok: false, reason: 'not_logged_in' };

    if (all[idx].password !== currentPassword) {
      return { ok: false, reason: 'invalid_current' };
    }

    const next = all.slice();
    next[idx] = { ...next[idx], password: newPassword };
    clientRepository.saveAll(next);
    return { ok: true };
  }

  async adminResetPassword(
    clientId: string,
    newPassword: string,
  ): Promise<AdminResetPasswordResult> {
    // 弱パスワード判定: UI 側の 「6 文字以上」 制約と揃える
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, reason: 'weak_new' };
    }

    const all = clientRepository.list();
    const idx = all.findIndex((c) => c.id === clientId);
    if (idx < 0) return { ok: false, reason: 'not_found' };

    // password 更新は clientRepository.update が strip するため、ここでは
    // saveAll を直接呼んで password を含む差し替えを行う。
    // 平文 password が画面側に露出しないよう authService 内に閉じ込める境界。
    const next = all.slice();
    next[idx] = { ...next[idx], password: newPassword };
    clientRepository.saveAll(next);
    return { ok: true };
  }

  // ──────────────────────────────────────────────
  // I-2a / I-2b 移行用 同期 shim (public)
  //
  // すべて AuthContext が同期 API を維持するための transition 用。
  // 本番認証 (Firebase / API + Cookie) では同期処理が成り立たないため、
  // 該当実装側で no-op / throw に倒す前提。AuthContext 完全 async 化時に削除候補。
  // ──────────────────────────────────────────────

  loginSync(clientId: string, password: string): LoginResult {
    const found = clientRepository.findForLogin(clientId, password);
    if (!found) return { ok: false, reason: 'invalid_credentials' };
    if (found.status === 'inactive') return { ok: false, reason: 'inactive' };

    const safe = this.applyParentOptions(found);
    this.writeSafeSession(safe);
    return { ok: true, session: { client: safe } };
  }

  restoreSessionSync(): AuthSession | null {
    const raw = this.readRawSession();
    if (!raw) return null;

    const safe = this.stripPassword(raw);
    // 旧フォーマット (password 入り) で残っていたら SafeClient で上書き保存
    if ('password' in raw) {
      this.writeSafeSession(safe);
    }
    return { client: safe };
  }

  persistSession(client: Client): void {
    // 引数は Client (現状 password を含む型) を受けるが、内部で SafeClient に剥がして保存。
    // sessionStorage に password が残らないことを保証する境界。
    this.writeSafeSession(this.stripPassword(client));
  }

  clearSession(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  // ──────────────────────────────────────────────
  // private helpers
  // ──────────────────────────────────────────────

  /**
   * sessionStorage の生 JSON を Partial<Client> として読む。
   * 旧フォーマット (password 入り) と新フォーマット (SafeClient) の両方を許容する。
   */
  private readRawSession(): (SafeClient & Partial<Pick<Client, 'password'>>) | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SafeClient & Partial<Pick<Client, 'password'>>;
    } catch {
      return null;
    }
  }

  private writeSafeSession(safe: SafeClient): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }

  private stripPassword(obj: SafeClient & Partial<Pick<Client, 'password'>>): SafeClient {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safe } = obj as Client;
    return safe;
  }

  /**
   * 子アカウントの場合、親アカウントの options を継承して SafeClient を返す。
   * 親が見つからない / options を持たない場合は素の SafeClient を返す。
   */
  private applyParentOptions(client: Client): SafeClient {
    let effective: Client = client;
    if (client.accountType === 'child' && client.parentId) {
      const parent = clientRepository.findById(client.parentId);
      if (parent?.options) {
        effective = { ...client, options: parent.options };
      }
    }
    return this.stripPassword(effective);
  }
}
