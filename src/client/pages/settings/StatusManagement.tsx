import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Status } from '@/types';
import Modal from '@/components/Modal';
import ColorPalette from '@/components/ColorPalette';
import { COLORS } from '@/components/ColorPalette';

const PAGE_SIZE = 10;

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

const StatusManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', color: COLORS[0].main });
  const [subInput, setSubInput] = useState<{ [id: number]: string }>({});

  const statuses = clientData?.statuses || [];

  const filtered = useMemo(() => {
    let list = [...statuses].sort((a, b) => a.order - b.order);
    if (filterTab === 'active') list = list.filter((s) => s.active);
    if (filterTab === 'inactive') list = list.filter((s) => !s.active);
    if (search) list = list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [statuses, filterTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const canEdit = !client || client.accountType === 'parent' || client.permissions.status;

  const openAddModal = () => {
    setEditId(null);
    setForm({ name: '', color: COLORS[0].main });
    setModalOpen(true);
  };

  const openEditModal = (s: Status) => {
    setEditId(s.id);
    setForm({ name: s.name, color: s.color });
    setModalOpen(true);
  };

  const saveStatus = () => {
    if (!form.name.trim()) return;
    updateClientData((data) => {
      const list = [...data.statuses];
      if (editId !== null) {
        const idx = list.findIndex((s) => s.id === editId);
        if (idx >= 0) {
          list[idx] = { ...list[idx], name: form.name.trim(), color: form.color };
        }
      } else {
        const maxId = list.reduce((m, s) => Math.max(m, s.id), 0);
        const maxOrder = list.reduce((m, s) => Math.max(m, s.order), 0);
        list.push({
          id: maxId + 1,
          name: form.name.trim(),
          color: form.color,
          active: true,
          order: maxOrder + 1,
          subStatuses: [],
        });
      }
      return { ...data, statuses: list };
    });
    setModalOpen(false);
  };

  const toggleActive = (id: number) => {
    updateClientData((data) => ({
      ...data,
      statuses: data.statuses.map((s) =>
        s.id === id ? { ...s, active: !s.active } : s
      ),
    }));
  };

  const moveOrder = (id: number, direction: 'up' | 'down') => {
    updateClientData((data) => {
      const list = [...data.statuses].sort((a, b) => a.order - b.order);
      const idx = list.findIndex((s) => s.id === id);
      if (idx < 0) return data;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= list.length) return data;
      const tmpOrder = list[idx].order;
      list[idx] = { ...list[idx], order: list[swapIdx].order };
      list[swapIdx] = { ...list[swapIdx], order: tmpOrder };
      return { ...data, statuses: list };
    });
  };

  const deleteStatus = (id: number) => {
    const status = statuses.find((s) => s.id === id);
    if (!status) return;
    if (!window.confirm(`"${status.name}" を削除しますか？該当ステータスの応募者からも参照がクリアされます。`)) return;
    updateClientData((data) => ({
      ...data,
      statuses: data.statuses.filter((s) => s.id !== id),
      applicants: data.applicants.map((a) =>
        a.stage === status.name ? { ...a, stage: '', subStatus: '' } : a
      ),
    }));
  };

  const addSubStatus = (id: number) => {
    const val = (subInput[id] || '').trim();
    if (!val) return;
    updateClientData((data) => ({
      ...data,
      statuses: data.statuses.map((s) =>
        s.id === id && !s.subStatuses.includes(val)
          ? { ...s, subStatuses: [...s.subStatuses, val] }
          : s
      ),
    }));
    setSubInput((prev) => ({ ...prev, [id]: '' }));
  };

  const removeSubStatus = (id: number, sub: string) => {
    updateClientData((data) => ({
      ...data,
      statuses: data.statuses.map((s) =>
        s.id === id
          ? { ...s, subStatuses: s.subStatuses.filter((ss) => ss !== sub) }
          : s
      ),
    }));
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>ステータス管理</h2>
        <button onClick={openAddModal} style={btnStyle('#fff', '#3B82F6')}>
          + 新規追加
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1rem' }}>
        {(['all', 'active', 'inactive'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setFilterTab(tab); setPage(1); }}
            style={{
              padding: '0.5rem 1.25rem',
              border: 'none',
              borderBottom: filterTab === tab ? '2px solid #3B82F6' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: filterTab === tab ? 600 : 400,
              color: filterTab === tab ? '#3B82F6' : '#6b7280',
            }}
          >
            {tab === 'all' ? 'すべて' : tab === 'active' ? '有効' : '無効'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="ステータス名で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inputStyle, maxWidth: '300px' }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem', width: '60px' }}>順序</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>カラー</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>ステータス名</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>状態</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>サブステータス</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', width: '160px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => moveOrder(s.id, 'up')}
                      style={{ ...btnStyle('#374151', '#f3f4f6'), padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveOrder(s.id, 'down')}
                      style={{ ...btnStyle('#374151', '#f3f4f6'), padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      ▼
                    </button>
                  </div>
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <div
                    style={{
                      width: '1.5rem',
                      height: '1.5rem',
                      borderRadius: '50%',
                      backgroundColor: s.color,
                    }}
                  />
                </td>
                <td style={{ padding: '0.5rem', fontWeight: 500 }}>{s.name}</td>
                <td style={{ padding: '0.5rem' }}>
                  <button
                    onClick={() => toggleActive(s.id)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      backgroundColor: s.active ? '#DCFCE7' : '#F3F4F6',
                      color: s.active ? '#166534' : '#6B7280',
                    }}
                  >
                    {s.active ? '有効' : '無効'}
                  </button>
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                    {s.subStatuses.map((sub) => (
                      <span
                        key={sub}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.125rem 0.5rem',
                          backgroundColor: '#EFF6FF',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          color: '#1E40AF',
                        }}
                      >
                        {sub}
                        <button
                          onClick={() => removeSubStatus(s.id, sub)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6B7280',
                            fontSize: '0.875rem',
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          x
                        </button>
                      </span>
                    ))}
                    <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                      <input
                        type="text"
                        value={subInput[s.id] || ''}
                        onChange={(e) => setSubInput((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') addSubStatus(s.id); }}
                        placeholder="追加..."
                        style={{ ...inputStyle, width: '80px', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                      />
                      <button
                        onClick={() => addSubStatus(s.id)}
                        style={{ ...btnStyle('#3B82F6', '#EFF6FF'), padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => openEditModal(s)} style={btnStyle('#374151', '#F3F4F6')}>
                      編集
                    </button>
                    <button onClick={() => deleteStatus(s.id)} style={btnStyle('#DC2626', '#FEF2F2')}>
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
          該当するステータスがありません。
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem', marginTop: '1rem' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            style={{ ...btnStyle('#374151', '#f3f4f6'), opacity: page <= 1 ? 0.5 : 1 }}
          >
            &lt;
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={btnStyle(p === page ? '#fff' : '#374151', p === page ? '#3B82F6' : '#f3f4f6')}
            >
              {p}
            </button>
          ))}
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            style={{ ...btnStyle('#374151', '#f3f4f6'), opacity: page >= totalPages ? 0.5 : 1 }}
          >
            &gt;
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'ステータス編集' : '新規ステータス追加'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
              ステータス名
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={inputStyle}
              placeholder="ステータス名を入力"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              カラー
            </label>
            <ColorPalette value={form.color} onChange={(c) => setForm((f) => ({ ...f, color: c }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>
              キャンセル
            </button>
            <button onClick={saveStatus} style={btnStyle('#fff', '#3B82F6')}>
              {editId ? '更新' : '追加'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StatusManagement;
