import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ChatLeadSetting, ChatLeadQuestion, ChatLeadChoice,
  ChatLeadSubQuestion, ChatInterviewCalendar,
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

// ── 選択肢エディタ（共通）────────────────────────────────────────────────────

const ChoiceList: React.FC<{
  choices: ChatLeadChoice[];
  onChange: (choices: ChatLeadChoice[]) => void;
}> = ({ choices, onChange }) => {
  const set = (cid: number, patch: Partial<ChatLeadChoice>) =>
    onChange(choices.map(c => c.id === cid ? { ...c, ...patch } : c));
  const add = () =>
    onChange([...choices, { id: newId(choices), label: '選択肢', judgment: 'ok', action: 'next' }]);
  const del = (cid: number) => onChange(choices.filter(c => c.id !== cid));

  return (
    <div>
      <span style={S.lbl}>回答選択肢</span>
      {choices.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
          <input value={c.label} onChange={e => set(c.id, { label: e.target.value })}
            style={{ ...S.inp, width: '160px' }} placeholder="選択肢ラベル" />
          {/* 判定 */}
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
          {/* 挙動 */}
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

// ── サブ質問カード ────────────────────────────────────────────────────────────

const SubQuestionCard: React.FC<{
  sq: ChatLeadSubQuestion;
  idx: number;
  onChange: (sq: ChatLeadSubQuestion) => void;
  onDelete: () => void;
}> = ({ sq, idx, onChange, onDelete }) => {
  const upd = (patch: Partial<ChatLeadSubQuestion>) => onChange({ ...sq, ...patch });
  return (
    <div style={{ border: '1px solid #c7d2fe', borderRadius: '8px', padding: '12px', marginBottom: '8px', background: '#f5f3ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#4f46e5' }}>サブ質問 {idx + 1}</span>
        <button onClick={onDelete}
          style={{ padding: '2px 8px', border: '1px solid #c4b5fd', borderRadius: '4px', background: '#ede9fe', color: '#7c3aed', cursor: 'pointer', fontSize: '0.72rem' }}>削除</button>
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        <div>
          <span style={S.lbl}>質問内容</span>
          <textarea value={sq.content} onChange={e => upd({ content: e.target.value })} style={ta(2)} placeholder="サブ質問の内容を入力" />
        </div>
        <div>
          <span style={S.lbl}>回答パターン</span>
          <AnsTypeToggle value={sq.answerType} onChange={v => upd({ answerType: v, choices: v === 'freetext' ? [] : sq.choices })} />
        </div>
        {sq.answerType !== 'freetext' && (
          <ChoiceList choices={sq.choices} onChange={cs => upd({ choices: cs })} />
        )}
      </div>
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
  const subs = q.subQuestions || [];

  const addSub = () => upd({
    subQuestions: [...subs, { id: newId(subs), content: '', answerType: 'single', choices: [] }],
  });
  const updSub = (i: number, sq: ChatLeadSubQuestion) => {
    const next = [...subs]; next[i] = sq; upd({ subQuestions: next });
  };
  const delSub = (i: number) => upd({ subQuestions: subs.filter((_, j) => j !== i) });

  return (
    <div style={S.card}>
      {/* ヘッダー */}
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
        {/* 質問内容 */}
        <div>
          <span style={S.lbl}>質問内容</span>
          <textarea value={q.content} onChange={e => upd({ content: e.target.value })}
            style={ta(2)} placeholder="例: ご希望の週の勤務日数を選択してください。" />
        </div>
        {/* 回答パターン */}
        <div>
          <span style={S.lbl}>回答パターン</span>
          <AnsTypeToggle value={q.answerType} onChange={v => upd({ answerType: v, choices: v === 'freetext' ? [] : q.choices })} />
        </div>
        {/* 選択肢 */}
        {q.answerType !== 'freetext' && (
          <ChoiceList choices={q.choices} onChange={cs => upd({ choices: cs })} />
        )}

        {/* サブ質問 */}
        {subs.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <span style={{ ...S.lbl, color: '#4f46e5' }}>サブ質問</span>
            {subs.map((sq, i) => (
              <SubQuestionCard key={sq.id} sq={sq} idx={i}
                onChange={nsq => updSub(i, nsq)} onDelete={() => delSub(i)} />
            ))}
          </div>
        )}
        <button onClick={addSub}
          style={{ padding: '5px 14px', border: '1px dashed #c4b5fd', borderRadius: '6px', background: '#faf5ff', cursor: 'pointer', fontSize: '0.8rem', color: '#7c3aed', alignSelf: 'flex-start' }}>
          + サブ質問追加
        </button>
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
          <span style={S.lbl}>面接方法 *</span>
          <select value={cal.method} onChange={e => upd({ method: e.target.value })} style={S.inp}>
            {['対面', 'WEB', '電話'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={S.lbl}>面接希望日/面接日選択前メッセージ</span>
          <textarea value={cal.preDateMessage} onChange={e => upd({ preDateMessage: e.target.value })}
            style={ta(2)} placeholder="面接希望日程（第1〜第3）を入力してください。" />
        </div>
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
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={S.lbl}>面接方法決定後メッセージ</span>
          <textarea value={cal.methodDecidedMessage} onChange={e => upd({ methodDecidedMessage: e.target.value })}
            style={ta(2)} placeholder="入力ありがとうございます。次に面接時間の調整をします。" />
        </div>
      </div>
    </div>
  );
};

// ── プレビュー ────────────────────────────────────────────────────────────────

type PMsg = { text: string; isBot: boolean };
interface PState {
  msgs: PMsg[];
  phase: 'idle' | 'question' | 'subquestion' | 'ng' | 'calendar' | 'done';
  qi: number;
  sqi: number; // sub-question index
}

const initP = (): PState => ({ msgs: [], phase: 'idle', qi: 0, sqi: 0 });

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

  const calLabel = (cal: ChatInterviewCalendar) =>
    `${cal.baseName}（${cal.method}）`;

  const goNextQuestion = (um: PMsg, qi: number) => {
    if (!lead) return;
    const next = qi + 1;
    if (next < lead.questions.length) {
      push([um, { text: lead.questions[next].content, isBot: true }], { phase: 'question', qi: next, sqi: 0 });
    } else if (lead.interviewCalendars.length > 0) {
      const msg = lead.interviewCalendars[0].preDateMessage || '面接希望日程を教えてください。';
      push([um, { text: msg, isBot: true }], { phase: 'calendar' });
    } else {
      push([um, { text: 'ありがとうございました！', isBot: true }], { phase: 'done' });
    }
  };

  const goNextSubOrNext = (um: PMsg, qi: number, sqi: number) => {
    if (!lead) return;
    const q = lead.questions[qi];
    const subs = q.subQuestions || [];
    const nextSqi = sqi + 1;
    if (nextSqi < subs.length) {
      push([um, { text: subs[nextSqi].content, isBot: true }], { phase: 'subquestion', sqi: nextSqi });
    } else {
      goNextQuestion(um, qi);
    }
  };

  const start = () => {
    if (!lead) return;
    const init: PMsg[] = [{ text: lead.startMessage || 'チャットを開始します', isBot: true }];
    if (lead.questions.length > 0) {
      init.push({ text: lead.questions[0].content, isBot: true });
      setPs({ msgs: init, phase: 'question', qi: 0, sqi: 0 });
    } else if (lead.interviewCalendars.length > 0) {
      init.push({ text: lead.interviewCalendars[0].preDateMessage || '面接希望日程を教えてください。', isBot: true });
      setPs({ msgs: init, phase: 'calendar', qi: 0, sqi: 0 });
    } else {
      setPs({ msgs: init, phase: 'done', qi: 0, sqi: 0 });
    }
  };

  const onChoice = (q: ChatLeadQuestion | ChatLeadSubQuestion, c: ChatLeadChoice, isSubQ: boolean) => {
    if (!lead) return;
    const um: PMsg = { text: c.label, isBot: false };
    if (c.action === 'ng_immediate') {
      push([um, { text: lead.ngMessageImmediate || '選考対象外となりました。', isBot: true }], { phase: 'ng' });
      return;
    }
    if (isSubQ) {
      goNextSubOrNext(um, ps.qi, ps.sqi);
    } else {
      const mainQ = q as ChatLeadQuestion;
      const subs = mainQ.subQuestions || [];
      if (subs.length > 0) {
        push([um, { text: subs[0].content, isBot: true }], { phase: 'subquestion', sqi: 0 });
      } else {
        goNextQuestion(um, ps.qi);
      }
    }
  };

  const onFree = (text: string) => {
    if (!lead) return;
    const um: PMsg = { text, isBot: false };
    if (ps.phase === 'subquestion') {
      goNextSubOrNext(um, ps.qi, ps.sqi);
    } else {
      const q = lead.questions[ps.qi];
      const subs = q?.subQuestions || [];
      if (subs.length > 0) {
        push([um, { text: subs[0].content, isBot: true }], { phase: 'subquestion', sqi: 0 });
      } else {
        goNextQuestion(um, ps.qi);
      }
    }
  };

  const onCalendar = (cal: ChatInterviewCalendar) => {
    push([
      { text: calLabel(cal), isBot: false },
      { text: cal.confirmedMessage || '面接が確定しました。', isBot: true },
    ], { phase: 'done' });
  };

  const curQ = lead?.questions[ps.qi];
  const curSubQ = curQ ? (curQ.subQuestions || [])[ps.sqi] : undefined;

  let btns: React.ReactNode = null;
  if (ps.phase === 'question' && curQ) {
    if (curQ.answerType === 'freetext') {
      btns = <FreetextInput onSend={onFree} />;
    } else {
      btns = (
        <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {curQ.choices.map(c => (
            <button key={c.id} onClick={() => onChoice(curQ, c, false)} style={{
              padding: '5px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.78rem',
              border: `1px solid ${c.judgment === 'ng' ? '#ef4444' : '#3b82f6'}`,
              background: '#fff', color: c.judgment === 'ng' ? '#ef4444' : '#3b82f6',
            }}>{c.label}</button>
          ))}
        </div>
      );
    }
  } else if (ps.phase === 'subquestion' && curSubQ) {
    if (curSubQ.answerType === 'freetext') {
      btns = <FreetextInput onSend={onFree} />;
    } else {
      btns = (
        <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {curSubQ.choices.map(c => (
            <button key={c.id} onClick={() => onChoice(curSubQ, c, true)} style={{
              padding: '5px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.78rem',
              border: `1px solid ${c.judgment === 'ng' ? '#ef4444' : '#7c3aed'}`,
              background: '#fff', color: c.judgment === 'ng' ? '#ef4444' : '#7c3aed',
            }}>{c.label}</button>
          ))}
        </div>
      );
    }
  } else if (ps.phase === 'calendar') {
    btns = (
      <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {lead?.interviewCalendars.map(cal => (
          <button key={cal.id} onClick={() => onCalendar(cal)} style={{
            padding: '5px 12px', border: '1px solid #10b981', borderRadius: '999px',
            background: '#fff', color: '#10b981', cursor: 'pointer', fontSize: '0.78rem',
          }}>{calLabel(cal)}</button>
        ))}
      </div>
    );
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
  const addQ = () => upd({ questions: [...lead.questions, { id: newId(lead.questions), content: '', answerType: 'single', choices: [], subQuestions: [] }] });
  const moveQ = (from: number, to: number) => {
    const qs = [...lead.questions]; [qs[from], qs[to]] = [qs[to], qs[from]]; upd({ questions: qs });
  };

  const updCal = (i: number, c: ChatInterviewCalendar) => { const cs = [...lead.interviewCalendars]; cs[i] = c; upd({ interviewCalendars: cs }); };
  const delCal = (i: number) => upd({ interviewCalendars: lead.interviewCalendars.filter((_, j) => j !== i) });
  const addCal = () => upd({
    interviewCalendars: [...lead.interviewCalendars, {
      id: newId(lead.interviewCalendars), baseName: bases[0] || '',
      method: '対面', preDateMessage: '', chatEndMessage: '', confirmedMessage: '', methodDecidedMessage: '',
    }],
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px', minWidth: 0 }}>

      {/* ── リード情報 ── */}
      <span style={secStyle()}>リード情報</span>
      <div style={{ display: 'grid', gap: '10px', marginBottom: '10px' }}>
        <div>
          <span style={S.lbl}>リード名 *</span>
          <input value={lead.leadName} onChange={e => upd({ leadName: e.target.value })}
            style={S.inp} placeholder="例: 警備スタッフ応募フロー" />
        </div>
        <div>
          <span style={S.lbl}>チャット開始メッセージ</span>
          <textarea value={lead.startMessage} onChange={e => upd({ startMessage: e.target.value })}
            style={ta(3)} placeholder="この度はご応募いただきありがとうございます。" />
        </div>
      </div>

      {/* ── 質問設定 ── */}
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

      {/* ── 選考NGメッセージ ── */}
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

      {/* ── 面接方法カレンダー ── */}
      <span style={secStyle()}>面接方法カレンダー</span>
      {lead.interviewCalendars.map((cal, i) => (
        <CalendarCard key={cal.id} cal={cal} bases={bases} idx={i}
          onChange={nc => updCal(i, nc)} onDelete={() => delCal(i)} />
      ))}
      <button onClick={addCal}
        style={{ padding: '8px 0', border: '1px dashed #6ee7b7', borderRadius: '8px', background: '#f0fdf4', color: '#059669', cursor: 'pointer', fontSize: '0.875rem', width: '100%', marginBottom: '24px' }}>
        + 面接方法カレンダー追加
      </button>

      {/* ── アクション ── */}
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
    if (leads.length > 0 && selectedId === null) setSelectedId(leads[0].id);
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
      id, leadName: '新しいチャット設定', startMessage: '',
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
      {/* ── 左: リスト ── */}
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

      {/* ── 中央: エディタ ── */}
      {selected ? (
        <LeadEditor key={selected.id} lead={selected} bases={bases} onChange={onChange} onDelete={deleteLead} />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
          左のリストから設定を選択してください
        </div>
      )}

      {/* ── 右: プレビュー ── */}
      <div style={{ padding: '20px 20px 20px 0' }}>
        <ChatPreview lead={selected} />
      </div>
    </div>
  );
};

export default ChatbotManagement;
