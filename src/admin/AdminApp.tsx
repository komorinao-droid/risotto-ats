import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ClipboardList,
  ShieldCheck,
  Link2,
  LogOut,
  Eye,
  EyeOff,
  Check,
  X,
  Building2,
  Store,
  AlertTriangle,
  Siren,
  RefreshCw,
  Loader2,
  UserCheck,
  UserX,
  PartyPopper,
  User,
  CalendarDays,
  FileText,
  Trophy,
  Newspaper,
  Settings,
  Sparkles,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Briefcase,
  Megaphone,
  KeyRound,
} from 'lucide-react';
import { storage } from '@/utils/storage';
import Modal from '@/components/Modal';
import type { Client, ClientData, ClientPermissions, ClientOperationLog } from '@/types';
import { getClientLogs, formatLogTimestamp } from '@/utils/clientLog';
import { calcAllClientStats, calcAdminAggregates, formatRelative, type ClientStats } from './clientStats';
import {
  generateSalt,
  generateToken,
  hashPassword,
  saveSession,
  loadSession,
  clearSession,
  makeExpiresAt,
  isLocked,
  shouldLock,
  makeLockUntil,
  pushAdminLog,
  getAdminLogs,
  type AdminOperationLogEntry,
} from './adminAuth';

/* ============================================================
   定数 / ヘルパー
   ============================================================ */
const ADMIN_PASSWORD = 'admin123';

const PLAN_LABELS: Record<Client['plan'], string> = {
  trial: 'トライアル',
  standard: 'スタンダード',
  professional: 'プロフェッショナル',
  enterprise: 'エンタープライズ',
};

const PLAN_COLORS: Record<Client['plan'], string> = {
  trial: '#6B7280',
  standard: '#3B82F6',
  professional: '#8B5CF6',
  enterprise: '#F59E0B',
};

const PERMISSION_LABELS: Record<keyof ClientPermissions, string> = {
  status: 'ステータス管理',
  source: '応募媒体管理',
  base: '拠点管理',
  job: '職種管理',
  hearing: 'ヒアリング管理',
  filtercond: 'フィルタ条件',
  mailtemplate: 'メールテンプレート',
  exclusion: '除外リスト',
  chatbot: 'チャットボット管理',
};

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as (keyof ClientPermissions)[];

const defaultPermissions = (): ClientPermissions => ({
  status: true, source: true, base: true, job: true,
  hearing: true, filtercond: true, mailtemplate: true, exclusion: true,
  chatbot: true,
});

function emptyClient(): Client {
  return {
    id: '',
    companyName: '',
    password: '',
    accountType: 'parent',
    parentId: undefined,
    baseName: '',
    plan: 'standard',
    status: 'active',
    contractStart: '',
    contractEnd: '',
    contactName: '',
    contactEmail: '',
    memo: '',
    permissions: defaultPermissions(),
    members: [],
  };
}

/* ============================================================
   追加型定義
   ============================================================ */
interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: 'super' | 'operator';
  // v1: password (平文) - マイグレーション元として残す
  password?: string;
  // v2: ハッシュ + ソルト
  passwordHash?: string;
  passwordSalt?: string;
  active: boolean;
  lastLoginAt?: string;
  // ログイン失敗カウント（5回失敗で30分ロック）
  failedAttempts?: number;
  lockedUntil?: string;
  createdAt: string;
}


interface MediaIntegration {
  id: string;
  name: string;
  type: string;
  apiKey?: string;
  webhookUrl?: string;
  status: 'active' | 'inactive';
  connectionStatus?: 'ok' | 'error' | 'unknown';
  lastChecked?: string;
  lastSync?: string;
  note?: string;
}

/* ============================================================
   管理用ストレージヘルパー
   ============================================================ */
const ADMIN_ACCOUNTS_KEY = 'risotto:admin:accounts';
const ADMIN_MEDIA_KEY = 'risotto:admin:media';

function getAdminAccounts(): AdminAccount[] {
  try {
    const raw = localStorage.getItem(ADMIN_ACCOUNTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as AdminAccount[];
      if (arr.length) {
        // 旧データの後方互換：active/createdAt 等の必須フィールドを補完
        return arr.map((a) => ({
          ...a,
          active: a.active !== false,
          // emailが無い既存データは admin@local とする（再ログイン時に変更可）
          email: a.email || (a.id === 'admin' ? 'admin@local' : `${a.id}@local`),
        }));
      }
    }
  } catch { /* ignore */ }
  // 初期データ：平文パスワード保持（初回ログイン時にハッシュ化）
  const defaults: AdminAccount[] = [
    {
      id: 'admin',
      name: 'システム管理者',
      email: 'admin@local',
      role: 'super',
      password: ADMIN_PASSWORD,
      active: true,
      createdAt: '2024-01-01',
    },
  ];
  localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(defaults));
  return defaults;
}
function saveAdminAccounts(accounts: AdminAccount[]) {
  localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** メールでアカウントを引く */
function findAccountByEmail(email: string): AdminAccount | null {
  const list = getAdminAccounts();
  const target = email.trim().toLowerCase();
  return list.find((a) => (a.email || '').toLowerCase() === target) || null;
}

/** アカウント1件を更新 */
function updateAccount(id: string, mutator: (a: AdminAccount) => AdminAccount): void {
  const list = getAdminAccounts();
  const next = list.map((a) => (a.id === id ? mutator(a) : a));
  saveAdminAccounts(next);
}

function getMediaIntegrations(): MediaIntegration[] {
  try {
    const raw = localStorage.getItem(ADMIN_MEDIA_KEY);
    if (raw) { const arr = JSON.parse(raw); if (arr.length) return arr; }
  } catch { /* ignore */ }
  const defaults: MediaIntegration[] = [
    { id: 'indeed', name: 'Indeed', type: 'indeed', status: 'inactive' },
    { id: 'doda', name: 'doda', type: 'doda', status: 'inactive' },
    { id: 'rikunabi', name: 'リクナビNEXT', type: 'rikunabi', status: 'inactive' },
    { id: 'mynavi', name: 'マイナビ転職', type: 'mynavi', status: 'inactive' },
    { id: 'hellowork', name: 'ハローワーク', type: 'hellowork', status: 'inactive' },
    { id: 'townwork', name: 'タウンワーク', type: 'townwork', status: 'inactive' },
  ];
  localStorage.setItem(ADMIN_MEDIA_KEY, JSON.stringify(defaults));
  return defaults;
}
function saveMediaIntegrations(integrations: MediaIntegration[]) {
  localStorage.setItem(ADMIN_MEDIA_KEY, JSON.stringify(integrations));
}

const PLAN_PRICES: Record<Client['plan'], number> = {
  trial: 0,
  standard: 50000,
  professional: 100000,
  enterprise: 200000,
};

const MEDIA_COLORS: Record<string, string> = {
  indeed: '#2557A7',
  doda: '#E67E22',
  rikunabi: '#DC2626',
  mynavi: '#16A34A',
  hellowork: '#CA8A04',
  townwork: '#9333EA',
  custom: '#6B7280',
};

const MediaIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 20 }) => {
  const color = MEDIA_COLORS[type] || '#6B7280';
  const Icon = type === 'custom' ? Settings : Newspaper;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
};

/* ============================================================
   共通スタイル
   ============================================================ */
const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '10px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  border: '1px solid #e5e7eb',
};

const btnPrimary: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  backgroundColor: '#C2570C',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.4rem 0.875rem',
  backgroundColor: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  color: '#DC2626',
  borderColor: '#FCA5A5',
};

const btnSuccess: React.CSSProperties = {
  ...btnSecondary,
  color: '#059669',
  borderColor: '#6EE7B7',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  marginBottom: '0.25rem',
  color: '#374151',
};

/* ============================================================
   管理者ログイン
   ============================================================ */
