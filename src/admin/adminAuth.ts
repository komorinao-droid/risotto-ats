/**
 * 運営側 認証ヘルパー
 * - SHA-256 ハッシュ + ソルト
 * - localStorage / sessionStorage によるセッション管理
 * - 30日 / セッション の2モード
 */

const SESSION_KEY = 'risotto:admin:session';
const ADMIN_LOG_KEY = 'risotto:admin:operation_logs';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30分
const LONG_SESSION_DAYS = 30;
const MAX_LOGS = 1000;

/* =========================================================
   ハッシュ / トークン
   ========================================================= */

/** ランダムなsalt（32hex chars） */
export function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ランダムなセッショントークン（64hex chars） */
export function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 ハッシュ（パスワード + ソルト → 64hex） */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* =========================================================
   セッション管理
   ========================================================= */

export interface AdminSessionStored {
  token: string;
  accountId: string;
  expiresAt: string; // ISO
  remember: boolean;
}

/** セッション保存。remember=true なら localStorage(30日)、false なら sessionStorage */
export function saveSession(session: AdminSessionStored): void {
  const data = JSON.stringify(session);
  if (session.remember) {
    localStorage.setItem(SESSION_KEY, data);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, data);
    localStorage.removeItem(SESSION_KEY);
  }
}

export function loadSession(): AdminSessionStored | null {
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as AdminSessionStored;
    // 必須フィールドの検証（改ざん検知）
    if (!s.token || typeof s.token !== 'string' || s.token.length < 32) {
      clearSession();
      return null;
    }
    if (!s.accountId || !s.expiresAt) {
      clearSession();
      return null;
    }
    if (new Date(s.expiresAt).getTime() < Date.now()) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function makeExpiresAt(remember: boolean): string {
  if (remember) {
    return new Date(Date.now() + LONG_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  // セッション = 24時間で強制切れ
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

/* =========================================================
   アカウントロック
   ========================================================= */

export function isLocked(account: { lockedUntil?: string }): boolean {
  if (!account.lockedUntil) return false;
  return new Date(account.lockedUntil).getTime() > Date.now();
}

export function shouldLock(failedAttempts: number): boolean {
  return failedAttempts >= MAX_FAILED_ATTEMPTS;
}

export function makeLockUntil(): string {
  return new Date(Date.now() + LOCK_DURATION_MS).toISOString();
}

/* =========================================================
   運営操作ログ
   ========================================================= */

export interface AdminOperationLogEntry {
  id: string;
  timestamp: string;
  operatorId: string;
  operatorName: string;
  action: string;
  target: string;
  detail?: string;
}

export function getAdminLogs(): AdminOperationLogEntry[] {
  try {
    const raw = localStorage.getItem(ADMIN_LOG_KEY);
    if (raw) return JSON.parse(raw) as AdminOperationLogEntry[];
  } catch { /* ignore */ }
  return [];
}

export function pushAdminLog(entry: Omit<AdminOperationLogEntry, 'id' | 'timestamp'>): void {
  const logs = getAdminLogs();
  const now = new Date();
  const log: AdminOperationLogEntry = {
    id: `${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.toISOString(),
    ...entry,
  };
  logs.unshift(log);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  try {
    localStorage.setItem(ADMIN_LOG_KEY, JSON.stringify(logs));
  } catch { /* ignore quota */ }
}
