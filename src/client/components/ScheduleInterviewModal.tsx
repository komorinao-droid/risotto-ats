import React, { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { today } from '@/utils/date';
import type { Applicant, InterviewEvent } from '@/types';

interface ScheduleInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicant: Applicant;
  prefillDate?: string;
  prefillTime?: string;
  onScheduled: (event: InterviewEvent) => void;
}

const INTERVIEW_COLORS = ['#3B82F6', '#22C55E', '#8B5CF6', '#EAB308', '#EF4444', '#F97316'];

function generateTimeOptions(startTime: string, endTime: string, intervalMin: number): string[] {
  const options: string[] = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let cur = sh * 60 + sm;
  const end = eh * 60 + em;
  while (cur <= end) {
    options.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
    cur += intervalMin;
  }
  return options;
}

// 拠点設定に依存しない全選択肢（フォールバック用）
const ALL_TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    ALL_TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

const ScheduleInterviewModal: React.FC<ScheduleInterviewModalProps> = ({
  isOpen,
  onClose,
  applicant,
  prefillDate,
  prefillTime,
  onScheduled,
}) => {
  const { clientData } = useAuth();

  const [date, setDate] = useState(prefillDate || '');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [color, setColor] = useState(INTERVIEW_COLORS[0]);
  const [method, setMethod] = useState<'対面' | 'WEB'>('対面');
  const [isBlocked, setIsBlocked] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [overlapInfo, setOverlapInfo] = useState('');
  const [showIntervalWarning, setShowIntervalWarning] = useState(false);

  // Reset when opening
  React.useEffect(() => {
    if (isOpen) {
      setDate(prefillDate || '');
      // prefillTime が指定されていれば開始時間にセット（拠点スロットに含まれる時間のみ適用）
      const initTime = prefillTime || '';
      setStartTime(initTime);
      // 終了時間は開始時間 + スロット間隔で自動セット（後の baseSettings が確定してから）
      setEndTime('');
      setColor(INTERVIEW_COLORS[0]);
      setMethod('対面');
      setIsBlocked(false);
      setErrors({});
      setShowOverlapWarning(false);
      setShowIntervalWarning(false);
    }
  }, [isOpen, prefillDate, prefillTime]);

  // 拠点設定を取得
  const baseSettings = useMemo(() => {
    if (!clientData) return { slotInterval: 30, startTime: '00:00', endTime: '23:45' };
    const base = clientData.bases.find(b => b.name === applicant.base);
    return {
      slotInterval: base?.slotInterval || 30,
      startTime: base?.startTime || '00:00',
      endTime: base?.endTime || '23:45',
    };
  }, [clientData, applicant.base]);

  // 拠点設定に基づく時間選択肢
  const timeOptions = useMemo(() => {
    return generateTimeOptions(baseSettings.startTime, baseSettings.endTime, baseSettings.slotInterval);
  }, [baseSettings]);

  // prefillTime が指定されていれば終了時間も自動セット
  React.useEffect(() => {
    if (isOpen && prefillTime && timeOptions.includes(prefillTime)) {
      setStartTime(prefillTime);
      const [h, m] = prefillTime.split(':').map(Number);
      const total = h * 60 + m + baseSettings.slotInterval;
      const endH = Math.floor(total / 60);
      const endM = total % 60;
      if (endH < 24) {
        const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        setEndTime(endStr);
      }
    }
  }, [isOpen, prefillTime, timeOptions, baseSettings.slotInterval]);

  function handleStartTimeChange(value: string) {
    setStartTime(value);
    if (value) {
      const [h, m] = value.split(':').map(Number);
      const total = h * 60 + m + baseSettings.slotInterval;
      const endH = Math.floor(total / 60);
      const endM = total % 60;
      if (endH < 24) {
        setEndTime(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`);
      }
    }
  }

  // 選択された時間の間隔が拠点のスロット間隔と一致するか確認
  function isDurationMismatched(): boolean {
    if (!startTime || !endTime) return false;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    return duration > 0 && duration % baseSettings.slotInterval !== 0;
  }

  const overlappingEvents = useMemo(() => {
    if (!clientData || !date || !startTime || !endTime) return [];
    return clientData.events.filter(
      (ev) =>
        ev.base === applicant.base &&
        ev.date === date &&
        ev.start < endTime &&
        ev.end > startTime
    );
  }, [clientData, date, startTime, endTime, applicant.base]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!date) errs.date = '日付を選択してください';
    else if (date < today()) errs.date = '過去の日付は選択できません';
    if (!startTime) errs.startTime = '開始時間を入力してください';
    if (!endTime) errs.endTime = '終了時間を入力してください';
    else if (startTime && endTime <= startTime) errs.endTime = '終了時間は開始時間より後にしてください';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(force = false, skipIntervalCheck = false) {
    if (!validate()) return;

    // スロット間隔チェック
    if (!skipIntervalCheck && isDurationMismatched()) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const duration = (eh * 60 + em) - (sh * 60 + sm);
      setShowIntervalWarning(true);
      void duration; // suppress unused warning
      return;
    }

    // Check overlaps
    if (!force && overlappingEvents.length > 0) {
      setOverlapInfo(
        `${applicant.base}拠点の${date} ${startTime}〜${endTime}に${overlappingEvents.length}件の面接が既に登録されています。強制的に登録しますか？`
      );
      setShowOverlapWarning(true);
      return;
    }

    const newEvent: InterviewEvent = {
      id: Date.now(),
      applicantId: applicant.id,
      date,
      start: startTime,
      end: endTime,
      title: `${applicant.name} 面接`,
      color,
      base: applicant.base,
      method,
    };

    onScheduled(newEvent);
    onClose();
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="面接スケジュール登録" width="480px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 応募者情報 */}
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#F9FAFB', borderRadius: '6px', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
              <div>
                <strong>{applicant.name}</strong>
                <span style={{ color: '#6B7280', marginLeft: '0.75rem' }}>{applicant.base || '拠点未設定'}</span>
              </div>
              {applicant.base && (
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', backgroundColor: '#EFF6FF', color: '#3B82F6', fontWeight: 600 }}>
                    {baseSettings.slotInterval}分間隔
                  </span>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', backgroundColor: '#F0FDF4', color: '#059669', fontWeight: 600 }}>
                    {baseSettings.startTime}〜{baseSettings.endTime}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 日付 */}
          <div>
            <label style={labelStyle}>日付 <span style={{ color: '#EF4444' }}>*</span></label>
            <input
              type="date"
              value={date}
              min={today()}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
            {errors.date && <div style={errorStyle}>{errors.date}</div>}
          </div>

          {/* 時間 */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>開始時間 <span style={{ color: '#EF4444' }}>*</span></label>
              <select
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                style={inputStyle}
              >
                <option value="">--:--</option>
                {timeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {errors.startTime && <div style={errorStyle}>{errors.startTime}</div>}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>終了時間 <span style={{ color: '#EF4444' }}>*</span></label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={inputStyle}
              >
                <option value="">--:--</option>
                {timeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {errors.endTime && <div style={errorStyle}>{errors.endTime}</div>}
            </div>
          </div>

          {/* 面接方法 */}
          <div>
            <label style={labelStyle}>面接方法</label>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
              {(['対面', 'WEB'] as const).map((m) => (
                <label
                  key={m}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: method === m ? '2px solid var(--color-primary)' : '1px solid #D1D5DB',
                    backgroundColor: method === m ? '#EFF6FF' : '#fff',
                    fontWeight: method === m ? 600 : 400,
                  }}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m}
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    style={{ display: 'none' }}
                  />
                  <span>{m === '対面' ? '\u{1F3E2}' : '\u{1F4BB}'}</span>
                  {m}
                </label>
              ))}
            </div>
          </div>


          {/* ブロック済み */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isBlocked}
              onChange={(e) => setIsBlocked(e.target.checked)}
            />
            ブロック枠として登録（容量0）
          </label>

          {/* ボタン */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button onClick={onClose} style={cancelBtnStyle}>
              キャンセル
            </button>
            <button onClick={() => handleSubmit(false)} style={submitBtnStyle}>
              登録
            </button>
          </div>
        </div>
      </Modal>

      {/* スロット間隔不一致の警告モーダル */}
      <Modal
        isOpen={showIntervalWarning}
        onClose={() => setShowIntervalWarning(false)}
        title="スロット間隔の確認"
        width="420px"
      >
        <div>
          <div style={{ padding: '1rem', backgroundColor: '#FEF3C7', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', color: '#92400E' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.375rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}><AlertTriangle size={14} /> スロット間隔が異なります</div>
            <div>
              {applicant.base}拠点のスロット間隔は <strong>{baseSettings.slotInterval}分</strong> に設定されていますが、
              選択した時間（{startTime}〜{endTime}）はこの間隔と一致していません。
            </div>
            <div style={{ marginTop: '0.5rem' }}>このまま登録しますか？</div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowIntervalWarning(false)} style={cancelBtnStyle}>
              戻る
            </button>
            <button
              onClick={() => {
                setShowIntervalWarning(false);
                handleSubmit(false, true);
              }}
              style={{ ...submitBtnStyle, backgroundColor: '#F59E0B' }}
            >
              OK・このまま登録
            </button>
          </div>
        </div>
      </Modal>

      {/* 重複警告モーダル */}
      <Modal
        isOpen={showOverlapWarning}
        onClose={() => setShowOverlapWarning(false)}
        title="時間帯重複の警告"
        width="420px"
      >
        <div>
          <div style={{ padding: '1rem', backgroundColor: '#FEF3C7', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', color: '#92400E' }}>
            {overlapInfo}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowOverlapWarning(false)} style={cancelBtnStyle}>
              キャンセル
            </button>
            <button
              onClick={() => {
                setShowOverlapWarning(false);
                handleSubmit(true, true);
              }}
              style={{ ...submitBtnStyle, backgroundColor: '#F59E0B' }}
            >
              強制登録
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '0.375rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = {
  color: '#EF4444',
  fontSize: '0.75rem',
  marginTop: '0.25rem',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  backgroundColor: '#fff',
  fontSize: '0.875rem',
  color: '#374151',
  cursor: 'pointer',
};

const submitBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'var(--color-primary, #3B82F6)',
  color: '#fff',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export default ScheduleInterviewModal;
