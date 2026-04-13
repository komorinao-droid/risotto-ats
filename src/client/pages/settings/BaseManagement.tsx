import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Base } from '@/types';
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

const BaseManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', color: COLORS[0].main, slotInterval: 30, startTime: '09:00', endTime: '18:00' });

  const bases = clientData?.bases || [];
  const canEdit = !client || client.accountType === 'parent' || client.permissions.base;

  const filtered = useMemo(() => {
    if (!search) return bases;
    return bases.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));
  }, [bases, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAdd = () => {
    setEditId(null);
    setForm({ name: '', color: COLORS[0].main, slotInterval: 30, startTime: '09:00', endTime: '18:00' });
    setModalOpen(true);
  };

  const openEdit = (b: Base) => {
    setEditId(b.id);
    setForm({ name: b.name, color: b.color, slotInterval: b.slotInterval || 30, startTime: b.startTime || '09:00', endTime: b.endTime || '18:00' });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    updateClientData((data) => {
      const list = [...data.bases];
      if (editId !== null) {
        const idx = list.findIndex((b) => b.id === editId);
        if (idx >= 0) list[idx] = { ...list[idx], name: form.name.trim(), color: form.color, slotInterval: form.slotInterval, startTime: form.startTime, endTime: form.endTime };
      } else {
        const maxId = list.reduce((m, b) => Math.max(m, b.id), 0);
        list.push({
          id: maxId + 1,
          name: form.name.trim(),
          color: form.color,
          slotInterval: form.slotInterval,
          startTime: form.startTime,
          endTime: form.endTime,
        });
      }
      return { ...data, bases: list };
    });
    setModalOpen(false);
  };

  const deleteBase = (id: number) => {
    const base = bases.find((b) => b.id === id);
    if (!base) return;
    if (!window.confirm(`"${base.name}" を削除しますか？`)) return;
    updateClientData((data) => ({
      ...data,
      bases: data.bases.filter((b) => b.id !== id),
    }));
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>拠点管理</h2>
        <button onClick={openAdd} style={btnStyle('#fff', '#3B82F6')}>+ 新規追加</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="拠点名で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inputStyle, maxWidth: '300px' }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>カラー</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>拠点名</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>受付時間</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>スロット間隔</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', width: '160px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((b) => (
              <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.5rem' }}>
                  <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', backgroundColor: b.color }} />
                </td>
                <td style={{ padding: '0.5rem', fontWeight: 500 }}>{b.name}</td>
                <td style={{ padding: '0.5rem', fontSize: '0.8125rem', color: '#374151' }}>{b.startTime || '09:00'} 〜 {b.endTime || '18:00'}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#EFF6FF', color: '#3B82F6' }}>{b.slotInterval || 30}分</span>
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(b)} style={btnStyle('#374151', '#F3F4F6')}>編集</button>
                    <button onClick={() => deleteBase(b.id)} style={btnStyle('#DC2626', '#FEF2F2')}>削除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>拠点が登録されていません。</div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem', marginTop: '1rem' }}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ ...btnStyle('#374151', '#f3f4f6'), opacity: page <= 1 ? 0.5 : 1 }}>&lt;</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)} style={btnStyle(p === page ? '#fff' : '#374151', p === page ? '#3B82F6' : '#f3f4f6')}>{p}</button>
          ))}
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={{ ...btnStyle('#374151', '#f3f4f6'), opacity: page >= totalPages ? 0.5 : 1 }}>&gt;</button>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editId ? '拠点編集' : '新規拠点追加'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>拠点名</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="拠点名を入力" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>カラー</label>
            <ColorPalette value={form.color} onChange={(c) => setForm((f) => ({ ...f, color: c }))} />
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>面接スロット設定</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8125rem', fontWeight: 500 }}>受付開始時間</label>
                <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8125rem', fontWeight: 500 }}>受付終了時間</label>
                <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8125rem', fontWeight: 500 }}>スロット間隔（分）</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[15, 30, 45, 60].map((min) => (
                  <label key={min} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', padding: '0.375rem 0.75rem', borderRadius: '6px', border: `1px solid ${form.slotInterval === min ? '#3B82F6' : '#e5e7eb'}`, backgroundColor: form.slotInterval === min ? '#EFF6FF' : '#fff', fontSize: '0.8125rem', fontWeight: form.slotInterval === min ? 600 : 400, color: form.slotInterval === min ? '#3B82F6' : '#374151' }}>
                    <input type="radio" name="slotInterval" checked={form.slotInterval === min} onChange={() => setForm((f) => ({ ...f, slotInterval: min }))} style={{ display: 'none' }} />
                    {min}分
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
            <button onClick={save} style={btnStyle('#fff', '#3B82F6')}>{editId ? '更新' : '追加'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BaseManagement;
