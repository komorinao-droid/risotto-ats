import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/Modal';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { warekiToDate } from '@/utils/wareki';
import { normalizeFurigana, isKatakanaOnly } from '@/utils/furigana';
import { today, calcAge } from '@/utils/date';
import { resolveJobs, resolveSources } from '@/utils/baseScope';
import type { Applicant, ClientData, PrefDateTime } from '@/types';

interface AddApplicantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  marginBottom: '0.25rem',
  color: '#374151',
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.75rem',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: '0.75rem',
};

const requiredMark: React.CSSProperties = {
  color: '#EF4444',
  marginLeft: '0.25rem',
};

const AddApplicantModal: React.FC<AddApplicantModalProps> = ({ isOpen, onClose }) => {
  const { clientData, updateClientData, logAction, client } = useAuth();
  const isChild = client?.accountType === 'child';
  const lockedBaseName = isChild ? (client?.baseName || '') : '';

  const [name, setName] = useState('');
  const [furigana, setFurigana] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDateInput, setBirthDateInput] = useState('');
  const [age, setAge] = useState<string>('');
  const [ageManual, setAgeManual] = useState(false);
  const [gender, setGender] = useState('');
  const [currentJob, setCurrentJob] = useState('');
  const [date, setDate] = useState(today());
  const [job, setJob] = useState('');
  const [src, setSrc] = useState('');
  const [stage, setStage] = useState('');
  const [base, setBase] = useState('');
  const [note, setNote] = useState('');
  const [prefDates, setPrefDates] = useState<PrefDateTime[]>([]);
  const [prefDateInput, setPrefDateInput] = useState('');
  const [prefTimeInput, setPrefTimeInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exclusionAlert, setExclusionAlert] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setFurigana('');
      setEmail('');
      setPhone('');
      setBirthDateInput('');
      setAge('');
      setAgeManual(false);
      setGender('');
      setCurrentJob('');
      setDate(today());
      setJob('');
      setSrc('');
      setStage(clientData?.statuses?.[0]?.name || '');
      setBase(lockedBaseName);
      setNote('');
      setPrefDates([]);
      setPrefDateInput('');
      setPrefTimeInput('');
      setErrors({});
      setExclusionAlert('');
    }
  }, [isOpen, clientData]);

  // Auto-calculate age from birth date
  useEffect(() => {
    if (ageManual) return;
    const parsed = warekiToDate(birthDateInput);
    if (parsed) {
      setAge(String(calcAge(parsed)));
    }
  }, [birthDateInput, ageManual]);

  // Insert hearing template on job change
  useEffect(() => {
    if (!job || !clientData) return;
    const tpl = clientData.hearingTemplates.find((h) => h.jobName === job);
    if (tpl && tpl.template) {
      setNote((prev) => {
        if (prev.includes(tpl.template)) return prev;
        return prev ? prev + '\n\n' + tpl.template : tpl.template;
      });
    }
  }, [job, clientData]);

  const statuses = useMemo(() => clientData?.statuses || [], [clientData]);
  // 子アカウントは自拠点のオーバーライド（あれば）を、なければ全社共通を使用
  const scopeBaseName = isChild ? client?.baseName : (base || undefined);
  const sources = useMemo(() => (clientData ? resolveSources(clientData, scopeBaseName) : []), [clientData, scopeBaseName]);
  const bases = useMemo(() => clientData?.bases || [], [clientData]);
  const jobs = useMemo(() => (clientData ? resolveJobs(clientData, scopeBaseName) : []), [clientData, scopeBaseName]);

  const baseOptions = useMemo(
    () => bases.map((b) => ({ value: b.name, label: b.name })),
    [bases]
  );

  // Exclusion / filter check
  const checkExclusion = (data: ClientData, applicant: Partial<Applicant>): string | null => {
    const alerts: string[] = [];
    const fc = data.filterCondition;

    // Age check
    if (fc.ageEnabled && applicant.age) {
      const ageNum = typeof applicant.age === 'string' ? parseInt(applicant.age, 10) : applicant.age;
      if (!isNaN(ageNum) && (ageNum < fc.ageMin || ageNum > fc.ageMax)) {
        alerts.push(`年齢(${ageNum}歳)がフィルタ条件外です`);
      }
    }

    // Gender check
    if (fc.genderFilter.length > 0 && applicant.gender) {
      if (!fc.genderFilter.includes(applicant.gender)) {
        alerts.push(`性別(${applicant.gender})がフィルタ条件外です`);
      }
    }

    // Source check
    if (fc.sourceFilter.length > 0 && applicant.src) {
      if (!fc.sourceFilter.includes(applicant.src)) {
        alerts.push(`応募媒体(${applicant.src})がフィルタ条件外です`);
      }
    }

    // Job check
    if (fc.jobFilter.length > 0 && applicant.job) {
      if (!fc.jobFilter.includes(applicant.job)) {
        alerts.push(`職種(${applicant.job})がフィルタ条件外です`);
      }
    }

    // Exclusion list check
    const normalizedPhone = (applicant.phone || '').replace(/[-\s]/g, '');
    for (const entry of data.exclusionList) {
      if (entry.type === 'email' && entry.email && applicant.email) {
        if (entry.email.toLowerCase() === applicant.email.toLowerCase()) {
          alerts.push(`メール(${applicant.email})が除外リストに該当します`);
        }
      }
      if (entry.type === 'phone' && entry.phone && normalizedPhone) {
        if (entry.phone.replace(/[-\s]/g, '') === normalizedPhone) {
          alerts.push(`電話番号が除外リストに該当します`);
        }
      }
      if (entry.type === 'name_birth' && entry.name && entry.birthDate) {
        const parsedBirth = warekiToDate(birthDateInput);
        if (applicant.name === entry.name && parsedBirth === entry.birthDate) {
          alerts.push(`氏名+生年月日が除外リストに該当します`);
        }
      }
    }

    return alerts.length > 0 ? alerts.join('\n') : null;
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '氏名は必須です';
    if (furigana.trim() && !isKatakanaOnly(normalizeFurigana(furigana))) {
      errs.furigana = 'フリガナはカタカナで入力してください';
    }
    if (!phone.trim()) errs.phone = '電話番号は必須です';
    if (!base.trim()) errs.base = '拠点は必須です';
    if (!src.trim()) errs.src = '求人媒体は必須です';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (!clientData) return;

    const parsedBirth = warekiToDate(birthDateInput) || '';
    const normalizedPhone = phone.replace(/[-\s]/g, '');
    const normalizedFurigana = furigana.trim() ? normalizeFurigana(furigana) : '';

    const newApplicant: Partial<Applicant> = {
      name: name.trim(),
      furigana: normalizedFurigana,
      email: email.trim(),
      phone: normalizedPhone,
      gender,
      age: age ? parseInt(age, 10) || age : '',
      birthDate: parsedBirth,
      currentJob: currentJob.trim(),
      date,
      job,
      src,
      stage,
      subStatus: '',
      base,
      note,
    };

    // Check exclusion
    const exclusionMsg = checkExclusion(clientData, newApplicant);
    let finalStage = stage;
    if (exclusionMsg) {
      const fc = clientData.filterCondition;
      finalStage = fc.excludeStatus || '対象外';
      setExclusionAlert(exclusionMsg);
    }

    // Check duplicate
    const isDuplicate = clientData.applicants.some(
      (a) =>
        (a.name === name.trim() && name.trim()) ||
        (normalizedPhone && a.phone.replace(/[-\s]/g, '') === normalizedPhone)
    );

    const maxId = clientData.applicants.reduce((max, a) => Math.max(max, a.id), 0);

    const applicant: Applicant = {
      id: maxId + 1,
      name: name.trim(),
      furigana: normalizedFurigana,
      email: email.trim(),
      phone: normalizedPhone,
      gender,
      age: age ? parseInt(age, 10) || age : '',
      birthDate: parsedBirth,
      currentJob: currentJob.trim(),
      date,
      job,
      src,
      stage: finalStage,
      subStatus: '',
      base,
      note,
      needsAction: false,
      actionDate: '',
      actionTime: '',
      actionMemo: '',
      prefDates: [...prefDates],
      intResult: '',
      intMethod: '',
      active: true,
      duplicate: isDuplicate,
      files: [],
      jobInfo: { jobId: '', jobNumber: '', productName: '', jobName: '', publishedJobType: '', companyName: '' },
      chatAnswers: [],
    };

    updateClientData((data) => {
      // Also mark existing duplicates
      const updatedApplicants = data.applicants.map((a) => {
        if (
          (a.name === applicant.name && applicant.name) ||
          (applicant.phone && a.phone.replace(/[-\s]/g, '') === applicant.phone)
        ) {
          return { ...a, duplicate: true };
        }
        return a;
      });
      return { ...data, applicants: [...updatedApplicants, applicant] };
    });
    logAction('applicant', '応募者追加', applicant.name || '(名前なし)', applicant.job || undefined);

    if (exclusionMsg) {
      // Keep modal open to show alert, then close
      setTimeout(() => {
        setExclusionAlert('');
        onClose();
      }, 3000);
    } else {
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="応募者を追加" width="680px">
      {exclusionAlert && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#FEF3C7',
            border: '1px solid #F59E0B',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.8125rem',
            color: '#92400E',
            whiteSpace: 'pre-line',
          }}
        >
          <strong>自動除外判定:</strong> 除外ステータスが適用されました。
          <br />
          {exclusionAlert}
        </div>
      )}

      {/* Name */}
      <div style={fieldStyle}>
        <label style={labelStyle}>
          氏名<span style={requiredMark}>*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="山田 太郎"
          style={{
            ...inputStyle,
            borderColor: errors.name ? '#EF4444' : '#d1d5db',
          }}
        />
        {errors.name && (
          <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {errors.name}
          </div>
        )}
      </div>

      {/* Furigana */}
      <div style={fieldStyle}>
        <label style={labelStyle}>フリガナ</label>
        <input
          type="text"
          value={furigana}
          onChange={(e) => setFurigana(e.target.value)}
          placeholder="ヤマダ タロウ"
          style={{
            ...inputStyle,
            borderColor: errors.furigana ? '#EF4444' : '#d1d5db',
          }}
        />
        {errors.furigana && (
          <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {errors.furigana}
          </div>
        )}
      </div>

      {/* Email / Phone */}
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>メール</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@mail.com"
            style={inputStyle}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>電話番号<span style={requiredMark}>*</span></label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="090-1234-5678"
            style={{ ...inputStyle, borderColor: errors.phone ? '#EF4444' : '#d1d5db' }}
          />
          {errors.phone && <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.phone}</div>}
        </div>
      </div>

      {/* BirthDate / Age */}
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>生年月日</label>
          <input
            type="text"
            value={birthDateInput}
            onChange={(e) => {
              setBirthDateInput(e.target.value);
              setAgeManual(false);
            }}
            placeholder="S45.3.15 / 1970-03-15"
            style={inputStyle}
          />
          {birthDateInput && warekiToDate(birthDateInput) && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
              {warekiToDate(birthDateInput)}
            </div>
          )}
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>年齢</label>
          <input
            type="number"
            value={age}
            onChange={(e) => {
              setAge(e.target.value);
              setAgeManual(true);
            }}
            placeholder="自動算出"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Gender */}
      <div style={fieldStyle}>
        <label style={labelStyle}>性別</label>
        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.25rem' }}>
          {['男性', '女性', 'その他'].map((g) => (
            <label
              key={g}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="gender"
                value={g}
                checked={gender === g}
                onChange={() => setGender(g)}
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      {/* Current Job */}
      <div style={fieldStyle}>
        <label style={labelStyle}>現職</label>
        <input
          type="text"
          value={currentJob}
          onChange={(e) => setCurrentJob(e.target.value)}
          placeholder="現在の職業"
          style={inputStyle}
        />
      </div>

      {/* Date / Job / Source */}
      <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>応募日</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>職種</label>
          <select
            value={job}
            onChange={(e) => setJob(e.target.value)}
            style={inputStyle}
          >
            <option value="">選択してください</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.name}>
                {j.name}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>応募媒体<span style={requiredMark}>*</span></label>
          <select
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            style={{ ...inputStyle, borderColor: errors.src ? '#EF4444' : '#d1d5db' }}
          >
            <option value="">選択してください</option>
            {sources.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.src && <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.src}</div>}
        </div>
      </div>

      {/* Status / Base */}
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>ステータス</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            style={inputStyle}
          >
            <option value="">選択してください</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>拠点<span style={requiredMark}>*</span></label>
          {isChild ? (
            <>
              <input
                type="text"
                value={lockedBaseName || '未設定'}
                disabled
                readOnly
                style={{ ...inputStyle, backgroundColor: '#F3F4F6', color: '#6B7280', cursor: 'not-allowed' }}
              />
              <div style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
                {lockedBaseName ? '子アカウントは自拠点が自動で設定されます' : '⚠ 自拠点が未設定です。本部アカウントで設定してください'}
              </div>
            </>
          ) : (
            <SearchableSelect
              options={baseOptions}
              value={base}
              onChange={setBase}
              placeholder="拠点を選択"
              style={{ border: errors.base ? '1px solid #EF4444' : undefined, borderRadius: '6px' }}
            />
          )}
          {errors.base && <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.base}</div>}
        </div>
      </div>

      {/* Preferred dates */}
      <div style={fieldStyle}>
        <label style={labelStyle}>面接希望日時</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={prefDateInput}
            onChange={(e) => setPrefDateInput(e.target.value)}
            style={{ ...inputStyle, flex: '1 1 140px' }}
          />
          <input
            type="time"
            value={prefTimeInput}
            onChange={(e) => setPrefTimeInput(e.target.value)}
            placeholder="時間（任意）"
            style={{ ...inputStyle, flex: '0 0 120px' }}
          />
          <button
            type="button"
            onClick={() => {
              if (prefDateInput) {
                const entry: PrefDateTime = { date: prefDateInput, time: prefTimeInput };
                const isDup = prefDates.some(p => p.date === entry.date && p.time === entry.time);
                if (!isDup) {
                  setPrefDates((prev) => [...prev, entry]);
                  setPrefDateInput('');
                  setPrefTimeInput('');
                }
              }
            }}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: 'var(--color-primary, #3B82F6)',
              color: '#fff',
              fontSize: '0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            追加
          </button>
        </div>
        {prefDates.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {prefDates.map((d, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.25rem 0.625rem',
                  backgroundColor: '#EFF6FF',
                  color: '#1D4ED8',
                  borderRadius: '9999px',
                  fontSize: '0.8125rem',
                }}
              >
                {d.date}{d.time ? ` ${d.time}` : ''}
                <button
                  type="button"
                  onClick={() => setPrefDates((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#1D4ED8',
                    fontSize: '0.875rem',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Note */}
      <div style={fieldStyle}>
        <label style={labelStyle}>メモ</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="自由入力"
          rows={4}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          marginTop: '0.5rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: '0.5rem 1.25rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            backgroundColor: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
            color: '#374151',
          }}
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: '0.5rem 1.25rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: 'var(--color-primary, #3B82F6)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          追加
        </button>
      </div>
    </Modal>
  );
};

export default AddApplicantModal;
