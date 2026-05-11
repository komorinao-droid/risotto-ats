/**
 * AuthService シングルトン エクスポート
 *
 * 使い方 (I-2 以降で AuthContext などから利用予定):
 *   import { authService } from '@/services/auth';
 *   const result = await authService.login(id, pw);
 *
 * 将来:
 *   本番認証へ差し替える時はここで実装クラスを切り替えるだけで済む。
 *     export const authService = new FirebaseAuthService();
 *     export const authService = new ApiCookieAuthService();
 *
 * Phase I-1 では呼出側未連携 (型と LocalStorage 実装の追加のみ)。
 */
import { LocalStorageAuthService } from './localAuth';

export const authService = new LocalStorageAuthService();

export type {
  SafeClient,
  AuthSession,
  LoginResult,
  ChangePasswordResult,
  AdminResetPasswordResult,
  AuthService,
} from './types';
