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
  /** ハッシュチェーン値 (改ざん検知用)。前ログのchain+当ログのcontentから算出 */
  chain?: string;
}

/** 軽量な FNV-1a ハッシュ (改ざん検知用、暗号強度なし) */
function fnv1aHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** ハッシュチェーン用 chain 値を計算 (前ログの chain + 当ログ内容) */
function computeChain(prevChain: string, log: Omit<AdminOperationLogEntry, 'chain'>): string {
  const payload = `${prevChain}|${log.id}|${log.timestamp}|${log.operatorId}|${log.action}|${log.target}|${log.detail || ''}`;
  return fnv1aHash(payload);
}

export function getAdminLogs(): AdminOperationLogEntry[] {
  try {
    const raw = localStorage.getItem(ADMIN_LOG_KEY);
    if (raw) return JSON.parse(raw) as AdminOperationLogEntry[];
  } catch { /* ignore */ }
  return [];
}

/** ハッシュチェーンの整合性を検証。改ざんがあれば該当エントリ index を返す */
export function verifyAdminLogIntegrity(): { ok: boolean; tamperedIndex?: number } {
  const logs = getAdminLogs();
  // logs は新しい順なので chain検証は古い順から
  const ordered = [...logs].reverse();
  let prevChain = 'genesis';
  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];
    if (!entry.chain) continue; // chain未設定の旧データはスキップ
    const expected = computeChain(prevChain, entry);
    if (entry.chain !== expected) {
      return { ok: false, tamperedIndex: logs.length - 1 - i };
    }
    prevChain = entry.chain;
  }
  return { ok: true };
}

export function pushAdminLog(entry: Omit<AdminOperationLogEntry, 'id' | 'timestamp' | 'chain'>): void {
  const logs = getAdminLogs();
  const now = new Date();
  const prevChain = logs.length > 0 ? (logs[0].chain || 'genesis') : 'genesis';
  const baseLog = {
    id: `${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.toISOString(),
    ...entry,
  };
  const log: AdminOperationLogEntry = {
    ...baseLog,
    chain: computeChain(prevChain, baseLog),
  };
  logs.unshift(log);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  try {
    localStorage.setItem(ADMIN_LOG_KEY, JSON.stringify(logs));
  } catch { /* ignore quota */ }
}
