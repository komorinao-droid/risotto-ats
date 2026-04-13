import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Applicant, FilterCondition } from '@/types';
import Modal from '@/components/Modal';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
};

const btnStyle = (color: string, bg: string): React.CSSProperties => ({
  padding: '0.375rem 0.75rem',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: bg,
  color,
  cursor: 'pointer',
  fontSize: '0.8125rem',
  fontWeight: 500,
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.25rem',
  fontSize: '0.875rem',
  fontWeight: 500,
};

const sectionStyle: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  marginBottom: '1rem',
};

function matchesFilter(a: Applicant, fc: FilterCondition): boolean {
  // Age filter
  if (fc.ageEnabled) {
    const age = typeof a.age === 'number' ? a.age : parseInt(String(a.age), 10);
    if (!isNaN(age) && (age < fc.ageMin || age > fc.ageMax)) return true;
  }
  // Gender filter
  if (fc.genderFilter.length > 0 && a.gender && !fc.genderFilter.includes(a.gender)) return true;
  // Source exclusion
  if (fc.sourceFilter.length > 0 && a.src && fc.sourceFilter.includes(a.src)) return true;
  // Job filter (if job list specified, only those are valid)
  if (fc.jobFilter.length > 0 && a.job && !fc.jobFilter.includes(a.job)) return true;

  return false;
}

