import React, { useState, useMemo, useCallback, useRef } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, dayOfWeekJP, timeToMinutes, minutesToTime } from '@/utils/date';
import type { InterviewEvent, Base, SlotSetting, Applicant } from '@/types';
import Modal from '@/components/Modal';
import SearchableSelect from '@/components/SearchableSelect';

// ── 定数 ──
const SLOT_INTERVALS = [15, 20, 30, 45, 60, 90, 120] as const;
const EVENT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const DAYS_JP = ['月', '火', '水', '木', '金', '土', '日'] as const;

function generateTimeOptions(start: number, end: number): string[] {
  const opts: string[] = [];
  for (let m = start; m <= end; m += 30) {
    opts.push(minutesToTime(m));
  }
  return opts;
}

const START_TIME_OPTIONS = generateTimeOptions(6 * 60, 23 * 60);
const END_TIME_OPTIONS = generateTimeOptions(6 * 60, 24 * 60);

// ── ユーティリティ ──
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function generateTimeSlots(startTime: string, endTime: string, interval: number): string[] {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const slots: string[] = [];
  for (let m = startMin; m < endMin; m += interval) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}


// ── サブコンポーネント ──

/** 拠点設定バー */
const BaseSettingsBar: React.FC<{
  bases: Base[];
  selectedBase: string;
  onBaseChange: (name: string) => void;
  slotInterval: number;
  onIntervalChange: (v: number) => void;
  startTime: string;
  onStartChange: (v: string) => void;
  endTime: string;
  onEndChange: (v: string) => void;
  customInterval: boolean;
  onCustomIntervalToggle: () => void;
}> = ({ bases, selectedBase, onBaseChange, slotInterval, onIntervalChange, startTime, onStartChange, endTime, onEndChange, customInterval, onCustomIntervalToggle }) => (
  <div style={{
    display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center',
    padding: '0.75rem 1rem', backgroundColor: '#f9fafb', borderRadius: '8px',
    border: '1px solid #e5e7eb', marginBottom: '1rem',
  }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500 }}>
      拠点
      <div style={{ minWidth: '160px' }}>
        <SearchableSelect
          options={bases.map(b => ({ value: b.name, label: b.name }))}
          value={selectedBase}
          onChange={onBaseChange}
          placeholder="拠点を選択"
        />
      </div>
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500 }}>
      スロット間隔
      {customInterval ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={slotInterval}
            onChange={e => {
              const v = Number(e.target.value);
              if (v >= 5 && v <= 240) onIntervalChange(v);
            }}
            style={{ ...selectStyle, width: '70px', textAlign: 'right' }}
          />
          <span style={{ fontSize: '0.8125rem' }}>分</span>
        </div>
      ) : (
        <select value={slotInterval} onChange={e => onIntervalChange(Number(e.target.value))} style={selectStyle}>
          {SLOT_INTERVALS.map(v => <option key={v} value={v}>{v}分</option>)}
        </select>
      )}
      <button
        onClick={onCustomIntervalToggle}
        style={{
          background: 'none', border: '1px solid #d1d5db', borderRadius: '4px',
          padding: '0.125rem 0.375rem', fontSize: '0.6875rem', color: '#6b7280',
          cursor: 'pointer',
        }}
        title={customInterval ? 'プリセットに戻す' : 'カスタム入力'}
      >
        {customInterval ? <ChevronDown size={12} /> : <Pencil size={12} />}
      </button>
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500 }}>
      開始
      <select value={startTime} onChange={e => onStartChange(e.target.value)} style={selectStyle}>
        {START_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500 }}>
      終了
      <select value={endTime} onChange={e => onEndChange(e.target.value)} style={selectStyle}>
        {END_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  </div>
);

const selectStyle: React.CSSProperties = {
  padding: '0.375rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db',
  fontSize: '0.8125rem', backgroundColor: '#fff', cursor: 'pointer',
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #d1d5db',
  backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  ...btnStyle, backgroundColor: '#3B82F6', color: '#fff', border: 'none',
};

const btnDanger: React.CSSProperties = {
  ...btnStyle, backgroundColor: '#EF4444', color: '#fff', border: 'none',
};

