import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { storage } from '@/utils/storage';

const Login: React.FC = () => {
  const { login } = useAuth();
  const [clientId, setClientId] = useState('demo');
  const [password, setPassword] = useState('demo');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setError('');
      setIsLoading(true);

      // Check if account is inactive before attempting login
      const clients = storage.getClients();
      const found = clients.find((c) => c.id === clientId);
      if (found && found.status === 'inactive') {
        setError('このアカウントは無効化されています。管理者にお問い合わせください。');
        setIsLoading(false);
        return;
      }

      const success = login(clientId, password);
      if (!success) {
        setError('クライアントIDまたはパスワードが正しくありません。');
      }
      setIsLoading(false);
    },
    [clientId, password, login]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const plans = [
    { name: 'トライアル', price: '無料', desc: '基本機能をお試し', color: '#6B7280' },
    { name: 'スタンダード', price: '¥9,800/月', desc: '中小企業向け', color: '#3B82F6' },
    { name: 'プロ', price: '¥29,800/月', desc: '大規模採用向け', color: '#8B5CF6' },
    { name: 'エンタープライズ', price: '応相談', desc: 'カスタム対応', color: '#F59E0B' },
  ];

  return (
    <div style={styles.container}>
      {/* Background decoration */}
      <div style={styles.bgDecor1} />
      <div style={styles.bgDecor2} />

      <div style={styles.inner}>
        {/* Left: Login form */}
        <div style={styles.formSection}>
          <div style={styles.card}>
            {/* Logo */}
            <div style={styles.logoWrap}>
              <div style={styles.logoIcon}>
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <rect width="36" height="36" rx="8" fill="url(#logoGrad)" />
                  <path
                    d="M10 18C10 13.58 13.58 10 18 10C22.42 10 26 13.58 26 18C26 22.42 22.42 26 18 26"
                    stroke="#fff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="18" cy="18" r="3" fill="#fff" />
                  <defs>
                    <linearGradient id="logoGrad" x1="0" y1="0" x2="36" y2="36">
                      <stop stopColor="#F97316" />
                      <stop offset="1" stopColor="#EA580C" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <h1 style={styles.logoText}>RISOTTO</h1>
              <p style={styles.subtitle}>採用管理システム (ATS)</p>
            </div>

            {/* Error */}
            {error && (
              <div style={styles.errorBox}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="7" stroke="#DC2626" strokeWidth="1.5" />
                  <path d="M8 5v3.5M8 10.5v.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>クライアントID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="クライアントIDを入力"
                  style={styles.input}
                  autoComplete="username"
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>パスワード</label>
                <div style={styles.passwordWrap}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="パスワードを入力"
                    style={{ ...styles.input, paddingRight: '2.75rem' }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    tabIndex={-1}
                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showPassword ? (
                      // Eye-off icon
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      // Eye icon
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !clientId || !password}
                style={{
                  ...styles.submitBtn,
                  opacity: isLoading || !clientId || !password ? 0.6 : 1,
                  cursor: isLoading || !clientId || !password ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>

            <p style={styles.demoHint}>
              デモアカウント: ID「demo」/ パスワード「demo」
            </p>
          </div>
        </div>

        {/* Right: Plan info */}
        <div style={styles.infoSection}>
          <h2 style={styles.infoTitle}>プラン体系</h2>
          <p style={styles.infoDesc}>
            ビジネスの規模に合わせた最適なプランをお選びください
          </p>

          <div style={styles.planGrid}>
            {plans.map((plan) => (
              <div key={plan.name} style={styles.planCard}>
                <div
                  style={{
                    ...styles.planDot,
                    backgroundColor: plan.color,
                  }}
                />
                <div style={styles.planName}>{plan.name}</div>
                <div style={styles.planPrice}>{plan.price}</div>
                <div style={styles.planDesc}>{plan.desc}</div>
              </div>
            ))}
          </div>

          <div style={styles.features}>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3 3 7-7" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              応募者の一元管理
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3 3 7-7" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              面接スケジュール管理
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3 3 7-7" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              採用レポート自動生成
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3 3 7-7" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              チャットボット連携
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    position: 'relative',
    overflow: 'hidden',
  },
  bgDecor1: {
    position: 'absolute',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.05)',
    top: '-200px',
    right: '-100px',
    pointerEvents: 'none',
  },
  bgDecor2: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.03)',
    bottom: '-150px',
    left: '-100px',
    pointerEvents: 'none',
  },
  inner: {
    display: 'flex',
    gap: '2rem',
    maxWidth: '900px',
    width: '100%',
    position: 'relative',
    zIndex: 1,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  formSection: {
    flex: '1 1 360px',
    maxWidth: '420px',
    minWidth: '320px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2.5rem 2rem',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  logoWrap: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  },
  logoIcon: {
    display: 'inline-block',
    marginBottom: '0.75rem',
  },
  logoText: {
    margin: '0',
    fontSize: '1.75rem',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #F97316, #EA580C)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '0.08em',
  },
  subtitle: {
    margin: '0.25rem 0 0',
    fontSize: '0.8125rem',
    color: '#9CA3AF',
    letterSpacing: '0.02em',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#FEF2F2',
    border: '1px solid #FECACA',
    color: '#DC2626',
    borderRadius: '8px',
    fontSize: '0.8125rem',
    marginBottom: '1.25rem',
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.25rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.375rem',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '1.5px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '0.9rem',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s, box-shadow 0.2s',
    outline: 'none',
    backgroundColor: '#F9FAFB',
  },
  passwordWrap: {
    position: 'relative' as const,
  },
  eyeBtn: {
    position: 'absolute' as const,
    right: '0.5rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    width: '100%',
    padding: '0.875rem',
    background: 'linear-gradient(135deg, #F97316, #EA580C)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.9375rem',
    fontWeight: 700,
    letterSpacing: '0.03em',
    marginTop: '0.25rem',
    transition: 'opacity 0.2s',
  },
  demoHint: {
    textAlign: 'center' as const,
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginTop: '1.5rem',
    marginBottom: 0,
  },
  // Info section
  infoSection: {
    flex: '1 1 360px',
    maxWidth: '420px',
    minWidth: '300px',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    padding: '1rem 0',
  },
  infoTitle: {
    margin: '0 0 0.5rem',
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  infoDesc: {
    margin: '0 0 1.75rem',
    fontSize: '0.875rem',
    opacity: 0.85,
    lineHeight: 1.6,
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  planCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(8px)',
    borderRadius: '12px',
    padding: '1rem',
    border: '1px solid rgba(255,255,255,0.15)',
  },
  planDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginBottom: '0.5rem',
  },
  planName: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    marginBottom: '0.25rem',
    opacity: 0.95,
  },
  planPrice: {
    fontSize: '1.125rem',
    fontWeight: 700,
    marginBottom: '0.25rem',
  },
  planDesc: {
    fontSize: '0.6875rem',
    opacity: 0.7,
  },
  features: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.625rem',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    opacity: 0.9,
  },
  featureIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: '50%',
    flexShrink: 0,
  },
};

export default Login;