const AdminLogin: React.FC<{ onLogin: (account: AdminAccount, remember: boolean) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setSubmitting(true);
    try {
      const account = findAccountByEmail(email);
      if (!account) {
        setError('メールアドレスまたはパスワードが正しくありません。');
        return;
      }
      if (!account.active) {
        setError('このアカウントは無効化されています。管理者にお問い合わせください。');
        return;
      }
      if (isLocked(account)) {
        const until = new Date(account.lockedUntil!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        setError(`連続ログイン失敗によりアカウントがロックされています（${until} まで）。`);
        return;
      }

      // 認証チェック
      let authed = false;
      if (account.passwordHash && account.passwordSalt) {
        const hash = await hashPassword(password, account.passwordSalt);
        authed = hash === account.passwordHash;
      } else if (account.password) {
        // 旧データ：平文と突合 → 成功時にハッシュ化して保存
        if (password === account.password) {
          authed = true;
          const salt = generateSalt();
          const hash = await hashPassword(password, salt);
          updateAccount(account.id, (a) => ({
            ...a,
            password: undefined,
            passwordHash: hash,
            passwordSalt: salt,
          }));
        }
      }

      if (!authed) {
        // 失敗カウント+1
        updateAccount(account.id, (a) => {
          const fa = (a.failedAttempts || 0) + 1;
          return {
            ...a,
            failedAttempts: fa,
            lockedUntil: shouldLock(fa) ? makeLockUntil() : a.lockedUntil,
          };
        });
        const remaining = Math.max(0, 5 - ((account.failedAttempts || 0) + 1));
        if (remaining === 0) {
          setError('連続ログイン失敗によりアカウントが30分間ロックされました。');
        } else {
          setError(`メールアドレスまたはパスワードが正しくありません（残り ${remaining} 回でロック）。`);
        }
        return;
      }

      // 成功：失敗カウントとロック解除
      updateAccount(account.id, (a) => ({
        ...a,
        failedAttempts: 0,
        lockedUntil: undefined,
        lastLoginAt: new Date().toISOString(),
      }));

      // 最新版を取得（ハッシュ化や last_login が反映済み）
      const fresh = findAccountByEmail(email)!;
      onLogin(fresh, remember);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#C2570C' }}>
      <form onSubmit={handleSubmit} style={{ backgroundColor: '#fff', padding: '2.5rem 2rem', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)', width: '420px', maxWidth: '90vw' }}>
        <h1 style={{ textAlign: 'center', margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700, color: '#C2570C' }}>RISOTTO</h1>
        <p style={{ textAlign: 'center', margin: '0 0 1.75rem', fontSize: '0.8125rem', color: '#6b7280' }}>運営管理画面ログイン</p>

        {error && (
          <div style={{ padding: '0.625rem 0.75rem', backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: '6px', fontSize: '0.8125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            style={inputStyle}
            placeholder="admin@example.com"
            autoFocus
            autoComplete="email"
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>パスワード</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e); }}
              style={{ ...inputStyle, paddingRight: '2.5rem' }}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.875rem', padding: '0.25rem' }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151', marginBottom: '1.25rem' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          ログイン状態を保持する（30日間）
        </label>

        <button type="submit" disabled={submitting} style={{ ...btnPrimary, width: '100%', padding: '0.75rem', fontSize: '0.9375rem', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? '認証中...' : 'ログイン'}
        </button>

        <div style={{ marginTop: '1.25rem', padding: '0.625rem 0.75rem', backgroundColor: '#F9FAFB', borderRadius: '6px', fontSize: '0.6875rem', color: '#6b7280', textAlign: 'center' }}>
          初期管理者: admin@local / admin123（初回ログイン後に必ず変更してください）
        </div>
      </form>
    </div>
  );
};

/* ============================================================
   統計カード
   ============================================================ */
const StatCard: React.FC<{ label: string; value: number | string; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div style={{ ...cardStyle, padding: '1.25rem', flex: '1 1 200px', minWidth: '180px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.125rem' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{value}</div>
      </div>
    </div>
  </div>
);

const SummaryTile: React.FC<{ label: string; value: number | string; sub?: string; color: string; icon: React.ReactNode }> = ({ label, value, sub, color, icon }) => (
  <div style={{ padding: '0.75rem 0.875rem', backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: color + '15', color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{label}</div>
    </div>
    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginTop: '0.125rem' }}>{sub}</div>}
  </div>
);

/* ============================================================
   プランバッジ
   ============================================================ */
const PlanBadge: React.FC<{ plan: Client['plan'] }> = ({ plan }) => (
  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: PLAN_COLORS[plan] + '20', color: PLAN_COLORS[plan] }}>
    {PLAN_LABELS[plan]}
  </span>
);

/* ============================================================
   ステータスバッジ
   ============================================================ */
const StatusBadge: React.FC<{ status: 'active' | 'inactive' }> = ({ status }) => (
  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: status === 'active' ? '#DEF7EC' : '#FDE8E8', color: status === 'active' ? '#059669' : '#DC2626' }}>
    {status === 'active' ? '有効' : '無効'}
  </span>
);

/* ============================================================
   SVG 棒グラフ
   ============================================================ */
const BarChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = 48;
  const gap = 24;
  const chartH = 160;
  const svgW = data.length * (barW + gap) - gap + 40;

  return (
    <svg width="100%" height={chartH + 40} viewBox={`0 0 ${svgW} ${chartH + 40}`} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const x = 20 + i * (barW + gap);
        const h = (d.value / maxVal) * chartH;
        const y = chartH - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={h} rx={4} fill={d.color} opacity={0.85} />
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="#374151">{d.value}</text>
            <text x={x + barW / 2} y={chartH + 18} textAnchor="middle" fontSize="10" fill="#6b7280">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

/* ============================================================
   ダッシュボード
   ============================================================ */
const Dashboard: React.FC<{ clients: Client[]; onNavigate: (view: string, id?: string) => void; statsMap: { [id: string]: ClientStats } }> = ({ clients, onNavigate, statsMap }) => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const activeCount = clients.filter(c => c.status === 'active').length;
  const inactiveCount = clients.filter(c => c.status === 'inactive').length;
  const newThisMonth = clients.filter(c => c.contractStart && c.contractStart.startsWith(thisMonth)).length;
  const aggregates = useMemo(() => calcAdminAggregates(clients, statsMap), [clients, statsMap]);

  const planCounts = (['trial', 'standard', 'professional', 'enterprise'] as const).map(p => ({
    label: PLAN_LABELS[p],
    value: clients.filter(c => c.plan === p && c.accountType === 'parent').length,
    color: PLAN_COLORS[p],
  }));

  const parents = clients.filter(c => c.accountType === 'parent');

  // 応募者数ランキング（多い順 上位5社）
  const topByApplicants = parents
    .map((p) => ({ client: p, count: statsMap[p.id]?.applicantCount || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>ダッシュボード</h2>

      {/* 統計カード - クライアント系 */}
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>クライアント</div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatCard label="本部アカウント" value={aggregates.parentCount} color="#3B82F6" icon={<Users size={22} />} />
        <StatCard label="子アカウント数" value={aggregates.totalChildAccounts} color="#0EA5E9" icon={<Store size={22} />} />
        <StatCard label="有効" value={activeCount} color="#059669" icon={<UserCheck size={22} />} />
        <StatCard label="無効" value={inactiveCount} color="#DC2626" icon={<UserX size={22} />} />
        <StatCard label="今月の新規" value={newThisMonth} color="#8B5CF6" icon={<PartyPopper size={22} />} />
      </div>

      {/* 統計カード - 利用状況 */}
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>利用状況</div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <StatCard label="総応募者数" value={aggregates.totalApplicants} color="#0891B2" icon={<User size={22} />} />
        <StatCard label="今月の応募" value={aggregates.thisMonthApplicants} color="#06B6D4" icon={<CalendarDays size={22} />} />
        <StatCard label="AI評価実行（累計）" value={aggregates.totalScreeningRuns} color="#9333EA" icon={<Sparkles size={22} />} />
        <StatCard label="AI評価実行（今月）" value={aggregates.thisMonthScreeningRuns} color="#A855F7" icon={<Sparkles size={22} />} />
        <StatCard label="AIスクリーニング有効" value={`${aggregates.enabledScreening} / ${aggregates.parentCount}`} color="#7C3AED" icon={<ShieldCheck size={22} />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(360px, 1.4fr)', gap: '1rem', marginBottom: '2rem' }}>
        {/* プラン別グラフ */}
        <div style={{ ...cardStyle, padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600 }}>プラン別 本部アカウント数</h3>
          <BarChart data={planCounts} />
        </div>

        {/* 応募者数ランキング */}
        <div style={{ ...cardStyle, padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.875rem', fontSize: '0.9375rem', fontWeight: 600 }}>応募者数ランキング</h3>
          {topByApplicants.length === 0 || topByApplicants.every(t => t.count === 0) ? (
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>応募者データがありません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {topByApplicants.map((t, idx) => {
                const max = topByApplicants[0].count || 1;
                const pct = (t.count / max) * 100;
                return (
                  <div
                    key={t.client.id}
                    onClick={() => onNavigate('detail', t.client.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.375rem 0.5rem', borderRadius: '6px' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ width: '20px', fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 600 }}>{idx + 1}</span>
                    <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.client.companyName}</span>
                    <div style={{ flex: 1.5, height: '8px', backgroundColor: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: PLAN_COLORS[t.client.plan] }} />
                    </div>
                    <span style={{ minWidth: '60px', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>{t.count}名</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* クライアント概要カード（カード一覧） */}
      <div style={{ ...cardStyle, padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600 }}>クライアント一覧（本部アカウント）</h3>
        {parents.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>クライアントが登録されていません。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
            {parents.map(c => {
              const stats = statsMap[c.id];
              return (
                <div
                  key={c.id}
                  onClick={() => onNavigate('detail', c.id)}
                  style={{ ...cardStyle, padding: '1rem', cursor: 'pointer', transition: 'box-shadow 0.15s', borderLeft: `4px solid ${PLAN_COLORS[c.plan]}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{c.companyName}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    <PlanBadge plan={c.plan} />
                    <span style={{ color: '#6b7280' }}>ID: {c.id}</span>
                  </div>
                  {stats && (
                    <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap', fontSize: '0.6875rem', color: '#6b7280' }}>
                      <span>応募 {stats.applicantCount}名</span>
                      <span>子アカ {stats.childCount}</span>
                      {stats.screeningEnabled && <span style={{ color: '#9333EA', fontWeight: 600 }}>AI 有効</span>}
                      <span style={{ marginLeft: 'auto' }}>{formatRelative(stats.lastActionAt)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================
   クライアント一覧 (ツリービュー)
   ============================================================ */
type SortKey = 'company' | 'plan' | 'status' | 'applicants' | 'children' | 'lastAction' | 'contractEnd';
type SortDir = 'asc' | 'desc';

const ClientList: React.FC<{
  clients: Client[];
  statsMap: { [id: string]: ClientStats };
  onNavigate: (view: string, id?: string) => void;
  onEdit: (client: Client) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
}> = ({ clients, statsMap, onNavigate, onEdit, onToggleStatus, onDelete, onAddChild }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showChildren, setShowChildren] = useState<boolean>(true);
  const [sortKey, setSortKey] = useState<SortKey>('company');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const parents = useMemo(() => clients.filter(c => c.accountType === 'parent'), [clients]);

  const filteredParents = useMemo(() => {
    let result = parents;
    if (planFilter) result = result.filter((p) => p.plan === planFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => {
        if (p.companyName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) return true;
        const children = clients.filter(c => c.accountType === 'child' && c.parentId === p.id);
        return children.some(c => c.companyName.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.baseName || '').toLowerCase().includes(q));
      });
    }
    // ソート
    const sorted = [...result];
    sorted.sort((a, b) => {
      const sa = statsMap[a.id];
      const sb = statsMap[b.id];
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'company': return a.companyName.localeCompare(b.companyName) * dir;
        case 'plan': return a.plan.localeCompare(b.plan) * dir;
        case 'status': return a.status.localeCompare(b.status) * dir;
        case 'applicants': return ((sa?.applicantCount || 0) - (sb?.applicantCount || 0)) * dir;
        case 'children': return ((sa?.childCount || 0) - (sb?.childCount || 0)) * dir;
        case 'lastAction': {
          const ta = sa?.lastActionAt ? new Date(sa.lastActionAt).getTime() : 0;
          const tb = sb?.lastActionAt ? new Date(sb.lastActionAt).getTime() : 0;
          return (ta - tb) * dir;
        }
        case 'contractEnd': return ((a.contractEnd || '').localeCompare(b.contractEnd || '')) * dir;
      }
    });
    return sorted;
  }, [parents, clients, search, planFilter, statusFilter, sortKey, sortDir, statsMap]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortHeader: React.FC<{ k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }> = ({ k, children, align = 'left' }) => {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          textAlign: align,
          fontWeight: 600,
          color: active ? '#111827' : '#6B7280',
          fontSize: '0.75rem',
          padding: '0.625rem 0.5rem',
          backgroundColor: '#F9FAFB',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          {children}
          {active ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} style={{ opacity: 0.4 }} />}
        </span>
      </th>
    );
  };

  return (
    <div style={{ padding: '1.5rem 2rem' }} onClick={() => setOpenMenuId(null)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>クライアント管理</h2>
        <button onClick={() => onNavigate('add')} style={btnPrimary}>+ 新規追加</button>
      </div>

      {/* フィルタバー */}
      <div style={{ ...cardStyle, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="会社名・IDで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: '220px' }}
        />
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="">プラン: 全て</option>
          {(['trial', 'standard', 'professional', 'enterprise'] as const).map((p) => (
            <option key={p} value={p}>{PLAN_LABELS[p]}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="">ステータス: 全て</option>
          <option value="active">有効のみ</option>
          <option value="inactive">無効のみ</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: '#374151', cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={showChildren} onChange={(e) => setShowChildren(e.target.checked)} />
          子アカウントを表示
        </label>
        {(planFilter || statusFilter || search) && (
          <button onClick={() => { setPlanFilter(''); setStatusFilter(''); setSearch(''); }} style={{ ...btnSecondary, fontSize: '0.75rem', padding: '0.375rem 0.625rem' }}>クリア</button>
        )}
      </div>

      <div style={{ ...cardStyle, overflow: 'visible' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '32px' }}></th>
              <SortHeader k="company">会社名 / 担当者</SortHeader>
              <SortHeader k="plan">プラン</SortHeader>
              <SortHeader k="status">状態</SortHeader>
              <SortHeader k="applicants" align="right">応募者数</SortHeader>
              <SortHeader k="children" align="right">子アカ</SortHeader>
              <SortHeader k="lastAction">最終操作</SortHeader>
              <SortHeader k="contractEnd">契約終了</SortHeader>
              <th style={{ width: '60px', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredParents.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>クライアントが見つかりません</td></tr>
            )}
            {filteredParents.map(p => {
              const children = clients.filter(c => c.accountType === 'child' && c.parentId === p.id);
              const isExpanded = expanded.has(p.id);
              const stats = statsMap[p.id];
              const aiOn = stats?.screeningEnabled;
              return (
                <React.Fragment key={p.id}>
                  {/* 親行 */}
                  <tr style={{ backgroundColor: '#FAFBFC', borderTop: '1px solid #E5E7EB' }}>
                    <td style={{ textAlign: 'center', cursor: children.length && showChildren ? 'pointer' : 'default', padding: '0.625rem 0.5rem' }} onClick={() => children.length && showChildren && toggleExpand(p.id)}>
                      {children.length > 0 && showChildren && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{isExpanded ? '▼' : '▶'}</span>}
                    </td>
                    <td style={{ padding: '0.625rem 0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.125rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.companyName}</span>
                        <span style={{ padding: '0.0625rem 0.375rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700, backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>本部</span>
                        {aiOn && <span title="AIスクリーニング有効" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.125rem', padding: '0.0625rem 0.375rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700, backgroundColor: '#F5F3FF', color: '#7C3AED' }}><Sparkles size={10} />AI</span>}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: '#6B7280' }}>
                        {p.contactName ? `担当: ${p.contactName}` : <span style={{ color: '#9CA3AF' }}>担当者未設定</span>}
                        <span style={{ marginLeft: '0.5rem', fontFamily: 'monospace' }}>ID: {p.id}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.625rem 0.5rem' }}><PlanBadge plan={p.plan} /></td>
                    <td style={{ padding: '0.625rem 0.5rem' }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem', fontWeight: 600 }}>
                      {stats?.applicantCount ?? 0}
                      {stats && stats.thisMonthApplicants > 0 && <span style={{ marginLeft: '0.25rem', fontSize: '0.6875rem', color: '#059669', fontWeight: 500 }}>+{stats.thisMonthApplicants}</span>}
                    </td>
                    <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem', color: '#374151' }}>
                      {stats?.childCount ?? 0}
                    </td>
                    <td style={{ padding: '0.625rem 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                      {formatRelative(stats?.lastActionAt || null)}
                    </td>
                    <td style={{ padding: '0.625rem 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                      {p.contractEnd || '-'}
                    </td>
                    <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center', position: 'relative' }}>
                      <RowActionMenu
                        client={p}
                        isOpen={openMenuId === p.id}
                        onOpen={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                        onClose={() => setOpenMenuId(null)}
                        onNavigate={onNavigate}
                        onEdit={onEdit}
                        onToggleStatus={onToggleStatus}
                        onDelete={onDelete}
                        onAddChild={onAddChild}
                      />
                    </td>
                  </tr>
                  {/* 子行 */}
                  {showChildren && isExpanded && children.map(ch => {
                    const cStats = statsMap[ch.id];
                    return (
                      <tr key={ch.id} style={{ backgroundColor: '#F8FAFF' }}>
                        <td></td>
                        <td style={{ padding: '0.5rem 0.5rem 0.5rem 2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span style={{ color: '#9ca3af' }}>└</span>
                            <span style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{ch.companyName}</span>
                            {ch.baseName && (
                              <span style={{ padding: '0.0625rem 0.375rem', borderRadius: '4px', fontSize: '0.625rem', backgroundColor: '#E0E7FF', color: '#4338CA' }}>{ch.baseName}</span>
                            )}
                            <span style={{ padding: '0.0625rem 0.375rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#B45309' }}>子</span>
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginLeft: '1rem' }}>
                            ID: <span style={{ fontFamily: 'monospace' }}>{ch.id}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem' }}><PlanBadge plan={ch.plan} /></td>
                        <td style={{ padding: '0.5rem' }}><StatusBadge status={ch.status} /></td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.75rem', color: '#6B7280' }}>—</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.75rem', color: '#6B7280' }}>—</td>
                        <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>{formatRelative(cStats?.lastActionAt || null)}</td>
                        <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                          {ALL_PERMISSIONS.filter(k => ch.permissions[k]).length} 権限
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', position: 'relative' }}>
                          <RowActionMenu
                            client={ch}
                            isOpen={openMenuId === ch.id}
                            onOpen={() => setOpenMenuId(openMenuId === ch.id ? null : ch.id)}
                            onClose={() => setOpenMenuId(null)}
                            onNavigate={onNavigate}
                            onEdit={onEdit}
                            onToggleStatus={onToggleStatus}
                            onDelete={onDelete}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ============================================================
   行ごとのアクションメニュー（︙ボタン）
   ============================================================ */
const RowActionMenu: React.FC<{
  client: Client;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: (view: string, id?: string) => void;
  onEdit: (c: Client) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild?: (parentId: string) => void;
}> = ({ client, isOpen, onOpen, onClose, onNavigate, onEdit, onToggleStatus, onDelete, onAddChild }) => {
  return (
    <div style={{ display: 'inline-block', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onOpen}
        style={{ padding: '0.25rem', border: '1px solid #E5E7EB', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
        title="操作メニュー"
      >
        <MoreVertical size={14} />
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.25rem',
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            minWidth: '140px',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <MenuItem onClick={() => { onNavigate('detail', client.id); onClose(); }}>詳細を開く</MenuItem>
          <MenuItem onClick={() => { onEdit(client); onClose(); }}>編集</MenuItem>
          {client.accountType === 'parent' && onAddChild && (
            <MenuItem onClick={() => { onAddChild(client.id); onClose(); }}>子アカウント追加</MenuItem>
          )}
          <MenuItem onClick={() => { onToggleStatus(client.id); onClose(); }} color={client.status === 'active' ? '#B45309' : '#059669'}>
            {client.status === 'active' ? '無効化する' : '有効化する'}
          </MenuItem>
          <MenuItem onClick={() => { onDelete(client.id); onClose(); }} color="#DC2626" border>
            削除
          </MenuItem>
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ onClick: () => void; children: React.ReactNode; color?: string; border?: boolean }> = ({ onClick, children, color, border }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block',
      width: '100%',
      padding: '0.5rem 0.875rem',
      border: 'none',
      backgroundColor: 'transparent',
      cursor: 'pointer',
      fontSize: '0.8125rem',
      textAlign: 'left',
      color: color || '#374151',
      borderTop: border ? '1px solid #F3F4F6' : 'none',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
  >
    {children}
  </button>
);

/* ============================================================
   クライアント詳細
   ============================================================ */
const ClientDetail: React.FC<{
  client: Client;
  clients: Client[];
  onBack: () => void;
  onEdit: (client: Client) => void;
  onUpdatePassword: (id: string, newPw: string) => void;
}> = ({ client, clients, onBack, onEdit, onUpdatePassword }) => {
  const [showPwSection, setShowPwSection] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const children = clients.filter(c => c.accountType === 'child' && c.parentId === client.id);
  const parent = client.parentId ? clients.find(c => c.id === client.parentId) : null;

  // クライアントデータの取得（親IDで解決）
  const dataId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
  const clientData: ClientData | null = useMemo(() => {
    try {
      return storage.getClientData(dataId);
    } catch { return null; }
  }, [dataId]);

  // 統計
  const stats = useMemo(() => {
    const c = client;
    const cd = clientData;
    const logs = (() => { try { return getClientLogs(dataId); } catch { return []; } })();
    const month = new Date();
    const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    return {
      applicants: cd?.applicants?.length ?? 0,
      thisMonthApplicants: cd?.applicants?.filter((a) => a.date && a.date.startsWith(monthPrefix)).length ?? 0,
      bases: cd?.bases?.length ?? 0,
      jobs: cd?.jobs?.length ?? 0,
      sources: cd?.sources?.length ?? 0,
      jobsByBase: Object.keys(cd?.jobsByBase || {}).length,
      sourcesByBase: Object.keys(cd?.sourcesByBase || {}).length,
      emailTemplates: cd?.emailTemplates?.length ?? 0,
      emailTemplatesByBase: Object.keys(cd?.emailTemplatesByBase || {}).length,
      lastLogin: logs.find((l) => l.category === 'auth' && l.action === 'ログイン')?.timestamp || null,
      screening: cd?.screeningCriteria,
      screeningRunsTotal: logs.filter((l) => l.action === 'AI評価実行').length,
      screeningRunsThisMonth: logs.filter((l) => l.action === 'AI評価実行' && l.timestamp.startsWith(monthPrefix)).length,
      _: c, // unused, kept to ensure deps are correct
    };
  }, [client, clientData, dataId]);

  const handlePasswordChange = () => {
    if (newPw.length < 6) {
      setPwError('パスワードは6文字以上で入力してください。');
      setPwSuccess('');
      return;
    }
    onUpdatePassword(client.id, newPw);
    setNewPw('');
    setPwError('');
    setPwSuccess('パスワードを更新しました。');
    setTimeout(() => setPwSuccess(''), 3000);
  };

  const sectionTitle: React.CSSProperties = { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#111827' };
  const infoRow: React.CSSProperties = { display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' };
  const infoLabel: React.CSSProperties = { minWidth: '120px', color: '#6b7280', fontWeight: 500 };

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <button onClick={onBack} style={{ ...btnSecondary, marginBottom: '1rem' }}>← 戻る</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{client.companyName}</h2>
        <button onClick={() => onEdit(client)} style={btnPrimary}>編集</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* 基本情報 */}
        <div style={{ ...cardStyle, padding: '1.25rem' }}>
          <h3 style={sectionTitle}>基本情報</h3>
          <div style={infoRow}><span style={infoLabel}>クライアントID</span><span style={{ fontFamily: 'monospace' }}>{client.id}</span></div>
          <div style={infoRow}><span style={infoLabel}>会社名</span><span>{client.companyName}</span></div>
          <div style={infoRow}><span style={infoLabel}>種別</span>
            <span>{client.accountType === 'parent' ? (
              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>本部</span>
            ) : (
              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: '#FEF3C7', color: '#B45309' }}>子アカウント</span>
            )}</span>
          </div>
          {parent && <div style={infoRow}><span style={infoLabel}>親アカウント</span><span>{parent.companyName} ({parent.id})</span></div>}
          {client.baseName && <div style={infoRow}><span style={infoLabel}>担当拠点</span><span>{client.baseName}</span></div>}
          <div style={infoRow}><span style={infoLabel}>プラン</span><PlanBadge plan={client.plan} /></div>
          <div style={infoRow}><span style={infoLabel}>ステータス</span><StatusBadge status={client.status} /></div>
          <div style={infoRow}><span style={infoLabel}>契約開始</span><span>{client.contractStart || '-'}</span></div>
          <div style={infoRow}><span style={infoLabel}>契約終了</span><span>{client.contractEnd || '-'}</span></div>
          <div style={infoRow}><span style={infoLabel}>担当者名</span><span>{client.contactName || '-'}</span></div>
          <div style={infoRow}><span style={infoLabel}>担当者メール</span><span>{client.contactEmail || '-'}</span></div>
        </div>

        {/* パスワード管理（折りたたみ） & メモ */}
        <div style={{ ...cardStyle, padding: '1.25rem' }}>
          <button
            onClick={() => setShowPwSection(!showPwSection)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', marginBottom: showPwSection ? '0.875rem' : 0 }}
          >
            <h3 style={{ ...sectionTitle, marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
              <KeyRound size={16} />
              パスワード管理
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{showPwSection ? '閉じる ▼' : '開く ▶'}</span>
          </button>
          {showPwSection && (
            <>
              <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.75rem', color: '#92400E', marginBottom: '0.875rem' }}>
                ⚠ パスワード情報は機密事項です。表示・変更はクライアントから依頼があった場合のみ行ってください。
              </div>
              <div style={infoRow}>
                <span style={infoLabel}>現パスワード</span>
                <span style={{ fontFamily: 'monospace' }}>{showPw ? client.password : '••••••••'}</span>
                <button onClick={() => setShowPw(!showPw)} style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>
                  {showPw ? '非表示' : '表示'}
                </button>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={labelStyle}>新しいパスワード（6文字以上）</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="新しいパスワード" />
                  <button onClick={handlePasswordChange} style={btnPrimary}>変更</button>
                </div>
                {pwError && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{pwError}</div>}
                {pwSuccess && <div style={{ color: '#059669', fontSize: '0.75rem', marginTop: '0.25rem' }}>{pwSuccess}</div>}
              </div>
            </>
          )}

          {/* メモ */}
          {client.memo && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={sectionTitle}>メモ</h3>
              <div style={{ backgroundColor: '#F9FAFB', borderRadius: '6px', padding: '0.75rem', fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{client.memo}</div>
            </div>
          )}

          {/* 最終ログイン */}
          {stats.lastLogin && (
            <div style={{ marginTop: showPwSection ? '1rem' : 0, fontSize: '0.75rem', color: '#6B7280' }}>
              最終ログイン: {formatLogTimestamp(stats.lastLogin)}
            </div>
          )}
        </div>
      </div>

      {/* データサマリ（親アカウントのみ） */}
      {client.accountType === 'parent' && (
        <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={sectionTitle}>データ概要</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <SummaryTile label="応募者" value={stats.applicants} sub={`今月 +${stats.thisMonthApplicants}`} icon={<User size={18} />} color="#0891B2" />
            <SummaryTile label="拠点" value={stats.bases} icon={<Building2 size={18} />} color="#0284C7" />
            <SummaryTile label="職種" value={stats.jobs} sub={stats.jobsByBase ? `拠点別 ${stats.jobsByBase}` : ''} icon={<Briefcase size={18} />} color="#7C3AED" />
            <SummaryTile label="応募媒体" value={stats.sources} sub={stats.sourcesByBase ? `拠点別 ${stats.sourcesByBase}` : ''} icon={<Megaphone size={18} />} color="#DB2777" />
            <SummaryTile label="メールテンプレ" value={stats.emailTemplates} sub={stats.emailTemplatesByBase ? `拠点別 ${stats.emailTemplatesByBase}` : ''} icon={<FileText size={18} />} color="#EA580C" />
            <SummaryTile label="子アカウント" value={children.length} icon={<Store size={18} />} color="#0EA5E9" />
          </div>
        </div>
      )}

      {/* AIスクリーニング状況（親アカウントのみ） */}
      {client.accountType === 'parent' && (
        <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem', borderTop: '3px solid #9333EA' }}>
          <h3 style={{ ...sectionTitle, display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <Sparkles size={16} color="#9333EA" />
            AIスクリーニング
          </h3>
          {!stats.screening ? (
            <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0 }}>未設定です。クライアント側で設定すると、ここに状況が表示されます。</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <SummaryTile
                label="機能"
                value={stats.screening.enabled ? '有効' : '無効'}
                color={stats.screening.enabled ? '#059669' : '#9CA3AF'}
                icon={stats.screening.enabled ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
              />
              <SummaryTile label="評価軸" value={stats.screening.axes?.length || 0} sub="軸" color="#7C3AED" icon={<LayoutDashboard size={18} />} />
              <SummaryTile label="職種別オーバーライド" value={Object.keys(stats.screening.byJob || {}).length} sub="職種" color="#A855F7" icon={<Briefcase size={18} />} />
              <SummaryTile label="評価実行（累計）" value={stats.screeningRunsTotal} icon={<Sparkles size={18} />} color="#9333EA" />
              <SummaryTile label="評価実行（今月）" value={stats.screeningRunsThisMonth} icon={<Sparkles size={18} />} color="#C026D3" />
            </div>
          )}
        </div>
      )}

      {/* 子アカウント（親の場合） */}
      {client.accountType === 'parent' && (
        <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={sectionTitle}>子アカウント ({children.length})</h3>
          {children.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>子アカウントはありません。</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>会社名</th>
                  <th>拠点名</th>
                  <th>ステータス</th>
                  <th>権限</th>
                </tr>
              </thead>
              <tbody>
                {children.map(ch => (
                  <tr key={ch.id}>
                    <td style={{ fontWeight: 500 }}>{ch.companyName}</td>
                    <td>{ch.baseName || '-'}</td>
                    <td><StatusBadge status={ch.status} /></td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {ALL_PERMISSIONS.map(k => (
                          <span key={k} style={{
                            padding: '0.0625rem 0.375rem',
                            borderRadius: '4px',
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            backgroundColor: ch.permissions[k] ? '#DEF7EC' : '#FDE8E8',
                            color: ch.permissions[k] ? '#059669' : '#DC2626',
                          }}>
                            {PERMISSION_LABELS[k]}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 子アカウントの場合: 権限一覧 */}
      {client.accountType === 'child' && (
        <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={sectionTitle}>付与権限</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {ALL_PERMISSIONS.map(k => (
              <span key={k} style={{
                padding: '0.25rem 0.625rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 500,
                backgroundColor: client.permissions[k] ? '#DEF7EC' : '#FDE8E8',
                color: client.permissions[k] ? '#059669' : '#DC2626',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  {client.permissions[k] ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                  {PERMISSION_LABELS[k]}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* クライアントデータ閲覧 */}
      <div style={{ ...cardStyle, padding: '1.25rem' }}>
        <h3 style={sectionTitle}>クライアントデータ</h3>
        {clientData && clientData.applicants.length > 0 ? (
          <ClientDataView data={clientData} />
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', opacity: 0.5 }}><ClipboardList size={32} /></div>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>このクライアントはまだログインしていないか、データがありません。</p>
          </div>
        )}
      </div>

      {/* 操作ログ */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={sectionTitle}>操作ログ（このクライアント）</h3>
        <ClientLogsSection client={client} />
      </div>
    </div>
  );
};

/* ============================================================
   クライアント詳細内の操作ログセクション
   ============================================================ */
const CATEGORY_LABELS: Record<ClientOperationLog['category'], { label: string; color: string; bg: string }> = {
  applicant: { label: '応募者', color: '#1D4ED8', bg: '#DBEAFE' },
  email: { label: 'メール', color: '#9333EA', bg: '#F3E8FF' },
  auth: { label: '認証', color: '#15803D', bg: '#DCFCE7' },
  other: { label: 'その他', color: '#6B7280', bg: '#F3F4F6' },
};

const ClientLogTable: React.FC<{ logs: ClientOperationLog[]; totalCount?: number }> = ({ logs, totalCount }) => {
  const headers = ['日時', '操作者', 'カテゴリ', 'アクション', '対象', '詳細'];
  return (
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#F9FAFB' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 && (
            <tr><td colSpan={headers.length} style={{ textAlign: 'center', padding: '2.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>ログがありません</td></tr>
          )}
          {logs.map(l => {
            const cat = CATEGORY_LABELS[l.category] || CATEGORY_LABELS.other;
            return (
              <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.625rem 1rem', fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{formatLogTimestamp(l.timestamp)}</td>
                <td style={{ padding: '0.625rem 1rem', fontSize: '0.8125rem', fontWeight: 500 }}>{l.operator}</td>
                <td style={{ padding: '0.625rem 1rem' }}>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: cat.bg, color: cat.color }}>{cat.label}</span>
                </td>
                <td style={{ padding: '0.625rem 1rem', fontSize: '0.8125rem' }}>{l.action}</td>
                <td style={{ padding: '0.625rem 1rem', fontSize: '0.8125rem' }}>{l.target}</td>
                <td style={{ padding: '0.625rem 1rem', fontSize: '0.75rem', color: '#6b7280' }}>{l.detail || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalCount !== undefined && (
        <div style={{ padding: '0.625rem 1rem', borderTop: '1px solid #e5e7eb', fontSize: '0.75rem', color: '#9ca3af' }}>
          {logs.length} 件 / 合計 {totalCount} 件
        </div>
      )}
    </div>
  );
};

const ClientLogsSection: React.FC<{ client: Client }> = ({ client }) => {
  // 子アカウントは親IDのバケツを参照
  const dataId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
  const [logs, setLogs] = useState<ClientOperationLog[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  useEffect(() => { setLogs(getClientLogs(dataId)); }, [dataId]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterCategory && l.category !== filterCategory) return false;
      if (filterDate && !l.timestamp.startsWith(filterDate)) return false;
      if (search) {
        const q = search.toLowerCase();
        return l.action.toLowerCase().includes(q)
          || l.target.toLowerCase().includes(q)
          || l.operator.toLowerCase().includes(q)
          || (l.detail || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, filterCategory, filterDate, search]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <input type="text" placeholder="キーワード検索..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '200px' }} />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, width: '160px' }}>
          <option value="">全カテゴリ</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...inputStyle, width: '150px' }} />
      </div>
      <ClientLogTable logs={filtered.slice(0, 100)} totalCount={filtered.length} />
    </div>
  );
};

/* ============================================================
   クライアントデータ閲覧
   ============================================================ */
const ClientDataView: React.FC<{ data: ClientData }> = ({ data }) => {
  const applicants = data.applicants;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const totalApplicants = applicants.length;
  const thisMonthApplicants = applicants.filter(a => a.date && a.date.startsWith(thisMonth)).length;

  const interviewCount = applicants.filter(a => a.stage === '面接確定' || a.stage === '面接調整中' || a.stage === '一次面接調整中').length;
  const offeredCount = applicants.filter(a => a.stage === '内定' || a.stage === '内定【承諾】').length;

  // ステータス分布
  const statusDist: Record<string, number> = {};
  applicants.forEach(a => {
    statusDist[a.stage] = (statusDist[a.stage] || 0) + 1;
  });
  const statusData = Object.entries(statusDist).map(([label, value]) => {
    const s = data.statuses.find(st => st.name === label);
    return { label, value, color: s?.color || '#6B7280' };
  }).sort((a, b) => b.value - a.value).slice(0, 8);

  // 直近10件
  const recent = [...applicants].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  }).slice(0, 10);

  const genderIcon = (g: string) => {
    if (g === '男性') return '♂';
    if (g === '女性') return '♀';
    return '-';
  };

  const sectionTitle: React.CSSProperties = { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#111827' };

  return (
    <div>
      {/* 統計カード */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <StatCard label="応募者数" value={totalApplicants} color="#3B82F6" icon={<User size={22} />} />
        <StatCard label="今月応募" value={thisMonthApplicants} color="#8B5CF6" icon={<CalendarDays size={22} />} />
        <StatCard label="面接予定" value={interviewCount} color="#F59E0B" icon={<FileText size={22} />} />
        <StatCard label="内定者" value={offeredCount} color="#059669" icon={<Trophy size={22} />} />
      </div>

      {/* ステータス分布 */}
      {statusData.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={sectionTitle}>ステータス分布</h4>
          <BarChart data={statusData} />
        </div>
      )}

      {/* 直近の応募者 */}
      <h4 style={sectionTitle}>最近の応募者（直近10件）</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>名前</th>
            <th>性別</th>
            <th>年齢</th>
            <th>応募日</th>
            <th>ステータス</th>
          </tr>
        </thead>
        <tbody>
          {recent.map(a => {
            const stObj = data.statuses.find(s => s.name === a.stage);
            return (
              <tr key={a.id}>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td style={{ fontSize: '1rem' }}>{genderIcon(a.gender)}</td>
                <td>{a.age || '-'}</td>
                <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>{a.date || '-'}</td>
                <td>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: (stObj?.color || '#6B7280') + '20', color: stObj?.color || '#6B7280' }}>
                    {a.stage}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* ============================================================
   クライアント追加/編集モーダル
   ============================================================ */
const ClientFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client) => void;
  clients: Client[];
  editingClient: Client | null;
  defaultParentId?: string;
}> = ({ isOpen, onClose, onSave, clients, editingClient, defaultParentId }) => {
  const isEdit = !!editingClient;

  const [form, setForm] = useState<ReturnType<typeof emptyClient>>(() => {
    if (editingClient) return { ...editingClient, members: editingClient.members || [] } ;
    const e = emptyClient();
    if (defaultParentId) {
      e.accountType = 'child';
      e.parentId = defaultParentId;
      const parent = clients.find(c => c.id === defaultParentId);
      if (parent) e.companyName = parent.companyName;
    }
    return e;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (editingClient) {
        setForm({ ...editingClient, members: editingClient.members || [] } as any);
      } else {
        const e = emptyClient();
        if (defaultParentId) {
          e.accountType = 'child';
          e.parentId = defaultParentId;
          const parent = clients.find(c => c.id === defaultParentId);
          if (parent) e.companyName = parent.companyName;
        }
        setForm(e);
      }
      setErrors({});
    }
  }, [isOpen, editingClient, defaultParentId, clients]);

  const parentOptions = useMemo(() =>
    clients.filter(c => c.accountType === 'parent').map(c => ({ value: c.id, label: `${c.companyName} (${c.id})` })),
    [clients]
  );

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as string]) setErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
  };

  const updatePermission = (key: keyof ClientPermissions, value: boolean) => {
    setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [key]: value } }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.companyName.trim()) e.companyName = '会社名は必須です';
    if (!form.id.trim()) e.id = 'クライアントIDは必須です';
    else if (!isEdit && clients.some(c => c.id === form.id)) e.id = 'このIDは既に使用されています';
    if (!form.password.trim()) e.password = 'パスワードは必須です';
    else if (form.password.length < 6) e.password = 'パスワードは6文字以上で入力してください';
    if (form.accountType === 'child' && !form.parentId) e.parentId = '親アカウントを選択してください';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const client: Client = {
      id: form.id,
      companyName: form.companyName,
      password: form.password,
      accountType: form.accountType,
      parentId: form.accountType === 'child' ? form.parentId : undefined,
      baseName: form.accountType === 'child' ? form.baseName : undefined,
      plan: form.plan,
      status: form.status,
      contractStart: form.contractStart || undefined,
      contractEnd: form.contractEnd || undefined,
      contactName: form.contactName || undefined,
      contactEmail: form.contactEmail || undefined,
      memo: form.memo || undefined,
      permissions: form.permissions,
      members: editingClient?.members || [],
      notificationEmail: editingClient?.notificationEmail,
      smsPhone: editingClient?.smsPhone,
    };
    onSave(client);
  };

  const fieldGroup = (label: string, required: boolean, key: string, children: React.ReactNode) => (
    <div style={{ marginBottom: '1rem' }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#DC2626' }}> *</span>}</label>
      {children}
      {errors[key] && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors[key]}</div>}
    </div>
  );

  const plans: Client['plan'][] = ['trial', 'standard', 'professional', 'enterprise'];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'クライアント編集' : '新規クライアント追加'} width="640px">
      <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0.25rem' }}>
        {fieldGroup('会社名', true, 'companyName',
          <input type="text" value={form.companyName} onChange={(e) => updateField('companyName', e.target.value)} style={inputStyle} />
        )}

        {fieldGroup('クライアントID', true, 'id',
          <input type="text" value={form.id} onChange={(e) => updateField('id', e.target.value)} style={{ ...inputStyle, backgroundColor: isEdit ? '#F3F4F6' : '#fff' }} disabled={isEdit} />
        )}

        {fieldGroup('パスワード', true, 'password',
          <input type="text" value={form.password} onChange={(e) => updateField('password', e.target.value)} style={inputStyle} placeholder="6文字以上" />
        )}

        {/* アカウント種別 */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>アカウント種別</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {(['parent', 'child'] as const).map(t => (
              <div
                key={t}
                onClick={() => updateField('accountType', t)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: `2px solid ${form.accountType === t ? '#3B82F6' : '#e5e7eb'}`,
                  backgroundColor: form.accountType === t ? '#EFF6FF' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.25rem', color: form.accountType === t ? '#3B82F6' : '#6b7280' }}>
                  {t === 'parent' ? <Building2 size={22} /> : <Store size={22} />}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t === 'parent' ? '本部アカウント' : '子アカウント'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 子アカウント時のみ */}
        {form.accountType === 'child' && (
          <>
            {fieldGroup('親アカウント', true, 'parentId',
              <select
                value={form.parentId || ''}
                onChange={(e) => updateField('parentId', e.target.value || undefined)}
                style={inputStyle}
              >
                <option value="">選択してください</option>
                {parentOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}

            {fieldGroup('担当拠点名', false, 'baseName',
              <input type="text" value={form.baseName || ''} onChange={(e) => updateField('baseName', e.target.value)} style={inputStyle} />
            )}
          </>
        )}

        {/* プラン */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>プラン</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {plans.map(p => (
              <div
                key={p}
                onClick={() => updateField('plan', p)}
                style={{
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: `2px solid ${form.plan === p ? PLAN_COLORS[p] : '#e5e7eb'}`,
                  backgroundColor: form.plan === p ? PLAN_COLORS[p] + '15' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.75rem', color: form.plan === p ? PLAN_COLORS[p] : '#6b7280' }}>
                  {PLAN_LABELS[p]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 権限（子アカウント時のみ） */}
        {form.accountType === 'child' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>権限設定</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {ALL_PERMISSIONS.map(k => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '6px', backgroundColor: form.permissions[k] ? '#F0FDF4' : '#FEF2F2', cursor: 'pointer', fontSize: '0.8125rem', border: `1px solid ${form.permissions[k] ? '#BBF7D0' : '#FECACA'}` }}>
                  <input type="checkbox" checked={form.permissions[k]} onChange={(e) => updatePermission(k, e.target.checked)} />
                  {PERMISSION_LABELS[k]}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ステータス */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>ステータス</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {(['active', 'inactive'] as const).map(s => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input type="radio" name="clientStatus" checked={form.status === s} onChange={() => updateField('status', s)} />
                {s === 'active' ? '有効' : '無効'}
              </label>
            ))}
          </div>
        </div>

        {/* 契約期間 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>契約開始日</label>
            <input type="date" value={form.contractStart || ''} onChange={(e) => updateField('contractStart', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>契約終了日</label>
            <input type="date" value={form.contractEnd || ''} onChange={(e) => updateField('contractEnd', e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* 担当者 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>担当者名</label>
            <input type="text" value={form.contactName || ''} onChange={(e) => updateField('contactName', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>担当者メール</label>
            <input type="email" value={form.contactEmail || ''} onChange={(e) => updateField('contactEmail', e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* メモ */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>メモ</label>
          <textarea value={form.memo || ''} onChange={(e) => updateField('memo', e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
        </div>

        {/* ボタン */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
          <button onClick={onClose} style={btnSecondary}>キャンセル</button>
          <button onClick={handleSave} style={btnPrimary}>{isEdit ? '更新' : '追加'}</button>
        </div>
      </div>
    </Modal>
  );
};

/* ============================================================
   契約・請求管理
   ============================================================ */
const ContractPage: React.FC<{ clients: Client[] }> = ({ clients }) => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().slice(0, 10);
  const in60 = new Date(today); in60.setDate(in60.getDate() + 60);
  const in60Str = in60.toISOString().slice(0, 10);

  const parents = clients.filter(c => c.accountType === 'parent');

  const getExpiryStatus = (contractEnd?: string): 'expired' | 'warn30' | 'warn60' | 'ok' | 'none' => {
    if (!contractEnd) return 'none';
    if (contractEnd < todayStr) return 'expired';
    if (contractEnd <= in30Str) return 'warn30';
    if (contractEnd <= in60Str) return 'warn60';
    return 'ok';
  };

  const expiryColor = { expired: '#DC2626', warn30: '#D97706', warn60: '#CA8A04', ok: '#059669', none: '#9CA3AF' };
  const expiryLabel = { expired: '期限切れ', warn30: '30日以内', warn60: '60日以内', ok: '正常', none: '未設定' };

  const totalMonthly = parents
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + PLAN_PRICES[c.plan], 0);

  const planRevenue = (['trial', 'standard', 'professional', 'enterprise'] as const).map(p => ({
    plan: p,
    count: parents.filter(c => c.plan === p && c.status === 'active').length,
    revenue: parents.filter(c => c.plan === p && c.status === 'active').length * PLAN_PRICES[p],
  }));

  const sectionTitle: React.CSSProperties = { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#111827' };

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>契約・請求管理</h2>

      {/* 月次売上サマリー */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <div style={{ ...cardStyle, padding: '1.25rem', flex: '1 1 200px' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>月次売上合計（推定）</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#C2570C' }}>¥{totalMonthly.toLocaleString()}</div>
        </div>
        {planRevenue.map(r => (
          <div key={r.plan} style={{ ...cardStyle, padding: '1.25rem', flex: '1 1 160px', borderLeft: `4px solid ${PLAN_COLORS[r.plan]}` }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{PLAN_LABELS[r.plan]}</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{r.count}社</div>
            <div style={{ fontSize: '0.8125rem', color: PLAN_COLORS[r.plan], fontWeight: 600 }}>¥{r.revenue.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* 契約一覧 */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>契約一覧</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB' }}>
              {['会社名', 'プラン', '月額', '契約開始', '契約終了', '状態', 'ステータス'].map(h => (
                <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parents.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>データなし</td></tr>
            )}
            {parents.map(c => {
              const status = getExpiryStatus(c.contractEnd);
              const rowBg = status === 'expired' ? '#FEF2F2' : status === 'warn30' ? '#FFFBEB' : '#fff';
              return (
                <tr key={c.id} style={{ backgroundColor: rowBg, borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{c.companyName}</td>
                  <td style={{ padding: '0.75rem 1rem' }}><PlanBadge plan={c.plan} /></td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 600 }}>¥{PLAN_PRICES[c.plan].toLocaleString()}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>{c.contractStart || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>{c.contractEnd || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: expiryColor[status] + '20', color: expiryColor[status] }}>
                      {expiryLabel[status]}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}><StatusBadge status={c.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ============================================================
   初期データ設定
   ============================================================ */
const InitDataPage: React.FC<{ clients: Client[] }> = ({ clients }) => {
  const [srcId, setSrcId] = useState('');
  const [dstIds, setDstIds] = useState<string[]>([]);
  const [copyItems, setCopyItems] = useState({ statuses: true, sources: true, bases: true, jobs: true, hearingItems: true, mailTemplates: false, filterConditions: false });
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parents = clients.filter(c => c.accountType === 'parent');

  const toggleDst = (id: string) => {
    setDstIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleExecute = () => {
    setResult(null); setError(null);
    if (!srcId) { setError('コピー元クライアントを選択してください'); return; }
    if (dstIds.length === 0) { setError('コピー先を1社以上選択してください'); return; }
    if (!Object.values(copyItems).some(Boolean)) { setError('コピーする項目を選択してください'); return; }

    let srcData: ClientData | null = null;
    try {
      const raw = localStorage.getItem(`hireflow:client:${srcId}:data`);
      if (raw) srcData = JSON.parse(raw) as ClientData;
    } catch { /* ignore */ }
    if (!srcData) { setError('コピー元のデータが見つかりません'); return; }

    let successCount = 0;
    for (const dstId of dstIds) {
      try {
        let dstData: ClientData | null = null;
        try {
          const raw = localStorage.getItem(`hireflow:client:${dstId}:data`);
          if (raw) dstData = JSON.parse(raw) as ClientData;
        } catch { /* ignore */ }
        if (!dstData) continue;

        if (copyItems.statuses) dstData.statuses = [...srcData.statuses];
        if (copyItems.sources) dstData.sources = [...srcData.sources];
        if (copyItems.bases) dstData.bases = [...srcData.bases];
        if (copyItems.jobs) dstData.jobs = [...srcData.jobs];
        if (copyItems.hearingItems) dstData.hearingTemplates = [...srcData.hearingTemplates];
        if (copyItems.mailTemplates) dstData.emailTemplates = [...srcData.emailTemplates];
        if (copyItems.filterConditions) dstData.filterCondition = { ...srcData.filterCondition };

        localStorage.setItem(`hireflow:client:${dstId}:data`, JSON.stringify(dstData));
        successCount++;
      } catch { /* skip */ }
    }

    setResult(`${successCount}社へのデータコピーが完了しました`);
    setDstIds([]);
  };

  const checkboxLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e5e7eb' };

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>初期データ設定</h2>
      <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>既存クライアントのマスタデータを他クライアントへコピーします</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* コピー元 */}
        <div style={{ ...cardStyle, padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 600 }}>コピー元クライアント</h3>
          <select value={srcId} onChange={e => setSrcId(e.target.value)} style={inputStyle}>
            <option value="">選択してください</option>
            {parents.map(c => <option key={c.id} value={c.id}>{c.companyName} ({c.id})</option>)}
          </select>
        </div>

        {/* コピー項目 */}
        <div style={{ ...cardStyle, padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 600 }}>コピー項目</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {(Object.entries(copyItems) as [keyof typeof copyItems, boolean][]).map(([key, val]) => {
              const labels: Record<string, string> = { statuses: 'ステータス', sources: '応募媒体', bases: '拠点', jobs: '職種', hearingItems: 'ヒアリング', mailTemplates: 'メールテンプレート', filterConditions: 'フィルタ条件' };
              return (
                <label key={key} style={{ ...checkboxLabel, backgroundColor: val ? '#FFF7ED' : '#fff', borderColor: val ? '#FB923C' : '#e5e7eb' }}>
                  <input type="checkbox" checked={val} onChange={e => setCopyItems(prev => ({ ...prev, [key]: e.target.checked }))} />
                  {labels[key]}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* コピー先 */}
      <div style={{ ...cardStyle, padding: '1.25rem', marginTop: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 600 }}>コピー先クライアント（複数選択可）</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
          {parents.filter(c => c.id !== srcId).map(c => {
            const sel = dstIds.includes(c.id);
            return (
              <label key={c.id} onClick={() => toggleDst(c.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', borderRadius: '6px', border: `1px solid ${sel ? '#C2570C' : '#e5e7eb'}`, backgroundColor: sel ? '#FFF7ED' : '#fff', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={sel} onChange={() => {}} style={{ accentColor: '#C2570C' }} />
                <span style={{ fontWeight: sel ? 600 : 400 }}>{c.companyName}</span>
                <PlanBadge plan={c.plan} />
              </label>
            );
          })}
          {parents.filter(c => c.id !== srcId).length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>対象クライアントがありません</p>
          )}
        </div>
      </div>

      {error && <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: '6px', fontSize: '0.875rem' }}>{error}</div>}
      {result && <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: '#F0FDF4', color: '#059669', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}><Check size={14} strokeWidth={3} /> {result}</div>}

      <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleExecute} style={btnPrimary}>コピー実行</button>
      </div>
    </div>
  );
};

/* ============================================================
   管理者アカウント管理
   ============================================================ */
interface AdminFormState {
  id: string;
  name: string;
  email: string;
  role: 'super' | 'operator';
  password: string;
  active: boolean;
}

const AdminAccountsPage: React.FC<{
  currentAccount: AdminAccount;
  onLog: (action: string, target: string, detail?: string) => void;
}> = ({ currentAccount, onLog }) => {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [form, setForm] = useState<AdminFormState>({ id: '', name: '', email: '', role: 'operator', password: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setAccounts(getAdminAccounts()); }, []);

  const reload = () => setAccounts(getAdminAccounts());

  const openAdd = () => {
    setEditing(null);
    setForm({ id: '', name: '', email: '', role: 'operator', password: '', active: true });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (acc: AdminAccount) => {
    setEditing(acc);
    setForm({
      id: acc.id,
      name: acc.name,
      email: acc.email || '',
      role: acc.role,
      password: '', // 既存パスワードは表示しない（変更時のみ入力）
      active: acc.active !== false,
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = '名前は必須です';
    if (!form.id.trim()) e.id = 'IDは必須です';
    else if (!editing && accounts.some(a => a.id === form.id)) e.id = 'このIDは既に使用されています';
    if (!form.email.trim()) e.email = 'メールアドレスは必須です';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = 'メール形式が不正です';
    else if (accounts.some(a => a.email?.toLowerCase() === form.email.toLowerCase() && a.id !== editing?.id)) e.email = 'このメールは他のアカウントで使われています';
    if (!editing && !form.password) e.password = 'パスワードは必須です';
    if (form.password && form.password.length < 8) e.password = 'パスワードは8文字以上で入力してください';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      let updated: AdminAccount[];
      if (editing) {
        // 編集: パスワード入力があった場合のみ再ハッシュ
        const target = accounts.find((a) => a.id === editing.id);
        if (!target) return;
        let next: AdminAccount = {
          ...target,
          name: form.name,
          email: form.email,
          role: form.role,
          active: form.active,
        };
        if (form.password) {
          const salt = generateSalt();
          const hash = await hashPassword(form.password, salt);
          next = { ...next, passwordHash: hash, passwordSalt: salt, password: undefined, failedAttempts: 0, lockedUntil: undefined };
        }
        updated = accounts.map(a => a.id === editing.id ? next : a);
        onLog('管理者アカウント編集', target.name, `ID: ${target.id}${form.password ? ' / パスワード変更' : ''}`);
      } else {
        // 新規追加
        const salt = generateSalt();
        const hash = await hashPassword(form.password, salt);
        const newAcc: AdminAccount = {
          id: form.id.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          active: true,
          passwordHash: hash,
          passwordSalt: salt,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        updated = [...accounts, newAcc];
        onLog('管理者アカウント作成', newAcc.name, `ID: ${newAcc.id} / ロール: ${newAcc.role}`);
      }
      saveAdminAccounts(updated);
      reload();
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = (acc: AdminAccount) => {
    if (acc.id === currentAccount.id && acc.active) {
      window.alert('自分自身を無効化することはできません。');
      return;
    }
    if (acc.role === 'super' && acc.active && accounts.filter(a => a.role === 'super' && a.active !== false).length <= 1) {
      window.alert('有効なスーパー管理者を1人以上残す必要があります');
      return;
    }
    const updated = accounts.map(a => a.id === acc.id ? { ...a, active: !(a.active !== false) } : a);
    saveAdminAccounts(updated);
    reload();
    onLog((acc.active !== false) ? '管理者アカウント無効化' : '管理者アカウント有効化', acc.name, `ID: ${acc.id}`);
  };

  const handleDelete = (acc: AdminAccount) => {
    if (acc.id === currentAccount.id) {
      window.alert('自分自身を削除することはできません。');
      return;
    }
    if (acc.role === 'super' && accounts.filter(a => a.role === 'super').length <= 1) {
      window.alert('スーパー管理者を1人以上残す必要があります');
      return;
    }
    if (!window.confirm(`${acc.name} を削除しますか？この操作は取り消せません。`)) return;
    const updated = accounts.filter(a => a.id !== acc.id);
    saveAdminAccounts(updated);
    reload();
    onLog('管理者アカウント削除', acc.name, `ID: ${acc.id}`);
  };

  const handleUnlock = (acc: AdminAccount) => {
    const updated = accounts.map(a => a.id === acc.id ? { ...a, failedAttempts: 0, lockedUntil: undefined } : a);
    saveAdminAccounts(updated);
    reload();
    onLog('管理者アカウントロック解除', acc.name, `ID: ${acc.id}`);
  };

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>管理者アカウント管理</h2>
        <button onClick={openAdd} style={btnPrimary}>+ 追加</button>
      </div>
      <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '0 0 1rem' }}>
        運営側のログインアカウントを管理します。スーパー管理者は全機能、オペレーターは閲覧と一部編集が可能です。
      </p>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB' }}>
              {['名前', 'メールアドレス', 'ロール', '状態', '最終ログイン', 'ロック', '操作'].map(h => (
                <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map(acc => {
              const locked = isLocked(acc);
              const isMe = acc.id === currentAccount.id;
              return (
                <tr key={acc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 500 }}>{acc.name}{isMe && <span style={{ marginLeft: '0.375rem', padding: '0.0625rem 0.375rem', borderRadius: '4px', fontSize: '0.6875rem', backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>自分</span>}</div>
                    <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', fontFamily: 'monospace' }}>ID: {acc.id}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>{acc.email || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: acc.role === 'super' ? '#FEF3C7' : '#E0E7FF', color: acc.role === 'super' ? '#B45309' : '#4338CA' }}>
                      {acc.role === 'super' ? 'スーパー' : 'オペレーター'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: acc.active !== false ? '#DEF7EC' : '#FDE8E8', color: acc.active !== false ? '#059669' : '#DC2626' }}>
                      {acc.active !== false ? '有効' : '無効'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: '#6b7280' }}>{formatRelative(acc.lastLoginAt || null)}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>
                    {locked ? (
                      <span style={{ color: '#DC2626' }}>
                        ロック中（〜{new Date(acc.lockedUntil!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）
                      </span>
                    ) : (acc.failedAttempts && acc.failedAttempts > 0) ? (
                      <span style={{ color: '#B45309' }}>失敗 {acc.failedAttempts} 回</span>
                    ) : (
                      <span style={{ color: '#9CA3AF' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <button onClick={() => openEdit(acc)} style={{ ...btnSecondary, padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>編集</button>
                      {locked && <button onClick={() => handleUnlock(acc)} style={{ ...btnSuccess, padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>解除</button>}
                      <button onClick={() => handleToggleActive(acc)} style={{ ...(acc.active !== false ? btnDanger : btnSuccess), padding: '0.25rem 0.625rem', fontSize: '0.75rem', opacity: isMe && acc.active !== false ? 0.5 : 1 }} disabled={isMe && acc.active !== false}>
                        {acc.active !== false ? '無効化' : '有効化'}
                      </button>
                      <button onClick={() => handleDelete(acc)} style={{ ...btnDanger, padding: '0.25rem 0.625rem', fontSize: '0.75rem', opacity: isMe ? 0.5 : 1 }} disabled={isMe}>削除</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? '管理者アカウント編集' : '管理者アカウント追加'} width="500px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={labelStyle}>名前 <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            {errors.name && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.name}</div>}
          </div>
          <div>
            <label style={labelStyle}>ログインID <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} style={{ ...inputStyle, backgroundColor: editing ? '#F3F4F6' : '#fff' }} disabled={!!editing} />
            {errors.id && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.id}</div>}
          </div>
          <div>
            <label style={labelStyle}>メールアドレス <span style={{ color: '#DC2626' }}>*</span></label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} placeholder="例: yamada@example.com" />
            {errors.email && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.email}</div>}
          </div>
          <div>
            <label style={labelStyle}>{editing ? 'パスワード変更（変更しない場合は空欄）' : 'パスワード（8文字以上）'} {!editing && <span style={{ color: '#DC2626' }}>*</span>}</label>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} placeholder={editing ? '空欄=変更しない' : ''} />
            {errors.password && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.password}</div>}
          </div>
          <div>
            <label style={labelStyle}>ロール</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {([['super', 'スーパー管理者'], ['operator', 'オペレーター']] as const).map(([val, lbl]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input type="radio" checked={form.role === val} onChange={() => setForm({ ...form, role: val })} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnSecondary}>キャンセル</button>
            <button onClick={handleSave} disabled={submitting} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? '保存中...' : (editing ? '更新' : '追加')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ============================================================
   監査ログ（運営側）
   ============================================================ */
const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AdminOperationLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => { setLogs(getAdminLogs()); }, []);

  const filtered = useMemo(() => {
    let result = logs;
    if (actionFilter) result = result.filter((l) => l.action.includes(actionFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((l) =>
        l.operatorName.toLowerCase().includes(q) ||
        l.target.toLowerCase().includes(q) ||
        (l.detail || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, search, actionFilter]);

  const uniqueActions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))), [logs]);

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>監査ログ</h2>
        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{logs.length} 件（最大1000件保持）</div>
      </div>
      <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '0 0 1rem' }}>
        運営側で行われた操作（クライアント作成・編集・削除、管理者操作、ログイン等）の履歴です。
      </p>

      <div style={{ ...cardStyle, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}>
        <input type="text" placeholder="操作者・対象・詳細で検索..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, width: '260px' }} />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="">操作: 全て</option>
          {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {(search || actionFilter) && <button onClick={() => { setSearch(''); setActionFilter(''); }} style={{ ...btnSecondary, padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>クリア</button>}
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB' }}>
              {['日時', '操作者', '操作', '対象', '詳細'].map(h => (
                <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF', fontSize: '0.875rem' }}>該当するログがありません</td></tr>
            )}
            {filtered.slice(0, 200).map(log => (
              <tr key={log.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#6B7280', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {new Date(log.timestamp).toLocaleString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 500 }}>{log.operatorName}</td>
                <td style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }}>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: '#F3F4F6', color: '#374151' }}>{log.action}</span>
                </td>
                <td style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }}>{log.target}</td>
                <td style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#6B7280' }}>{log.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div style={{ padding: '0.625rem', textAlign: 'center', fontSize: '0.75rem', color: '#9CA3AF', backgroundColor: '#F9FAFB' }}>
            最新 200件を表示中（全 {filtered.length} 件）
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================
   接続チェックユーティリティ
   ============================================================ */
function simulateConnectionCheck(m: MediaIntegration): Promise<'ok' | 'error'> {
  // API KeyもWebhookも未設定なら必ずエラー
  if (!m.apiKey && !m.webhookUrl) {
    return new Promise(resolve => setTimeout(() => resolve('error'), 800));
  }
  // 設定済みならランダムで成否を返す（実際はAPIコールするところ）
  return new Promise(resolve => {
    const delay = 600 + Math.random() * 800;
    // API Keyが短すぎる場合はエラー
    const result = (m.apiKey && m.apiKey.length >= 8) || m.webhookUrl ? 'ok' : 'error';
    setTimeout(() => resolve(result), delay);
  });
}

/* ============================================================
   媒体連携管理
   ============================================================ */
const MediaIntegrationPage: React.FC<{
  onConnectionError?: (count: number) => void;
}> = ({ onConnectionError }) => {
  const [integrations, setIntegrations] = useState<MediaIntegration[]>([]);
  const [form, setForm] = useState<MediaIntegration>({ id: '', name: '', type: 'custom', status: 'inactive' });
  const [modalOpen, setModalOpen] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [newForm, setNewForm] = useState<MediaIntegration>({ id: '', name: '', type: 'custom', status: 'inactive' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [dismissedAlert, setDismissedAlert] = useState(false);

  const load = () => {
    const data = getMediaIntegrations();
    setIntegrations(data);
    const errCount = data.filter(m => m.status === 'active' && m.connectionStatus === 'error').length;
    onConnectionError?.(errCount);
  };

  useEffect(() => { load(); }, []);

  // 30秒ごとに有効な媒体を自動チェック
  useEffect(() => {
    const tick = setInterval(() => {
      const current = getMediaIntegrations();
      const activeWithKey = current.filter(m => m.status === 'active' && (m.apiKey || m.webhookUrl));
      if (activeWithKey.length === 0) return;
      activeWithKey.forEach(m => {
        simulateConnectionCheck(m).then(result => {
          const now = new Date().toLocaleString('ja-JP');
          setIntegrations(prev => {
            const updated = prev.map(x => x.id === m.id ? { ...x, connectionStatus: result, lastChecked: now } : x);
            saveMediaIntegrations(updated);
            const errCount = updated.filter(x => x.status === 'active' && x.connectionStatus === 'error').length;
            onConnectionError?.(errCount);
            return updated;
          });
        });
      });
    }, 30000);
    return () => clearInterval(tick);
  }, []);

  const handleConnectionTest = async (m: MediaIntegration) => {
    setCheckingIds(prev => new Set(prev).add(m.id));
    const result = await simulateConnectionCheck(m);
    const now = new Date().toLocaleString('ja-JP');
    setIntegrations(prev => {
      const updated = prev.map(x => x.id === m.id ? { ...x, connectionStatus: result, lastChecked: now } : x);
      saveMediaIntegrations(updated);
      const errCount = updated.filter(x => x.status === 'active' && x.connectionStatus === 'error').length;
      onConnectionError?.(errCount);
      return updated;
    });
    setCheckingIds(prev => { const s = new Set(prev); s.delete(m.id); return s; });
    setDismissedAlert(false);
  };

  const openEdit = (m: MediaIntegration) => {
    setForm({ ...m });
    setModalOpen(true);
  };

  const handleSaveEdit = () => {
    const updated = integrations.map(m => m.id === form.id ? { ...form, connectionStatus: undefined, lastChecked: undefined } : m);
    saveMediaIntegrations(updated);
    setIntegrations(updated);
    setModalOpen(false);
  };

  const handleToggle = (id: string) => {
    const updated = integrations.map(m => m.id === id
      ? { ...m, status: m.status === 'active' ? 'inactive' as const : 'active' as const, connectionStatus: undefined, lastChecked: undefined }
      : m);
    saveMediaIntegrations(updated);
    setIntegrations(updated);
    const errCount = updated.filter(x => x.status === 'active' && x.connectionStatus === 'error').length;
    onConnectionError?.(errCount);
  };

  const validateNew = () => {
    const e: Record<string, string> = {};
    if (!newForm.name.trim()) e.name = '媒体名は必須です';
    if (!newForm.id.trim()) e.id = 'IDは必須です';
    else if (integrations.some(m => m.id === newForm.id)) e.id = 'このIDは既に使用されています';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAddNew = () => {
    if (!validateNew()) return;
    const updated = [...integrations, newForm];
    saveMediaIntegrations(updated);
    setIntegrations(updated);
    setAddModal(false);
    setNewForm({ id: '', name: '', type: 'custom', status: 'inactive' });
    setErrors({});
  };

  const handleDelete = (m: MediaIntegration) => {
    if (!window.confirm(`${m.name} を削除しますか？`)) return;
    const updated = integrations.filter(x => x.id !== m.id);
    saveMediaIntegrations(updated);
    setIntegrations(updated);
    const errCount = updated.filter(x => x.status === 'active' && x.connectionStatus === 'error').length;
    onConnectionError?.(errCount);
  };

  const handleCheckAll = () => {
    const actives = integrations.filter(m => m.status === 'active');
    actives.forEach(m => handleConnectionTest(m));
  };

  const errorIntegrations = integrations.filter(m => m.status === 'active' && m.connectionStatus === 'error');

  const connBadge = (m: MediaIntegration) => {
    if (m.status !== 'active') return null;
    if (!m.connectionStatus || m.connectionStatus === 'unknown') return null;
    const ok = m.connectionStatus === 'ok';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: ok ? '#DEF7EC' : '#FEF2F2', color: ok ? '#059669' : '#DC2626' }}>
        {ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
        {ok ? '接続OK' : '切断中'}
      </span>
    );
  };

  const statusBadge = (status: 'active' | 'inactive') => (
    <span style={{ padding: '0.25rem 0.625rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: status === 'active' ? '#DEF7EC' : '#F3F4F6', color: status === 'active' ? '#059669' : '#9CA3AF' }}>
      {status === 'active' ? '● 連携中' : '○ 未連携'}
    </span>
  );

  const fieldRow = (label: string, key: keyof MediaIntegration, formState: MediaIntegration, setter: React.Dispatch<React.SetStateAction<MediaIntegration>>, type = 'text', errKey?: string) => (
    <div style={{ marginBottom: '0.875rem' }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={(formState[key] as string) || ''} onChange={e => setter(prev => ({ ...prev, [key]: e.target.value }))} style={inputStyle} />
      {errKey && errors[errKey] && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors[errKey]}</div>}
    </div>
  );

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      {/* 接続エラーアラートバナー */}
      {!dismissedAlert && errorIntegrations.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', marginBottom: '1.25rem' }}>
          <span style={{ flexShrink: 0, color: '#DC2626', display: 'flex' }}><Siren size={20} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#991B1B', marginBottom: '0.25rem' }}>
              接続エラーが検出されました（{errorIntegrations.length}件）
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#DC2626' }}>
              {errorIntegrations.map(m => m.name).join('・')} との接続が切断されています。API Keyやエンドポイント設定を確認してください。
            </div>
          </div>
          <button
            onClick={() => setDismissedAlert(true)}
            style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '0', lineHeight: 1, display: 'flex' }}
          ><X size={16} /></button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>媒体連携管理</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>求人媒体のAPI連携設定を管理します（30秒ごとに自動チェック）</p>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button
            onClick={handleCheckAll}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            disabled={checkingIds.size > 0}
          >
            {checkingIds.size > 0 ? (
              <><Loader2 size={14} className="spin" /> チェック中...</>
            ) : (
              <><RefreshCw size={14} /> 全件チェック</>
            )}
          </button>
          <button onClick={() => { setNewForm({ id: '', name: '', type: 'custom', status: 'inactive' }); setErrors({}); setAddModal(true); }} style={btnPrimary}>+ 媒体追加</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {integrations.map(m => {
          const isError = m.status === 'active' && m.connectionStatus === 'error';
          const isChecking = checkingIds.has(m.id);
          const borderColor = isError ? '#FCA5A5' : m.status === 'active' && m.connectionStatus === 'ok' ? '#6EE7B7' : m.status === 'active' ? '#e5e7eb' : '#e5e7eb';
          return (
            <div key={m.id} style={{ ...cardStyle, padding: '1.25rem', borderTop: `3px solid ${borderColor}`, position: 'relative', backgroundColor: isError ? '#FFFAFA' : '#fff' }}>
              {isError && (
                <div style={{ position: 'absolute', top: '-1px', right: '1rem', fontSize: '0.6875rem', fontWeight: 700, color: '#DC2626', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderTop: 'none', padding: '0.125rem 0.5rem', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <AlertTriangle size={12} /> 接続エラー
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}><MediaIcon type={m.type} size={24} /></span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{m.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>ID: {m.id}</div>
                  </div>
                </div>
                {statusBadge(m.status)}
              </div>

              {/* 接続状態バッジ */}
              {m.connectionStatus && m.status === 'active' && (
                <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {connBadge(m)}
                  {m.lastChecked && <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>確認: {m.lastChecked}</span>}
                </div>
              )}

              <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                <div style={{ marginBottom: '0.25rem' }}>
                  <span style={{ color: '#374151', fontWeight: 500 }}>API Key: </span>
                  {m.apiKey ? <span style={{ fontFamily: 'monospace' }}>{m.apiKey.slice(0,8)}••••</span> : <span style={{ color: '#d1d5db' }}>未設定</span>}
                </div>
                <div>
                  <span style={{ color: '#374151', fontWeight: 500 }}>Webhook: </span>
                  {m.webhookUrl ? <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{m.webhookUrl.slice(0,30)}...</span> : <span style={{ color: '#d1d5db' }}>未設定</span>}
                </div>
                {m.lastSync && <div style={{ marginTop: '0.25rem' }}>最終同期: {m.lastSync}</div>}
                {m.note && <div style={{ marginTop: '0.25rem', fontStyle: 'italic' }}>{m.note}</div>}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => handleToggle(m.id)} style={{ ...(m.status === 'active' ? btnDanger : btnSuccess), padding: '0.375rem 0.75rem', fontSize: '0.75rem', flex: 1 }}>
                  {m.status === 'active' ? '無効化' : '有効化'}
                </button>
                {m.status === 'active' && (
                  <button
                    onClick={() => handleConnectionTest(m)}
                    disabled={isChecking}
                    style={{ ...btnSecondary, padding: '0.375rem 0.625rem', fontSize: '0.75rem', color: '#3B82F6', borderColor: '#BFDBFE', minWidth: '4rem' }}
                  >
                    {isChecking ? '⟳' : '接続テスト'}
                  </button>
                )}
                <button onClick={() => openEdit(m)} style={{ ...btnSecondary, padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}>設定</button>
                <button onClick={() => handleDelete(m)} style={{ ...btnDanger, padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}>削除</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 設定編集モーダル */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={`${form.name} の連携設定`} width="480px">
        <div>
          {fieldRow('API Key', 'apiKey', form, setForm)}
          {fieldRow('Webhook URL', 'webhookUrl', form, setForm)}
          {fieldRow('最終同期日時', 'lastSync', form, setForm)}
          {fieldRow('メモ', 'note', form, setForm)}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnSecondary}>キャンセル</button>
            <button onClick={handleSaveEdit} style={btnPrimary}>保存</button>
          </div>
        </div>
      </Modal>

      {/* 新規追加モーダル */}
      <Modal isOpen={addModal} onClose={() => setAddModal(false)} title="媒体追加" width="480px">
        <div>
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={labelStyle}>媒体名 <span style={{ color: '#DC2626' }}>*</span></label>
            <input type="text" value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
            {errors.name && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.name}</div>}
          </div>
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={labelStyle}>媒体ID <span style={{ color: '#DC2626' }}>*</span></label>
            <input type="text" value={newForm.id} onChange={e => setNewForm(p => ({ ...p, id: e.target.value }))} style={inputStyle} placeholder="例: indeed, custom1" />
            {errors.id && <div style={{ color: '#DC2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.id}</div>}
          </div>
          {fieldRow('API Key', 'apiKey', newForm, setNewForm)}
          {fieldRow('Webhook URL', 'webhookUrl', newForm, setNewForm)}
          {fieldRow('メモ', 'note', newForm, setNewForm)}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button onClick={() => setAddModal(false)} style={btnSecondary}>キャンセル</button>
            <button onClick={handleAddNew} style={btnPrimary}>追加</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ============================================================
   メインの AdminApp
   ============================================================ */
const AdminApp: React.FC = () => {
  const [currentAccount, setCurrentAccount] = useState<AdminAccount | null>(null);
  const isLoggedIn = !!currentAccount;
  const [currentView, setCurrentView] = useState<'dashboard' | 'clients' | 'detail' | 'add' | 'contracts' | 'initdata' | 'adminaccounts' | 'media' | 'auditlog'>('dashboard');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [, setAccountMenuOpen] = useState(false);

  // モーダル
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | undefined>();

  // 確認ダイアログ
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // 媒体接続エラー件数
  const [mediaErrorCount, setMediaErrorCount] = useState<number>(() => {
    const integrations = getMediaIntegrations();
    return integrations.filter(m => m.status === 'active' && m.connectionStatus === 'error').length;
  });

  // セッション復元
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    const accounts = getAdminAccounts();
    const acc = accounts.find((a) => a.id === session.accountId);
    if (acc && acc.active) {
      setCurrentAccount(acc);
    } else {
      clearSession();
    }
  }, []);

  // ログイン処理
  const handleLogin = useCallback((account: AdminAccount, remember: boolean) => {
    saveSession({
      token: generateToken(),
      accountId: account.id,
      expiresAt: makeExpiresAt(remember),
      remember,
    });
    setCurrentAccount(account);
    pushAdminLog({
      operatorId: account.id,
      operatorName: account.name,
      action: 'ログイン',
      target: account.email,
    });
  }, []);

  // ログアウト
  const handleLogout = useCallback(() => {
    if (currentAccount) {
      pushAdminLog({
        operatorId: currentAccount.id,
        operatorName: currentAccount.name,
        action: 'ログアウト',
        target: currentAccount.email,
      });
    }
    clearSession();
    setCurrentAccount(null);
    setAccountMenuOpen(false);
  }, [currentAccount]);

  const isSuper = currentAccount?.role === 'super';

  // クライアント読み込み
  const loadClients = useCallback(() => {
    setClients(storage.getClients());
  }, []);

  useEffect(() => {
    if (isLoggedIn) loadClients();
  }, [isLoggedIn, loadClients]);

  const saveAndReload = (updated: Client[]) => {
    storage.saveClients(updated);
    setClients(updated);
  };

  // ナビゲーション
  const navigate = (view: string, id?: string) => {
    if (view === 'detail' && id) {
      setSelectedClientId(id);
      setCurrentView('detail');
    } else if (view === 'clients') {
      setCurrentView('clients');
    } else if (view === 'dashboard') {
      setCurrentView('dashboard');
    } else if (view === 'add') {
      setEditingClient(null);
      setDefaultParentId(undefined);
      setModalOpen(true);
    } else if (view === 'contracts') {
      setCurrentView('contracts');
    } else if (view === 'initdata') {
      setCurrentView('initdata');
    } else if (view === 'adminaccounts') {
      setCurrentView('adminaccounts');
    } else if (view === 'media') {
      setCurrentView('media');
    } else if (view === 'auditlog') {
      setCurrentView('auditlog');
    }
  };

  // 操作ログ記録ヘルパー
  const logAdminAction = useCallback((action: string, target: string, detail?: string) => {
    if (!currentAccount) return;
    pushAdminLog({
      operatorId: currentAccount.id,
      operatorName: currentAccount.name,
      action,
      target,
      detail,
    });
  }, [currentAccount]);

  // 保存
  const handleSave = (client: Client) => {
    let updated: Client[];
    const existing = clients.findIndex(c => c.id === client.id);
    const isNew = existing < 0;
    if (existing >= 0) {
      updated = [...clients];
      updated[existing] = client;
    } else {
      updated = [...clients, client];
    }
    saveAndReload(updated);
    setModalOpen(false);
    setEditingClient(null);
    setDefaultParentId(undefined);
    logAdminAction(isNew ? 'クライアント作成' : 'クライアント編集', client.companyName, `ID: ${client.id}`);
  };

  // 編集
  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setDefaultParentId(undefined);
    setModalOpen(true);
  };

  // 子アカウント追加
  const handleAddChild = (parentId: string) => {
    setEditingClient(null);
    setDefaultParentId(parentId);
    setModalOpen(true);
  };

  // ステータストグル
  const handleToggleStatus = (id: string) => {
    const c = clients.find(cl => cl.id === id);
    if (!c) return;
    const newStatus = c.status === 'active' ? 'inactive' : 'active';
    setConfirmDialog({
      message: `${c.companyName} を ${newStatus === 'active' ? '有効' : '無効'} にしますか？`,
      onConfirm: () => {
        const updated = clients.map(cl => cl.id === id ? { ...cl, status: newStatus as 'active' | 'inactive' } : cl);
        saveAndReload(updated);
        setConfirmDialog(null);
        logAdminAction(newStatus === 'active' ? 'クライアント有効化' : 'クライアント無効化', c.companyName, `ID: ${c.id}`);
      },
    });
  };

  // 削除（super のみ）
  const handleDelete = (id: string) => {
    if (!isSuper) {
      window.alert('削除はsuper権限のみ可能です。管理者にお問い合わせください。');
      return;
    }
    const c = clients.find(cl => cl.id === id);
    if (!c) return;
    const children = clients.filter(cl => cl.parentId === id);
    setConfirmDialog({
      message: `${c.companyName} を削除しますか？${children.length > 0 ? `（子アカウント ${children.length} 件も削除されます）` : ''}`,
      onConfirm: () => {
        const idsToDelete = new Set([id, ...children.map(ch => ch.id)]);
        const updated = clients.filter(cl => !idsToDelete.has(cl.id));
        saveAndReload(updated);
        setConfirmDialog(null);
        if (selectedClientId && idsToDelete.has(selectedClientId)) {
          setCurrentView('clients');
          setSelectedClientId(null);
        }
        logAdminAction('クライアント削除', c.companyName, `ID: ${c.id}${children.length ? ` / 子アカ${children.length}件含む` : ''}`);
      },
    });
  };

  // パスワード更新
  const handleUpdatePassword = (id: string, newPw: string) => {
    const c = clients.find(cl => cl.id === id);
    const updated = clients.map(cl => cl.id === id ? { ...cl, password: newPw } : cl);
    saveAndReload(updated);
    if (c) logAdminAction('クライアントパスワード変更', c.companyName, `ID: ${c.id}`);
  };

  if (!isLoggedIn || !currentAccount) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const selectedClient = selectedClientId ? clients.find(c => c.id === selectedClientId) : null;

  const statsMap = calcAllClientStats(clients);

  const sidebarItems: { key: string; label: string; Icon: typeof LayoutDashboard; superOnly?: boolean }[] = [
    { key: 'dashboard', label: 'ダッシュボード', Icon: LayoutDashboard },
    { key: 'clients', label: 'クライアント管理', Icon: Users },
    { key: 'contracts', label: '契約・請求管理', Icon: CreditCard },
    { key: 'initdata', label: '初期データ設定', Icon: ClipboardList },
    { key: 'adminaccounts', label: '管理者アカウント', Icon: ShieldCheck, superOnly: true },
    { key: 'auditlog', label: '監査ログ', Icon: FileText, superOnly: true },
    { key: 'media', label: '媒体連携管理', Icon: Link2 },
  ].filter((it) => !it.superOnly || isSuper);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* サイドバー */}
      <aside style={{ width: '220px', minWidth: '220px', backgroundColor: '#C2570C', color: '#fff', padding: '1.25rem 0.75rem', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ margin: '0 0 0.25rem', padding: '0 0.5rem', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.05em' }}>RISOTTO</h2>
        <p style={{ margin: '0 0 1.5rem', padding: '0 0.5rem', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.75)' }}>運営管理画面</p>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {sidebarItems.map(item => {
            const isActive = currentView === item.key || (item.key === 'clients' && (currentView === 'detail' || currentView === 'add'));
            const Icon = item.Icon;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.625rem 0.75rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                  backgroundColor: isActive ? '#EA580C' : 'transparent',
                  borderRadius: '6px',
                  fontWeight: isActive ? 600 : 400,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <Icon size={16} strokeWidth={2} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === 'media' && mediaErrorCount > 0 && (
                  <span style={{ minWidth: '18px', height: '18px', borderRadius: '9999px', backgroundColor: '#DC2626', color: '#fff', fontSize: '0.625rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                    {mediaErrorCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* アカウント情報 + ログアウト */}
        <div style={{ marginTop: '0.5rem', padding: '0.625rem', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
              {currentAccount.name.slice(0, 1)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentAccount.name}</div>
              <div style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentAccount.role === 'super' ? 'スーパー管理者' : 'オペレータ'}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center', padding: '0.375rem', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '4px', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '0.75rem', width: '100%' }}
          >
            <LogOut size={12} /> ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main style={{ flex: 1, backgroundColor: '#f8fafc', overflow: 'auto' }}>
        {currentView === 'dashboard' && (
          <Dashboard clients={clients} onNavigate={navigate} statsMap={statsMap} />
        )}
        {(currentView === 'clients' || currentView === 'add') && (
          <ClientList
            clients={clients}
            statsMap={statsMap}
            onNavigate={navigate}
            onEdit={handleEdit}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDelete}
            onAddChild={handleAddChild}
          />
        )}
        {currentView === 'detail' && selectedClient && (
          <ClientDetail
            client={selectedClient}
            clients={clients}
            onBack={() => setCurrentView('clients')}
            onEdit={handleEdit}
            onUpdatePassword={handleUpdatePassword}
          />
        )}
        {currentView === 'contracts' && (
          <ContractPage clients={clients} />
        )}
        {currentView === 'initdata' && (
          <InitDataPage clients={clients} />
        )}
        {currentView === 'adminaccounts' && isSuper && (
          <AdminAccountsPage currentAccount={currentAccount} onLog={logAdminAction} />
        )}
        {currentView === 'auditlog' && isSuper && (
          <AuditLogPage />
        )}
        {currentView === 'media' && (
          <MediaIntegrationPage onConnectionError={setMediaErrorCount} />
        )}
      </main>

      {/* クライアント追加/編集モーダル */}
      <ClientFormModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingClient(null); setDefaultParentId(undefined); }}
        onSave={handleSave}
        clients={clients}
        editingClient={editingClient}
        defaultParentId={defaultParentId}
      />

      {/* 確認ダイアログ */}
      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', maxWidth: '400px', width: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.9375rem', color: '#374151' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem' }}>
              <button onClick={() => setConfirmDialog(null)} style={btnSecondary}>キャンセル</button>
              <button onClick={confirmDialog.onConfirm} style={{ ...btnPrimary, backgroundColor: '#DC2626' }}>確認</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminApp;
