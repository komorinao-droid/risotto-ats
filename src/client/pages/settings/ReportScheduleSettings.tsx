import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Clock, Plus, Trash2, Save, AlertCircle } from 'lucide-react';
import type { ReportScheduleSetting } from '@/types';
import { nextScheduledRun, frequencyLabel, rangePresetLabel } from '@/utils/reports/schedule';

const DEFAULT_SETTING: ReportScheduleSetting = {
  enabled: false,
  frequency: 'monthly',
  dayOfMonth: 1,
  time: '09:00',
  recipients: [],
  rangePreset: 'lastMonth',
  includeAi: false,
};

const labelStyle: React.CSSProperties = { fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem', display: 'block' };
const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', width: '100%', boxSizing: 'border-box' };

const ReportScheduleSettings: React.FC = () => {
  const { clientData, updateClientData } = useAuth();
  const [setting, setSetting] = useState<ReportScheduleSetting>(DEFAULT_SETTING);
  const [newEmail, setNewEmail] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (clientData?.reportSchedule) setSetting(clientData.reportSchedule);
  }, [clientData?.reportSchedule]);

  const update = <K extends keyof ReportScheduleSetting>(key: K, value: ReportScheduleSetting[K]) => {
    setSetting((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const addRecipient = () => {
    const email = newEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('有効なメールアドレスを入力してください');
      return;
    }
    if (setting.recipients.includes(email)) return;
    update('recipients', [...setting.recipients, email]);
    setNewEmail('');
  };

  const removeRecipient = (email: string) => {
    update('recipients', setting.recipients.filter((e) => e !== email));
  };

  const save = () => {
    updateClientData((data) => ({ ...data, reportSchedule: setting }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const next = nextScheduledRun(setting);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Mail size={20} color="#F97316" />
          採用レポート 定期配信設定
        </h2>
        <button
          onClick={save}
          style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', backgroundColor: '#F97316', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <Save size={14} />
          保存
        </button>
      </div>

      {saved && (
        <div style={{ padding: '0.5rem 0.875rem', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '6px', fontSize: '0.8125rem', marginBottom: '1rem' }}>
          設定を保存しました。
        </div>
      )}

      {/* 有効/無効 */}
      <div style={{ padding: '1rem', backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', marginBottom: '1.25rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={setting.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            style={{ width: '1.125rem', height: '1.125rem' }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#9A3412' }}>定期配信を有効にする</span>
        </label>
        {setting.enabled && next && (
          <div style={{ marginTop: '0.625rem', padding: '0.5rem 0.75rem', backgroundColor: '#fff', borderRadius: '6px', fontSize: '0.8125rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={14} color="#F97316" />
            次回配信予定: <strong>{next.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            <span style={{ color: '#6B7280' }}>({frequencyLabel(setting)})</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {/* 配信頻度 */}
        <div>
          <label style={labelStyle}>配信頻度</label>
          <select
            value={setting.frequency}
            onChange={(e) => update('frequency', e.target.value as ReportScheduleSetting['frequency'])}
            style={inputStyle}
          >
            <option value="monthly">毎月</option>
            <option value="biweekly">隔週</option>
            <option value="weekly">毎週</option>
          </select>
        </div>

        {/* 配信日 */}
        {setting.frequency === 'monthly' ? (
          <div>
            <label style={labelStyle}>配信日（1〜28）</label>
            <input
              type="number"
              min={1}
              max={28}
              value={setting.dayOfMonth || 1}
              onChange={(e) => update('dayOfMonth', Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
              style={inputStyle}
            />
          </div>
        ) : (
          <div>
            <label style={labelStyle}>配信曜日</label>
            <select
              value={setting.dayOfWeek ?? 1}
              onChange={(e) => update('dayOfWeek', parseInt(e.target.value))}
              style={inputStyle}
            >
              <option value={0}>日曜</option>
              <option value={1}>月曜</option>
              <option value={2}>火曜</option>
              <option value={3}>水曜</option>
              <option value={4}>木曜</option>
              <option value={5}>金曜</option>
              <option value={6}>土曜</option>
            </select>
          </div>
        )}

        {/* 配信時刻 */}
        <div>
          <label style={labelStyle}>配信時刻</label>
          <input
            type="time"
            value={setting.time || '09:00'}
            onChange={(e) => update('time', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* 期間プリセット */}
        <div>
          <label style={labelStyle}>レポート対象期間</label>
          <select
            value={setting.rangePreset}
            onChange={(e) => update('rangePreset', e.target.value as ReportScheduleSetting['rangePreset'])}
            style={inputStyle}
          >
            <option value="lastMonth">{rangePresetLabel('lastMonth')}</option>
            <option value="lastQuarter">{rangePresetLabel('lastQuarter')}</option>
            <option value="lastHalf">{rangePresetLabel('lastHalf')}</option>
          </select>
        </div>
      </div>

      {/* AI総評含む */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
          <input
            type="checkbox"
            checked={setting.includeAi}
            onChange={(e) => update('includeAi', e.target.checked)}
          />
          AI総評ページを含める（配信レポートにAI分析結果を含めます）
        </label>
      </div>

      {/* 配信先 */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>配信先メールアドレス</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.5rem' }}>
          {setting.recipients.length === 0 && (
            <div style={{ padding: '0.625rem 0.875rem', border: '1px dashed #d1d5db', borderRadius: '6px', fontSize: '0.8125rem', color: '#9CA3AF', textAlign: 'center' }}>
              配信先が未設定です
            </div>
          )}
          {setting.recipients.map((email) => (
            <div key={email} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
              <Mail size={14} color="#6B7280" />
              <span style={{ flex: 1, fontSize: '0.875rem' }}>{email}</span>
              <button
                onClick={() => removeRecipient(email)}
                style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addRecipient(); }}
            placeholder="example@company.com"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={addRecipient}
            style={{ padding: '0.5rem 0.875rem', border: 'none', borderRadius: '6px', backgroundColor: '#0EA5E9', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <Plus size={14} />
            追加
          </button>
        </div>
      </div>

      {/* 直近配信履歴 */}
      {setting.lastRunAt && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '0.8125rem', color: '#374151' }}>
          <strong>最終配信:</strong> {new Date(setting.lastRunAt).toLocaleString('ja-JP')}
          {setting.lastRunStatus === 'failed' && (
            <span style={{ marginLeft: '0.5rem', color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <AlertCircle size={12} />
              配信失敗: {setting.lastRunError || 'エラー詳細不明'}
            </span>
          )}
        </div>
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9CA3AF', lineHeight: 1.6 }}>
        ※ 設定された頻度・時刻に、指定した期間のレポートが自動生成され、配信先メールアドレスにPDFが添付されて送信されます。<br />
        ※ サーバー側の配信エンジンは順次稼働開始予定です。設定保存のみ現状ご利用いただけます。
      </p>
    </div>
  );
};

export default ReportScheduleSettings;
