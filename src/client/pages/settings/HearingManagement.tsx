import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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

const HearingManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [activeJob, setActiveJob] = useState('');
  const [template, setTemplate] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jobs = clientData?.jobs || [];
  const hearingTemplates = clientData?.hearingTemplates || [];
  const canEdit = !client || client.accountType === 'parent' || client.permissions.hearing;

  // Set first job as active when jobs change
  useEffect(() => {
    if (jobs.length > 0 && (!activeJob || !jobs.find((j) => j.name === activeJob))) {
      setActiveJob(jobs[0].name);
    }
  }, [jobs, activeJob]);

  // Load template when active job changes
  useEffect(() => {
    const found = hearingTemplates.find((h) => h.jobName === activeJob);
    setTemplate(found?.template || '');
    setSaveState('idle');
  }, [activeJob, hearingTemplates]);

  const doSave = useCallback(
    (value: string) => {
      setSaveState('saving');
      updateClientData((data) => {
        const list = [...data.hearingTemplates];
        const idx = list.findIndex((h) => h.jobName === activeJob);
        if (idx >= 0) {
          list[idx] = { ...list[idx], template: value };
        } else {
          list.push({ jobName: activeJob, template: value });
        }
        return { ...data, hearingTemplates: list };
      });
      setTimeout(() => setSaveState('saved'), 300);
    },
    [activeJob, updateClientData]
  );

  const handleChange = (value: string) => {
    setTemplate(value);
    setSaveState('idle');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(value), 800);
  };

  const handleManualSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    doSave(template);
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>ヒアリング項目管理</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8125rem', color: saveState === 'saving' ? '#F59E0B' : saveState === 'saved' ? '#22C55E' : '#9ca3af' }}>
            {saveState === 'saving' ? '保存中...' : saveState === 'saved' ? '保存済み \u2713' : ''}
          </span>
          <button onClick={handleManualSave} style={btnStyle('#fff', '#3B82F6')}>保存</button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
          まず「職種管理」から職種を登録してください。
        </div>
      ) : (
        <>
          {/* Job tabs */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => setActiveJob(j.name)}
                style={{
                  padding: '0.5rem 1.25rem',
                  border: 'none',
                  borderBottom: activeJob === j.name ? '2px solid #3B82F6' : '2px solid transparent',
                  marginBottom: '-2px',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: activeJob === j.name ? 600 : 400,
                  color: activeJob === j.name ? '#3B82F6' : '#6b7280',
                }}
              >
                {j.name}
              </button>
            ))}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              「{activeJob}」のヒアリングテンプレート
            </label>
            <textarea
              value={template}
              onChange={(e) => handleChange(e.target.value)}
              rows={16}
              placeholder={`ヒアリング項目を入力してください...\n\n例:\n・前職について\n・志望動機\n・希望勤務地\n・希望給与\n・入社可能日`}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default HearingManagement;
