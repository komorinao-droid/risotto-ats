import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { EmailTemplate } from '@/types';
import Modal from '@/components/Modal';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  width: '100%',
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

const VARIABLES = ['{{氏名}}', '{{職種}}', '{{応募日}}', '{{拠点}}', '{{拠点住所}}', '{{確定面接日}}', '{{応募媒体}}'];

const SHARED = '__shared__';

const EmailTemplateManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const isChild = client?.accountType === 'child';
  const [scope, setScope] = useState<string>(isChild ? (client?.baseName || SHARED) : SHARED);

  useEffect(() => {
    if (isChild && client?.baseName) setScope(client.baseName);
  }, [isChild, client?.baseName]);

  const isBaseScope = scope !== SHARED;
  const overrideExists = isBaseScope && !!clientData?.emailTemplatesByBase?.[scope];
  const templates: EmailTemplate[] = useMemo(() => {
    if (!clientData) return [];
    if (isBaseScope && overrideExists) return clientData.emailTemplatesByBase![scope] || [];
    return clientData.emailTemplates || [];
  }, [clientData, scope, isBaseScope, overrideExists]);
  const canEdit = !client || client.accountType === 'parent' || client.permissions.mailtemplate;
  const editingScope = scope;

  const writeTemplates = useCallback((mutator: (list: EmailTemplate[]) => EmailTemplate[]) => {
    updateClientData((data) => {
      if (editingScope === SHARED) return { ...data, emailTemplates: mutator(data.emailTemplates) };
      const current = data.emailTemplatesByBase?.[editingScope] ?? data.emailTemplates;
      return {
        ...data,
        emailTemplatesByBase: { ...(data.emailTemplatesByBase || {}), [editingScope]: mutator(current) },
      };
    });
  }, [editingScope, updateClientData]);

  // スコープ切替時に選択をリセット
  useEffect(() => { setSelectedId(null); }, [scope]);

  // Load template on select
  useEffect(() => {
    if (selectedId !== null) {
      const t = templates.find((t) => t.id === selectedId);
      if (t) {
        setName(t.name);
        setSubject(t.subject);
        setBody(t.body);
        setSaveState('idle');
      }
    }
  }, [selectedId]);

  // Auto-select first
  useEffect(() => {
    if (templates.length > 0 && (selectedId === null || !templates.find((t) => t.id === selectedId))) {
      setSelectedId(templates[0].id);
    }
  }, [templates]);

  const doSave = useCallback(() => {
    if (selectedId === null) return;
    setSaveState('saving');
    writeTemplates((list) => list.map((t) => (t.id === selectedId ? { ...t, name, subject, body } : t)));
    setTimeout(() => setSaveState('saved'), 300);
  }, [selectedId, name, subject, body, writeTemplates]);

  const scheduleAutoSave = () => {
    setSaveState('idle');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(), 1000);
  };

  const insertVariable = (v: string) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newBody = body.slice(0, start) + v + body.slice(end);
    setBody(newBody);
    scheduleAutoSave();
    // Restore cursor
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  };

  const addTemplate = () => {
    if (!newName.trim()) return;
    writeTemplates((list) => {
      const maxId = list.reduce((m, t) => Math.max(m, t.id), 0);
      return [...list, { id: maxId + 1, name: newName.trim(), subject: '', body: '' }];
    });
    setNewName('');
    setModalOpen(false);
  };

  const deleteTemplate = (id: number) => {
    const t = templates.find((t) => t.id === id);
    if (!t || !window.confirm(`"${t.name}" を削除しますか？`)) return;
    writeTemplates((list) => list.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const removeOverride = () => {
    if (!isBaseScope) return;
    if (!window.confirm(`「${scope}」の拠点別メールテンプレ設定を削除し、全社共通に戻しますか？`)) return;
    updateClientData((data) => {
      const next = { ...(data.emailTemplatesByBase || {}) };
      delete next[scope];
      return { ...data, emailTemplatesByBase: next };
    });
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>メールテンプレート管理</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8125rem', color: saveState === 'saving' ? '#F59E0B' : saveState === 'saved' ? '#22C55E' : '#9ca3af' }}>
            {saveState === 'saving' ? '保存中...' : saveState === 'saved' ? '保存済み \u2713' : ''}
          </span>
        </div>
      </div>

      {/* スコープ切替 */}
      {!isChild && (clientData?.bases?.length || 0) > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>編集スコープ:</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}>
            <option value={SHARED}>全社共通</option>
            {clientData?.bases.map((b) => (
              <option key={b.id} value={b.name}>
                拠点別: {b.name}{clientData?.emailTemplatesByBase?.[b.name] ? '（カスタム済）' : ''}
              </option>
            ))}
          </select>
          {isBaseScope && overrideExists && (
            <button onClick={removeOverride} style={btnStyle('#DC2626', '#FEF2F2')}>拠点別設定を削除</button>
          )}
        </div>
      )}

      {isBaseScope && !overrideExists && (
        <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.8125rem', color: '#92400E', marginBottom: '0.75rem' }}>
          現在「{scope}」の拠点別テンプレ設定はありません。下に表示しているのは全社共通の内容です。<strong>追加・編集すると拠点別設定が新規作成されます。</strong>
        </div>
      )}
      {isChild && (
        <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#F3F4F6', borderRadius: '6px', fontSize: '0.8125rem', color: '#4B5563', marginBottom: '0.75rem' }}>
          {overrideExists ? '自拠点用にカスタム済のメールテンプレ設定です。' : '全社共通のテンプレ設定を表示中です。編集すると自拠点用の設定が作成されます。'}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', minHeight: '500px' }}>
        {/* Left panel: template list */}
        <div style={{ width: '240px', minWidth: '240px', borderRight: '1px solid #e5e7eb', paddingRight: '1rem' }}>
          <button onClick={() => setModalOpen(true)} style={{ ...btnStyle('#fff', '#3B82F6'), width: '100%', marginBottom: '0.75rem' }}>
            + 新規テンプレート
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {templates.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: selectedId === t.id ? '#EFF6FF' : 'transparent',
                  border: selectedId === t.id ? '1px solid #BFDBFE' : '1px solid transparent',
                }}
                onClick={() => setSelectedId(t.id)}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: selectedId === t.id ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.875rem', padding: '0 0.25rem' }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: editor */}
        <div style={{ flex: 1 }}>
          {selectedId !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>テンプレート名</label>
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); scheduleAutoSave(); }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>件名</label>
                <input
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); scheduleAutoSave(); }}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>本文</label>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {VARIABLES.map((v) => (
                      <button
                        key={v}
                        onClick={() => insertVariable(v)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          background: '#F9FAFB',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          color: '#374151',
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => { setBody(e.target.value); scheduleAutoSave(); }}
                  rows={16}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={doSave} style={btnStyle('#fff', '#3B82F6')}>保存</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
              テンプレートを選択してください
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="新規テンプレート" width="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>テンプレート名</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} placeholder="テンプレート名" onKeyDown={(e) => { if (e.key === 'Enter') addTemplate(); }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
            <button onClick={addTemplate} style={btnStyle('#fff', '#3B82F6')}>作成</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EmailTemplateManagement;
