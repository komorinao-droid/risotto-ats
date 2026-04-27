import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

const lblStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.25rem',
  fontSize: '0.875rem',
  fontWeight: 500,
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

const emptyForm = {
  name: '', nameKana: '', address: '', phone: '', matchingCondition: '', notes: '', registeredDate: '',
  color: COLORS[0].main, slotInterval: 30, startTime: '09:00', endTime: '18:00',
};

// ── URL helpers ──
function getBaseIdFromURL(): number | null {
  const val = new URLSearchParams(window.location.search).get('base');
  return val ? Number(val) : null;
}
function setBaseIdInURL(id: number | null) {
  const url = new URL(window.location.href);
  if (id != null) url.searchParams.set('base', String(id));
  else url.searchParams.delete('base');
  window.history.pushState({}, '', url.toString());
}

// ── 詳細行 ──
const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
    <td style={{ padding: '12px 16px', fontWeight: 500, color: '#374151', fontSize: '0.875rem', width: '180px', whiteSpace: 'nowrap' }}>{label}</td>
    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: '#111827' }}>{value || '-'}</td>
  </tr>
);

// ── 詳細ページ ──
const BaseDetail: React.FC<{ base: Base; onBack: () => void; onEdit: (b: Base) => void; onDelete: (id: number) => void; onNavigate: (path: string) => void; canMutate: boolean }> = ({ base, onBack, onEdit, onDelete, onNavigate, canMutate }) => (
  <div style={{ padding: '1.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>拠点詳細</h2>
      {canMutate && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => onEdit(base)} style={{ ...btnStyle('#fff', '#3B82F6'), padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}>編集</button>
          <button onClick={() => onDelete(base.id)} style={{ ...btnStyle('#DC2626', '#FEF2F2'), padding: '0.5rem 1.25rem', fontSize: '0.875rem', border: '1px solid #fca5a5' }}>削除</button>
        </div>
      )}
    </div>
    <div onClick={onBack} style={{ cursor: 'pointer', color: '#6b7280', fontSize: '0.8125rem', marginBottom: '1rem' }}>
      &lt; 拠点一覧に戻る
    </div>

    <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
      {[
        { label: 'チャット設定', path: `/settings/chatbot?base=${encodeURIComponent(base.name)}` },
        { label: 'カレンダー', path: `/calendar?base=${encodeURIComponent(base.name)}` },
      ].map(item => (
        <button key={item.label} onClick={() => onNavigate(item.path)}
          style={{ padding: '8px 24px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', color: '#374151', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>
          {item.label}
        </button>
      ))}
    </div>

    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', backgroundColor: base.color }} />
        <span style={{ fontWeight: 600, fontSize: '1rem' }}>拠点情報</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <DetailRow label="ID" value={String(base.id)} />
          <DetailRow label="拠点名" value={base.name} />
          <DetailRow label="拠点名カナ" value={base.nameKana} />
          <DetailRow label="住所" value={base.address} />
          <DetailRow label="電話番号" value={base.phone} />
          <DetailRow label="マッチング条件" value={base.matchingCondition} />
          <DetailRow label="備考" value={base.notes} />
          <DetailRow label="登録日" value={base.registeredDate} />
        </tbody>
      </table>
    </div>

    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginTop: '1rem' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
        <span style={{ fontWeight: 600, fontSize: '1rem' }}>面接スロット設定</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <DetailRow label="受付時間" value={`${base.startTime || '09:00'} 〜 ${base.endTime || '18:00'}`} />
          <DetailRow label="スロット間隔" value={`${base.slotInterval || 30}分`} />
        </tbody>
      </table>
    </div>

  </div>
);

// ── メイン ──
const BaseManagement: React.FC = () => {
  const navigate = useNavigate();
  const { clientData, updateClientData, client } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(getBaseIdFromURL);

  const isChild = client?.accountType === 'child';
  const allBases = clientData?.bases || [];
  // 子アカウントは自拠点のみ閲覧可能
  const bases = useMemo(() => {
    if (isChild && client?.baseName) {
      return allBases.filter((b) => b.name === client.baseName);
    }
    return allBases;
  }, [allBases, isChild, client?.baseName]);
  const canEdit = !client || client.accountType === 'parent' || client.permissions.base;
  // 子アカウントは編集・追加・削除を禁止（自拠点情報は親が管轄）
  const canMutate = !isChild && canEdit;

  // popstate で戻る対応
  useEffect(() => {
    const onPop = () => setSelectedBaseId(getBaseIdFromURL());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goDetail = useCallback((id: number) => {
    setBaseIdInURL(id);
    setSelectedBaseId(id);
  }, []);

  const goList = useCallback(() => {
    setBaseIdInURL(null);
    setSelectedBaseId(null);
  }, []);

  const filtered = useMemo(() => {
    let result = bases;
    if (selectedFilter) {
      result = result.filter(b => b.name === selectedFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((b) => b.name.toLowerCase().includes(q) || (b.nameKana || '').toLowerCase().includes(q));
    }
    return result;
  }, [bases, search, selectedFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, registeredDate: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const openEdit = (b: Base) => {
    setEditId(b.id);
    setForm({
      name: b.name, nameKana: b.nameKana || '', address: b.address || '', phone: b.phone || '',
      matchingCondition: b.matchingCondition || '', notes: b.notes || '', registeredDate: b.registeredDate || '',
      color: b.color, slotInterval: b.slotInterval || 30, startTime: b.startTime || '09:00', endTime: b.endTime || '18:00',
    });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    updateClientData((data) => {
      const list = [...data.bases];
      const baseData: Base = {
        id: editId ?? (list.reduce((m, b) => Math.max(m, b.id), 0) + 1),
        name: form.name.trim(), nameKana: form.nameKana.trim(), address: form.address.trim(),
        phone: form.phone.trim(), matchingCondition: form.matchingCondition.trim(),
        notes: form.notes.trim(), registeredDate: form.registeredDate,
        color: form.color, slotInterval: form.slotInterval, startTime: form.startTime, endTime: form.endTime,
      };
      if (editId !== null) {
        const idx = list.findIndex((b) => b.id === editId);
        if (idx >= 0) list[idx] = baseData;
      } else {
        list.push(baseData);
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
    if (selectedBaseId === id) goList();
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  // ── 詳細ページ ──
  const selectedBase = selectedBaseId != null ? bases.find(b => b.id === selectedBaseId) : null;
  if (selectedBase) {
    return (
      <>
        <BaseDetail base={selectedBase} onBack={goList} onEdit={openEdit} onDelete={deleteBase} onNavigate={navigate} canMutate={canMutate} />
        {canMutate && (
          <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="拠点編集">
            <EditForm form={form} setForm={setForm} editId={editId} save={save} close={() => setModalOpen(false)} />
          </Modal>
        )}
      </>
    );
  }

  // ── 一覧ページ ──
  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>拠点管理</h2>
        {canMutate && (
          <button onClick={openAdd} style={btnStyle('#fff', '#3B82F6')}>+ 新規追加</button>
        )}
      </div>
      {isChild && (
        <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#F3F4F6', borderRadius: '6px', fontSize: '0.8125rem', color: '#4B5563', marginBottom: '0.75rem' }}>
          子アカウントは自拠点のみ閲覧できます（編集は本部アカウントから）
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="拠点名・カナで検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inputStyle, maxWidth: '250px' }}
        />
        <select
          value={selectedFilter}
          onChange={(e) => { setSelectedFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, maxWidth: '200px' }}
        >
          <option value="">全ての拠点</option>
          {bases.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {paged.map((b) => (
          <div
            key={b.id}
            onClick={() => goDetail(b.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
          >
            <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', backgroundColor: b.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{b.name}</span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>&gt;</span>
          </div>
        ))}
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

      {canMutate && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="新規拠点追加">
          <EditForm form={form} setForm={setForm} editId={editId} save={save} close={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
};

// ── 編集フォーム（共通） ──
const EditForm: React.FC<{
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  editId: number | null;
  save: () => void;
  close: () => void;
}> = ({ form, setForm, editId, save, close }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
      <div>
        <label style={lblStyle}>拠点名 *</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="例: 東京本社" />
      </div>
      <div>
        <label style={lblStyle}>拠点名カナ</label>
        <input value={form.nameKana} onChange={(e) => setForm((f) => ({ ...f, nameKana: e.target.value }))} style={inputStyle} placeholder="例: トウキョウホンシャ" />
      </div>
    </div>
    <div>
      <label style={lblStyle}>住所</label>
      <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} style={inputStyle} placeholder="例: 東京都千代田区丸の内1-1-1" />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
      <div>
        <label style={lblStyle}>電話番号</label>
        <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={inputStyle} placeholder="例: 03-1234-5678" />
      </div>
      <div>
        <label style={lblStyle}>登録日</label>
        <input type="date" value={form.registeredDate} onChange={(e) => setForm((f) => ({ ...f, registeredDate: e.target.value }))} style={inputStyle} />
      </div>
    </div>
    <div>
      <label style={lblStyle}>マッチング条件</label>
      <input value={form.matchingCondition} onChange={(e) => setForm((f) => ({ ...f, matchingCondition: e.target.value }))} style={inputStyle} placeholder="例: 関東エリア希望者" />
    </div>
    <div>
      <label style={lblStyle}>備考</label>
      <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="備考を入力" />
    </div>
    <div>
      <label style={{ ...lblStyle, marginBottom: '0.5rem' }}>カラー</label>
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
      <button onClick={close} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
      <button onClick={save} style={btnStyle('#fff', '#3B82F6')}>{editId ? '更新' : '追加'}</button>
    </div>
  </div>
);

export default BaseManagement;
