import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Job } from '@/types';
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

const JobManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', color: COLORS[0].main });

  const jobs = clientData?.jobs || [];
  const canEdit = !client || client.accountType === 'parent' || client.permissions.job;

  const filtered = useMemo(() => {
    if (!search) return jobs;
    return jobs.filter((j) => j.name.toLowerCase().includes(search.toLowerCase()));
  }, [jobs, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAdd = () => {
    setEditId(null);
    setForm({ name: '', color: COLORS[0].main });
    setModalOpen(true);
  };

  const openEdit = (j: Job) => {
    setEditId(j.id);
    setForm({ name: j.name, color: j.color });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    updateClientData((data) => {
      const list = [...data.jobs];
      if (editId !== null) {
        const idx = list.findIndex((j) => j.id === editId);
        if (idx >= 0) list[idx] = { ...list[idx], name: form.name.trim(), color: form.color };
      } else {
        const maxId = list.reduce((m, j) => Math.max(m, j.id), 0);
        list.push({ id: maxId + 1, name: form.name.trim(), color: form.color });
      }
      return { ...data, jobs: list };
    });
    setModalOpen(false);
  };

  const deleteJob = (id: number) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    if (!window.confirm(`"${job.name}" を削除しますか？該当職種の応募者からも参照がクリアされます。`)) return;
    updateClientData((data) => ({
      ...data,
      jobs: data.jobs.filter((j) => j.id !== id),
      applicants: data.applicants.map((a) =>
        a.job === job.name ? { ...a, job: '' } : a
      ),
    }));
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>職種管理</h2>
        <button onClick={openAdd} style={btnStyle('#fff', '#3B82F6')}>+ 新規追加</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="職種名で検索..."
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
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>職種名</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', width: '160px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((j) => (
              <tr key={j.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.5rem' }}>
                  <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', backgroundColor: j.color }} />
                </td>
                <td style={{ padding: '0.5rem', fontWeight: 500 }}>{j.name}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(j)} style={btnStyle('#374151', '#F3F4F6')}>編集</button>
                    <button onClick={() => deleteJob(j.id)} style={btnStyle('#DC2626', '#FEF2F2')}>削除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>職種が登録されていません。</div>
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editId ? '職種編集' : '新規職種追加'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>職種名</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="職種名を入力" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>カラー</label>
            <ColorPalette value={form.color} onChange={(c) => setForm((f) => ({ ...f, color: c }))} />
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

export default JobManagement;
