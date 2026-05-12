import React, { useState, useEffect, useMemo } from 'react';
import { Copy, X } from 'lucide-react';
import Modal from '@/components/Modal';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { warekiToDate } from '@/utils/wareki';
import { normalizeFurigana, isKatakanaOnly } from '@/utils/furigana';
import { today, calcAge } from '@/utils/date';
import { applicantRepository, resolveDataOwnerId } from '@/repositories';
import type { Applicant, ClientData } from '@/types';

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
  const { clientData, reloadClientData, logAction, client } = useAuth();
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exclusionAlert, setExclusionAlert] = useState('');

  // 過去応募者からの複製（再応募用）
  const [prefillOpen, setPrefillOpen] = useState(false);
  const [prefillQuery, setPrefillQuery] = useState('');
  const [prefilledFromName, setPrefilledFromName] = useState<string | null>(null);

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
      setErrors({});
      setExclusionAlert('');
      setPrefillOpen(false);
      setPrefillQuery('');
      setPrefilledFromName(null);
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
  // O-5: baseScope.ts を撤去し inline 解決に変更（既存 JobManagement.tsx と同じパターン）。
  // scopeBaseName 指定 + 拠点別オーバーライドありなら override 層、それ以外は全社共通にフォールバック。
  const sources = useMemo(() => {
    if (!clientData) return [];
    if (scopeBaseName && clientData.sourcesByBase?.[scopeBaseName]) {
      return clientData.sourcesByBase[scopeBaseName];
    }
    return clientData.sources || [];
  }, [clientData, scopeBaseName]);
  const bases = useMemo(() => clientData?.bases || [], [clientData]);
  const jobs = useMemo(() => {
    if (!clientData) return [];
    if (scopeBaseName && clientData.jobsByBase?.[scopeBaseName]) {
      return clientData.jobsByBase[scopeBaseName];
    }
    return clientData.jobs || [];
  }, [clientData, scopeBaseName]);

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
      prefDates: [],
      intResult: '',
      intMethod: '',
      active: true,
      duplicate: isDuplicate,
      files: [],
      jobInfo: { jobId: '', jobNumber: '', productName: '', jobName: '', publishedJobType: '', companyName: '' },
      chatAnswers: [],
    };

    // 新規応募者は Repository 経由で作成。createdAt/updatedAt/stageChangedAt が自動付与される。
    // 既存応募者の重複フラグは applicantRepository.markDuplicateByMatch で更新（O-3）。
    // scope.baseName で子アカウントの base 絞込ロジックを Repository 側に再現。
    if (client) {
      const ownerId = resolveDataOwnerId(client);
      const scopeBase = client.accountType === 'child' ? (client.baseName || null) : null;
      applicantRepository.markDuplicateByMatch(
        ownerId,
        { name: applicant.name, phone: applicant.phone },
        { baseName: scopeBase },
      );
      applicantRepository.create(ownerId, applicant);
      reloadClientData();
    }
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

  // 過去応募者の検索候補（氏名/フリガナ/電話/メールで部分一致）
  const prefillCandidates = useMemo(() => {
    if (!clientData || !prefillQuery.trim()) return [];
    const q = prefillQuery.trim().toLowerCase();
    const qPhone = q.replace(/[-\s]/g, '');
    // 同名複数応募の最新を上位にしたいので、id 降順でソート
    const sorted = [...clientData.applicants].sort((a, b) => b.id - a.id);
    const seen = new Set<string>();
    const matched: Applicant[] = [];
    for (const a of sorted) {
      const phoneNorm = (a.phone || '').replace(/[-\s]/g, '');
      const hit =
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.furigana && a.furigana.toLowerCase().includes(q)) ||
        (a.email && a.email.toLowerCase().includes(q)) ||
        (qPhone && phoneNorm && phoneNorm.includes(qPhone));
      if (!hit) continue;
      // 同一人物の重複表示を避けるため (氏名+電話) で uniq
      const key = `${a.name}__${phoneNorm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matched.push(a);
      if (matched.length >= 8) break;
    }
    return matched;
  }, [clientData, prefillQuery]);

  const handlePrefill = (src: Applicant) => {
    setName(src.name || '');
    setFurigana(src.furigana || '');
    setEmail(src.email || '');
    setPhone(src.phone || '');
    setBirthDateInput(src.birthDate || '');
    setAge(src.age != null ? String(src.age) : '');
    setAgeManual(true);
    setGender(src.gender || '');
    setCurrentJob(src.currentJob || '');
    // 応募固有フィールド (date/job/src/stage/base/note) は新規入力扱いで触らない
    setPrefilledFromName(src.name || '(名前なし)');
    setPrefillOpen(false);
    setPrefillQuery('');
    setErrors({});
  };

  const clearPrefill = () => {
    setName('');
    setFurigana('');
    setEmail('');
    setPhone('');
    setBirthDateInput('');
    setAge('');
    setAgeManual(false);
    setGender('');
    setCurrentJob('');
    setPrefilledFromName(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="応募者を追加" width="680px">
      {/* 過去応募者から複製（再応募） */}
      <div style={{ marginBottom: '0.875rem', padding: '0.625rem 0.75rem', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
        {!prefillOpen && !prefilledFromName && (
          <button
            type="button"
            onClick={() => setPrefillOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.5rem', border: 'none', backgroundColor: 'transparent', color: '#374151', fontSize: '0.8125rem', cursor: 'pointer' }}
            title="過去に登録済みの応募者から個人情報をコピーして再応募として登録します"
          >
            <Copy size={14} />
            過去応募者から複製
          </button>
        )}

        {prefillOpen && !prefilledFromName && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>過去応募者を検索（氏名・フリガナ・電話・メール）</span>
              <button
                type="button"
                onClick={() => { setPrefillOpen(false); setPrefillQuery(''); }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280', display: 'inline-flex', alignItems: 'center' }}
                aria-label="検索を閉じる"
              >
                <X size={14} />
              </button>
            </div>
            <input
              type="text"
              value={prefillQuery}
              onChange={(e) => setPrefillQuery(e.target.value)}
              placeholder="例: 山田 / ヤマダ / 09012345678"
              autoFocus
              style={inputStyle}
            />
            {prefillQuery.trim() && (
              <div style={{ marginTop: '0.5rem', maxHeight: '220px', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff' }}>
                {prefillCandidates.length === 0 ? (
                  <div style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', color: '#9CA3AF' }}>該当なし</div>
                ) : (
                  prefillCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handlePrefill(c)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid #F3F4F6', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.8125rem' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
                    >
                      <div style={{ fontWeight: 600, color: '#111827' }}>
                        {c.name || '(名前なし)'} <span style={{ fontWeight: 400, color: '#6B7280', fontSize: '0.75rem' }}>{c.furigana ? `（${c.furigana}）` : ''}</span>
                      </div>
                      <div style={{ color: '#6B7280', fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        {[c.phone, c.email, c.date && `前回応募: ${c.date}`, c.job].filter(Boolean).join(' / ')}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {prefilledFromName && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8125rem', color: '#1F2937' }}>
            <span>
              <strong>{prefilledFromName}</strong> さんの過去情報を複製しました（応募日・職種・媒体・ステータス・拠点は新規入力）
            </span>
            <button
              type="button"
              onClick={clearPrefill}
              style={{ border: '1px solid #D1D5DB', backgroundColor: '#fff', borderRadius: '4px', padding: '0.125rem 0.5rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' }}
            >
              クリア
            </button>
          </div>
        )}
      </div>

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
