import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ChatLeadSetting, ChatLeadQuestion, ChatLeadChoice,
  ChatInterviewCalendar,
} from '@/types';

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function newId(items: { id: number }[]): number {
  return items.length ? Math.max(...items.map(x => x.id)) + 1 : 1;
}

const S = {
  inp: {
    padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px',
    fontSize: '0.875rem', width: '100%', boxSizing: 'border-box' as const,
  },
  lbl: {
    fontSize: '0.8rem', fontWeight: 600, color: '#374151',
    marginBottom: '4px', display: 'block',
  } as React.CSSProperties,
  card: {
    border: '1px solid #e5e7eb', borderRadius: '10px',
    padding: '16px', marginBottom: '12px', background: '#fff',
  } as React.CSSProperties,
};

function ta(rows = 2): React.CSSProperties {
  return { ...S.inp, resize: 'vertical' as const, fontFamily: 'inherit', minHeight: `${rows * 1.6}rem` };
}

function secStyle(): React.CSSProperties {
  return {
    fontSize: '0.9rem', fontWeight: 700, color: '#1f2937',
    borderBottom: '2px solid #3b82f6', paddingBottom: '6px',
    marginBottom: '14px', marginTop: '24px', display: 'block',
  };
}

const ALL_METHODS = ['対面', 'WEB', '電話'] as const;

// ── 回答タイプ切替 ────────────────────────────────────────────────────────────

type AnsType = 'single' | 'multiple' | 'freetext';
const ANS: Record<AnsType, string> = { single: '単一選択', multiple: '複数選択', freetext: 'フリーテキスト' };

const AnsTypeToggle: React.FC<{ value: AnsType; onChange: (v: AnsType) => void }> = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
    {(['single', 'multiple', 'freetext'] as AnsType[]).map(t => (
      <button key={t} onClick={() => onChange(t)} style={{
        padding: '4px 14px', border: `1px solid ${value === t ? '#3b82f6' : '#d1d5db'}`,
        borderRadius: '6px', background: value === t ? '#eff6ff' : '#fff',
        color: value === t ? '#2563eb' : '#6b7280',
        cursor: 'pointer', fontSize: '0.8rem', fontWeight: value === t ? 700 : 400,
      }}>{ANS[t]}</button>
    ))}
  </div>
);

// ── 選択肢エディタ ────────────────────────────────────────────────────────────