const FilterConditionSettings: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [flagAgeInput, setFlagAgeInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ count: number; done: boolean } | null>(null);

  const fc = clientData?.filterCondition || {
    ageEnabled: false, ageMin: 18, ageMax: 65,
    genderFilter: [], sourceFilter: [], jobFilter: [],
    excludeStatus: '', flagAges: [],
  };
  const applicants = clientData?.applicants || [];
  const sources = clientData?.sources || [];
  const jobs = clientData?.jobs || [];
  const statuses = clientData?.statuses || [];

  const canEdit = !client || client.accountType === 'parent' || client.permissions.filtercond;

  const updateFC = (partial: Partial<FilterCondition>) => {
    updateClientData((data) => ({
      ...data,
      filterCondition: { ...data.filterCondition, ...partial },
    }));
  };

  // Preview: applicants that would be excluded
  const affected = useMemo(() => {
    return applicants.filter((a) => a.active && matchesFilter(a, fc));
  }, [applicants, fc]);

  const addFlagAge = () => {
    const n = parseInt(flagAgeInput, 10);
    if (isNaN(n) || fc.flagAges.includes(n)) return;
    updateFC({ flagAges: [...fc.flagAges, n].sort((a, b) => a - b) });
    setFlagAgeInput('');
  };

  const removeFlagAge = (age: number) => {
    updateFC({ flagAges: fc.flagAges.filter((a) => a !== age) });
  };

  const toggleGender = (g: string) => {
    const list = fc.genderFilter.includes(g)
      ? fc.genderFilter.filter((x) => x !== g)
      : [...fc.genderFilter, g];
    updateFC({ genderFilter: list });
  };

  const toggleSource = (s: string) => {
    const list = fc.sourceFilter.includes(s)
      ? fc.sourceFilter.filter((x) => x !== s)
      : [...fc.sourceFilter, s];
    updateFC({ sourceFilter: list });
  };

  const toggleJob = (j: string) => {
    const list = fc.jobFilter.includes(j)
      ? fc.jobFilter.filter((x) => x !== j)
      : [...fc.jobFilter, j];
    updateFC({ jobFilter: list });
  };

  const executeExclusion = () => {
    if (!fc.excludeStatus) {
      alert('除外ステータスを選択してください。');
      return;
    }
    const count = affected.length;
    updateClientData((data) => {
      const affectedIds = new Set(
        data.applicants
          .filter((a) => a.active && matchesFilter(a, data.filterCondition))
          .map((a) => a.id)
      );
      return {
        ...data,
        applicants: data.applicants.map((a) =>
          affectedIds.has(a.id) ? { ...a, stage: fc.excludeStatus, active: false } : a
        ),
      };
    });
    setResult({ count, done: true });
    setConfirmOpen(false);
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 600 }}>フィルタ条件設定</h2>

      {/* Age */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <label style={{ ...labelStyle, margin: 0 }}>年齢フィルタ</label>
          <button
            onClick={() => updateFC({ ageEnabled: !fc.ageEnabled })}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              backgroundColor: fc.ageEnabled ? '#DCFCE7' : '#F3F4F6',
              color: fc.ageEnabled ? '#166534' : '#6B7280',
            }}
          >
            {fc.ageEnabled ? '有効' : '無効'}
          </button>
        </div>
        {fc.ageEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="number"
              value={fc.ageMin}
              onChange={(e) => updateFC({ ageMin: Number(e.target.value) || 0 })}
              style={{ ...inputStyle, width: '80px' }}
            />
            <span>歳 〜</span>
            <input
              type="number"
              value={fc.ageMax}
              onChange={(e) => updateFC({ ageMax: Number(e.target.value) || 0 })}
              style={{ ...inputStyle, width: '80px' }}
            />
            <span>歳</span>
          </div>
        )}
      </div>

      {/* Gender */}
      <div style={sectionStyle}>
        <label style={labelStyle}>性別フィルタ（選択した性別のみ通過）</label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {['男性', '女性', 'その他'].map((g) => (
            <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={fc.genderFilter.includes(g)}
                onChange={() => toggleGender(g)}
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      {/* Source exclusion */}
      <div style={sectionStyle}>
        <label style={labelStyle}>除外する応募媒体</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {sources.map((s) => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={fc.sourceFilter.includes(s.name)}
                onChange={() => toggleSource(s.name)}
              />
              {s.name}
            </label>
          ))}
          {sources.length === 0 && <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>媒体が未登録です</span>}
        </div>
      </div>

      {/* Job filter */}
      <div style={sectionStyle}>
        <label style={labelStyle}>有効な職種（選択した職種のみ通過）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {jobs.map((j) => (
            <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={fc.jobFilter.includes(j.name)}
                onChange={() => toggleJob(j.name)}
              />
              {j.name}
            </label>
          ))}
          {jobs.length === 0 && <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>職種が未登録です</span>}
        </div>
      </div>

      {/* Exclude status */}
      <div style={sectionStyle}>
        <label style={labelStyle}>除外時に設定するステータス</label>
        <select
          value={fc.excludeStatus}
          onChange={(e) => updateFC({ excludeStatus: e.target.value })}
          style={{ ...inputStyle, width: '240px' }}
        >
          <option value="">選択してください</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Flag ages */}
      <div style={sectionStyle}>
        <label style={labelStyle}>年齢ハイライト</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
          {fc.flagAges.map((age) => (
            <span
              key={age}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.125rem 0.5rem',
                backgroundColor: '#FEF3C7',
                borderRadius: '999px',
                fontSize: '0.8125rem',
                color: '#92400E',
              }}
            >
              {age}歳
              <button
                onClick={() => removeFlagAge(age)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', fontSize: '0.875rem', padding: 0 }}
              >
                x
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <input
            type="number"
            value={flagAgeInput}
            onChange={(e) => setFlagAgeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addFlagAge(); }}
            placeholder="年齢を入力"
            style={{ ...inputStyle, width: '100px' }}
          />
          <button onClick={addFlagAge} style={btnStyle('#fff', '#3B82F6')}>追加</button>
        </div>
      </div>

      {/* Preview */}
      <div style={{ ...sectionStyle, backgroundColor: '#F9FAFB' }}>
        <label style={labelStyle}>プレビュー: 条件適用時の影響</label>
        <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: affected.length > 0 ? '#DC2626' : '#22C55E' }}>
          該当件数: {affected.length}件
        </div>
        {affected.length > 0 && (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.375rem' }}>氏名</th>
                  <th style={{ textAlign: 'left', padding: '0.375rem' }}>年齢</th>
                  <th style={{ textAlign: 'left', padding: '0.375rem' }}>性別</th>
                  <th style={{ textAlign: 'left', padding: '0.375rem' }}>媒体</th>
                  <th style={{ textAlign: 'left', padding: '0.375rem' }}>職種</th>
                  <th style={{ textAlign: 'left', padding: '0.375rem' }}>ステータス</th>
                </tr>
              </thead>
              <tbody>
                {affected.slice(0, 20).map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.375rem' }}>{a.name}</td>
                    <td style={{ padding: '0.375rem' }}>{a.age}</td>
                    <td style={{ padding: '0.375rem' }}>{a.gender}</td>
                    <td style={{ padding: '0.375rem' }}>{a.src}</td>
                    <td style={{ padding: '0.375rem' }}>{a.job}</td>
                    <td style={{ padding: '0.375rem' }}>{a.stage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {affected.length > 20 && (
              <div style={{ textAlign: 'center', padding: '0.5rem', color: '#6b7280', fontSize: '0.8125rem' }}>
                ...他 {affected.length - 20}件
              </div>
            )}
          </div>
        )}
      </div>

      {/* Execute */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => {
            if (affected.length === 0) { alert('該当する応募者がいません。'); return; }
            setConfirmOpen(true);
          }}
          style={btnStyle('#fff', '#DC2626')}
        >
          一括除外を実行
        </button>
        {result?.done && (
          <span style={{ fontSize: '0.875rem', color: '#22C55E', fontWeight: 500 }}>
            {result.count}件を除外しました。
          </span>
        )}
      </div>

      {/* Confirmation dialog */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="一括除外の確認" width="480px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            {affected.length}件の応募者を「{fc.excludeStatus}」ステータスに変更します。
          </p>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#DC2626', fontWeight: 500 }}>
            この操作は元に戻せません。実行しますか？
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button onClick={() => setConfirmOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
            <button onClick={executeExclusion} style={btnStyle('#fff', '#DC2626')}>実行する</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FilterConditionSettings;
