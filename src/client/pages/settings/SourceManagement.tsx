import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Source, ClientData } from '@/types';
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

const SHARED = '__shared__';

const SourceManagement: React.FC = () => {
  const { clientData, updateClientData, client, logAction } = useAuth();
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
  const isChild = client?.accountType === 'child';
  const [scope, setScope] = useState<string>(isChild ? (client?.baseName || SHARED) : SHARED);

  useEffect(() => {
    if (isChild && client?.baseName) setScope(client.baseName);
  }, [isChild, client?.baseName]);

  const isBaseScope = scope !== SHARED;
  const overrideExists = isBaseScope && !!clientData?.sourcesByBase?.[scope];
  const sources: Source[] = useMemo(() => {
    if (!clientData) return [];
    if (isBaseScope && overrideExists) return clientData.sourcesByBase![scope] || [];
    return clientData.sources || [];
  }, [clientData, scope, isBaseScope, overrideExists]);

  const canEdit = !client || client.accountType === 'parent' || client.permissions.source;
  const editingScope = scope;

  const writeSources = (mutator: (list: Source[]) => Source[]) => {
    updateClientData((data) => {
      if (editingScope === SHARED) return { ...data, sources: mutator(data.sources) };
      const current = data.sourcesByBase?.[editingScope] ?? data.sources;
      return {
        ...data,
        sourcesByBase: { ...(data.sourcesByBase || {}), [editingScope]: mutator(current) },
      };
    });
  };

  const openAddModal = () => {
    setForm({ name: '', color: COLORS[0].main, monthlyCost: 0, loginId: '', password: '', url: '' });
    setModalOpen(true);
  };

  const scopeDetail = () => editingScope === SHARED ? '全社共通' : `拠点別: ${editingScope}`;

  const addSource = () => {
    if (!form.name.trim()) return;
    writeSources((list) => {
      const maxId = list.reduce((m, s) => Math.max(m, s.id), 0);
      return [...list, { id: maxId + 1, ...form, name: form.name.trim() }];
    });
    logAction('setting', '応募媒体追加', form.name.trim(), scopeDetail());
    setModalOpen(false);
  };

  const startEdit = (s: Source) => {
    setEditingId(s.id);
    setEditRow({ ...s });
  };

  const saveEdit = () => {
    if (!editRow || !editRow.name.trim()) return;
    writeSources((list) => list.map((s) => (s.id === editRow.id ? { ...editRow, name: editRow.name.trim() } : s)));
    logAction('setting', '応募媒体編集', editRow.name.trim(), scopeDetail());
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
    updateClientData((data) => {
      const next: ClientData = { ...data };
      if (editingScope === SHARED) {
        next.sources = data.sources.filter((s) => s.id !== id);
      } else {
        const current = data.sourcesByBase?.[editingScope] ?? data.sources;
        next.sourcesByBase = { ...(data.sourcesByBase || {}), [editingScope]: current.filter((s) => s.id !== id) };
      }
      next.applicants = data.applicants.map((a) => (a.src === source.name ? { ...a, src: '' } : a));
      return next;
    });
    logAction('setting', '応募媒体削除', source.name, scopeDetail());
  };

  const removeOverride = () => {
    if (!isBaseScope) return;
    if (!window.confirm(`「${scope}」の拠点別媒体設定を削除し、全社共通に戻しますか？`)) return;
    updateClientData((data) => {
      const next = { ...(data.sourcesByBase || {}) };
      delete next[scope];
      return { ...data, sourcesByBase: next };
    });
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

      {/* スコープ切替（親アカのみ） */}
      {!isChild && (clientData?.bases?.length || 0) > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>編集スコープ:</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}>
            <option value={SHARED}>全社共通</option>
            {clientData?.bases.map((b) => (
              <option key={b.id} value={b.name}>
                拠点別: {b.name}{clientData?.sourcesByBase?.[b.name] ? '（カスタム済）' : ''}
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
          現在「{scope}」の拠点別媒体設定はありません。下に表示しているのは全社共通の内容です。<strong>追加・編集すると拠点別設定が新規作成されます。</strong>
        </div>
      )}
      {isChild && (
        <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#F3F4F6', borderRadius: '6px', fontSize: '0.8125rem', color: '#4B5563', marginBottom: '0.75rem' }}>
          {overrideExists ? '自拠点用にカスタム済の媒体設定です。' : '全社共通の媒体設定を表示中です。編集すると自拠点用の設定が作成されます。'}
        </div>
      )}

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
