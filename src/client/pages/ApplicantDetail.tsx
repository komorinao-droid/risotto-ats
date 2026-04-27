import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertTriangle, Check, Sparkles, Loader2 } from 'lucide-react';
import { resolveJobs, resolveSources, resolveScreeningCriteria, hasScreeningJobOverride } from '@/utils/baseScope';
import { useAuth } from '@/contexts/AuthContext';
import Tabs from '@/components/Tabs';
import Modal from '@/components/Modal';
import SearchableSelect from '@/components/SearchableSelect';
import { getColorDef } from '@/components/ColorPalette';
import ScheduleInterviewModal from '@/client/components/ScheduleInterviewModal';
import { normalizeFurigana } from '@/utils/furigana';
import { warekiToDate, dateToWareki } from '@/utils/wareki';
import { calcAge, formatDateJP, today, dayOfWeekJP } from '@/utils/date';
import type { Applicant, InterviewEvent, ClientData, PrefDateTime } from '@/types';

/** 旧フォーマット（string）と新フォーマット（PrefDateTime）両方に対応 */
function normalizePrefDate(d: PrefDateTime | string): PrefDateTime {
  if (typeof d === 'string') return { date: d, time: '' };
  return d;
}

/* =======================================
   URL query param helpers
   ======================================= */
function getApplicantIdFromURL(): number | null {
  const params = new URLSearchParams(window.location.search);
  const val = params.get('applicant');
  return val ? Number(val) : null;
}

function setApplicantIdInURL(id: number | null) {
  const url = new URL(window.location.href);
  if (id != null) {
    url.searchParams.set('applicant', String(id));
  } else {
    url.searchParams.delete('applicant');
  }
  window.history.pushState({}, '', url.toString());
}

/* =======================================
   Shared styles
   ======================================= */
const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  marginBottom: '1rem',
  overflow: 'hidden',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #e5e7eb',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '0.9375rem',
  fontWeight: 700,
  color: '#111827',
  margin: 0,
};

const cardBodyStyle: React.CSSProperties = {
  padding: '1rem',
};

const tableRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  alignItems: 'center',
  padding: '0.5rem 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.8125rem',
};

const tableLabelStyle: React.CSSProperties = {
  color: '#6b7280',
  fontWeight: 500,
  fontSize: '0.8125rem',
};

const tableValueStyle: React.CSSProperties = {
  color: '#111827',
  fontSize: '0.8125rem',
};

const smallInputStyle: React.CSSProperties = {
  padding: '0.375rem 0.625rem',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  width: '100%',
  boxSizing: 'border-box',
};

const btnOrange: React.CSSProperties = {
  padding: '0.375rem 0.875rem',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: '#F97316',
  color: '#fff',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.375rem 0.875rem',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#374151',
  fontSize: '0.8125rem',
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  padding: '0.375rem 0.875rem',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: '#EF4444',
  color: '#fff',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
};

/* =======================================
   Main Component
   ======================================= */
interface ApplicantDetailProps {
  applicantId?: number | null;
  onBack?: () => void;
}

