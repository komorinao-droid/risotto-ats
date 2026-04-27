import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { ScreeningCriteria } from '@/types';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.875rem',
  fontWeight: 600,
  marginBottom: '0.375rem',
  color: '#374151',
};

const helpStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#6b7280',
  marginTop: '0.25rem',
  marginBottom: '0.5rem',
};

const defaultCriteria = (): ScreeningCriteria => ({
  enabled: false,
  evaluationPoints: '',
  requiredQualities: '',
  ngQualities: '',
  passThreshold: 75,
  rejectThreshold: 30,
});

const ScreeningSettings: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [form, setForm] = useState<ScreeningCriteria>(defaultCriteria());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (clientData?.screeningCriteria) {
      setForm({ ...defaultCriteria(), ...clientData.screeningCriteria });
    }
  }, [clientData]);

  const isChild = client?.accountType === 'child';
  if (isChild) {
    return (
      <div style={{ padding: '2rem', color: '#6b7280' }}>
        AIスクリーニング設定は本部アカウントのみ編集できます。
      </div>
    );
  }

  const save = () => {
    updateClientData((data) => ({ ...data, screeningCriteria: form }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Sparkles size={20} color="#9333EA" />
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>AIスクリーニング設定</h2>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: 0, marginBottom: '1.5rem' }}>
        応募者詳細画面で「AI評価実行」ボタンを押した際に、ここで設定した基準に基づいてClaude AIが書類選考スコアを算出します。
      </p>

      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9375rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            AIスクリーニング機能を有効化
          </label>
          <div style={helpStyle}>
            無効の場合、応募者詳細画面の「AI評価実行」ボタンが非表示になります。
          </div>
        </div>

        <div>
          <label style={labelStyle}>評価観点</label>
          <div style={helpStyle}>どんな点を見て評価してほしいかを自由記述（例: 接客経験の有無、勤務地への通いやすさ、長期就業の意思）</div>
          <textarea
            value={form.evaluationPoints}
            onChange={(e) => setForm((f) => ({ ...f, evaluationPoints: e.target.value }))}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="・〇〇な経験がある人を高評価&#10;・通勤30分圏内であることを重視&#10;・週4日以上稼働できる人を優先"
          />
        </div>

        <div>
          <label style={labelStyle}>必須要件</label>
          <div style={helpStyle}>満たしていないと不合格寄りになる条件</div>
          <textarea
            value={form.requiredQualities}
            onChange={(e) => setForm((f) => ({ ...f, requiredQualities: e.target.value }))}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="・自動車免許&#10;・土日いずれか出勤可能"
          />
        </div>

        <div>
          <label style={labelStyle}>NG要件</label>
          <div style={helpStyle}>該当すると即不合格寄りになる条件</div>
          <textarea
            value={form.ngQualities}
            onChange={(e) => setForm((f) => ({ ...f, ngQualities: e.target.value }))}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="・短期離職を3社連続&#10;・志望動機が空欄"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>合格推奨スコア</label>
            <div style={helpStyle}>このスコア以上で「合格推奨」と判定</div>
            <input
              type="number"
              min={0}
              max={100}
              value={form.passThreshold}
              onChange={(e) => setForm((f) => ({ ...f, passThreshold: Number(e.target.value) || 0 }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>不合格推奨スコア</label>
            <div style={helpStyle}>このスコア以下で「不合格推奨」と判定</div>
            <input
              type="number"
              min={0}
              max={100}
              value={form.rejectThreshold}
              onChange={(e) => setForm((f) => ({ ...f, rejectThreshold: Number(e.target.value) || 0 }))}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
          {saved && <span style={{ fontSize: '0.8125rem', color: '#059669' }}>保存しました</span>}
          <button
            onClick={save}
            style={{
              padding: '0.5rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: 'var(--color-primary, #F97316)',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            保存
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.8125rem', color: '#92400E' }}>
        <strong>運用メモ:</strong> AI評価はあくまで判断補助です。最終的な書類選考の合否判断は人間が行ってください。
        Claude API キー（ANTHROPIC_API_KEY）は運営側で環境変数として一括管理しています。
      </div>
    </div>
  );
};

export default ScreeningSettings;
