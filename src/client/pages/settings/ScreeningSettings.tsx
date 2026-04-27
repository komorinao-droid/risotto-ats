import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { ScreeningCriteria, ScreeningCriteriaBody } from '@/types';

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

const SHARED = '__shared__';

const defaultCriteria = (): ScreeningCriteria => ({
  enabled: false,
  evaluationPoints: '',
  requiredQualities: '',
  ngQualities: '',
  passThreshold: 75,
  rejectThreshold: 30,
  byJob: {},
});

const ScreeningSettings: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [form, setForm] = useState<ScreeningCriteria>(defaultCriteria());
  const [scope, setScope] = useState<string>(SHARED); // SHARED or jobName
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (clientData?.screeningCriteria) {
      setForm({ ...defaultCriteria(), ...clientData.screeningCriteria, byJob: clientData.screeningCriteria.byJob || {} });
    }
  }, [clientData]);

  const isChild = client?.accountType === 'child';
  const jobs = useMemo(() => clientData?.jobs || [], [clientData]);

  if (isChild) {
    return (
      <div style={{ padding: '2rem', color: '#6b7280' }}>
        AIスクリーニング設定は本部アカウントのみ編集できます。
      </div>
    );
  }

  const isJobScope = scope !== SHARED;
  const jobOverride = isJobScope ? form.byJob?.[scope] : undefined;
  const overrideExists = isJobScope && !!jobOverride;

  // 表示中のスコープに応じた本文
  const visibleBody: ScreeningCriteriaBody = isJobScope
    ? (jobOverride ?? { evaluationPoints: form.evaluationPoints, requiredQualities: form.requiredQualities, ngQualities: form.ngQualities })
    : { evaluationPoints: form.evaluationPoints, requiredQualities: form.requiredQualities, ngQualities: form.ngQualities };

  const setBody = (next: ScreeningCriteriaBody) => {
    if (isJobScope) {
      setForm((f) => ({
        ...f,
        byJob: { ...(f.byJob || {}), [scope]: next },
      }));
    } else {
      setForm((f) => ({
        ...f,
        evaluationPoints: next.evaluationPoints,
        requiredQualities: next.requiredQualities,
        ngQualities: next.ngQualities,
      }));
    }
  };

  const save = () => {
    updateClientData((data) => ({ ...data, screeningCriteria: form }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const removeOverride = () => {
    if (!isJobScope) return;
    if (!window.confirm(`「${scope}」の職種別スクリーニング基準を削除し、全社デフォルトに戻しますか？`)) return;
    setForm((f) => {
      const next = { ...(f.byJob || {}) };
      delete next[scope];
      return { ...f, byJob: next };
    });
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Sparkles size={20} color="#9333EA" />
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>AIスクリーニング設定</h2>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: 0, marginBottom: '1rem' }}>
        応募者詳細の「AIスクリーニング」タブで「AI評価実行」を押すと、ここで設定した基準でClaude AIが書類選考スコアを算出します。
        職種ごとに評価軸が違う場合はスコープを切り替えて職種別に設定できます。
      </p>

      {/* スコープセレクタ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>編集スコープ:</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '240px' }}>
          <option value={SHARED}>全社デフォルト</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.name}>
              職種別: {j.name}{form.byJob?.[j.name] ? '（カスタム済）' : ''}
            </option>
          ))}
        </select>
        {isJobScope && overrideExists && (
          <button
            onClick={removeOverride}
            style={{ padding: '0.375rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer' }}
          >
            この職種の設定を削除
          </button>
        )}
      </div>

      {isJobScope && !overrideExists && (
        <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.8125rem', color: '#92400E', marginBottom: '0.75rem' }}>
          現在「{scope}」の職種別設定はありません。下に表示しているのは全社デフォルトの内容です。<strong>編集して保存すると職種別設定が新規作成されます。</strong>
        </div>
      )}

      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* 全社共通項目（職種スコープ時は非表示） */}
        {!isJobScope && (
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
              無効の場合、応募者詳細の「AIスクリーニング」タブで評価実行できません（タブ自体は表示されます）。
            </div>
          </div>
        )}

        <div>
          <label style={labelStyle}>評価観点</label>
          <div style={helpStyle}>
            {isJobScope
              ? `「${scope}」職種で重視する評価軸（例: 業界経験年数、特定スキル、稼働可能日数）`
              : '全職種共通の基本評価軸（職種別を設定するとそちらが優先されます）'}
          </div>
          <textarea
            value={visibleBody.evaluationPoints}
            onChange={(e) => setBody({ ...visibleBody, evaluationPoints: e.target.value })}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="・〇〇な経験がある人を高評価&#10;・通勤30分圏内であることを重視&#10;・週4日以上稼働できる人を優先"
          />
        </div>

        <div>
          <label style={labelStyle}>必須要件</label>
          <div style={helpStyle}>満たしていないと不合格寄りになる条件</div>
          <textarea
            value={visibleBody.requiredQualities}
            onChange={(e) => setBody({ ...visibleBody, requiredQualities: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="・自動車免許&#10;・土日いずれか出勤可能"
          />
        </div>

        <div>
          <label style={labelStyle}>NG要件</label>
          <div style={helpStyle}>該当すると即不合格寄りになる条件</div>
          <textarea
            value={visibleBody.ngQualities}
            onChange={(e) => setBody({ ...visibleBody, ngQualities: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="・短期離職を3社連続&#10;・志望動機が空欄"
          />
        </div>

        {/* しきい値（全社共通のみ） */}
        {!isJobScope && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>合格推奨スコア</label>
              <div style={helpStyle}>このスコア以上で「合格推奨」と判定（全社共通）</div>
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
              <div style={helpStyle}>このスコア以下で「不合格推奨」と判定（全社共通）</div>
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
        )}

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
        <strong>運用メモ:</strong> AI評価は判断補助です。最終的な合否判断は人間が行ってください。
        評価実行時は「応募者の職種」に対応した基準が自動で使われます。職種別設定がない場合は全社デフォルトを使用。
      </div>
    </div>
  );
};

export default ScreeningSettings;
