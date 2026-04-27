import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, ClientData } from '@/types';
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

// 編集スコープ: '__shared__' = 全社共通 / 拠点名 = 拠点別オーバーライド
const SHARED = '__shared__';

const JobManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', color: COLORS[0].main });
  const isChild = client?.accountType === 'child';
  // 子アカは自拠点固定。親アカは全社共通 or 拠点別を選択
  const [scope, setScope] = useState<string>(isChild ? (client?.baseName || SHARED) : SHARED);

  // 子アカの scope を強制
  useEffect(() => {
    if (isChild && client?.baseName) setScope(client.baseName);
  }, [isChild, client?.baseName]);

  const canEdit = !client || client.accountType === 'parent' || client.permissions.job;

  // 現在のスコープに該当する jobs（オーバーライド未設定の場合は全社共通にフォールバック）
  const isBaseScope = scope !== SHARED;
  const overrideExists = isBaseScope && !!clientData?.jobsByBase?.[scope];
  const jobs: Job[] = useMemo(() => {
    if (!clientData) return [];
    if (isBaseScope && overrideExists) {
      return clientData.jobsByBase![scope] || [];
    }
    return clientData.jobs || [];
  }, [clientData, scope, isBaseScope, overrideExists]);

  // 子アカは自拠点オーバーライドを編集（オーバーライドが空ならフォールバック表示中、編集すると新規作成）
  const editingScope = scope;

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

  // 拠点別レイヤへの書き込みヘルパー
  const writeJobs = (mutator: (list: Job[]) => Job[]) => {
    updateClientData((data) => {
      if (editingScope === SHARED) {
        return { ...data, jobs: mutator(data.jobs) };
      }
      // 拠点別レイヤ：未設定なら親共通からコピーして開始
      const current = data.jobsByBase?.[editingScope] ?? data.jobs;
      const next = mutator(current);
      return {
        ...data,
        jobsByBase: { ...(data.jobsByBase || {}), [editingScope]: next },
      };
    });
  };

  const save = () => {
    if (!form.name.trim()) return;
    writeJobs((list) => {
      const updated = [...list];
      if (editId !== null) {
        const idx = updated.findIndex((j) => j.id === editId);
        if (idx >= 0) updated[idx] = { ...updated[idx], name: form.name.trim(), color: form.color };
      } else {
        const maxId = updated.reduce((m, j) => Math.max(m, j.id), 0);
        updated.push({ id: maxId + 1, name: form.name.trim(), color: form.color });
      }
      return updated;
    });
    setModalOpen(false);
  };

  const deleteJob = (id: number) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    if (!window.confirm(`"${job.name}" を削除しますか？該当職種の応募者からも参照がクリアされます。`)) return;
    updateClientData((data) => {
      const next: ClientData = { ...data };
      if (editingScope === SHARED) {
        next.jobs = data.jobs.filter((j) => j.id !== id);
      } else {
        const current = data.jobsByBase?.[editingScope] ?? data.jobs;
        next.jobsByBase = { ...(data.jobsByBase || {}), [editingScope]: current.filter((j) => j.id !== id) };
      }
      next.applicants = data.applicants.map((a) => (a.job === job.name ? { ...a, job: '' } : a));
      return next;
    });
  };

  const removeOverride = () => {
    if (!isBaseScope) return;
    if (!window.confirm(`「${scope}」の拠点別職種設定を削除し、全社共通に戻しますか？`)) return;
    updateClientData((data) => {
      const next = { ...(data.jobsByBase || {}) };
      delete next[scope];
      return { ...data, jobsByBase: next };
    });
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  const bases = clientData?.bases || [];

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>職種管理</h2>
        <button onClick={openAdd} style={btnStyle('#fff', '#3B82F6')}>+ 新規追加</button>
      </div>

      {/* スコープ切替（親アカのみ表示） */}
      {!isChild && bases.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>編集スコープ:</span>
          <select value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }} style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}>
            <option value={SHARED}>全社共通</option>
            {bases.map((b) => (
              <option key={b.id} value={b.name}>
                拠点別: {b.name}{clientData?.jobsByBase?.[b.name] ? '（カスタム済）' : ''}
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
          現在「{scope}」の拠点別設定はありません。下に表示しているのは全社共通の内容です。<strong>追加・編集すると拠点別設定が新規作成されます。</strong>
        </div>
      )}
      {isChild && (
        <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#F3F4F6', borderRadius: '6px', fontSize: '0.8125rem', color: '#4B5563', marginBottom: '0.75rem' }}>
          {overrideExists ? '自拠点用にカスタム済の職種設定です。' : '全社共通の職種設定を表示中です。編集すると自拠点用の設定が作成されます。'}
        </div>
      )}

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
