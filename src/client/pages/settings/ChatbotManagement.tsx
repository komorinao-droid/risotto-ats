import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatButton } from '@/types';
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

// ---- Scenario Tab ----
const ScenarioTab: React.FC = () => {
  const { clientData, updateClientData } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [previewMessages, setPreviewMessages] = useState<{ text: string; isUser: boolean }[]>([]);
  const [previewScenarioId, setPreviewScenarioId] = useState<number | null>(null);

  const scenarios = clientData?.chatScenarios || [];
  const selected = scenarios.find((s) => s.id === selectedId) || null;

  const addScenario = () => {
    if (!newName.trim()) return;
    updateClientData((data) => {
      const maxId = data.chatScenarios.reduce((m, s) => Math.max(m, s.id), 0);
      return {
        ...data,
        chatScenarios: [...data.chatScenarios, { id: maxId + 1, name: newName.trim(), messages: [] }],
      };
    });
    setNewName('');
    setModalOpen(false);
  };

  const deleteScenario = (id: number) => {
    if (!window.confirm('このシナリオを削除しますか？')) return;
    updateClientData((data) => ({
      ...data,
      chatScenarios: data.chatScenarios.filter((s) => s.id !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  };

  const addMessage = () => {
    if (!selected) return;
    updateClientData((data) => ({
      ...data,
      chatScenarios: data.chatScenarios.map((s) => {
        if (s.id !== selected.id) return s;
        const maxMsgId = s.messages.reduce((m, msg) => Math.max(m, msg.id), 0);
        return { ...s, messages: [...s.messages, { id: maxMsgId + 1, text: '', buttons: [] }] };
      }),
    }));
  };

  const updateMessage = (msgId: number, text: string) => {
    if (!selected) return;
    updateClientData((data) => ({
      ...data,
      chatScenarios: data.chatScenarios.map((s) =>
        s.id !== selected.id ? s : {
          ...s,
          messages: s.messages.map((m) => m.id === msgId ? { ...m, text } : m),
        }
      ),
    }));
  };

  const deleteMessage = (msgId: number) => {
    if (!selected) return;
    updateClientData((data) => ({
      ...data,
      chatScenarios: data.chatScenarios.map((s) =>
        s.id !== selected.id ? s : { ...s, messages: s.messages.filter((m) => m.id !== msgId) }
      ),
    }));
  };

  const addButton = (msgId: number) => {
    if (!selected) return;
    updateClientData((data) => ({
      ...data,
      chatScenarios: data.chatScenarios.map((s) =>
        s.id !== selected.id ? s : {
          ...s,
          messages: s.messages.map((m) =>
            m.id !== msgId ? m : { ...m, buttons: [...m.buttons, { label: '新しいボタン' }] }
          ),
        }
      ),
    }));
  };

  const updateButton = (msgId: number, btnIdx: number, partial: Partial<ChatButton>) => {
    if (!selected) return;
    updateClientData((data) => ({
      ...data,
      chatScenarios: data.chatScenarios.map((s) =>
        s.id !== selected.id ? s : {
          ...s,
          messages: s.messages.map((m) =>
            m.id !== msgId ? m : {
              ...m,
              buttons: m.buttons.map((b, i) => i === btnIdx ? { ...b, ...partial } : b),
            }
          ),
        }
      ),
    }));
  };

  const removeButton = (msgId: number, btnIdx: number) => {
    if (!selected) return;
    updateClientData((data) => ({
      ...data,
      chatScenarios: data.chatScenarios.map((s) =>
        s.id !== selected.id ? s : {
          ...s,
          messages: s.messages.map((m) =>
            m.id !== msgId ? m : { ...m, buttons: m.buttons.filter((_, i) => i !== btnIdx) }
          ),
        }
      ),
    }));
  };

  // Preview logic
  const startPreview = () => {
    const first = scenarios[0];
    if (!first) return;
    setPreviewScenarioId(first.id);
    setPreviewMessages([]);
    // Load first scenario messages
    const msgs: { text: string; isUser: boolean }[] = [];
    first.messages.forEach((m) => {
      if (m.text) msgs.push({ text: m.text, isUser: false });
    });
    setPreviewMessages(msgs);
  };

  const handlePreviewButton = (btn: ChatButton) => {
    setPreviewMessages((prev) => [...prev, { text: btn.label, isUser: true }]);
    if (btn.nextScenarioId) {
      const next = scenarios.find((s) => s.id === btn.nextScenarioId);
      if (next) {
        setPreviewScenarioId(next.id);
        const msgs: { text: string; isUser: boolean }[] = [];
        next.messages.forEach((m) => {
          if (m.text) msgs.push({ text: m.text, isUser: false });
        });
        setTimeout(() => setPreviewMessages((prev) => [...prev, ...msgs]), 300);
      }
    }
  };

  const previewScenario = scenarios.find((s) => s.id === previewScenarioId);
  const previewButtons = previewScenario?.messages.flatMap((m) => m.buttons).filter((b) => b.label) || [];

  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      {/* Left: scenario list + editor */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>シナリオ一覧</span>
          <button onClick={() => setModalOpen(true)} style={btnStyle('#fff', '#3B82F6')}>+ 追加</button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {scenarios.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: selectedId === s.id ? '#EFF6FF' : '#F3F4F6',
                border: selectedId === s.id ? '1px solid #BFDBFE' : '1px solid #e5e7eb',
                fontSize: '0.875rem',
                fontWeight: selectedId === s.id ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {s.name}
              <button
                onClick={(e) => { e.stopPropagation(); deleteScenario(s.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem' }}
              >
                x
              </button>
            </div>
          ))}
        </div>

        {selected && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>メッセージフロー: {selected.name}</span>
              <button onClick={addMessage} style={btnStyle('#3B82F6', '#EFF6FF')}>+ メッセージ追加</button>
            </div>

            {selected.messages.map((msg, idx) => (
              <div
                key={msg.id}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  backgroundColor: '#FAFAFA',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>メッセージ {idx + 1}</span>
                  <button onClick={() => deleteMessage(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '0.75rem' }}>
                    削除
                  </button>
                </div>
                <textarea
                  value={msg.text}
                  onChange={(e) => updateMessage(msg.id, e.target.value)}
                  rows={2}
                  placeholder="メッセージテキスト"
                  style={{ ...inputStyle, resize: 'vertical', marginBottom: '0.5rem', fontFamily: 'inherit' }}
                />

                <div style={{ marginLeft: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>選択ボタン:</div>
                  {msg.buttons.map((btn, bIdx) => (
                    <div key={bIdx} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <input
                        value={btn.label}
                        onChange={(e) => updateButton(msg.id, bIdx, { label: e.target.value })}
                        placeholder="ボタンラベル"
                        style={{ ...inputStyle, width: '160px', padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      />
                      <select
                        value={btn.nextScenarioId || ''}
                        onChange={(e) => updateButton(msg.id, bIdx, { nextScenarioId: e.target.value ? Number(e.target.value) : undefined })}
                        style={{ ...inputStyle, width: '160px', padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      >
                        <option value="">リンク先なし</option>
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <button onClick={() => removeButton(msg.id, bIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '0.75rem' }}>
                        x
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addButton(msg.id)} style={{ ...btnStyle('#6b7280', '#F3F4F6'), padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                    + ボタン追加
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!selected && scenarios.length > 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>シナリオを選択してください</div>
        )}
      </div>

      {/* Right: preview */}
      <div style={{ width: '320px', minWidth: '320px', borderLeft: '1px solid #e5e7eb', paddingLeft: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>プレビュー</span>
          <button onClick={startPreview} style={btnStyle('#fff', '#22C55E')}>開始</button>
        </div>
        <div
          style={{
            height: '400px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: '#F9FAFB',
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {previewMessages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.isUser ? 'flex-end' : 'flex-start',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '12px',
                  maxWidth: '80%',
                  fontSize: '0.8125rem',
                  backgroundColor: m.isUser ? '#3B82F6' : '#fff',
                  color: m.isUser ? '#fff' : '#374151',
                  border: m.isUser ? 'none' : '1px solid #e5e7eb',
                }}
              >
                {m.text}
              </div>
            ))}
          </div>
          {previewButtons.length > 0 && (
            <div style={{ padding: '0.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {previewButtons.map((btn, i) => (
                <button
                  key={i}
                  onClick={() => handlePreviewButton(btn)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    border: '1px solid #3B82F6',
                    borderRadius: '999px',
                    backgroundColor: '#fff',
                    color: '#3B82F6',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="新規シナリオ" width="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} placeholder="シナリオ名" onKeyDown={(e) => { if (e.key === 'Enter') addScenario(); }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
            <button onClick={addScenario} style={btnStyle('#fff', '#3B82F6')}>作成</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ---- Question Tab ----
const QuestionTab: React.FC = () => {
  const { clientData, updateClientData } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const groups = clientData?.chatQuestionGroups || [];
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  const addGroup = () => {
    if (!newGroupName.trim()) return;
    updateClientData((data) => {
      const maxId = data.chatQuestionGroups.reduce((m, g) => Math.max(m, g.id), 0);
      return {
        ...data,
        chatQuestionGroups: [...data.chatQuestionGroups, { id: maxId + 1, name: newGroupName.trim(), questions: [] }],
      };
    });
    setNewGroupName('');
    setModalOpen(false);
  };

  const deleteGroup = (id: number) => {
    if (!window.confirm('この質問グループを削除しますか？')) return;
    updateClientData((data) => ({
      ...data,
      chatQuestionGroups: data.chatQuestionGroups.filter((g) => g.id !== id),
    }));
    if (selectedGroupId === id) setSelectedGroupId(null);
  };

  const addQuestion = () => {
    if (!selectedGroup) return;
    updateClientData((data) => ({
      ...data,
      chatQuestionGroups: data.chatQuestionGroups.map((g) => {
        if (g.id !== selectedGroup.id) return g;
        const maxQId = g.questions.reduce((m, q) => Math.max(m, q.id), 0);
        return { ...g, questions: [...g.questions, { id: maxQId + 1, text: '' }] };
      }),
    }));
  };

  const updateQuestion = (qId: number, text: string) => {
    if (!selectedGroup) return;
    updateClientData((data) => ({
      ...data,
      chatQuestionGroups: data.chatQuestionGroups.map((g) =>
        g.id !== selectedGroup.id ? g : {
          ...g,
          questions: g.questions.map((q) => q.id === qId ? { ...q, text } : q),
        }
      ),
    }));
  };

  const deleteQuestion = (qId: number) => {
    if (!selectedGroup) return;
    updateClientData((data) => ({
      ...data,
      chatQuestionGroups: data.chatQuestionGroups.map((g) =>
        g.id !== selectedGroup.id ? g : { ...g, questions: g.questions.filter((q) => q.id !== qId) }
      ),
    }));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>質問グループ一覧</span>
        <button onClick={() => setModalOpen(true)} style={btnStyle('#fff', '#3B82F6')}>+ グループ追加</button>
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        {/* Group list */}
        <div style={{ width: '240px', minWidth: '240px' }}>
          {groups.map((g) => (
            <div
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: selectedGroupId === g.id ? '#EFF6FF' : 'transparent',
                border: selectedGroupId === g.id ? '1px solid #BFDBFE' : '1px solid transparent',
                marginBottom: '0.25rem',
              }}
            >
              <span style={{ fontSize: '0.875rem', fontWeight: selectedGroupId === g.id ? 600 : 400 }}>
                {g.name} ({g.questions.length})
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem' }}
              >
                x
              </button>
            </div>
          ))}
          {groups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.8125rem' }}>
              グループが未登録です
            </div>
          )}
        </div>

        {/* Question detail */}
        <div style={{ flex: 1, borderLeft: '1px solid #e5e7eb', paddingLeft: '1rem' }}>
          {selectedGroup ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 500 }}>{selectedGroup.name} の質問</span>
                <button onClick={addQuestion} style={btnStyle('#3B82F6', '#EFF6FF')}>+ 質問追加</button>
              </div>
              {selectedGroup.questions.map((q, idx) => (
                <div key={q.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', minWidth: '20px' }}>{idx + 1}.</span>
                  <input
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, e.target.value)}
                    placeholder="質問テキスト"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => deleteQuestion(q.id)} style={btnStyle('#DC2626', '#FEF2F2')}>削除</button>
                </div>
              ))}
              {selectedGroup.questions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.8125rem' }}>
                  質問がありません
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9ca3af' }}>
              グループを選択してください
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="新規質問グループ" width="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} style={inputStyle} placeholder="グループ名" onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
            <button onClick={addGroup} style={btnStyle('#fff', '#3B82F6')}>作成</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ---- Main component ----
const ChatbotManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scenario' | 'question'>('scenario');

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 600 }}>チャットボット管理</h2>

      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1rem' }}>
        {[
          { key: 'scenario' as const, label: 'シナリオ管理' },
          { key: 'question' as const, label: 'チャット質問管理' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.5rem 1.25rem',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #3B82F6' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#3B82F6' : '#6b7280',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'scenario' ? <ScenarioTab /> : <QuestionTab />}
    </div>
  );
};

export default ChatbotManagement;