const ChoiceList: React.FC<{
  choices: ChatLeadChoice[];
  onChange: (choices: ChatLeadChoice[]) => void;
}> = ({ choices, onChange }) => {
  const set = (cid: number, patch: Partial<ChatLeadChoice>) =>
    onChange(choices.map(c => c.id === cid ? { ...c, ...patch } : c));
  const add = () =>
    onChange([...choices, { id: newId(choices), label: '選択肢', judgment: 'ok', action: 'next' }]);
  const del = (cid: number) => onChange(choices.filter(c => c.id !== cid));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= choices.length) return;
    const next = [...choices];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div>
      <span style={S.lbl}>回答選択肢</span>
      {choices.map((c, i) => (
        <div key={c.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button onClick={() => move(i, i - 1)} disabled={i === 0}
              style={{ padding: '0 6px', border: '1px solid #e5e7eb', borderRadius: '3px', background: '#fff', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.35 : 1, fontSize: '0.65rem', lineHeight: 1.2 }}>▲</button>
            <button onClick={() => move(i, i + 1)} disabled={i === choices.length - 1}
              style={{ padding: '0 6px', border: '1px solid #e5e7eb', borderRadius: '3px', background: '#fff', cursor: i === choices.length - 1 ? 'default' : 'pointer', opacity: i === choices.length - 1 ? 0.35 : 1, fontSize: '0.65rem', lineHeight: 1.2 }}>▼</button>
          </div>
          <input value={c.label} onChange={e => set(c.id, { label: e.target.value })}
            style={{ ...S.inp, width: '160px' }} placeholder="選択肢ラベル" />
          <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
            {(['ok', 'ng'] as const).map(j => (
              <button key={j} onClick={() => set(c.id, { judgment: j })} style={{
                padding: '4px 12px', border: 'none', cursor: 'pointer', fontSize: '0.78rem',
                background: c.judgment === j ? (j === 'ok' ? '#dcfce7' : '#fee2e2') : '#f9fafb',
                color: c.judgment === j ? (j === 'ok' ? '#16a34a' : '#dc2626') : '#9ca3af',
                fontWeight: c.judgment === j ? 700 : 400,
              }}>{j.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
            {([['next', '次へ'], ['ng_immediate', 'NG即時']] as [ChatLeadChoice['action'], string][]).map(([val, lbl]) => (
              <button key={val} onClick={() => set(c.id, { action: val })} style={{
                padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: '0.78rem',
                background: c.action === val ? '#eff6ff' : '#f9fafb',
                color: c.action === val ? '#2563eb' : '#9ca3af',
                fontWeight: c.action === val ? 700 : 400,
              }}>{lbl}</button>
            ))}
          </div>
          <button onClick={() => del(c.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button onClick={add}
        style={{ padding: '5px 14px', border: '1px dashed #d1d5db', borderRadius: '6px', background: '#f9fafb', cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280' }}>
        + 選択肢追加
      </button>
    </div>
  );
};

// ── 質問カード ────────────────────────────────────────────────────────────────

const QuestionCard: React.FC<{
  q: ChatLeadQuestion;
  idx: number;
  total: number;
  onChange: (q: ChatLeadQuestion) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({ q, idx, total, onChange, onDelete, onMoveUp, onMoveDown }) => {
  const upd = (patch: Partial<ChatLeadQuestion>) => onChange({ ...q, ...patch });

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1f2937' }}>質問設定 {idx + 1}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={onMoveUp} disabled={idx === 0}
            style={{ padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', background: '#fff', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.35 : 1, fontSize: '0.75rem' }}>▲</button>
          <button onClick={onMoveDown} disabled={idx === total - 1}
            style={{ padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', background: '#fff', cursor: idx === total - 1 ? 'default' : 'pointer', opacity: idx === total - 1 ? 0.35 : 1, fontSize: '0.75rem' }}>▼</button>
          <button onClick={onDelete}
            style={{ padding: '3px 10px', border: '1px solid #fca5a5', borderRadius: '4px', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem' }}>削除</button>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        <div>
          <span style={S.lbl}>質問内容</span>
          <textarea value={q.content} onChange={e => upd({ content: e.target.value })}
            style={ta(2)} placeholder="例: ご希望の週の勤務日数を選択してください。" />
        </div>
        <div>
          <span style={S.lbl}>回答パターン</span>
          <AnsTypeToggle value={q.answerType} onChange={v => upd({ answerType: v, choices: v === 'freetext' ? [] : q.choices })} />
        </div>
        {q.answerType !== 'freetext' && (
          <ChoiceList choices={q.choices} onChange={cs => upd({ choices: cs })} />
        )}
      </div>
    </div>
  );
};

// ── 面接カレンダーカード ──────────────────────────────────────────────────────

const CalendarCard: React.FC<{
  cal: ChatInterviewCalendar;
  bases: string[];
  idx: number;
  onChange: (cal: ChatInterviewCalendar) => void;
  onDelete: () => void;
}> = ({ cal, bases, idx, onChange, onDelete }) => {
  const upd = (patch: Partial<ChatInterviewCalendar>) => onChange({ ...cal, ...patch });

  const toggleMethod = (m: string) => {
    const has = cal.methods.includes(m);
    const next = has ? cal.methods.filter(x => x !== m) : [...cal.methods, m];
    if (next.length > 0) upd({ methods: next });
  };

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1f2937' }}>面接方法カレンダー {idx + 1}</span>
        <button onClick={onDelete}
          style={{ padding: '3px 10px', border: '1px solid #fca5a5', borderRadius: '4px', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem' }}>削除</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <span style={S.lbl}>カレンダー（拠点）</span>
          <select value={cal.baseName} onChange={e => upd({ baseName: e.target.value })} style={S.inp}>
            <option value="">選択してください</option>
            {bases.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <span style={S.lbl}>
            面接方法
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: '6px', fontSize: '0.75rem' }}>
              {cal.methods.length === 1 ? '（1つのみ選択 → 応募者への選択なし）' : `（${cal.methods.length}つ選択 → 応募者が選択）`}
            </span>
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ALL_METHODS.map(m => {
              const active = cal.methods.includes(m);
              return (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: '5px 12px', border: `1px solid ${active ? '#3b82f6' : '#d1d5db'}`, borderRadius: '6px', background: active ? '#eff6ff' : '#fff', fontSize: '0.85rem', color: active ? '#2563eb' : '#374151', fontWeight: active ? 600 : 400 }}>
                  <input type="checkbox" checked={active} onChange={() => toggleMethod(m)} style={{ display: 'none' }} />
                  {m}
                </label>
              );
            })}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={S.lbl}>面接希望日/面接日選択前メッセージ</span>
          <textarea value={cal.preDateMessage} onChange={e => upd({ preDateMessage: e.target.value })}
            style={ta(2)} placeholder="面接希望日程（第1〜第3）を入力してください。" />
        </div>
        {cal.methods.length > 1 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={S.lbl}>面接方法決定後メッセージ</span>
            <textarea value={cal.methodDecidedMessage} onChange={e => upd({ methodDecidedMessage: e.target.value })}
              style={ta(2)} placeholder="入力ありがとうございます。次に面接時間の調整をします。" />
          </div>
        )}
        <div>
          <span style={S.lbl}>チャット終了メッセージ</span>
          <textarea value={cal.chatEndMessage} onChange={e => upd({ chatEndMessage: e.target.value })}
            style={ta(2)} placeholder="ご入力ありがとうございました。" />
        </div>
        <div>
          <span style={S.lbl}>面接確定時メッセージ</span>
          <textarea value={cal.confirmedMessage} onChange={e => upd({ confirmedMessage: e.target.value })}
            style={ta(2)} placeholder="面接日程が確定しました。" />
        </div>
      </div>
    </div>
  );
};

// ── プレビュー ────────────────────────────────────────────────────────────────

type PMsg = { text: string; isBot: boolean };
interface PState {
  msgs: PMsg[];
  phase: 'idle' | 'question' | 'ng' | 'method' | 'calendar' | 'done';
  qi: number;
  calIdx: number;
}

const initP = (): PState => ({ msgs: [], phase: 'idle', qi: 0, calIdx: 0 });

const FreetextInput: React.FC<{ onSend: (t: string) => void }> = ({ onSend }) => {
  const [v, setV] = useState('');
  const send = () => { if (v.trim()) { onSend(v); setV(''); } };
  return (
    <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '6px' }}>
      <input value={v} onChange={e => setV(e.target.value)} placeholder="テキストを入力..."
        onKeyDown={e => { if (e.key === 'Enter') send(); }}
        style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem' }} />
      <button onClick={send}
        style={{ padding: '5px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>
        送信
      </button>
    </div>
  );
};

const ChatPreview: React.FC<{ lead: ChatLeadSetting | null }> = ({ lead }) => {
  const [ps, setPs] = useState<PState>(initP);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ps.msgs]);

  const push = (add: PMsg[], extra?: Partial<PState>) =>
    setPs(p => ({ ...p, msgs: [...p.msgs, ...add], ...extra }));

  // 全質問終了後にカレンダーフェーズへ
  const goCalendar = (um: PMsg) => {
    if (!lead || lead.interviewCalendars.length === 0) {
      push([um, { text: 'ありがとうございました！', isBot: true }], { phase: 'done' });
      return;
    }
    const cal = lead.interviewCalendars[0];
    // 面接方法が1つなら自動確定、2つ以上なら選択
    if (cal.methods.length === 1) {
      const msgs: PMsg[] = [um];
      if (cal.preDateMessage) msgs.push({ text: cal.preDateMessage, isBot: true });
      setPs(p => ({ ...p, msgs: [...p.msgs, ...msgs], phase: 'calendar', calIdx: 0 }));
    } else {
      const msgs: PMsg[] = [um, { text: `面接方法を選択してください。`, isBot: true }];
      setPs(p => ({ ...p, msgs: [...p.msgs, ...msgs], phase: 'method', calIdx: 0 }));
    }
  };

  const goNextQuestion = (um: PMsg, qi: number) => {
    if (!lead) return;
    const next = qi + 1;
    if (next < lead.questions.length) {
      push([um, { text: lead.questions[next].content, isBot: true }], { phase: 'question', qi: next });
    } else {
      goCalendar(um);
    }
  };

  const start = () => {
    if (!lead) return;
    const init: PMsg[] = [{ text: lead.startMessage || 'チャットを開始します', isBot: true }];
    if (lead.questions.length > 0) {
      init.push({ text: lead.questions[0].content, isBot: true });
      setPs({ msgs: init, phase: 'question', qi: 0, calIdx: 0 });
    } else if (lead.interviewCalendars.length > 0) {
      const cal = lead.interviewCalendars[0];
      if (cal.methods.length === 1) {
        if (cal.preDateMessage) init.push({ text: cal.preDateMessage, isBot: true });
        setPs({ msgs: init, phase: 'calendar', qi: 0, calIdx: 0 });
      } else {
        init.push({ text: '面接方法を選択してください。', isBot: true });
        setPs({ msgs: init, phase: 'method', qi: 0, calIdx: 0 });
      }
    } else {
      setPs({ msgs: init, phase: 'done', qi: 0, calIdx: 0 });
    }
  };

  const onChoice = (_q: ChatLeadQuestion, c: ChatLeadChoice) => {
    if (!lead) return;
    const um: PMsg = { text: c.label, isBot: false };
    if (c.action === 'ng_immediate') {
      push([um, { text: lead.ngMessageImmediate || '選考対象外となりました。', isBot: true }], { phase: 'ng' });
      return;
    }
    goNextQuestion(um, ps.qi);
  };

  const onFree = (text: string) => {
    if (!lead) return;
    goNextQuestion({ text, isBot: false }, ps.qi);
  };

  const onMethodSelect = (method: string) => {
    if (!lead) return;
    const cal = lead.interviewCalendars[ps.calIdx];
    const msgs: PMsg[] = [{ text: method, isBot: false }];
    if (cal.methodDecidedMessage) msgs.push({ text: cal.methodDecidedMessage, isBot: true });
    if (cal.preDateMessage) msgs.push({ text: cal.preDateMessage, isBot: true });
    push(msgs, { phase: 'calendar' });
  };

  const onCalendarFree = (text: string) => {
    if (!lead) return;
    const cal = lead.interviewCalendars[ps.calIdx];
    const msgs: PMsg[] = [{ text, isBot: false }];
    if (cal.confirmedMessage) msgs.push({ text: cal.confirmedMessage, isBot: true });
    if (cal.chatEndMessage) msgs.push({ text: cal.chatEndMessage, isBot: true });
    push(msgs, { phase: 'done' });
  };

  const curQ = lead?.questions[ps.qi];
  const curCal = lead?.interviewCalendars[ps.calIdx];

  let btns: React.ReactNode = null;
  if (ps.phase === 'question' && curQ) {
    if (curQ.answerType === 'freetext') {
      btns = <FreetextInput onSend={onFree} />;
    } else {
      btns = (
        <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {curQ.choices.map(c => (
            <button key={c.id} onClick={() => onChoice(curQ, c)} style={{
              padding: '5px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.78rem',
              border: `1px solid ${c.judgment === 'ng' ? '#ef4444' : '#3b82f6'}`,
              background: '#fff', color: c.judgment === 'ng' ? '#ef4444' : '#3b82f6',
            }}>{c.label}</button>
          ))}
        </div>
      );
    }
  } else if (ps.phase === 'method' && curCal) {
    btns = (
      <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {curCal.methods.map(m => (
          <button key={m} onClick={() => onMethodSelect(m)} style={{
            padding: '5px 12px', border: '1px solid #f59e0b', borderRadius: '999px',
            background: '#fff', color: '#d97706', cursor: 'pointer', fontSize: '0.78rem',
          }}>{m}</button>
        ))}
      </div>
    );
  } else if (ps.phase === 'calendar') {
    btns = <FreetextInput onSend={onCalendarFree} />;
  }

  return (
    <div style={{ width: '300px', minWidth: '300px', borderLeft: '1px solid #e5e7eb', paddingLeft: '16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>プレビュー</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setPs(initP())}
            style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>リセット</button>
          <button onClick={start} disabled={!lead}
            style={{ padding: '4px 10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', cursor: lead ? 'pointer' : 'default', opacity: lead ? 1 : 0.5 }}>開始</button>
        </div>
      </div>
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f9fafb', flex: 1, minHeight: '500px', maxHeight: 'calc(100vh - 200px)' }}>
        <div style={{ padding: '10px 14px', background: '#3b82f6', color: '#fff', borderRadius: '12px 12px 0 0', fontSize: '0.85rem', fontWeight: 600 }}>
          {lead?.leadName || 'チャット'}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ps.msgs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem', marginTop: '30px' }}>「開始」ボタンで流れを確認</div>
          ) : (
            ps.msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.isBot ? 'flex-start' : 'flex-end', alignItems: 'flex-end', gap: '6px' }}>
                {m.isBot && (
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#3b82f6', color: '#fff', fontSize: '0.62rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>Bot</div>
                )}
                <div style={{
                  padding: '8px 12px',
                  borderRadius: m.isBot ? '0 12px 12px 12px' : '12px 12px 0 12px',
                  maxWidth: '78%', fontSize: '0.8rem', lineHeight: 1.5,
                  background: m.isBot ? '#fff' : '#3b82f6',
                  color: m.isBot ? '#374151' : '#fff',
                  border: m.isBot ? '1px solid #e5e7eb' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>{m.text}</div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        {btns}
      </div>
    </div>
  );
};

// ── リードエディタ（中央パネル）──────────────────────────────────────────────

const LeadEditor: React.FC<{
  lead: ChatLeadSetting;
  bases: string[];
  onChange: (lead: ChatLeadSetting) => void;
  onDelete: () => void;
}> = ({ lead, bases, onChange, onDelete }) => {
  const upd = (patch: Partial<ChatLeadSetting>) => onChange({ ...lead, ...patch });

  const updQ = (i: number, q: ChatLeadQuestion) => { const qs = [...lead.questions]; qs[i] = q; upd({ questions: qs }); };
  const delQ = (i: number) => upd({ questions: lead.questions.filter((_, j) => j !== i) });
  const addQ = () => upd({ questions: [...lead.questions, { id: newId(lead.questions), content: '', answerType: 'single', choices: [] }] });
  const moveQ = (from: number, to: number) => {
    const qs = [...lead.questions]; [qs[from], qs[to]] = [qs[to], qs[from]]; upd({ questions: qs });
  };

  const updCal = (i: number, c: ChatInterviewCalendar) => { const cs = [...lead.interviewCalendars]; cs[i] = c; upd({ interviewCalendars: cs }); };
  const delCal = (i: number) => upd({ interviewCalendars: lead.interviewCalendars.filter((_, j) => j !== i) });
  const addCal = () => upd({
    interviewCalendars: [...lead.interviewCalendars, {
      id: newId(lead.interviewCalendars), baseName: bases[0] || '',
      methods: ['対面'], preDateMessage: '', chatEndMessage: '', confirmedMessage: '', methodDecidedMessage: '',
    }],
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px', minWidth: 0 }}>

      <span style={secStyle()}>リード情報</span>
      <div style={{ display: 'grid', gap: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <span style={S.lbl}>リード名 *</span>
            <input value={lead.leadName} onChange={e => upd({ leadName: e.target.value })}
              style={S.inp} placeholder="例: 警備スタッフ応募フロー" />
          </div>
          <div>
            <span style={S.lbl}>拠点</span>
            <select value={lead.baseName || ''} onChange={e => upd({ baseName: e.target.value })} style={S.inp}>
              <option value="">選択してください</option>
              {bases.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span style={S.lbl}>チャット開始メッセージ</span>
          <textarea value={lead.startMessage} onChange={e => upd({ startMessage: e.target.value })}
            style={ta(3)} placeholder="この度はご応募いただきありがとうございます。" />
        </div>
      </div>

      <span style={secStyle()}>質問設定</span>
      {lead.questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} idx={i} total={lead.questions.length}
          onChange={nq => updQ(i, nq)} onDelete={() => delQ(i)}
          onMoveUp={() => moveQ(i, i - 1)} onMoveDown={() => moveQ(i, i + 1)} />
      ))}
      <button onClick={addQ}
        style={{ padding: '8px 0', border: '1px dashed #93c5fd', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', width: '100%', marginBottom: '4px' }}>
        + 質問追加
      </button>

      <span style={secStyle()}>選考NGメッセージ</span>
      <div style={{ display: 'grid', gap: '10px' }}>
        <div>
          <span style={S.lbl}>選考NGメッセージ（即時）</span>
          <textarea value={lead.ngMessageImmediate} onChange={e => upd({ ngMessageImmediate: e.target.value })}
            style={ta(2)} placeholder="大変申し訳ございませんが、今回はご希望に沿えませんでした。" />
        </div>
        <div>
          <span style={S.lbl}>選考NGメッセージ（全ての質問に回答後）</span>
          <textarea value={lead.ngMessageAfterAll} onChange={e => upd({ ngMessageAfterAll: e.target.value })}
            style={ta(2)} placeholder="選考の結果、今回はご希望に沿えませんでした。" />
        </div>
      </div>

      <span style={secStyle()}>面接方法カレンダー</span>
      {lead.interviewCalendars.map((cal, i) => (
        <CalendarCard key={cal.id} cal={cal} bases={bases} idx={i}
          onChange={nc => updCal(i, nc)} onDelete={() => delCal(i)} />
      ))}
      <button onClick={addCal}
        style={{ padding: '8px 0', border: '1px dashed #6ee7b7', borderRadius: '8px', background: '#f0fdf4', color: '#059669', cursor: 'pointer', fontSize: '0.875rem', width: '100%', marginBottom: '24px' }}>
        + 面接方法カレンダー追加
      </button>

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onDelete}
          style={{ padding: '8px 24px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
          削除
        </button>
      </div>
    </div>
  );
};

// ── メインコンポーネント ──────────────────────────────────────────────────────

const ChatbotManagement: React.FC = () => {
  const { clientData, updateClientData } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const leads = clientData?.chatLeadSettings || [];
  const bases = (clientData?.bases || []).map(b => b.name);
  const selected = leads.find(l => l.id === selectedId) || null;

  useEffect(() => {
    if (leads.length > 0 && selectedId === null) {
      const urlBase = new URLSearchParams(window.location.search).get('base');
      if (urlBase) {
        const match = leads.find(l => l.baseName === urlBase);
        if (match) { setSelectedId(match.id); return; }
      }
      setSelectedId(leads[0].id);
    }
  }, [leads.length]);

  const onChange = (lead: ChatLeadSetting) => {
    updateClientData(data => ({
      ...data,
      chatLeadSettings: (data.chatLeadSettings || []).map(l => l.id === lead.id ? lead : l),
    }));
  };

  const addLead = () => {
    const id = newId(leads);
    const nl: ChatLeadSetting = {
      id, baseName: '', leadName: '新しいチャット設定', startMessage: '',
      questions: [], ngMessageImmediate: '', ngMessageAfterAll: '',
      interviewCalendars: [],
    };
    updateClientData(data => ({ ...data, chatLeadSettings: [...(data.chatLeadSettings || []), nl] }));
    setSelectedId(id);
  };

  const deleteLead = () => {
    if (!selected || !window.confirm('このチャット設定を削除しますか？')) return;
    updateClientData(data => ({
      ...data,
      chatLeadSettings: (data.chatLeadSettings || []).filter(l => l.id !== selected.id),
    }));
    setSelectedId(null);
  };

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <div style={{ width: '220px', minWidth: '220px', borderRight: '1px solid #e5e7eb', padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1f2937' }}>チャット設定</span>
          <button onClick={addLead}
            style={{ padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>+ 追加</button>
        </div>
        {leads.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center', padding: '16px 0' }}>設定がありません</div>
        )}
        {leads.map(l => (
          <button key={l.id} onClick={() => setSelectedId(l.id)} style={{
            padding: '10px 12px', border: `1px solid ${selectedId === l.id ? '#93c5fd' : '#e5e7eb'}`,
            borderRadius: '8px', background: selectedId === l.id ? '#eff6ff' : '#fff',
            cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
            fontWeight: selectedId === l.id ? 700 : 400, color: '#1f2937',
          }}>
            {l.leadName || '（名称未設定）'}
          </button>
        ))}
      </div>

      {selected ? (
        <LeadEditor key={selected.id} lead={selected} bases={bases} onChange={onChange} onDelete={deleteLead} />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
          左のリストから設定を選択してください
        </div>
      )}

      <div style={{ padding: '20px 20px 20px 0' }}>
        <ChatPreview lead={selected} />
      </div>
    </div>
  );
};

export default ChatbotManagement;
