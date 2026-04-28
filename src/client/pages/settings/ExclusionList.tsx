import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ExclusionEntry } from '@/types';
import Modal from '@/components/Modal';

const PAGE_SIZE = 30;

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

const typeLabels: Record<ExclusionEntry['type'], string> = {
  email: 'メール',
  phone: '電話',
  name_birth: '氏名+生年月日',
};

const ExclusionList: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<{ email: boolean; phone: boolean; name_birth: boolean }>({
    email: true,
    phone: true,
    name_birth: true,
  });
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState<ExclusionEntry['type']>('email');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formName, setFormName] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [addResult, setAddResult] = useState<string | null>(null);

  const exclusionList = clientData?.exclusionList || [];
  const statuses = clientData?.statuses || [];
  const canEdit = !client || client.accountType === 'parent' || client.permissions.exclusion;

  // Find inactive statuses to use for auto-exclusion
  const excludeStatus = statuses.find((s) => s.name === '対象外') || statuses.find((s) => !s.active);

  const filtered = useMemo(() => {
    let list = exclusionList.filter((e) => typeFilter[e.type]);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => {
        if (e.email && e.email.toLowerCase().includes(q)) return true;
        if (e.phone && e.phone.includes(q)) return true;
        if (e.name && e.name.toLowerCase().includes(q)) return true;
        if (e.birthDate && e.birthDate.includes(q)) return true;
        return false;
      });
    }
    return list;
  }, [exclusionList, typeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAdd = () => {
    setFormType('email');
    setFormEmail('');
    setFormPhone('');
    setFormName('');
    setFormBirthDate('');
    setAddResult(null);
    setModalOpen(true);
  };

  const addEntry = () => {
    let entry: Omit<ExclusionEntry, 'id'>;
    if (formType === 'email') {
      if (!formEmail.trim()) return;
      entry = { type: 'email', email: formEmail.trim() };
    } else if (formType === 'phone') {
      if (!formPhone.trim()) return;
      entry = { type: 'phone', phone: formPhone.trim() };
    } else {
      if (!formName.trim() || !formBirthDate) return;
      entry = { type: 'name_birth', name: formName.trim(), birthDate: formBirthDate };
    }

    // 重複チェック（同じ条件のエントリが既にあれば登録しない）
    const existingList = clientData?.exclusionList || [];
    const duplicate = existingList.find((e) => {
      if (e.type !== entry.type) return false;
      if (entry.type === 'email') return e.email?.toLowerCase() === entry.email?.toLowerCase();
      if (entry.type === 'phone') return (e.phone || '').replace(/[-\s]/g, '') === (entry.phone || '').replace(/[-\s]/g, '');
      if (entry.type === 'name_birth') return e.name === entry.name && e.birthDate === entry.birthDate;
      return false;
    });
    if (duplicate) {
      setAddResult('既に同じ条件が登録されています。');
      return;
    }

    let matchCount = 0;

    updateClientData((data) => {
      const maxId = data.exclusionList.reduce((m, e) => Math.max(m, e.id), 0);
      const newEntry: ExclusionEntry = { id: maxId + 1, ...entry };

      // Check existing applicants for matches
      const updatedApplicants = data.applicants.map((a) => {
        let matches = false;
        if (formType === 'email' && a.email === entry.email) matches = true;
        if (formType === 'phone' && a.phone === entry.phone) matches = true;
        if (formType === 'name_birth' && a.name === entry.name && a.birthDate === entry.birthDate) matches = true;

        if (matches && a.active) {
          matchCount++;
          return {
            ...a,
            stage: excludeStatus?.name || '対象外',
            active: false,
          };
        }
        return a;
      });

      return {
        ...data,
        exclusionList: [...data.exclusionList, newEntry],
        applicants: updatedApplicants,
      };
    });

    setAddResult(
      matchCount > 0
        ? `登録しました。既存応募者 ${matchCount}件のステータスを変更しました。`
        : '登録しました。'
    );
  };

  const deleteEntry = (id: number) => {
    if (!window.confirm('この除外ルールを削除しますか？')) return;
    updateClientData((data) => ({
      ...data,
      exclusionList: data.exclusionList.filter((e) => e.id !== id),
    }));
  };

  const displayValue = (e: ExclusionEntry): string => {
    if (e.type === 'email') return e.email || '';
    if (e.type === 'phone') return e.phone || '';
    return `${e.name || ''} / ${e.birthDate || ''}`;
  };

  if (!canEdit) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>この機能へのアクセス権がありません。</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>除外リスト管理</h2>
        <button onClick={openAdd} style={btnStyle('#fff', '#3B82F6')}>+ 新規登録</button>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        {(Object.keys(typeLabels) as ExclusionEntry['type'][]).map((t) => (
          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={typeFilter[t]}
              onChange={() => { setTypeFilter((f) => ({ ...f, [t]: !f[t] })); setPage(1); }}
            />
            {typeLabels[t]}
          </label>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="検索..."
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
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>タイプ</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>値</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', width: '80px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{
                    padding: '0.125rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    backgroundColor: e.type === 'email' ? '#EFF6FF' : e.type === 'phone' ? '#F0FDF4' : '#FEF3C7',
                    color: e.type === 'email' ? '#1E40AF' : e.type === 'phone' ? '#166534' : '#92400E',
                  }}>
                    {typeLabels[e.type]}
                  </span>
                </td>
                <td style={{ padding: '0.5rem' }}>{displayValue(e)}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                  <button onClick={() => deleteEntry(e.id)} style={btnStyle('#DC2626', '#FEF2F2')}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>除外ルールが登録されていません。</div>
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

      {/* Add Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="除外ルール登録">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>タイプ</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {(Object.keys(typeLabels) as ExclusionEntry['type'][]).map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="radio" name="excType" checked={formType === t} onChange={() => setFormType(t)} />
                  {typeLabels[t]}
                </label>
              ))}
            </div>
          </div>

          {formType === 'email' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>メールアドレス</label>
              <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} style={inputStyle} placeholder="example@mail.com" />
            </div>
          )}

          {formType === 'phone' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>電話番号</label>
              <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} style={inputStyle} placeholder="090-1234-5678" />
            </div>
          )}

          {formType === 'name_birth' && (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>氏名</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} style={inputStyle} placeholder="山田 太郎" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>生年月日</label>
                <input type="date" value={formBirthDate} onChange={(e) => setFormBirthDate(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}

          {addResult && (
            <div style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: '#F0FDF4',
              color: '#166534',
              fontSize: '0.8125rem',
            }}>
              {addResult}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={() => setModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>閉じる</button>
            <button onClick={addEntry} style={btnStyle('#fff', '#3B82F6')}>登録</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ExclusionList;