// ── 枠一括設定モーダル ──
/** 週番号ヘルパー: 指定月に含まれる週（月曜始まり）のリストを返す */
function getWeeksInMonth(year: number, month: number): { weekNum: number; monday: Date }[] {
  const weeks: { weekNum: number; monday: Date }[] = [];
  const firstDay = new Date(year, month, 1);
  let monday = getMondayOfWeek(firstDay);
  let weekNum = 1;
  while (monday.getMonth() <= month && monday.getFullYear() === year || (weekNum === 1 && monday < firstDay)) {
    weeks.push({ weekNum, monday: new Date(monday) });
    monday = addDays(monday, 7);
    weekNum++;
    // Stop when monday is in a later month and past the last day of target month
    if (monday.getFullYear() > year || (monday.getFullYear() === year && monday.getMonth() > month)) {
      // Include this week only if it still overlaps with the target month
      const lastDayOfMonth = new Date(year, month + 1, 0);
      if (monday <= lastDayOfMonth) {
        weeks.push({ weekNum, monday: new Date(monday) });
      }
      break;
    }
  }
  return weeks;
}

const BulkSlotModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onApply: (dates: string[], capacity: number) => void;
}> = ({ isOpen, onClose, onApply }) => {
  const [mode, setMode] = useState<'month' | 'week' | 'day'>('month');
  const [capacity, setCapacity] = useState(1);
  const [skipWeekend, setSkipWeekend] = useState(true);

  // Month tab state
  const now = new Date();
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthMonth, setMonthMonth] = useState(now.getMonth()); // 0-indexed

  // Week tab state
  const [weekYear, setWeekYear] = useState(now.getFullYear());
  const [weekMonth, setWeekMonth] = useState(now.getMonth());
  const [weekIdx, setWeekIdx] = useState(0);

  // Day tab state
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [miniMonth, setMiniMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const weeksInMonth = useMemo(() => getWeeksInMonth(weekYear, weekMonth), [weekYear, weekMonth]);

  const handleApply = () => {
    let dates: string[] = [];
    if (mode === 'month') {
      const daysInM = new Date(monthYear, monthMonth + 1, 0).getDate();
      for (let d = 1; d <= daysInM; d++) {
        const dt = new Date(monthYear, monthMonth, d);
        if (skipWeekend && isWeekend(dt)) continue;
        dates.push(formatDate(dt));
      }
    } else if (mode === 'week') {
      const week = weeksInMonth[weekIdx];
      if (week) {
        for (let i = 0; i < 7; i++) {
          const dt = addDays(week.monday, i);
          if (skipWeekend && isWeekend(dt)) continue;
          dates.push(formatDate(dt));
        }
      }
    } else {
      dates = Array.from(selectedDays).filter((ds) => {
        if (!skipWeekend) return true;
        const dt = new Date(ds + 'T00:00:00');
        return !isWeekend(dt);
      }).sort();
    }
    if (dates.length > 0) {
      onApply(dates, capacity);
      onClose();
    }
  };

  const miniMonthDays = useMemo(() => {
    const y = miniMonth.getFullYear();
    const m = miniMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInM = new Date(y, m + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const cells: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInM; d++) cells.push(new Date(y, m, d));
    return cells;
  }, [miniMonth]);

  const toggleDay = (dateStr: string) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid #3B82F6' : '2px solid transparent',
    color: active ? '#3B82F6' : '#6b7280', fontSize: '0.875rem', background: 'none', border: 'none',
    borderBottomWidth: '2px', borderBottomStyle: 'solid',
    borderBottomColor: active ? '#3B82F6' : 'transparent',
  });

  // Generate month options for selectors
  const monthOptions = useMemo(() => {
    const opts: { year: number; month: number; label: string }[] = [];
    for (let offset = -6; offset <= 12; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      opts.push({ year: d.getFullYear(), month: d.getMonth(), label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
    }
    return opts;
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="枠一括設定" width="480px">
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '1rem' }}>
        <button onClick={() => setMode('month')} style={tabStyle(mode === 'month')}>月一括</button>
        <button onClick={() => setMode('week')} style={tabStyle(mode === 'week')}>週一括</button>
        <button onClick={() => setMode('day')} style={tabStyle(mode === 'day')}>日毎</button>
      </div>

      {/* ── 月一括タブ ── */}
      {mode === 'month' && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 500 }}>対象月</label>
          <select
            value={`${monthYear}-${monthMonth}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number);
              setMonthYear(y);
              setMonthMonth(m);
            }}
            style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' as const }}
          >
            {monthOptions.map(o => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>
            ))}
          </select>

          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 500 }}>容量（同時面接可能数）</label>
            <input type="number" min={0} max={99} value={capacity} onChange={e => setCapacity(Number(e.target.value))}
              style={{ ...selectStyle, width: '80px' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', marginTop: '0.75rem' }}>
            <input type="checkbox" checked={skipWeekend} onChange={e => setSkipWeekend(e.target.checked)} />
            土日をスキップ
          </label>

          <button onClick={handleApply} style={{ ...btnPrimary, width: '100%', marginTop: '1rem' }}>
            この月の平日全てに適用
          </button>
        </div>
      )}

      {/* ── 週一括タブ ── */}
      {mode === 'week' && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 500 }}>対象月</label>
          <select
            value={`${weekYear}-${weekMonth}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number);
              setWeekYear(y);
              setWeekMonth(m);
              setWeekIdx(0);
            }}
            style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' as const, marginBottom: '0.5rem' }}
          >
            {monthOptions.map(o => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>
            ))}
          </select>

          <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 500 }}>対象週</label>
          <select
            value={weekIdx}
            onChange={e => setWeekIdx(Number(e.target.value))}
            style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' as const }}
          >
            {weeksInMonth.map((w, i) => (
              <option key={i} value={i}>
                {weekYear}年{weekMonth + 1}月 第{w.weekNum}週（{formatDate(w.monday)}〜{formatDate(addDays(w.monday, 6))}）
              </option>
            ))}
          </select>

          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 500 }}>容量（同時面接可能数）</label>
            <input type="number" min={0} max={99} value={capacity} onChange={e => setCapacity(Number(e.target.value))}
              style={{ ...selectStyle, width: '80px' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', marginTop: '0.75rem' }}>
            <input type="checkbox" checked={skipWeekend} onChange={e => setSkipWeekend(e.target.checked)} />
            土日をスキップ
          </label>

          <button onClick={handleApply} style={{ ...btnPrimary, width: '100%', marginTop: '1rem' }}>
            この週に適用
          </button>
        </div>
      )}

      {/* ── 日毎タブ（ミニカレンダー） ── */}
      {mode === 'day' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <button onClick={() => setMiniMonth(new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1))} style={btnStyle}>&lt;</button>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{miniMonth.getFullYear()}年{miniMonth.getMonth() + 1}月</span>
            <button onClick={() => setMiniMonth(new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1))} style={btnStyle}>&gt;</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', fontSize: '0.75rem' }}>
            {DAYS_JP.map(d => <div key={d} style={{ padding: '0.25rem', fontWeight: 600, color: '#6b7280' }}>{d}</div>)}
            {miniMonthDays.map((dt, i) => {
              if (!dt) return <div key={`e-${i}`} />;
              const ds = formatDate(dt);
              const sel = selectedDays.has(ds);
              return (
                <div key={ds} onClick={() => toggleDay(ds)} style={{
                  padding: '0.375rem', cursor: 'pointer', borderRadius: '4px',
                  backgroundColor: sel ? '#3B82F6' : '#f9fafb',
                  color: sel ? '#fff' : isWeekend(dt) ? '#EF4444' : '#374151',
                  fontWeight: sel ? 600 : 400,
                  transition: 'background-color 0.1s',
                }}>{dt.getDate()}</div>
              );
            })}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
            {selectedDays.size}日選択中
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 500 }}>容量（同時面接可能数）</label>
            <input type="number" min={0} max={99} value={capacity} onChange={e => setCapacity(Number(e.target.value))}
              style={{ ...selectStyle, width: '80px' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', marginTop: '0.75rem' }}>
            <input type="checkbox" checked={skipWeekend} onChange={e => setSkipWeekend(e.target.checked)} />
            土日をスキップ
          </label>

          <button onClick={handleApply} style={{ ...btnPrimary, width: '100%', marginTop: '1rem' }}>
            選択した日に一括適用
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
        <button onClick={onClose} style={btnStyle}>キャンセル</button>
      </div>
    </Modal>
  );
};

