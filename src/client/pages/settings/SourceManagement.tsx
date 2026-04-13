import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Source } from '@/types';
import Modal from '@/components/Modal';
import ColorPalette from '@/components/ColorPalette';
import { COLORS } from '@/components/ColorPalette';

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

const SourceManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<Source, 'id'>>({
    name: '',
    color: COLORS[0].main,
    monthlyCost: 0,
    loginId: '',
    password: '',
    url: '',
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Source | null>(null);
  const [showPw, setShowPw] = useState<{ [id: number]: boolean }>({});

  const sources = clientData?.sources || [];

  const canEdit = !client || client.accountType === 'parent' || client.permissions.source;

  const openAddModal = () => {
    setForm({ name: '', color: COLORS[0].main, monthlyCost: 0, loginId: '', password: '', url: '' });
    setModalOpen(true);
  };

  const addSource = () => {
    if (!form.name.trim()) return;
    updateClientData((data) => {
      const maxId = data.sources.reduce((m, s) => Math.max(m, s.id), 0);
      return {
        ...data,
        sources: [...data.sources, { id: maxId + 1, ...form, name: form.name.trim() }],
      };
    });
    setModalOpen(false);
  };

  const startEdit = (s: Source) => {
    setEditingId(s.id);
    setEditRow({ ...s });
  };

  const saveEdit = () => {
    if (!editRow || !editRow.name.trim()) return;
    updateClientData((data) => ({
      ...data,
      sources: data.sources.map((s) => (s.id === editRow.id ? { ...editRow, name: editRow.name.trim() } : s)),
    }));
    setEditingId(null);
    setEditRow(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRow(null);
  };

  const deleteSource = (id: number) => {
    const source = sources.find((s) => s.id === id);
    if (!source) return;
    if (!window.confirm(`"${source.name}" を削除しますか？該当媒体の応募者からも参照がクリアされます。`)) return;
    updateClientData((data) => ({
      ...data,
      sources: data.sources.filter((s) => s.id !== id),
      applicants: data.applicants.map((a) =>
        a.src === source.name ? { ...a, src: '' } : a
      ),
    }));
  };

  const togglePw = (id: number) => setShowPw((prev) => ({ ...prev, [id]: !prev[id] }));

  const formatCost = (n: number) => `\u00A5${n.toLocaleString()}`;

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>応募媒体管理</h2>
        <button onClick={openAddModal} style={btnStyle('#fff', '#3B82F6')}>+ 新規追加</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>カラー</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>媒体名</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>月額費用</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>ログインID</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>パスワード</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>URL</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', width: '160px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const isEditing = editingId === s.id && editRow;
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem' }}>
                    {isEditing ? (
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            width: '1.5rem',
                            height: '1.5rem',
                            borderRadius: '50%',
                            backgroundColor: editRow!.color,
                            cursor: 'pointer',
                          }}
                          title="カラー変更はモーダルから"
                        />
                        <div style={{ position: 'absolute', top: '2rem', left: 0, zIndex: 10, background: '#fff', padding: '0.5rem', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                          <ColorPalette value={editRow!.color} onChange={(c) => setEditRow((r) => r ? { ...r, color: c } : r)} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', backgroundColor: s.color }} />
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {isEditing ? (
                      <input
                        value={editRow!.name}
                        onChange={(e) => setEditRow((r) => r ? { ...r, name: e.target.value } : r)}
                        style={{ ...inputStyle, width: '120px' }}
                      />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{s.name}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editRow!.monthlyCost}
                        onChange={(e) => setEditRow((r) => r ? { ...r, monthlyCost: Number(e.target.value) || 0 } : r)}
                        style={{ ...inputStyle, width: '100px', textAlign: 'right' }}
                      />
                    ) : (
                      formatCost(s.monthlyCost)
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {isEditing ? (
                      <input
                        value={editRow!.loginId}
                        onChange={(e) => setEditRow((r) => r ? { ...r, loginId: e.target.value } : r)}
                        style={{ ...inputStyle, width: '120px' }}
                      />
                    ) : (
                      s.loginId || '-'
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {isEditing ? (
                      <input
                        type={showPw[s.id] ? 'text' : 'password'}
                        value={editRow!.password}
                        onChange={(e) => setEditRow((r) => r ? { ...r, password: e.target.value } : r)}
                        style={{ ...inputStyle, width: '120px' }}
                      />
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        {showPw[s.id] ? s.password : s.password ? '********' : '-'}
                        {s.password && (
                          <button
                            onClick={() => togglePw(s.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280' }}
                          >
                            {showPw[s.id] ? '隠す' : '表示'}
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {isEditing ? (
                      <input
                        value={editRow!.url}
                        onChange={(e) => setEditRow((r) => r ? { ...r, url: e.target.value } : r)}
                        style={{ ...inputStyle, width: '160px' }}
                      />
                    ) : s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', textDecoration: 'underline', fontSize: '0.8125rem' }}>
                        {s.url.length > 30 ? s.url.slice(0, 30) + '...' : s.url}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        <button onClick={saveEdit} style={btnStyle('#fff', '#22C55E')}>保存</button>
                        <button onClick={cancelEdit} style={btnStyle('#374151', '#F3F4F6')}>取消</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => startEdit(s)} style={btnStyle('#374151', '#F3F4F6')}>編集</button>
                        <button onClick={() => deleteSource(s.id)} style={btnStyle('#DC2626', '#FEF2F2')}>削除</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sources.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
          応募媒体が登録されていません。
        </div>
      )}

      {/* Add Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="応募媒体追加">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>媒体名 *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="媒体名" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>カラー</label>
            <ColorPalette value={form.color} onChange={(c) => setForm((f) => ({ ...f, color: c }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>ログインID</label>
              <input value={form.loginId} onChange={(e) => setForm((f) => ({ ...f, loginId: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>パスワード</label>
              <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>URL</label>
            <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} style={inputStyle} placeholder="https://..." />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>月額費用</label>
            <input type="number" value={form.monthlyCost} onChange={(e) => setForm((f) => ({ ...f, monthlyCost: Number(e.target.value) || 0 }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
            <button onClick={addSource} style={btnStyle('#fff', '#3B82F6')}>追加</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SourceManagement;