const ApplicantDetail: React.FC<ApplicantDetailProps> = ({ applicantId: propId, onBack }) => {
  const { clientData, updateClientData, logAction } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(propId ?? getApplicantIdFromURL());
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // popstate listener for deep linking
  useEffect(() => {
    const handler = () => {
      const id = getApplicantIdFromURL();
      setSelectedId(id);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // Sync URL when selectedId changes (but not on popstate)
  useEffect(() => {
    if (propId === undefined) {
      const urlId = getApplicantIdFromURL();
      if (urlId !== selectedId) {
        setApplicantIdInURL(selectedId);
      }
    }
  }, [selectedId, propId]);

  const applicant = useMemo(
    () => clientData?.applicants.find((a) => a.id === selectedId) ?? null,
    [clientData, selectedId]
  );

  const updateApplicant = useCallback(
    (updater: (a: Applicant) => Applicant) => {
      if (!applicant) return;
      updateClientData((data) => ({
        ...data,
        applicants: data.applicants.map((a) => (a.id === applicant.id ? updater(a) : a)),
      }));
    },
    [applicant, updateClientData]
  );

  const handleDelete = useCallback(() => {
    if (!applicant) return;
    updateClientData((data) => ({
      ...data,
      applicants: data.applicants.filter((a) => a.id !== applicant.id),
      events: data.events.filter((e) => e.applicantId !== applicant.id),
    }));
    logAction('applicant', '応募者削除', applicant.name || String(applicant.id));
    setDeleteConfirm(false);
    if (onBack) onBack();
    else {
      setSelectedId(null);
      setApplicantIdInURL(null);
    }
  }, [applicant, updateClientData, onBack]);

  // (needsAction handling moved below with action modal state)

  if (!clientData) {
    return <div style={{ padding: '2rem', color: '#6B7280' }}>Loading...</div>;
  }

  if (!applicant) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ color: '#6B7280', marginBottom: '1rem' }}>Applicant not found.</div>
        {onBack && (
          <button onClick={onBack} style={btnSecondary}>
            Back
          </button>
        )}
      </div>
    );
  }

  const events = clientData.events.filter((e) => e.applicantId === applicant.id);

  // Duplicate check (with count)
  const { isDuplicate, duplicateCount } = useMemo(() => {
    if (!applicant || !clientData) return { isDuplicate: false, duplicateCount: 0 };
    const normalizedPhone = applicant.phone?.replace(/[-\s]/g, '') || '';
    const matches = clientData.applicants.filter(
      (a) =>
        a.id !== applicant.id &&
        ((a.name === applicant.name && applicant.name) ||
          (normalizedPhone && a.phone?.replace(/[-\s]/g, '') === normalizedPhone))
    );
    return { isDuplicate: matches.length > 0, duplicateCount: matches.length + 1 };
  }, [applicant, clientData]);

  // Action modal state
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionDate, setActionDate] = useState('');
  const [actionTime, setActionTime] = useState('');
  const [actionMemo, setActionMemo] = useState('');

  const handleNeedsActionClick = useCallback(() => {
    if (!applicant) return;
    if (applicant.needsAction) {
      // Currently active -> confirm to deactivate
      if (window.confirm('要対応を解除しますか？')) {
        updateApplicant((a) => ({
          ...a,
          needsAction: false,
          actionDate: '',
          actionTime: '',
          actionMemo: '',
        }));
      }
    } else {
      // Open modal to set action
      setActionDate(today());
      setActionTime('');
      setActionMemo('');
      setActionModalOpen(true);
    }
  }, [applicant, updateApplicant]);

  const handleActionModalSave = useCallback(() => {
    if (!actionDate) return;
    updateApplicant((a) => ({
      ...a,
      needsAction: true,
      actionDate,
      actionTime,
      actionMemo,
    }));
    setActionModalOpen(false);
  }, [actionDate, actionTime, actionMemo, updateApplicant]);

  return (
    <div style={{ padding: '0' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#FAFBFC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {onBack && (
            <button onClick={onBack} style={{ ...btnSecondary, padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
              &#8592; 戻る
            </button>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>{applicant.name}</h2>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              {applicant.furigana && <span>{applicant.furigana}</span>}
              {applicant.furigana && applicant.base && <span> | </span>}
              {applicant.base && <span>{applicant.base}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Needs Action toggle */}
          <button
            onClick={handleNeedsActionClick}
            style={{
              padding: '0.375rem 0.75rem',
              border: applicant.needsAction ? '2px solid #F97316' : '1px solid #D1D5DB',
              borderRadius: '6px',
              backgroundColor: applicant.needsAction ? 'rgba(249,115,22,0.08)' : '#fff',
              color: applicant.needsAction ? '#F97316' : '#6B7280',
              fontSize: '0.8125rem',
              fontWeight: applicant.needsAction ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            要対応
          </button>
          <button
            onClick={() => setDeleteConfirm(true)}
            style={{ ...btnDanger, fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
          >
            削除
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 1.5rem 1.5rem' }}>
        <Tabs
          tabs={[
            {
              key: 'info',
              label: '応募情報',
              content: (
                <InfoTab
                  applicant={applicant}
                  clientData={clientData}
                  events={events}
                  isDuplicate={isDuplicate}
                  duplicateCount={duplicateCount}
                  updateApplicant={updateApplicant}
                  updateClientData={updateClientData}
                />
              ),
            },
            {
              key: 'screening',
              label: 'AIスクリーニング',
              content: (
                <ScreeningTab
                  applicant={applicant}
                  clientData={clientData}
                  updateApplicant={updateApplicant}
                />
              ),
            },
            { key: 'email', label: 'メール', content: <EmailTab /> },
            { key: 'files', label: 'ファイル', content: <FilesTab applicant={applicant} /> },
            { key: 'webinterview', label: 'WEB面接', content: <WebInterviewTab /> },
            {
              key: 'jobinfo',
              label: '求人情報',
              content: (
                <JobInfoTab
                  applicant={applicant}
                  updateApplicant={updateApplicant}
                />
              ),
            },
            {
              key: 'history',
              label: '過去の応募',
              content: (
                <HistoryTab
                  applicant={applicant}
                  clientData={clientData}
                  onNavigate={(id) => {
                    setSelectedId(id);
                    setApplicantIdInURL(id);
                  }}
                />
              ),
            },
          ]}
        />
      </div>

      {/* Delete confirmation */}
      <Modal isOpen={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="応募者の削除" width="400px">
        <div>
          <p style={{ fontSize: '0.875rem', marginTop: 0 }}>
            <strong>{applicant.name}</strong> のデータを完全に削除します。この操作は元に戻せません。
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button onClick={() => setDeleteConfirm(false)} style={btnSecondary}>キャンセル</button>
            <button onClick={handleDelete} style={btnDanger}>削除する</button>
          </div>
        </div>
      </Modal>

      {/* Action modal */}
      <Modal isOpen={actionModalOpen} onClose={() => setActionModalOpen(false)} title="要対応の設定" width="420px">
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              次回対応日<span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
            </label>
            <input
              type="date"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              style={{ ...smallInputStyle, width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              対応時間
            </label>
            <input
              type="time"
              value={actionTime}
              onChange={(e) => setActionTime(e.target.value)}
              style={{ ...smallInputStyle, width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              対応メモ
            </label>
            <textarea
              value={actionMemo}
              onChange={(e) => setActionMemo(e.target.value)}
              placeholder="対応内容を入力..."
              rows={3}
              style={{
                ...smallInputStyle,
                width: '100%',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setActionModalOpen(false)} style={btnSecondary}>取消</button>
            <button
              onClick={handleActionModalSave}
              disabled={!actionDate}
              style={{
                ...btnOrange,
                opacity: actionDate ? 1 : 0.5,
                cursor: actionDate ? 'pointer' : 'not-allowed',
              }}
            >
              設定
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* =======================================
   Tab 1: Info (2-column layout)
   ======================================= */
interface InfoTabProps {
  applicant: Applicant;
  clientData: ClientData;
  events: InterviewEvent[];
  isDuplicate: boolean;
  duplicateCount: number;
  updateApplicant: (updater: (a: Applicant) => Applicant) => void;
  updateClientData: (updater: (data: ClientData) => ClientData) => void;
}

const InfoTab: React.FC<InfoTabProps> = ({
  applicant,
  clientData,
  events,
  isDuplicate,
  duplicateCount,
  updateApplicant,
  updateClientData,
}) => {
  const { logAction, client } = useAuth();
  const isChild = client?.accountType === 'child';
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Applicant>>({});
  const [birthDateInput, setBirthDateInput] = useState('');
  const [baseChangeWarning, setBaseChangeWarning] = useState('');
  const [baseBlockModal, setBaseBlockModal] = useState(false);
  const [pendingBaseChange, setPendingBaseChange] = useState<string | null>(null);

  // 未来日の面接イベント
  const futureEvents = events.filter((e) => e.date >= today());

  // Memo
  const [memoText, setMemoText] = useState(applicant.note || '');
  const [memoSaved, setMemoSaved] = useState(true);
  const memoTimer = useRef<ReturnType<typeof setTimeout>>();

  // Interview schedule modal
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [cancelConfirmEvent, setCancelConfirmEvent] = useState<InterviewEvent | null>(null);

  // Sync memo with prop
  useEffect(() => {
    setMemoText(applicant.note || '');
    setMemoSaved(true);
  }, [applicant.note]);

  function startEdit() {
    setEditData({
      name: applicant.name,
      furigana: applicant.furigana,
      date: applicant.date,
      age: applicant.age,
      birthDate: applicant.birthDate,
      gender: applicant.gender,
      phone: applicant.phone,
      email: applicant.email,
      currentJob: applicant.currentJob,
      base: applicant.base,
      src: applicant.src,
      job: applicant.job,
    });
    setBirthDateInput(applicant.birthDate || '');
    setBaseChangeWarning('');
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditData({});
    setBaseChangeWarning('');
  }

  function saveEdit() {
    // 二重チェック：未来面接がある状態で拠点が変わっていればブロック
    if (editData.base && editData.base !== applicant.base && futureEvents.length > 0) {
      setBaseBlockModal(true);
      return;
    }
    updateApplicant((a) => ({
      ...a,
      ...(editData as Partial<Applicant>),
    }));
    logAction('applicant', '応募者編集', applicant.name || String(applicant.id));
    setIsEditing(false);
    setEditData({});
    setBaseChangeWarning('');
  }

  function handleBirthDateChange(val: string) {
    setBirthDateInput(val);
    const converted = warekiToDate(val);
    if (converted) {
      const age = calcAge(converted);
      setEditData((prev) => ({ ...prev, birthDate: converted, age }));
    } else {
      setEditData((prev) => ({ ...prev, birthDate: val }));
    }
  }

  function handleFuriganaChange(val: string) {
    setEditData((prev) => ({ ...prev, furigana: normalizeFurigana(val) }));
  }

  function handleBaseChange(val: string) {
    if (val !== applicant.base && futureEvents.length > 0) {
      // 未来面接がある場合はブロック
      setBaseBlockModal(true);
      return;
    }
    // 子アカウントが拠点を変更しようとした場合、閲覧不可になる旨を確認
    if (val !== applicant.base && isChild) {
      setPendingBaseChange(val);
      return;
    }
    setEditData((prev) => ({ ...prev, base: val }));
    setBaseChangeWarning('');
  }

  function confirmBaseChange() {
    if (pendingBaseChange) {
      setEditData((prev) => ({ ...prev, base: pendingBaseChange }));
      setBaseChangeWarning('');
    }
    setPendingBaseChange(null);
  }


  function saveMemo(text: string) {
    updateApplicant((a) => ({ ...a, note: text }));
    setMemoSaved(true);
  }

  function handleMemoChange(text: string) {
    setMemoText(text);
    setMemoSaved(false);
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => saveMemo(text), 1200);
  }

  function insertHearingTemplate(template: string) {
    const newText = memoText ? memoText + '\n\n' + template : template;
    setMemoText(newText);
    setMemoSaved(false);
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => saveMemo(newText), 1200);
  }

  function handleStatusChange(newStatus: string) {
    const prev = applicant.stage;
    updateApplicant((a) => ({ ...a, stage: newStatus, subStatus: '' }));
    logAction('applicant', 'ステータス変更', applicant.name || String(applicant.id), `${prev} → ${newStatus}`);
  }

  function handleSubStatusChange(sub: string) {
    updateApplicant((a) => ({ ...a, subStatus: sub }));
  }

  function handleIntResult(result: string) {
    updateApplicant((a) => ({ ...a, intResult: result }));
  }

  function handleScheduled(event: InterviewEvent) {
    updateClientData((data) => ({
      ...data,
      events: [...data.events, event],
      applicants: data.applicants.map((a) =>
        a.id === applicant.id ? { ...a, stage: '面接確定' } : a
      ),
    }));
  }

  function handleCancelEvent(eventId: number) {
    const ev = events.find((e) => e.id === eventId);
    updateClientData((data) => {
      const cancelledEntry = ev ? {
        date: ev.date,
        start: ev.start,
        end: ev.end,
        base: ev.base,
        method: ev.method || '',
        cancelledAt: new Date().toLocaleString('ja-JP'),
      } : null;
      return {
        ...data,
        events: data.events.filter((e) => e.id !== eventId),
        applicants: data.applicants.map((a) =>
          a.id === applicant.id
            ? {
                ...a,
                cancelledInterviews: cancelledEntry
                  ? [...(a.cancelledInterviews || []), cancelledEntry]
                  : (a.cancelledInterviews || []),
              }
            : a
        ),
      };
    });
    setCancelConfirmEvent(null);
  }

  function handleReschedule(event: InterviewEvent) {
    updateClientData((data) => ({
      ...data,
      events: data.events.filter((e) => e.id !== event.id),
    }));
    setScheduleDate('');
    setScheduleTime('');
    setScheduleOpen(true);
  }

  // Status
  const currentStatus = clientData.statuses.find((s) => s.name === applicant.stage);
  const statusOptions = clientData.statuses.map((s) => ({ value: s.name, label: s.name }));
  const hasSubStatuses = currentStatus && currentStatus.subStatuses.length > 0;

  // 応募者の拠点スコープで sources / jobs を解決（拠点別オーバーライド対応）
  const scopedSources = resolveSources(clientData, applicant.base);
  const scopedJobs = resolveJobs(clientData, applicant.base);

  // Source badge color
  const sourceObj = scopedSources.find((s) => s.name === applicant.src);
  const sourceColor = sourceObj?.color || '#6B7280';

  // Confirmed event
  const confirmedEvent = events.length > 0 ? events[0] : null;

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      {/* LEFT COLUMN - 60% */}
      <div style={{ flex: '0 0 60%', maxWidth: '60%' }}>
        {/* === Application Info Card === */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>応募情報</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {!isEditing ? (
                <button onClick={startEdit} style={{ ...btnSecondary, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}>
                  編集
                </button>
              ) : (
                <>
                  <button onClick={cancelEdit} style={{ ...btnSecondary, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}>
                    キャンセル
                  </button>
                  <button onClick={saveEdit} style={{ ...btnOrange, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}>
                    保存
                  </button>
                </>
              )}
              <button style={{ ...btnOrange, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }} disabled>
                SMS/メール送信
              </button>
            </div>
          </div>

          <div style={cardBodyStyle}>
            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ ...tableLabelStyle, fontWeight: 600 }}>ステータス</span>
              {currentStatus && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.1875rem 0.625rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: (() => {
                    const cd = getColorDef(currentStatus.color);
                    return cd?.bg || '#F3F4F6';
                  })(),
                  color: (() => {
                    const cd = getColorDef(currentStatus.color);
                    return cd?.main || '#374151';
                  })(),
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: currentStatus.color,
                  }} />
                  {applicant.stage}
                </span>
              )}
              <div style={{ minWidth: '180px' }}>
                <SearchableSelect
                  options={statusOptions}
                  value={applicant.stage}
                  onChange={handleStatusChange}
                />
              </div>
            </div>

            {/* Sub-status row */}
            {hasSubStatuses && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{
                  padding: '0.125rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: '#DEF7EC',
                  color: '#065F46',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}>サブステータス</span>
                <select
                  value={applicant.subStatus || ''}
                  onChange={(e) => handleSubStatusChange(e.target.value)}
                  style={{ ...smallInputStyle, width: 'auto', minWidth: '160px' }}
                >
                  <option value="">選択してください</option>
                  {currentStatus!.subStatuses.map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            )}

            {baseChangeWarning && (
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#FEF3C7', borderRadius: '6px', fontSize: '0.75rem', color: '#92400E', marginBottom: '0.75rem' }}>
                {baseChangeWarning}
              </div>
            )}

            {/* Info table */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ width: '120px', flexShrink: 0, fontSize: '0.8125rem', color: '#6b7280' }}>氏名</span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isEditing ? (
                    <input value={editData.name || ''} onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))} style={{ flex: 1, padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem' }} />
                  ) : (
                    <span style={{ fontSize: '0.8125rem', color: '#111827', fontWeight: 500 }}>{applicant.name}</span>
                  )}
                  {isDuplicate && (
                    <span style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: '4px', whiteSpace: 'nowrap' }}>重複 {duplicateCount}件</span>
                  )}
                </div>
              </div>
              <InfoTableRow label="フリガナ" value={applicant.furigana} editing={isEditing} editValue={editData.furigana || ''} onChange={handleFuriganaChange} placeholder="カタカナで入力" />
              <InfoTableRow label="応募日" value={formatDateJP(applicant.date)} editing={isEditing} editValue={editData.date || ''} onChange={(v) => setEditData((p) => ({ ...p, date: v }))} type="date" />
              <InfoTableRow label="年齢" value={applicant.age != null ? `${applicant.age}歳` : '-'} editing={false} editValue="" onChange={() => {}} />
              <InfoTableRow label="生年月日" value={applicant.birthDate ? `${formatDateJP(applicant.birthDate)} (${dateToWareki(applicant.birthDate)})` : ''} editing={isEditing} editValue={birthDateInput} onChange={handleBirthDateChange} placeholder="R5.4.1 / 2023-04-01" />
              <InfoTableRow label="性別" value={applicant.gender} editing={isEditing} editValue={editData.gender || ''} onChange={(v) => setEditData((p) => ({ ...p, gender: v }))} selectOptions={['男性', '女性', 'その他', '未回答']} />
              <InfoTableRow label="現在の職業" value={applicant.currentJob} editing={isEditing} editValue={editData.currentJob || ''} onChange={(v) => setEditData((p) => ({ ...p, currentJob: v }))} />
              {isEditing ? (
                <div style={tableRowStyle}>
                  <span style={tableLabelStyle}>拠点</span>
                  <SearchableSelect
                    options={clientData.bases.map((b) => ({ value: b.name, label: b.name }))}
                    value={editData.base || ''}
                    onChange={handleBaseChange}
                    placeholder="拠点を選択"
                  />
                </div>
              ) : (
                <InfoTableRow label="拠点" value={applicant.base} editing={false} editValue="" onChange={() => {}} />
              )}
              <InfoTableRow label="電話番号" value={applicant.phone} editing={isEditing} editValue={editData.phone || ''} onChange={(v) => setEditData((p) => ({ ...p, phone: v }))} type="tel" />
              <InfoTableRow label="メールアドレス" value={applicant.email} editing={isEditing} editValue={editData.email || ''} onChange={(v) => setEditData((p) => ({ ...p, email: v }))} type="email" />
              {/* Source with color badge */}
              {isEditing ? (
                <div style={tableRowStyle}>
                  <span style={tableLabelStyle}>応募媒体</span>
                  <SearchableSelect
                    options={scopedSources.map((s) => ({ value: s.name, label: s.name }))}
                    value={editData.src || ''}
                    onChange={(v) => setEditData((p) => ({ ...p, src: v }))}
                    placeholder="媒体を選択"
                  />
                </div>
              ) : (
                <div style={tableRowStyle}>
                  <span style={tableLabelStyle}>応募媒体</span>
                  <span>
                    {applicant.src ? (
                      <span style={{
                        display: 'inline-block',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: sourceColor + '20',
                        color: sourceColor,
                      }}>
                        {applicant.src}
                      </span>
                    ) : (
                      <span style={{ color: '#9CA3AF' }}>-</span>
                    )}
                  </span>
                </div>
              )}
              {isEditing ? (
                <div style={tableRowStyle}>
                  <span style={tableLabelStyle}>職種</span>
                  <SearchableSelect
                    options={scopedJobs.map((j) => ({ value: j.name, label: j.name }))}
                    value={editData.job || ''}
                    onChange={(v) => setEditData((p) => ({ ...p, job: v }))}
                    placeholder="職種を選択"
                  />
                </div>
              ) : (
                <InfoTableRow label="職種" value={applicant.job} editing={false} editValue="" onChange={() => {}} />
              )}
            </div>
          </div>
        </div>

        {/* === Memo Card === */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>メモ</h3>
            {clientData.hearingTemplates.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    const tmpl = clientData.hearingTemplates.find((h) => h.jobName === e.target.value);
                    if (tmpl) insertHearingTemplate(tmpl.template);
                    e.target.value = '';
                  }
                }}
                style={{
                  ...smallInputStyle,
                  width: 'auto',
                  fontSize: '0.75rem',
                  color: '#F97316',
                  borderColor: '#F97316',
                  cursor: 'pointer',
                }}
              >
                <option value="">ヒアリング挿入</option>
                {clientData.hearingTemplates.map((h) => (
                  <option key={h.jobName} value={h.jobName}>{h.jobName}</option>
                ))}
              </select>
            )}
          </div>
          <div style={cardBodyStyle}>
            <textarea
              value={memoText}
              onChange={(e) => handleMemoChange(e.target.value)}
              style={{
                width: '100%',
                minHeight: '140px',
                padding: '0.625rem 0.75rem',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: '1.6',
              }}
              placeholder="応募者に関するメモを入力してください..."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {memoSaved && memoText && (
                  <>
                    <span style={{ color: '#22C55E', display: 'inline-flex' }}><Check size={12} strokeWidth={3} /></span>
                    <span style={{ color: '#22C55E' }}>保存済み</span>
                  </>
                )}
                {!memoSaved && (
                  <span style={{ color: '#F59E0B' }}>保存中...</span>
                )}
              </div>
              <button
                onClick={() => saveMemo(memoText)}
                style={{
                  ...btnSecondary,
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  backgroundColor: memoSaved ? '#F3F4F6' : '#fff',
                  color: memoSaved ? '#9CA3AF' : '#374151',
                }}
              >
                {memoSaved ? '保存済み' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - 40% */}
      <div style={{ flex: '0 0 40%', maxWidth: '40%' }}>
        {/* === Interview Info Card === */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>面接情報</h3>
            <button
              onClick={() => { setScheduleDate(''); setScheduleTime(''); setScheduleOpen(true); }}
              style={{ ...btnOrange, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
            >
              + 面接を設定
            </button>
          </div>
          <div style={cardBodyStyle}>
            {/* Interview result buttons */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500 }}>面接結果</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[
                  { label: '採用', value: '合格', activeColor: '#22C55E' },
                  { label: '不採用', value: '不合格', activeColor: '#6B7280' },
                  { label: '面接欠席', value: '欠席', activeColor: '#6B7280' },
                ].map((item) => {
                  const isActive = applicant.intResult === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => handleIntResult(item.value)}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.25rem',
                        border: isActive ? 'none' : '1px solid #D1D5DB',
                        borderRadius: '6px',
                        backgroundColor: isActive ? item.activeColor : '#fff',
                        color: isActive ? '#fff' : '#374151',
                        fontSize: '0.75rem',
                        fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interview table */}
            <div>
              <div style={tableRowStyle}>
                <span style={tableLabelStyle}>面接方法</span>
                <span style={tableValueStyle}>
                  {applicant.intMethod
                    ? `${applicant.intMethod === 'WEB' ? 'WEB' : '対面'}`
                    : <span style={{ color: '#9CA3AF' }}>未設定</span>
                  }
                </span>
              </div>
              <div style={tableRowStyle}>
                <span style={tableLabelStyle}>面接カレンダー</span>
                <span style={tableValueStyle}>
                  {applicant.base || <span style={{ color: '#9CA3AF' }}>&#8212;</span>}
                </span>
              </div>
              <div style={tableRowStyle}>
                <span style={tableLabelStyle}>確定済み面接日時</span>
                <span style={tableValueStyle}>
                  {confirmedEvent ? (
                    <span>
                      {formatDateJP(confirmedEvent.date)} {confirmedEvent.start}~{confirmedEvent.end}
                    </span>
                  ) : (
                    <span style={{ color: '#9CA3AF' }}>&#8212;</span>
                  )}
                </span>
              </div>
              <div style={{ ...tableRowStyle, borderBottom: 'none', alignItems: 'flex-start' }}>
                <span style={tableLabelStyle}>面接日程（変更前）</span>
                <span style={{ ...tableValueStyle }}>
                  {applicant.cancelledInterviews && applicant.cancelledInterviews.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      {applicant.cancelledInterviews.slice().reverse().map((ci, idx) => (
                        <div key={idx} style={{ fontSize: '0.75rem', padding: '0.375rem 0.625rem', backgroundColor: '#FEF2F2', borderRadius: '4px', borderLeft: '3px solid #FCA5A5' }}>
                          <div style={{ fontWeight: 600, color: '#374151' }}>
                            {ci.date} {ci.start}〜{ci.end}
                            {ci.base && <span style={{ color: '#6B7280', fontWeight: 400, marginLeft: '0.5rem' }}>{ci.base}</span>}
                            {ci.method && <span style={{ color: '#6B7280', fontWeight: 400, marginLeft: '0.375rem' }}>({ci.method})</span>}
                          </div>
                          <div style={{ color: '#9CA3AF', marginTop: '0.125rem' }}>キャンセル: {ci.cancelledAt}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#9CA3AF' }}>&#8212;</span>
                  )}
                </span>
              </div>
            </div>

            {/* Event list with actions */}
            {events.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#F9FAFB',
                      borderRadius: '6px',
                      marginBottom: '0.375rem',
                      borderLeft: `3px solid ${ev.color}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                      <span style={{ fontWeight: 600 }}>{formatDateJP(ev.date)}</span>
                      <span>{ev.start}~{ev.end}</span>
                      <span style={{ color: '#9CA3AF' }}>{ev.base}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        onClick={() => handleReschedule(ev)}
                        style={{ ...btnSecondary, fontSize: '0.6875rem', padding: '0.125rem 0.375rem' }}
                      >
                        変更
                      </button>
                      <button
                        onClick={() => setCancelConfirmEvent(ev)}
                        style={{ ...btnSecondary, fontSize: '0.6875rem', padding: '0.125rem 0.375rem', color: '#EF4444', borderColor: '#FCA5A5' }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Preferred dates */}
            {applicant.prefDates && applicant.prefDates.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' }}>
                  希望日時
                </div>
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {applicant.prefDates.map((raw, i) => {
                    const d = normalizePrefDate(raw);
                    return (
                      <button
                        key={i}
                        onClick={() => { setScheduleDate(d.date); setScheduleTime(d.time); setScheduleOpen(true); }}
                        style={{
                          ...btnSecondary,
                          fontSize: '0.6875rem',
                          padding: '0.1875rem 0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <span style={{ color: '#F97316', fontWeight: 600 }}>+</span>
                        {formatDateJP(d.date) || d.date}{d.time ? ` ${d.time}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* === Chat Q&A Card === */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={{ ...cardTitleStyle, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '1rem' }}>{'\uD83D\uDCAC'}</span>
              質問回答
            </h3>
          </div>
          <div style={cardBodyStyle}>
            {applicant.chatAnswers && applicant.chatAnswers.length > 0 ? (
              <div>
                {applicant.chatAnswers.map((ca, i) => (
                  <div key={i} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                      Q: {ca.question}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#111827', paddingLeft: '0.5rem', borderLeft: '2px solid #F97316' }}>
                      {ca.answer}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '0.8125rem', color: '#9CA3AF', marginBottom: '0.5rem' }}>
                  この機能は現在開発中です
                </div>
              </div>
            )}
            <div style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: '#F9FAFB',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#9CA3AF',
              textAlign: 'center',
            }}>
              チャットの質問回答が自動で反映されます
            </div>
          </div>
        </div>

        {/* === Job Info Card === */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>求人情報</h3>
          </div>
          <div style={cardBodyStyle}>
            {applicant.jobInfo && Object.values(applicant.jobInfo).some(v => !!v) ? (
              <div>
                {[
                  { key: 'jobId',            label: '求人・案件ID' },
                  { key: 'jobNumber',        label: '仕事番号' },
                  { key: 'productName',      label: '商品名' },
                  { key: 'jobName',          label: '求人・案件名' },
                  { key: 'publishedJobType', label: '原稿掲載職種' },
                  { key: 'companyName',      label: '掲載会社名' },
                ].map(({ key, label }, i, arr) => (
                  <div key={key} style={i === arr.length - 1 ? { ...tableRowStyle, borderBottom: 'none' } : tableRowStyle}>
                    <span style={tableLabelStyle}>{label}</span>
                    <span style={tableValueStyle}>{(applicant.jobInfo as unknown as Record<string, string>)[key] || '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>求人情報が未登録です</div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Schedule Interview Modal */}
      <ScheduleInterviewModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        applicant={applicant}
        prefillDate={scheduleDate}
        prefillTime={scheduleTime}
        onScheduled={handleScheduled}
      />

      {/* Base change blocked modal */}
      <Modal
        isOpen={baseBlockModal}
        onClose={() => setBaseBlockModal(false)}
        title="拠点変更できません"
        width="440px"
      >
        <div>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.875rem 1rem', backgroundColor: '#FEF2F2',
            borderRadius: '8px', border: '1px solid #FECACA', marginBottom: '1rem',
          }}>
            <span style={{ color: '#DC2626', display: 'flex', lineHeight: 1 }}><AlertTriangle size={20} /></span>
            <div>
              <div style={{ fontWeight: 600, color: '#991B1B', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
                未来日の面接が{futureEvents.length}件あります
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#7F1D1D' }}>
                拠点を変更するには、先に以下の面接をキャンセルしてください。
              </div>
            </div>
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            {futureEvents.map((ev) => (
              <div key={ev.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.75rem', borderBottom: '1px solid #F3F4F6',
                fontSize: '0.8125rem',
              }}>
                <span style={{ color: '#374151' }}>
                  {ev.date}（{dayOfWeekJP(ev.date)}）{ev.start}〜{ev.end}
                </span>
                <span style={{
                  padding: '0.125rem 0.5rem', borderRadius: '4px',
                  backgroundColor: '#F3F4F6', color: '#6B7280', fontSize: '0.75rem',
                }}>
                  {ev.base}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setBaseBlockModal(false)} style={btnOrange}>閉じる</button>
          </div>
        </div>
      </Modal>

      {/* Base change confirm (子アカウント) */}
      <Modal
        isOpen={!!pendingBaseChange}
        onClose={() => setPendingBaseChange(null)}
        title="拠点を変更しますか？"
        width="440px"
      >
        <div>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.875rem 1rem', backgroundColor: '#FFFBEB',
            borderRadius: '8px', border: '1px solid #FDE68A', marginBottom: '1rem',
          }}>
            <span style={{ color: '#B45309', display: 'flex', lineHeight: 1 }}><AlertTriangle size={20} /></span>
            <div>
              <div style={{ fontWeight: 600, color: '#92400E', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
                {applicant.base} → {pendingBaseChange}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#78350F' }}>
                他拠点に変更すると、この応募者は<strong>あなたから閲覧できなくなります</strong>。
                変更後は本部または変更先拠点のアカウントから操作してください。
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setPendingBaseChange(null)} style={btnSecondary}>キャンセル</button>
            <button onClick={confirmBaseChange} style={btnOrange}>変更する</button>
          </div>
        </div>
      </Modal>

      {/* Cancel confirm */}
      <Modal
        isOpen={!!cancelConfirmEvent}
        onClose={() => setCancelConfirmEvent(null)}
        title="面接キャンセル"
        width="400px"
      >
        <div>
          <p style={{ fontSize: '0.875rem', marginTop: 0 }}>
            この面接をキャンセルしますか？
            {cancelConfirmEvent && (
              <span style={{ display: 'block', marginTop: '0.5rem', color: '#6B7280' }}>
                {formatDateJP(cancelConfirmEvent.date)} {cancelConfirmEvent.start} ~ {cancelConfirmEvent.end}
              </span>
            )}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setCancelConfirmEvent(null)} style={btnSecondary}>戻る</button>
            <button onClick={() => cancelConfirmEvent && handleCancelEvent(cancelConfirmEvent.id)} style={btnDanger}>キャンセルする</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* =======================================
   InfoTableRow helper
   ======================================= */
interface InfoTableRowProps {
  label: string;
  value: string;
  editing: boolean;
  editValue: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  selectOptions?: string[];
}

const InfoTableRow: React.FC<InfoTableRowProps> = ({ label, value, editing, editValue, onChange, type, placeholder, selectOptions }) => (
  <div style={tableRowStyle}>
    <span style={tableLabelStyle}>{label}</span>
    {editing ? (
      selectOptions ? (
        <select value={editValue} onChange={(e) => onChange(e.target.value)} style={smallInputStyle}>
          <option value="">選択してください</option>
          {selectOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={type || 'text'}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={smallInputStyle}
        />
      )
    ) : (
      <span style={{ ...tableValueStyle, color: value ? '#111827' : '#9CA3AF' }}>
        {value || '-'}
      </span>
    )}
  </div>
);

/* =======================================
   JobInfoEditRow helper
   ======================================= */
const JobInfoEditRow: React.FC<{ label: string; value: string; onChange: (v: string) => void; last?: boolean }> = ({ label, value, onChange, last }) => (
  <div style={last ? { ...tableRowStyle, borderBottom: 'none' } : tableRowStyle}>
    <span style={tableLabelStyle}>{label}</span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={smallInputStyle}
    />
  </div>
);

/* =======================================
   Tab: AI Screening
   ======================================= */
interface ScreeningTabProps {
  applicant: Applicant;
  clientData: ClientData;
  updateApplicant: (updater: (a: Applicant) => Applicant) => void;
}

const ScreeningTab: React.FC<ScreeningTabProps> = ({ applicant, clientData, updateApplicant }) => {
  const { logAction } = useAuth();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const screening = applicant.screening;
  const enabled = !!clientData.screeningCriteria?.enabled;

  const recoStyle = (reco: string) => {
    if (reco === 'pass') return { bg: '#DEF7EC', color: '#065F46', label: '合格推奨' };
    if (reco === 'reject') return { bg: '#FEE2E2', color: '#991B1B', label: '不合格推奨' };
    return { bg: '#FEF3C7', color: '#92400E', label: '要確認' };
  };

  // 応募者の職種で評価基準を解決（職種別オーバーライドあれば優先）
  const resolvedCriteria = resolveScreeningCriteria(clientData.screeningCriteria, applicant.job);
  const usingJobOverride = !!applicant.job && hasScreeningJobOverride(clientData.screeningCriteria, applicant.job);

  async function run() {
    if (!resolvedCriteria || !resolvedCriteria.enabled) {
      setError('AIスクリーニング機能が有効化されていません（設定 → AIスクリーニング）');
      return;
    }
    setRunning(true);
    setError('');
    try {
      const resp = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicant: {
            age: applicant.age,
            gender: applicant.gender,
            currentJob: applicant.currentJob,
            job: applicant.job,
            src: applicant.src,
            base: applicant.base,
            educationWorkHistory: applicant.educationWorkHistory,
            desiredConditions: applicant.desiredConditions,
            chatAnswers: applicant.chatAnswers,
            note: applicant.note,
          },
          criteria: resolvedCriteria,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const result = {
        score: Number(data.score) || 0,
        recommendation: data.recommendation,
        reasons: Array.isArray(data.reasons) ? data.reasons : [],
        concerns: Array.isArray(data.concerns) ? data.concerns : [],
        evaluatedAt: data.evaluatedAt || new Date().toISOString(),
        model: data.model || 'claude-haiku-4-5',
      };
      updateApplicant((a) => ({ ...a, screening: result }));
      logAction('applicant', 'AI評価実行', applicant.name || String(applicant.id), `スコア: ${result.score} / ${result.recommendation}`);
    } catch (e: any) {
      setError(e?.message || 'AI評価に失敗しました');
    } finally {
      setRunning(false);
    }
  }

  if (!enabled) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem', opacity: 0.4 }}>
          <Sparkles size={36} color="#9333EA" />
        </div>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>AIスクリーニングは無効化されています</h3>
        <p style={{ color: '#6B7280', fontSize: '0.875rem', margin: 0 }}>
          設定 → AIスクリーニング で「機能を有効化」をONにしてください。
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={18} color="#9333EA" />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>AIスクリーニング結果</h3>
        </div>
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: 'var(--color-primary, #F97316)',
            color: '#fff',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: running ? 'wait' : 'pointer',
            opacity: running ? 0.6 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          {running ? (
            <><Loader2 size={14} className="spin" /> 評価中...</>
          ) : (
            <><Sparkles size={14} /> {screening ? '再評価' : 'AI評価実行'}</>
          )}
        </button>
      </div>

      <div style={{ padding: '0.5rem 0.875rem', backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '6px', fontSize: '0.75rem', color: '#5B21B6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <strong>使用基準:</strong>
        {usingJobOverride ? (
          <>職種別「<strong>{applicant.job}</strong>」用にカスタマイズされた評価基準</>
        ) : (
          <>全社デフォルト基準{applicant.job ? `（職種「${applicant.job}」専用設定なし）` : '（職種未設定）'}</>
        )}
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '0.875rem', color: '#991B1B', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {!screening && !running && !error && (
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #E5E7EB' }}>
          <p style={{ color: '#6B7280', fontSize: '0.875rem', margin: 0 }}>
            まだAI評価を実行していません。<br />
            「AI評価実行」ボタンを押すとClaude AIが書類選考スコアを算出します。
          </p>
        </div>
      )}

      {screening && (() => {
        const r = recoStyle(screening.recommendation);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1rem 1.25rem', backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#9333EA', lineHeight: 1 }}>{screening.score}</span>
                <span style={{ fontSize: '1rem', color: '#9CA3AF' }}>/ 100</span>
              </div>
              <span style={{ padding: '0.375rem 0.875rem', borderRadius: '9999px', backgroundColor: r.bg, color: r.color, fontSize: '0.875rem', fontWeight: 700 }}>
                {r.label}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF', marginLeft: 'auto' }}>
                評価: {new Date(screening.evaluatedAt).toLocaleString('ja-JP')}<br />
                Model: {screening.model}
              </span>
            </div>

            {screening.reasons.length > 0 && (
              <div style={{ padding: '1rem 1.25rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#065F46', marginBottom: '0.5rem' }}>+ 加点ポイント</div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.8 }}>
                  {screening.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
              </div>
            )}

            {screening.concerns.length > 0 && (
              <div style={{ padding: '1rem 1.25rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.5rem' }}>− 懸念ポイント</div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.8 }}>
                  {screening.concerns.map((concern, i) => <li key={i}>{concern}</li>)}
                </ul>
              </div>
            )}

            <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.8125rem', color: '#92400E' }}>
              <strong>運用メモ:</strong> AI評価は判断補助です。最終的な合否判断は人間が行ってください。
            </div>
          </div>
        );
      })()}
    </div>
  );
};

/* =======================================
   Tab 2: Email
   ======================================= */
const EmailTab: React.FC = () => (
  <div style={{ padding: '1.5rem', textAlign: 'center' }}>
    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>{'\u2709'}</div>
    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>メール / SMS送信</h3>
    <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0 }}>
      メール・SMS送信機能は今後実装予定です。
    </p>
    <div style={{
      marginTop: '1.5rem',
      padding: '1rem',
      backgroundColor: '#F9FAFB',
      borderRadius: '8px',
      border: '1px dashed #D1D5DB',
    }}>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <button style={{ ...btnSecondary, opacity: 0.5, cursor: 'not-allowed' }} disabled>
          メール送信
        </button>
        <button style={{ ...btnSecondary, opacity: 0.5, cursor: 'not-allowed' }} disabled>
          SMS送信
        </button>
      </div>
    </div>
  </div>
);

/* =======================================
   Tab 3: Files
   ======================================= */
const FilesTab: React.FC<{ applicant: Applicant }> = ({ applicant }) => {
  const files = applicant.files || [];

  function getExtIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
      pdf: '\u{1F4C4}',
      doc: '\u{1F4DD}',
      docx: '\u{1F4DD}',
      xls: '\u{1F4CA}',
      xlsx: '\u{1F4CA}',
      jpg: '\u{1F5BC}',
      jpeg: '\u{1F5BC}',
      png: '\u{1F5BC}',
      gif: '\u{1F5BC}',
    };
    return icons[ext] || '\u{1F4CE}';
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  if (files.length === 0) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>{'\u{1F4C1}'}</div>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>ファイルなし</h3>
        <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0 }}>
          アップロードされたファイルはありません。
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {files.map((f, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.625rem 0.75rem',
            borderBottom: '1px solid #F3F4F6',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>{getExtIcon(f.name)}</span>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{f.name}</div>
              <div style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>{formatSize(f.size)}</div>
            </div>
          </div>
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...btnSecondary,
              textDecoration: 'none',
              fontSize: '0.75rem',
              padding: '0.25rem 0.625rem',
            }}
          >
            ダウンロード
          </a>
        </div>
      ))}
    </div>
  );
};

/* =======================================
   Tab 4: Web Interview
   ======================================= */
const WebInterviewTab: React.FC = () => (
  <div style={{ padding: '1.5rem', textAlign: 'center' }}>
    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>{'\u{1F4F9}'}</div>
    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>WEB面接</h3>
    <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0, marginBottom: '1.5rem' }}>
      Google Meet / Zoom連携機能は今後開発予定です。
    </p>
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          padding: '1.25rem',
          borderRadius: '8px',
          border: '1px dashed #D1D5DB',
          backgroundColor: '#F9FAFB',
          width: '180px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Google Meet</div>
        <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>開発予定</div>
      </div>
      <div
        style={{
          padding: '1.25rem',
          borderRadius: '8px',
          border: '1px dashed #D1D5DB',
          backgroundColor: '#F9FAFB',
          width: '180px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Zoom</div>
        <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>開発予定</div>
      </div>
    </div>
  </div>
);

/* =======================================
   Tab 5: Job Info
   ======================================= */
interface JobInfoTabProps {
  applicant: Applicant;
  updateApplicant: (updater: (a: Applicant) => Applicant) => void;
}

const EMPTY_JOB_INFO = { jobId: '', jobNumber: '', productName: '', jobName: '', publishedJobType: '', companyName: '' };

const JobInfoTab: React.FC<JobInfoTabProps> = ({ applicant, updateApplicant }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(applicant.jobInfo || EMPTY_JOB_INFO);

  const info = applicant.jobInfo || EMPTY_JOB_INFO;
  const hasData = Object.values(info).some((v) => !!v);

  const fields: { key: keyof typeof EMPTY_JOB_INFO; label: string }[] = [
    { key: 'jobId',           label: '求人・案件ID' },
    { key: 'jobNumber',       label: '仕事番号' },
    { key: 'productName',     label: '商品名' },
    { key: 'jobName',         label: '求人・案件名' },
    { key: 'publishedJobType', label: '原稿掲載職種' },
    { key: 'companyName',     label: '掲載会社名' },
  ];

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={cardTitleStyle}>求人情報</h3>
          {!editing ? (
            <button
              onClick={() => { setForm(info); setEditing(true); }}
              style={{ ...btnOrange, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
            >
              編集
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setEditing(false)} style={{ ...btnSecondary, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}>キャンセル</button>
              <button onClick={() => { updateApplicant((a) => ({ ...a, jobInfo: form })); setEditing(false); }} style={{ ...btnOrange, fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}>保存</button>
            </div>
          )}
        </div>
        <div style={cardBodyStyle}>
          {editing ? (
            <div>
              {fields.map(({ key, label }, i) => (
                <JobInfoEditRow
                  key={key}
                  label={label}
                  value={form[key]}
                  onChange={(v) => setForm((p) => ({ ...p, [key]: v }))}
                  last={i === fields.length - 1}
                />
              ))}
            </div>
          ) : hasData ? (
            <div>
              {fields.map(({ key, label }, i) => (
                <div key={key} style={i === fields.length - 1 ? { ...tableRowStyle, borderBottom: 'none' } : tableRowStyle}>
                  <span style={tableLabelStyle}>{label}</span>
                  <span style={tableValueStyle}>{info[key] || '-'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>求人情報が未登録です</div>
            </div>
          )}
        </div>
      </div>

      {/* === Education & Work History Card === */}
      <div style={{ ...cardStyle, marginTop: '1rem' }}>
        <div style={cardHeaderStyle}>
          <h3 style={cardTitleStyle}>学歴・職務経歴</h3>
        </div>
        <div style={cardBodyStyle}>
          <div>
            {[
              { key: 'finalEducation',   label: '最終学歴' },
              { key: 'graduationYear',   label: '卒業年' },
              { key: 'employmentStatus', label: '就業状況' },
              { key: 'jobChangeCount',   label: '転職回数' },
              { key: 'workHistory',      label: '職務経歴' },
              { key: 'workHistoryOther', label: '職務経歴その他' },
              { key: 'qualifications',   label: '資格・スキル' },
            ].map(({ key, label }, i, arr) => (
              <div key={key} style={i === arr.length - 1 ? { ...tableRowStyle, borderBottom: 'none' } : tableRowStyle}>
                <span style={tableLabelStyle}>{label}</span>
                <span style={tableValueStyle}>
                  {(applicant.educationWorkHistory as unknown as Record<string, string> | undefined)?.[key] || '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === Desired Conditions & Motivation Card === */}
      <div style={{ ...cardStyle, marginTop: '1rem' }}>
        <div style={cardHeaderStyle}>
          <h3 style={cardTitleStyle}>希望条件・動機</h3>
        </div>
        <div style={cardBodyStyle}>
          <div>
            {[
              { key: 'preferredLocation', label: '希望勤務地' },
              { key: 'availableDays',     label: '勤務可能曜日' },
              { key: 'availableHours',    label: '勤務可能時間帯' },
              { key: 'selfPr',            label: '自己PR' },
              { key: 'motivation',        label: '志望動機' },
              { key: 'otherQuestions',    label: '質問ほか' },
            ].map(({ key, label }, i, arr) => (
              <div key={key} style={i === arr.length - 1 ? { ...tableRowStyle, borderBottom: 'none' } : tableRowStyle}>
                <span style={tableLabelStyle}>{label}</span>
                <span style={tableValueStyle}>
                  {(applicant.desiredConditions as unknown as Record<string, string> | undefined)?.[key] || '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =======================================
   Tab 6: History (past applications)
   ======================================= */
interface HistoryTabProps {
  applicant: Applicant;
  clientData: ClientData;
  onNavigate: (id: number) => void;
}

const HistoryTab: React.FC<HistoryTabProps> = ({ applicant, clientData, onNavigate }) => {
  const duplicates = useMemo(
    () =>
      clientData.applicants.filter(
        (a) =>
          a.id !== applicant.id &&
          (a.name === applicant.name || (applicant.phone && a.phone === applicant.phone))
      ),
    [clientData.applicants, applicant]
  );

  if (duplicates.length === 0) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>{'\u{1F50D}'}</div>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>重複応募者なし</h3>
        <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0 }}>
          同一氏名・電話番号の応募者は見つかりませんでした。
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: '0.75rem' }}>
        同一氏名または電話番号の応募者: {duplicates.length}件
      </div>
      {duplicates.map((dup) => {
        const st = clientData.statuses.find((s) => s.name === dup.stage);
        const colorDef = st ? getColorDef(st.color) : null;
        return (
          <div
            key={dup.id}
            onClick={() => onNavigate(dup.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '0.375rem',
              backgroundColor: '#F9FAFB',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{dup.name}</span>
                {dup.stage && (
                  <span
                    style={{
                      padding: '0.0625rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.6875rem',
                      fontWeight: 500,
                      backgroundColor: colorDef?.bg || '#F3F4F6',
                      color: colorDef?.main || '#374151',
                    }}
                  >
                    {dup.stage}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'flex', gap: '0.75rem' }}>
                {dup.phone && <span>{dup.phone}</span>}
                {dup.date && <span>応募日: {formatDateJP(dup.date)}</span>}
                {dup.base && <span>{dup.base}</span>}
                {dup.src && <span>{dup.src}</span>}
              </div>
            </div>
            <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>{'\u2192'}</span>
          </div>
        );
      })}
    </div>
  );
};

export default ApplicantDetail;
