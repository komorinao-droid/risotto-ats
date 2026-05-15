import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  baseRepository,
  clientRepository,
  recruitmentOpeningRepository,
  resolveDataOwnerId,
} from '@/repositories';
import type { Base, Job, RecruitmentOpeningStatus } from '@/types';
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

// ── 職種別募集状況セクション (Step 1, 2026-05 追加) ──
//   拠点詳細内で「拠点 × 職種」ごとに `募集中 / 充足` を切り替えるカード。
//   応募フロー (AddApplicantModal / CSV / 面接予約 / チャットボット) には Step 1 では接続せず、
//   状態の保存・読み出し・操作ログ記録のみを行う。
const RecruitmentOpeningSection: React.FC<{ base: Base }> = ({ base }) => {
  const { clientData, client, logAction, reloadClientData } = useAuth();

  // 子アカウントは自拠点のみ編集可。親アカウントは全拠点編集可。
  const editable = useMemo(() => {
    if (!client) return false;
    if (client.accountType === 'parent') return true;
    // 子アカウント: 自拠点と一致する場合のみ編集可
    return client.baseName === base.name;
  }, [client, base.name]);

  // 拠点の職種一覧（拠点別 override があれば優先）
  const jobs: Job[] = useMemo(() => {
    if (!clientData) return [];
    return clientData.jobsByBase?.[base.name] ?? clientData.jobs ?? [];
  }, [clientData, base.name]);

  // 現状のステータスマップ（未登録は 'open' 扱い）
  const initialMap = useMemo<Record<string, RecruitmentOpeningStatus>>(() => {
    const map: Record<string, RecruitmentOpeningStatus> = {};
    const openings = clientData?.recruitmentOpenings ?? [];
    for (const j of jobs) {
      const found = openings.find((o) => o.baseName === base.name && o.jobName === j.name);
      map[j.name] = found?.status ?? 'open';
    }
    return map;
  }, [clientData?.recruitmentOpenings, jobs, base.name]);

  const [pending, setPending] = useState(initialMap);
  const [saving, setSaving] = useState(false);

  // initialMap が再生成されたら pending を同期（拠点切替 / リロード後）
  useEffect(() => {
    setPending(initialMap);
  }, [initialMap]);

  const dirty = useMemo(() => {
    return jobs.some((j) => (pending[j.name] ?? 'open') !== (initialMap[j.name] ?? 'open'));
  }, [jobs, pending, initialMap]);

  // 「充足」ステータスが statuses に登録されているか
  //  - Step 1 ではガイダンス表示のみ。自動作成はしない
  //  - Step 2 で filled 応募者を「充足」ステータスに自動振り分けする予定
  const hasFilledStatus = useMemo(() => {
    return (clientData?.statuses ?? []).some((s) => s.name === '充足');
  }, [clientData?.statuses]);

  const handleSave = () => {
    if (!client || !dirty || saving) return;
    const ownerId = resolveDataOwnerId(client);
    // 変更があった行のみ送る（無駄な書込を避ける）
    const changedInputs = jobs
      .filter((j) => (pending[j.name] ?? 'open') !== (initialMap[j.name] ?? 'open'))
      .map((j) => ({
        baseName: base.name,
        jobName: j.name,
        status: pending[j.name] ?? 'open',
      }));
    if (changedInputs.length === 0) return;
    setSaving(true);
    const operator = client.contactName || client.companyName;
    recruitmentOpeningRepository.bulkSetStatus(ownerId, changedInputs, operator);
    const summary = changedInputs
      .map((c) => `${c.jobName}: ${c.status === 'filled' ? '充足' : '募集中'}`)
      .join(' / ');
    logAction('setting', '募集状況変更', base.name, summary);
    reloadClientData();
    setSaving(false);
  };

  const handleReset = () => {
    setPending(initialMap);
  };

  if (jobs.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginTop: '1rem' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>職種別募集状況</span>
        </div>
        <div style={{ padding: '1rem 1.25rem', fontSize: '0.875rem', color: '#9ca3af' }}>
          職種が登録されていません。先に「職種管理」から職種を追加してください。
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginTop: '1rem' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>職種別募集状況</span>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            この拠点で募集中か充足かを職種ごとに管理します。応募フローへの自動反映は今後のアップデートで追加されます。
          </div>
        </div>
        {editable && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleReset}
              disabled={!dirty || saving}
              style={{ ...btnStyle('#374151', '#F3F4F6'), opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? 'not-allowed' : 'pointer' }}
            >
              戻す
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              style={{ ...btnStyle('#fff', '#3B82F6'), opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
      {!editable && (
        <div style={{ padding: '0.5rem 1.25rem', backgroundColor: '#F3F4F6', fontSize: '0.75rem', color: '#4B5563' }}>
          閲覧のみ可能です（編集は本部アカウントまたは自拠点の子アカウントから）。
        </div>
      )}
      {!hasFilledStatus && (
        <div style={{ padding: '0.625rem 1.25rem', backgroundColor: '#FFF7ED', borderBottom: '1px solid #FED7AA', fontSize: '0.75rem', color: '#9A3412' }}>
          ヒント: 「ステータス管理」に <strong>「充足」</strong> ステータスを追加しておくと、今後のアップデートで充足拠点への応募が自動でこのステータスに振り分けられます。
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>職種</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>状況</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const current = pending[j.name] ?? 'open';
              return (
                <tr key={j.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <div style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', backgroundColor: j.color || '#9ca3af', flexShrink: 0 }} />
                    {j.name}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'inline-flex', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
                      {([
                        { value: 'open' as const, label: '募集中', activeBg: '#3B82F6', activeColor: '#fff' },
                        { value: 'filled' as const, label: '充足', activeBg: '#DC2626', activeColor: '#fff' },
                      ]).map((opt) => {
                        const active = current === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => editable && setPending((p) => ({ ...p, [j.name]: opt.value }))}
                            disabled={!editable}
                            aria-pressed={active}
                            style={{
                              padding: '0.375rem 0.875rem',
                              border: 'none',
                              backgroundColor: active ? opt.activeBg : '#fff',
                              color: active ? opt.activeColor : '#6b7280',
                              fontSize: '0.8125rem',
                              fontWeight: active ? 600 : 400,
                              cursor: editable ? 'pointer' : 'not-allowed',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

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

    <RecruitmentOpeningSection base={base} />

  </div>
);

// ── メイン ──
const BaseManagement: React.FC = () => {
  const navigate = useNavigate();
  const { clientData, client, logAction, reloadClientData } = useAuth();
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
    if (!client) return;
    const isNew = editId === null;
    const ownerId = resolveDataOwnerId(client);
    const fields: Omit<Base, 'id'> = {
      name: form.name.trim(), nameKana: form.nameKana.trim(), address: form.address.trim(),
      phone: form.phone.trim(), matchingCondition: form.matchingCondition.trim(),
      notes: form.notes.trim(), registeredDate: form.registeredDate,
      color: form.color, slotInterval: form.slotInterval, startTime: form.startTime, endTime: form.endTime,
    };
    if (editId !== null) {
      // L-2: rename 時に applicants/events/slotSettings/*ByBase は追従させない既存挙動を維持
      //      （baseRepository.update も rename カスケードを実装していない）
      baseRepository.update(ownerId, editId, fields);
    } else {
      baseRepository.create(ownerId, fields);
    }
    // ClientData を再読込して画面に反映
    reloadClientData();
    logAction('setting', isNew ? '拠点追加' : '拠点編集', form.name.trim());
    setModalOpen(false);
  };

  const deleteBase = (id: number) => {
    const base = bases.find((b) => b.id === id);
    if (!base) return;
    if (!client) return;
    const ownerId = resolveDataOwnerId(client);
    // 関連データの件数を確認（confirm dialog 表示用）
    const relatedApplicants = clientData?.applicants.filter((a) => a.base === base.name).length || 0;
    const relatedEvents = clientData?.events.filter((e) => e.base === base.name).length || 0;
    // この拠点専用の子アカウント数（confirm dialog 表示用）
    // M-8: storage.getClients() 直叩きから clientRepository.listChildren() 経由に置換。
    //   listChildren は accountType==='child' && parentId===ownerId を内部で絞るため、
    //   ここでは baseName 一致だけを追加でフィルタする。
    const relatedChildAccounts = clientRepository
      .listChildren(ownerId)
      .filter((c) => c.baseName === base.name).length;
    const warning = relatedApplicants || relatedEvents || relatedChildAccounts
      ? `\n\n⚠ 関連データもクリアされます:\n・応募者の拠点指定: ${relatedApplicants}件\n・面接予定: ${relatedEvents}件${relatedChildAccounts ? `\n・子アカウント: ${relatedChildAccounts}件（拠点指定が外れます。アカウント自体は残ります）` : ''}\n（応募者・面接イベント自体は削除されず、拠点情報のみクリアされます）`
      : '';
    if (!window.confirm(`"${base.name}" を削除しますか？${warning}`)) return;

    // L-3: 8 配列カスケード + 子アカウント baseName クリアを Repository に集約
    const result = baseRepository.deleteWithCascade(ownerId, id);
    // removed=false は base 不在のレース（同時に他タブで削除された等）。no-op 扱い
    if (!result.removed) return;
    reloadClientData();
    logAction(
      'setting',
      '拠点削除',
      base.name,
      `応募者${result.clearedApplicantBaseCount}件・面接${result.removedEventCount}件・子アカ${result.detachedChildAccountCount}件のbase指定もクリア`,
    );
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
