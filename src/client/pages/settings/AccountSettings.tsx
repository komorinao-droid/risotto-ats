import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Member } from '@/types';
import { storage } from '@/utils/storage';
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.25rem',
  fontSize: '0.875rem',
  fontWeight: 500,
};

const sectionStyle: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  marginBottom: '1.5rem',
};

const planLabels: Record<string, string> = {
  trial: 'トライアル',
  standard: 'スタンダード',
  professional: 'プロフェッショナル',
  enterprise: 'エンタープライズ',
};

const AccountSettings: React.FC = () => {
  const { client } = useAuth();

  // Company info
  const [companyName, setCompanyName] = useState(client?.companyName || '');
  const [contactName, setContactName] = useState(client?.contactName || '');
  const [notificationEmail, setNotificationEmail] = useState(client?.notificationEmail || '');
  const [smsPhone, setSmsPhone] = useState(client?.smsPhone || '');
  const [companyMsg, setCompanyMsg] = useState('');

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Members
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberForm, setMemberForm] = useState<Omit<Member, 'id'>>({
    name: '',
    email: '',
    phone: '',
    notifyEmail: true,
    notifySms: false,
  });

  if (!client) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>ログインしてください。</div>;
  }

  const members = client.members || [];

  const saveCompanyInfo = () => {
    const clients = storage.getClients();
    const idx = clients.findIndex((c) => c.id === client.id);
    if (idx < 0) return;
    clients[idx] = {
      ...clients[idx],
      companyName: companyName.trim() || clients[idx].companyName,
      contactName: contactName.trim(),
      notificationEmail: notificationEmail.trim(),
      smsPhone: smsPhone.trim(),
    };
    storage.saveClients(clients);
    setCompanyMsg('保存しました');
    setTimeout(() => setCompanyMsg(''), 2000);
  };

  const changePassword = () => {
    setPwMsg(null);
    if (currentPw !== client.password) {
      setPwMsg({ type: 'error', text: '現在のパスワードが正しくありません。' });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ type: 'error', text: 'パスワードは6文字以上にしてください。' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: '新しいパスワードと確認が一致しません。' });
      return;
    }
    const clients = storage.getClients();
    const idx = clients.findIndex((c) => c.id === client.id);
    if (idx < 0) return;
    clients[idx] = { ...clients[idx], password: newPw };
    storage.saveClients(clients);
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setPwMsg({ type: 'success', text: 'パスワードを変更しました。' });
  };

  const addMember = () => {
    if (!memberForm.name.trim() || !memberForm.email.trim()) return;
    const clients = storage.getClients();
    const idx = clients.findIndex((c) => c.id === client.id);
    if (idx < 0) return;
    const maxId = (clients[idx].members || []).reduce((m, mem) => Math.max(m, mem.id), 0);
    const newMember: Member = {
      id: maxId + 1,
      name: memberForm.name.trim(),
      email: memberForm.email.trim(),
      phone: memberForm.phone.trim(),
      notifyEmail: memberForm.notifyEmail,
      notifySms: memberForm.notifySms,
    };
    clients[idx] = { ...clients[idx], members: [...(clients[idx].members || []), newMember] };
    storage.saveClients(clients);
    setMemberForm({ name: '', email: '', phone: '', notifyEmail: true, notifySms: false });
    setMemberModalOpen(false);
    // Force re-render via a reload workaround
    window.location.reload();
  };

  const deleteMember = (memberId: number) => {
    if (!window.confirm('このメンバーを削除しますか？')) return;
    const clients = storage.getClients();
    const idx = clients.findIndex((c) => c.id === client.id);
    if (idx < 0) return;
    clients[idx] = { ...clients[idx], members: (clients[idx].members || []).filter((m) => m.id !== memberId) };
    storage.saveClients(clients);
    window.location.reload();
  };

  const toggleMemberNotify = (memberId: number, field: 'notifyEmail' | 'notifySms') => {
    const clients = storage.getClients();
    const idx = clients.findIndex((c) => c.id === client.id);
    if (idx < 0) return;
    clients[idx] = {
      ...clients[idx],
      members: (clients[idx].members || []).map((m) =>
        m.id === memberId ? { ...m, [field]: !m[field] } : m
      ),
    };
    storage.saveClients(clients);
    window.location.reload();
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>アカウント設定</h2>

      {/* Account info display */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>アカウント情報</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: '#6b7280' }}>クライアントID:</span>
          <span style={{ fontWeight: 500 }}>{client.id}</span>
          <span style={{ color: '#6b7280' }}>アカウント種別:</span>
          <span style={{ fontWeight: 500 }}>{client.accountType === 'parent' ? '親アカウント' : '子アカウント'}</span>
          {client.accountType === 'child' && client.baseName && (
            <>
              <span style={{ color: '#6b7280' }}>担当拠点:</span>
              <span style={{ fontWeight: 500 }}>{client.baseName}</span>
            </>
          )}
          <span style={{ color: '#6b7280' }}>契約プラン:</span>
          <span style={{ fontWeight: 500 }}>{planLabels[client.plan] || client.plan}</span>
        </div>
      </div>

      {/* Company info */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>会社情報</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>会社名</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>管理者名</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>通知メールアドレス</label>
            <input type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>SMS電話番号</label>
            <input value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} style={inputStyle} placeholder="090-XXXX-XXXX" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={saveCompanyInfo} style={btnStyle('#fff', '#3B82F6')}>保存</button>
            {companyMsg && (
              <span style={{ fontSize: '0.8125rem', color: '#22C55E', fontWeight: 500 }}>{companyMsg}</span>
            )}
          </div>
        </div>
      </div>

      {/* Password */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>パスワード変更</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '400px' }}>
          <div>
            <label style={labelStyle}>現在のパスワード</label>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>新しいパスワード（6文字以上）</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>新しいパスワード（確認）</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} />
          </div>
          {pwMsg && (
            <div style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: pwMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
              color: pwMsg.type === 'success' ? '#166534' : '#DC2626',
              fontSize: '0.8125rem',
            }}>
              {pwMsg.text}
            </div>
          )}
          <div>
            <button onClick={changePassword} style={btnStyle('#fff', '#3B82F6')}>パスワード変更</button>
          </div>
        </div>
      </div>

      {/* Members */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>メンバー管理</h3>
          <button onClick={() => setMemberModalOpen(true)} style={btnStyle('#fff', '#3B82F6')}>+ メンバー追加</button>
        </div>

        {members.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
            メンバーが登録されていません。
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>氏名</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>メール</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>電話</th>
                <th style={{ textAlign: 'center', padding: '0.5rem' }}>メール通知</th>
                <th style={{ textAlign: 'center', padding: '0.5rem' }}>SMS通知</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 500 }}>{m.name}</td>
                  <td style={{ padding: '0.5rem' }}>{m.email}</td>
                  <td style={{ padding: '0.5rem' }}>{m.phone || '-'}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={m.notifyEmail}
                      onChange={() => toggleMemberNotify(m.id, 'notifyEmail')}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={m.notifySms}
                      onChange={() => toggleMemberNotify(m.id, 'notifySms')}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    <button onClick={() => deleteMember(m.id)} style={btnStyle('#DC2626', '#FEF2F2')}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add member modal */}
      <Modal isOpen={memberModalOpen} onClose={() => setMemberModalOpen(false)} title="メンバー追加">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>氏名 *</label>
            <input value={memberForm.name} onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>メールアドレス *</label>
            <input type="email" value={memberForm.email} onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>電話番号</label>
            <input value={memberForm.phone} onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={memberForm.notifyEmail} onChange={(e) => setMemberForm((f) => ({ ...f, notifyEmail: e.target.checked }))} />
              メール通知
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={memberForm.notifySms} onChange={(e) => setMemberForm((f) => ({ ...f, notifySms: e.target.checked }))} />
              SMS通知
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={() => setMemberModalOpen(false)} style={btnStyle('#374151', '#F3F4F6')}>キャンセル</button>
            <button onClick={addMember} style={btnStyle('#fff', '#3B82F6')}>追加</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AccountSettings;