// ── 予約モーダル ──
const BookingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  dateStr: string;
  timeStr: string;
  baseName: string;
  existingEvents: InterviewEvent[];
  applicants: Applicant[];
  onBook: (ev: Omit<InterviewEvent, 'id'>) => void;
  slotInterval: number;
}> = ({ isOpen, onClose, dateStr, timeStr, baseName, existingEvents, applicants, onBook, slotInterval }) => {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [method, setMethod] = useState<'対面' | 'WEB'>('対面');
  const [applicantId, setApplicantId] = useState<number>(0);
  const [forceBook, setForceBook] = useState(false);

  const overlapping = existingEvents.filter(ev => ev.date === dateStr && ev.start === timeStr);
  const endTime = minutesToTime(timeToMinutes(timeStr) + slotInterval);

  const handleBook = () => {
    if (!title.trim()) return;
    // 重複予約の二重ガード（UIのdisabledが効かない場合の防御）
    if (overlapping.length > 0 && !forceBook) {
      window.alert('この時間帯には既に予約があります。「重複しても予約する」にチェックを入れてください。');
      return;
    }
    onBook({
      applicantId,
      date: dateStr,
      start: timeStr,
      end: endTime,
      title: title.trim(),
      color,
      base: baseName,
      method,
    });
    setTitle('');
    setColor(EVENT_COLORS[0]);
    setMethod('対面');
    setApplicantId(0);
    setForceBook(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="面接予約" width="480px">
      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f0f9ff', borderRadius: '6px', fontSize: '0.8125rem' }}>
        <strong>{dateStr}（{dayOfWeekJP(dateStr)}）{timeStr} - {endTime}</strong>
        <span style={{ marginLeft: '0.75rem', color: '#6b7280' }}>拠点: {baseName}</span>
      </div>

      {overlapping.length > 0 && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#FEF2F2', borderRadius: '6px', fontSize: '0.8125rem' }}>
          <div style={{ fontWeight: 600, color: '#DC2626', marginBottom: '0.375rem' }}>
            この時間帯に{overlapping.length}件の予約があります
          </div>
          {overlapping.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: ev.color, display: 'inline-block' }} />
              {ev.title}（{ev.method}）
            </div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input type="checkbox" checked={forceBook} onChange={e => setForceBook(e.target.checked)} />
            強制予約する
          </label>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem' }}>タイトル</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="面接タイトル"
          style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem' }}>応募者</label>
        <select value={applicantId} onChange={e => setApplicantId(Number(e.target.value))}
          style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
          <option value={0}>（未選択）</option>
          {applicants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem' }}>カラー</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {EVENT_COLORS.map(c => (
            <div key={c} onClick={() => setColor(c)} style={{
              width: '32px', height: '32px', borderRadius: '50%', backgroundColor: c, cursor: 'pointer',
              border: color === c ? '3px solid #1e3a5f' : '3px solid transparent',
              transition: 'border-color 0.15s',
            }} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem' }}>面接方法</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['対面', 'WEB'] as const).map(m => (
            <button key={m} onClick={() => setMethod(m)} style={{
              ...btnStyle, backgroundColor: method === m ? '#3B82F6' : '#fff',
              color: method === m ? '#fff' : '#374151',
              border: method === m ? '1px solid #3B82F6' : '1px solid #d1d5db',
            }}>
              {m === '対面' ? '\uD83C\uDFE2 対面' : '\uD83D\uDCBB WEB'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnStyle}>キャンセル</button>
        <button onClick={handleBook} disabled={!title.trim() || (overlapping.length > 0 && !forceBook)}
          style={{
            ...btnPrimary,
            opacity: (!title.trim() || (overlapping.length > 0 && !forceBook)) ? 0.5 : 1,
            cursor: (!title.trim() || (overlapping.length > 0 && !forceBook)) ? 'not-allowed' : 'pointer',
          }}>
          予約する
        </button>
      </div>
    </Modal>
  );
};

// ── イベント詳細モーダル ──
const EventDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  event: InterviewEvent | null;
  applicant: Applicant | null;
  onCancel: (id: number) => void;
  onNavigateApplicant?: (id: number) => void;
}> = ({ isOpen, onClose, event, applicant, onCancel, onNavigateApplicant }) => {
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!event) return null;

  return (
    <Modal isOpen={isOpen} onClose={() => { setConfirmCancel(false); onClose(); }} title="面接詳細" width="480px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            width: '14px', height: '14px', borderRadius: '50%', backgroundColor: event.color,
            display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>{event.title}</span>
          <span style={{
            fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px',
            backgroundColor: event.method === 'WEB' ? '#DBEAFE' : '#D1FAE5',
            color: event.method === 'WEB' ? '#1D4ED8' : '#065F46',
          }}>
            {event.method === 'WEB' ? '\uD83D\uDCBB WEB' : '\uD83C\uDFE2 対面'}
          </span>
        </div>

        <div style={{ fontSize: '0.8125rem', color: '#374151', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.375rem 1rem' }}>
          <span style={{ color: '#6b7280' }}>拠点</span><span>{event.base}</span>
          <span style={{ color: '#6b7280' }}>日時</span><span>{event.date}（{dayOfWeekJP(event.date)}）{event.start} - {event.end}</span>
        </div>

        {applicant && (
          <div style={{
            padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px',
            fontSize: '0.8125rem', border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.375rem' }}>応募者情報</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem' }}>
              <span style={{ color: '#6b7280' }}>氏名</span><span>{applicant.name}</span>
              <span style={{ color: '#6b7280' }}>メール</span><span>{applicant.email}</span>
              <span style={{ color: '#6b7280' }}>電話</span><span>{applicant.phone}</span>
            </div>
            {onNavigateApplicant && (
              <button onClick={() => onNavigateApplicant(applicant.id)}
                style={{ ...btnStyle, marginTop: '0.5rem', fontSize: '0.75rem' }}>
                応募者詳細を見る
              </button>
            )}
          </div>
        )}

        {!confirmCancel ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={onClose} style={btnStyle}>閉じる</button>
            <button onClick={() => setConfirmCancel(true)} style={btnDanger}>キャンセル</button>
          </div>
        ) : (
          <div style={{
            padding: '0.75rem', backgroundColor: '#FEF2F2', borderRadius: '6px',
            border: '1px solid #FECACA',
          }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#DC2626', margin: '0 0 0.5rem' }}>
              この面接予約をキャンセルしますか？
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmCancel(false)} style={btnStyle}>戻る</button>
              <button onClick={() => { onCancel(event.id); setConfirmCancel(false); onClose(); }} style={btnDanger}>
                削除する
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ── メインコンポーネント ──
const Calendar: React.FC = () => {
  const { clientData, updateClientData } = useAuth();

  // 週の基準日
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  // 拠点
  const bases = clientData?.bases ?? [];
  const [selectedBase, setSelectedBase] = useState(() => {
    const urlBase = new URLSearchParams(window.location.search).get('base');
    if (urlBase && bases.some(b => b.name === urlBase)) return urlBase;
    return bases[0]?.name ?? '';
  });
  // 設定
  const currentBase = bases.find(b => b.name === selectedBase);
  const [slotInterval, setSlotInterval] = useState(currentBase?.slotInterval ?? 30);
  const [startTime, setStartTime] = useState(currentBase?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(currentBase?.endTime ?? '18:00');
  // 編集モード
  const [editMode, setEditMode] = useState(false);
  // ドラッグ選択
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragRef = useRef(false);
  // モーダル
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bookingModal, setBookingModal] = useState<{ dateStr: string; timeStr: string } | null>(null);
  const [detailEvent, setDetailEvent] = useState<InterviewEvent | null>(null);
  // 枠数編集ポップオーバー
  const [capacityEdit, setCapacityEdit] = useState<{ dateStr: string; timeStr: string; value: number } | null>(null);
  // カスタムスロット間隔
  const [customInterval, setCustomInterval] = useState(false);

  // 拠点変更時に設定反映
  const handleBaseChange = useCallback((name: string) => {
    setSelectedBase(name);
    const b = bases.find(x => x.name === name);
    if (b) {
      setSlotInterval(b.slotInterval || 30);
      setStartTime(b.startTime || '09:00');
      setEndTime(b.endTime || '18:00');
    }
  }, [bases]);

  // 設定保存
  const saveBaseSettings = useCallback((interval: number, start: string, end: string) => {
    if (!selectedBase) return;
    updateClientData(data => ({
      ...data,
      bases: data.bases.map(b => b.name === selectedBase ? { ...b, slotInterval: interval, startTime: start, endTime: end } : b),
    }));
  }, [selectedBase, updateClientData]);

  const handleIntervalChange = (v: number) => { setSlotInterval(v); saveBaseSettings(v, startTime, endTime); };
  const handleStartChange = (v: string) => { setStartTime(v); saveBaseSettings(slotInterval, v, endTime); };
  const handleEndChange = (v: string) => { setEndTime(v); saveBaseSettings(slotInterval, startTime, v); };

  // 週データ
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const timeSlots = useMemo(() => generateTimeSlots(startTime, endTime, slotInterval), [startTime, endTime, slotInterval]);

  // スロット設定
  const slotSettings = clientData?.slotSettings ?? {};
  const baseSlots: SlotSetting = slotSettings[selectedBase] ?? {};

  const getCapacity = (dateStr: string, timeStr: string): number => {
    return baseSlots[dateStr]?.[timeStr] ?? 0;
  };

  // イベント
  const events = clientData?.events ?? [];
  const applicants = clientData?.applicants ?? [];
  const weekEvents = useMemo(() => {
    const dateSet = new Set(weekDates.map(d => formatDate(d)));
    return events.filter(ev => ev.base === selectedBase && dateSet.has(ev.date));
  }, [events, selectedBase, weekDates]);

  const getEventsAt = (dateStr: string, timeStr: string) =>
    weekEvents.filter(ev => ev.date === dateStr && ev.start === timeStr);

  const getBookedCount = (dateStr: string, timeStr: string) => getEventsAt(dateStr, timeStr).length;

  // 枠操作
  const setSlotCapacity = useCallback((dateStr: string, timeStr: string, capacity: number) => {
    updateClientData(data => {
      const ss = { ...data.slotSettings };
      if (!ss[selectedBase]) ss[selectedBase] = {};
      const dateSlots = { ...ss[selectedBase][dateStr] };
      dateSlots[timeStr] = capacity;
      ss[selectedBase] = { ...ss[selectedBase], [dateStr]: dateSlots };
      return { ...data, slotSettings: ss };
    });
  }, [selectedBase, updateClientData]);

  const toggleSlot = useCallback((dateStr: string, timeStr: string) => {
    const current = getCapacity(dateStr, timeStr);
    const newVal = current > 0 ? 0 : 1;
    setSlotCapacity(dateStr, timeStr, newVal);
    return newVal;
  }, [getCapacity, setSlotCapacity]);

  // セルクリック
  const handleCellClick = (dateStr: string, timeStr: string) => {
    if (editMode) {
      // 枠数編集ポップオーバーを表示
      const current = getCapacity(dateStr, timeStr);
      setCapacityEdit({ dateStr, timeStr, value: current });
    } else {
      const cap = getCapacity(dateStr, timeStr);
      const booked = getBookedCount(dateStr, timeStr);
      if (cap > 0 && booked < cap) {
        setBookingModal({ dateStr, timeStr });
      }
    }
  };

  // 枠数確定
  const applyCapacityEdit = () => {
    if (capacityEdit) {
      setSlotCapacity(capacityEdit.dateStr, capacityEdit.timeStr, capacityEdit.value);
      setCapacityEdit(null);
    }
  };

  // ドラッグ
  const handleCellMouseDown = (dateStr: string, timeStr: string) => {
    if (!editMode) return;
    const newVal = toggleSlot(dateStr, timeStr);
    setIsDragging(true);
    setDragValue(newVal);
    dragRef.current = true;
  };

  const handleCellMouseEnter = (dateStr: string, timeStr: string) => {
    if (!editMode || !dragRef.current || dragValue === null) return;
    setSlotCapacity(dateStr, timeStr, dragValue);
  };

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragValue(null);
    dragRef.current = false;
  }, []);

  // 一括操作
  const bulkSetAllSlots = (capacity: number, weekdaysOnly: boolean) => {
    updateClientData(data => {
      const ss = { ...data.slotSettings };
      if (!ss[selectedBase]) ss[selectedBase] = {};
      weekDates.forEach(dt => {
        if (weekdaysOnly && isWeekend(dt)) return;
        const dateStr = formatDate(dt);
        const dateSlots: Record<string, number> = {};
        timeSlots.forEach(ts => { dateSlots[ts] = capacity; });
        ss[selectedBase] = { ...ss[selectedBase], [dateStr]: { ...ss[selectedBase][dateStr], ...dateSlots } };
      });
      return { ...data, slotSettings: ss };
    });
  };

  const handleBulkApply = (dates: string[], capacity: number) => {
    updateClientData(data => {
      const ss = { ...data.slotSettings };
      if (!ss[selectedBase]) ss[selectedBase] = {};
      dates.forEach(dateStr => {
        const dateSlots: Record<string, number> = {};
        timeSlots.forEach(ts => { dateSlots[ts] = capacity; });
        ss[selectedBase] = { ...ss[selectedBase], [dateStr]: { ...ss[selectedBase][dateStr], ...dateSlots } };
      });
      return { ...data, slotSettings: ss };
    });
  };

  // 予約
  const handleBook = (ev: Omit<InterviewEvent, 'id'>) => {
    updateClientData(data => {
      const maxId = data.events.reduce((mx, e) => Math.max(mx, e.id), 0);
      return { ...data, events: [...data.events, { ...ev, id: maxId + 1 }] };
    });
  };

  // イベント削除
  const handleCancelEvent = (id: number) => {
    updateClientData(data => ({
      ...data,
      events: data.events.filter(e => e.id !== id),
    }));
  };

  // ナビゲーション
  const goToday = () => { setCapacityEdit(null); setWeekStart(getMondayOfWeek(new Date())); };
  const goPrev = () => { setCapacityEdit(null); setWeekStart(addDays(weekStart, -7)); };
  const goNext = () => { setCapacityEdit(null); setWeekStart(addDays(weekStart, 7)); };

  const todayStr = formatDate(new Date());

  if (!clientData) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>読み込み中...</div>;
  }

  return (
    <div style={{ padding: '1.25rem', userSelect: isDragging ? 'none' : 'auto' }} onMouseUp={handleMouseUp}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>面接カレンダー</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => setEditMode(!editMode)} style={{
            ...btnStyle,
            backgroundColor: editMode ? '#FEF3C7' : '#fff',
            borderColor: editMode ? '#F59E0B' : '#d1d5db',
            color: editMode ? '#92400E' : '#374151',
          }}>
            {editMode ? '\u270F\uFE0F 編集モードON' : '\u270F\uFE0F 編集モード'}
          </button>
        </div>
      </div>

      {/* 拠点設定バー */}
      <BaseSettingsBar
        bases={bases} selectedBase={selectedBase} onBaseChange={handleBaseChange}
        slotInterval={slotInterval} onIntervalChange={handleIntervalChange}
        startTime={startTime} onStartChange={handleStartChange}
        endTime={endTime} onEndChange={handleEndChange}
        customInterval={customInterval}
        onCustomIntervalToggle={() => setCustomInterval(!customInterval)}
      />

      {/* 編集モードツールバー */}
      {editMode && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem 1rem',
          backgroundColor: '#FFFBEB', borderRadius: '8px', border: '1px solid #FDE68A',
          marginBottom: '1rem', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400E', marginRight: '0.5rem' }}>
            枠管理
          </span>
          <button onClick={() => bulkSetAllSlots(1, false)} style={btnStyle}>全枠開放</button>
          <button onClick={() => bulkSetAllSlots(0, false)} style={btnStyle}>全枠閉鎖</button>
          <button onClick={() => bulkSetAllSlots(1, true)} style={btnStyle}>平日のみ開放</button>
          <button onClick={() => setBulkModalOpen(true)} style={btnPrimary}>一括設定</button>
        </div>
      )}

      {/* 週ナビゲーション */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem',
      }}>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button onClick={goPrev} style={btnStyle}>&lt; 前週</button>
          <button onClick={goToday} style={btnPrimary}>今週</button>
          <button onClick={goNext} style={btnStyle}>次週 &gt;</button>
        </div>
        <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
          {weekStart.getFullYear()}年{weekStart.getMonth() + 1}月
        </span>
      </div>

      {/* カレンダーグリッド */}
      {bases.length === 0 ? (
        <div style={{
          padding: '3rem 2rem', textAlign: 'center', color: '#6b7280',
          backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb',
        }}>
          拠点が設定されていません。「拠点管理」から拠点を追加してください。
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '72px repeat(7, 1fr)',
            minWidth: '800px',
          }}>
            {/* ヘッダー行 */}
            <div style={headerCellStyle} />
            {weekDates.map((dt, i) => {
              const ds = formatDate(dt);
              const isToday = ds === todayStr;
              const weekend = isWeekend(dt);
              return (
                <div key={ds} style={{
                  ...headerCellStyle,
                  backgroundColor: isToday ? '#EFF6FF' : weekend ? '#fef2f2' : '#f9fafb',
                  borderLeft: '1px solid #e5e7eb',
                }}>
                  <div style={{ fontSize: '0.6875rem', color: weekend ? '#EF4444' : '#6b7280' }}>
                    {DAYS_JP[i]}
                  </div>
                  <div style={{
                    fontSize: '1rem', fontWeight: isToday ? 700 : 500,
                    color: isToday ? '#3B82F6' : weekend ? '#EF4444' : '#374151',
                  }}>
                    {dt.getDate()}
                  </div>
                  <div style={{ fontSize: '0.625rem', color: '#9ca3af' }}>
                    {dt.getMonth() + 1}月
                  </div>
                </div>
              );
            })}

            {/* 時間行 */}
            {timeSlots.map(ts => (
              <React.Fragment key={ts}>
                {/* 時間ラベル */}
                <div style={{
                  padding: '0.25rem 0.5rem', fontSize: '0.6875rem', color: '#6b7280',
                  borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'flex-end', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                }}>
                  {ts}
                </div>

                {/* 日別セル */}
                {weekDates.map(dt => {
                  const dateStr = formatDate(dt);
                  const cap = getCapacity(dateStr, ts);
                  const evts = getEventsAt(dateStr, ts);
                  const booked = evts.length;
                  const remaining = cap - booked;
                  const isToday = dateStr === todayStr;
                  const weekend = isWeekend(dt);
                  const available = cap > 0 && remaining > 0;
                  const full = cap > 0 && remaining <= 0;

                  return (
                    <div
                      key={`${dateStr}-${ts}`}
                      onMouseDown={(e) => { e.preventDefault(); handleCellMouseDown(dateStr, ts); }}
                      onMouseEnter={() => handleCellMouseEnter(dateStr, ts)}
                      onClick={() => { if (!dragRef.current) handleCellClick(dateStr, ts); }}
                      style={{
                        borderTop: '1px solid #e5e7eb',
                        borderLeft: '1px solid #e5e7eb',
                        padding: '0.25rem',
                        minHeight: '48px',
                        backgroundColor:
                          editMode
                            ? cap > 0 ? '#ECFDF5' : weekend ? '#fef2f2' : '#fff'
                            : isToday ? '#FAFBFF' : weekend ? '#FFFBFB' : '#fff',
                        cursor: editMode ? 'crosshair' : available ? 'pointer' : 'default',
                        transition: 'background-color 0.1s',
                        position: 'relative',
                      }}
                    >
                      {/* 残枠表示 */}
                      {cap > 0 && (
                        <div style={{
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          textAlign: 'right',
                          color: full ? '#EF4444' : '#10B981',
                          marginBottom: '0.125rem',
                        }}>
                          {full ? '満員' : `${remaining}枠`}
                        </div>
                      )}
                      {editMode && cap === 0 && (
                        <div style={{
                          fontSize: '0.625rem', textAlign: 'right', color: '#d1d5db',
                        }}>
                          --
                        </div>
                      )}

                      {/* 枠数編集ポップオーバー */}
                      {editMode && capacityEdit && capacityEdit.dateStr === dateStr && capacityEdit.timeStr === ts && (
                        <div
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          style={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            zIndex: 20, backgroundColor: '#fff', borderRadius: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: '0.5rem',
                            display: 'flex', flexDirection: 'column', gap: '0.375rem', minWidth: '100px',
                          }}
                        >
                          <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#374151' }}>枠数</label>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={capacityEdit.value}
                            onChange={e => setCapacityEdit({ ...capacityEdit, value: Math.max(0, Number(e.target.value)) })}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') applyCapacityEdit();
                              if (e.key === 'Escape') setCapacityEdit(null);
                            }}
                            style={{
                              width: '60px', padding: '0.25rem 0.375rem', border: '1px solid #d1d5db',
                              borderRadius: '4px', fontSize: '0.8125rem', textAlign: 'center',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={applyCapacityEdit}
                              style={{
                                flex: 1, padding: '0.25rem', backgroundColor: '#3B82F6', color: '#fff',
                                border: 'none', borderRadius: '4px', fontSize: '0.6875rem', cursor: 'pointer',
                              }}
                            >
                              設定
                            </button>
                            <button
                              onClick={() => setCapacityEdit(null)}
                              style={{
                                flex: 1, padding: '0.25rem', backgroundColor: '#f3f4f6',
                                border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.6875rem', cursor: 'pointer',
                              }}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}

                      {/* イベントカード */}
                      {evts.map(ev => (
                        <div
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); setDetailEvent(ev); }}
                          style={{
                            padding: '0.1875rem 0.375rem',
                            borderRadius: '4px',
                            backgroundColor: ev.color + '20',
                            borderLeft: `3px solid ${ev.color}`,
                            fontSize: '0.6875rem',
                            lineHeight: 1.3,
                            marginBottom: '0.125rem',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <span style={{ marginRight: '0.25rem' }}>
                            {ev.method === 'WEB' ? '\uD83D\uDCBB' : '\uD83C\uDFE2'}
                          </span>
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* モーダル群 */}
      <BulkSlotModal isOpen={bulkModalOpen} onClose={() => setBulkModalOpen(false)} onApply={handleBulkApply} />

      {bookingModal && (
        <BookingModal
          isOpen={!!bookingModal}
          onClose={() => setBookingModal(null)}
          dateStr={bookingModal.dateStr}
          timeStr={bookingModal.timeStr}
          baseName={selectedBase}
          existingEvents={events}
          applicants={applicants}
          onBook={handleBook}
          slotInterval={slotInterval}
        />
      )}

      <EventDetailModal
        isOpen={!!detailEvent}
        onClose={() => setDetailEvent(null)}
        event={detailEvent}
        applicant={detailEvent ? applicants.find(a => a.id === detailEvent.applicantId) ?? null : null}
        onCancel={handleCancelEvent}
      />
    </div>
  );
};

const headerCellStyle: React.CSSProperties = {
  padding: '0.5rem', textAlign: 'center',
  backgroundColor: '#f9fafb', position: 'sticky', top: 0, zIndex: 1,
};

export default Calendar;
