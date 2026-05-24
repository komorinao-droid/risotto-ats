import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { clientRepository } from '@/repositories';
import {
  DEFAULT_NO_RESPONSE_THRESHOLD_DAYS,
  NO_RESPONSE_THRESHOLD_DAYS_OPTIONS,
  getNoResponseThresholdDays,
  normalizeNoResponseThresholdDays,
} from '@/utils/clientAutomationSettings';

/**
 * クライアント向け「自動処理設定」ページ (Step 9)。
 *
 * 役割:
 *  - 反応なし判定日数を確認 / 変更
 *  - 自動ステータス / 自動タグの一覧を読み取り専用で表示し、運用者が自動処理の挙動を理解できるようにする
 *
 * 既存ロジックには触らない (intake / 面接導線停止 / 反応なし候補判定 / 手動切替 全て従来通り)。
 */

const pageStyle: React.CSSProperties = {
  padding: '1.5rem',
  maxWidth: '880px',
};

const sectionStyle: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  marginBottom: '1.5rem',
  backgroundColor: '#fff',
};

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 0.25rem',
  fontSize: '1rem',
  fontWeight: 600,
  color: '#111827',
};

const sectionDescStyle: React.CSSProperties = {
  margin: '0 0 0.875rem',
  fontSize: '0.75rem',
  color: '#6B7280',
  lineHeight: 1.6,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.8125rem',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.625rem 0.75rem',
  borderBottom: '1px solid #e5e7eb',
  backgroundColor: '#F9FAFB',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#6B7280',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  borderBottom: '1px solid #F3F4F6',
  color: '#111827',
  verticalAlign: 'top',
};

const btnPrimary: React.CSSProperties = {
  padding: '0.375rem 0.875rem',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: '#3B82F6',
  color: '#fff',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.375rem 0.875rem',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#374151',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  padding: '0.375rem 0.625rem',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '0.875rem',
  minWidth: '110px',
};

const badgeStyle = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '0.125rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.6875rem',
  fontWeight: 600,
  color,
  backgroundColor: bg,
  border: `1px solid ${border}`,
  whiteSpace: 'nowrap',
});

const TRIGGER_AUTO = badgeStyle('#1E3A8A', '#DBEAFE', '#BFDBFE');
const TRIGGER_MANUAL = badgeStyle('#3F3F46', '#F3F4F6', '#E5E7EB');
const TRIGGER_CANDIDATE = badgeStyle('#92400E', '#FEF3C7', '#FDE68A');
const TRIGGER_PLANNED = badgeStyle('#6B21A8', '#F3E8FF', '#E9D5FF');

type StatusCategory = 'implemented' | 'candidate' | 'planned';
type StatusTrigger = 'auto' | 'manual' | 'candidate' | 'planned';

interface StatusRow {
  label: string;
  category: StatusCategory;
  trigger: StatusTrigger;
  triggerLabel: string;
  condition: string;
  effect: string;
}

const STATUS_ROWS: StatusRow[] = [
  // ── 実装済み（自動付与 / ボタン操作） ──
  {
    label: '新規',
    category: 'implemented',
    trigger: 'auto',
    triggerLabel: '自動で付与',
    condition: '応募者を取り込んだ時',
    effect: '応募直後の初期状態',
  },
  {
    label: '面接確定',
    category: 'implemented',
    trigger: 'auto',
    triggerLabel: '自動で付与',
    condition: '面接日程を確定した時',
    effect: '面接情報に確定日時が表示されます',
  },
  {
    label: '面接欠席',
    category: 'implemented',
    trigger: 'manual',
    triggerLabel: 'ボタン操作で付与',
    condition: '面接情報の「面接欠席」ボタンを押した時',
    effect: '面接結果として管理されます',
  },
  {
    label: '採用',
    category: 'implemented',
    trigger: 'manual',
    triggerLabel: 'ボタン操作で付与',
    condition: '面接情報の「採用」ボタンを押した時',
    effect: '面接結果として管理されます',
  },
  {
    label: '不採用',
    category: 'implemented',
    trigger: 'manual',
    triggerLabel: 'ボタン操作で付与',
    condition: '面接情報の「不採用」ボタンを押した時',
    effect: '面接結果として管理されます',
  },
  {
    label: '選考対象外',
    category: 'implemented',
    trigger: 'auto',
    triggerLabel: '自動で付与',
    condition: '除外リスト該当 / 応募条件外の応募登録',
    effect: '通常の日程調整を停止します',
  },
  {
    label: '充足受付',
    category: 'implemented',
    trigger: 'auto',
    triggerLabel: '自動で付与',
    condition: '充足中の拠点×職種への応募登録',
    effect: '通常の日程調整を停止し、充足返信導線を表示します',
  },

  // ── 候補表示（バッジ表示のみ、確定はしない） ──
  {
    label: '反応なし候補',
    category: 'candidate',
    trigger: 'candidate',
    triggerLabel: '候補表示のみ',
    condition: '最終連絡から判定日数を超過',
    effect: '応募者一覧・詳細で候補として表示します。自動確定はしません',
  },
  {
    label: '面接終了',
    category: 'candidate',
    trigger: 'candidate',
    triggerLabel: '自動判定表示',
    condition: '確定済みの面接日程を過ぎ、面接結果が未入力',
    effect: '応募者一覧・詳細で面接終了として表示します。保存はしません',
  },

  // ── 今後対応（送信基盤・自動判定整備後） ──
  {
    label: '日程調整中',
    category: 'planned',
    trigger: 'planned',
    triggerLabel: '今後対応',
    condition: '日程調整メール / SMS を送信した時',
    effect: '送信機能整備後に自動付与予定',
  },
  {
    label: '追いかけ中',
    category: 'planned',
    trigger: 'planned',
    triggerLabel: '今後対応',
    condition: '日程調整後、追加追客を開始した時',
    effect: '送信回数ルール整備後に自動付与予定',
  },
  {
    label: '反応なし',
    category: 'planned',
    trigger: 'planned',
    triggerLabel: '今後対応',
    condition: '設定した送信回数を送り切っても反応がない時',
    effect: '送信回数ルール整備後に自動付与予定',
  },
  {
    label: '送信失敗',
    category: 'planned',
    trigger: 'planned',
    triggerLabel: '今後対応',
    condition: 'メール / SMS 送信に失敗した時',
    effect: '実送信基盤整備後に自動付与予定',
  },
];

const STATUS_GROUPS: Array<{
  category: StatusCategory;
  title: string;
  description: string;
}> = [
  {
    category: 'implemented',
    title: '実装済み',
    description: '応募取込や面接情報の操作で実際に付与・利用されている自動ステータスです。',
  },
  {
    category: 'candidate',
    title: '候補表示',
    description: '判定条件を満たした応募者を「候補」として表示します。確定状態ではありません。',
  },
  {
    category: 'planned',
    title: '今後対応',
    description: '送信基盤・自動判定の整備後に対応予定の自動ステータスです。現時点では自動付与されません。',
  },
];

interface TagRow {
  label: string;
  condition: string;
}

const TAG_ROWS: TagRow[] = [
  { label: '充足求人応募', condition: '充足になっている拠点×職種に応募されたとき' },
  { label: '除外リスト該当', condition: '除外リストに登録されている連絡先 / 氏名と一致したとき' },
  { label: '応募条件外', condition: 'フィルタ条件のいずれにも一致しなかったとき' },
];

const renderTriggerBadge = (row: StatusRow) => {
  if (row.trigger === 'auto') return <span style={TRIGGER_AUTO}>{row.triggerLabel}</span>;
  if (row.trigger === 'candidate') return <span style={TRIGGER_CANDIDATE}>{row.triggerLabel}</span>;
  if (row.trigger === 'planned') return <span style={TRIGGER_PLANNED}>{row.triggerLabel}</span>;
  return <span style={TRIGGER_MANUAL}>{row.triggerLabel}</span>;
};

const subTitleStyle: React.CSSProperties = {
  margin: '1rem 0 0.25rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#111827',
};

const subDescStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '0.75rem',
  color: '#6B7280',
  lineHeight: 1.6,
};

const AutomationSettings: React.FC = () => {
  const { client, logAction, refreshClient } = useAuth();
  const currentValue = getNoResponseThresholdDays(client);
  const isUnset = client?.noResponseThresholdDays == null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number>(currentValue);
  const [savedAt, setSavedAt] = useState<string>('');

  if (!client) {
    return <div style={{ padding: '2rem', color: '#6B7280' }}>ログインしてください。</div>;
  }

  const startEdit = () => {
    setDraft(currentValue);
    setSavedAt('');
    setEditing(true);
  };

  const handleSave = () => {
    const next = normalizeNoResponseThresholdDays(draft);
    if (next === currentValue && !isUnset) {
      setEditing(false);
      return;
    }
    const current = clientRepository.findById(client.id);
    if (!current) return;
    clientRepository.update(client.id, { noResponseThresholdDays: next });
    const beforeLabel = isUnset
      ? `未設定(${DEFAULT_NO_RESPONSE_THRESHOLD_DAYS}日扱い)`
      : `${currentValue}日`;
    logAction('setting', '自動処理設定変更', '反応なし判定日数', `${beforeLabel} → ${next}日`);
    refreshClient();
    setSavedAt(new Date().toLocaleTimeString());
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(currentValue);
    setEditing(false);
  };

  return (
    <div style={pageStyle}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>自動処理設定</h2>

      {/* A. 反応なし判定 */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3 style={sectionTitleStyle}>反応なし判定</h3>
          {!editing && (
            <button onClick={startEdit} style={btnSecondary} type="button">編集</button>
          )}
        </div>
        <p style={sectionDescStyle}>
          日程調整や連絡から、ここで設定した日数を超えて応募者の反応がない場合に「反応なし候補」として一覧と詳細に表示します。判定日数を超えただけでは自動的に「反応なし」確定にはしません。
        </p>

        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
          判定日数
        </div>

        {!editing && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{currentValue}日</div>
            {isUnset && (
              <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>
                （未設定のためデフォルト {DEFAULT_NO_RESPONSE_THRESHOLD_DAYS}日 を表示）
              </span>
            )}
            {savedAt && (
              <span style={{ fontSize: '0.6875rem', color: '#059669' }}>{savedAt} 保存済</span>
            )}
          </div>
        )}

        {editing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={draft}
              onChange={(e) => setDraft(normalizeNoResponseThresholdDays(e.target.value))}
              style={inputStyle}
            >
              {NO_RESPONSE_THRESHOLD_DAYS_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
            <button onClick={handleSave} style={btnPrimary} type="button">保存</button>
            <button onClick={handleCancel} style={btnSecondary} type="button">キャンセル</button>
            <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>1〜30日の範囲で設定できます</span>
          </div>
        )}
      </section>

      {/* B. 自動ステータス一覧 */}
      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>自動ステータス</h3>
        <p style={sectionDescStyle}>
          応募者ごとに1つだけ持つ自動処理の現在状態です。「実装済み」は応募取込や面接情報のボタン操作で実際に付与されます。「候補表示」は条件を満たした応募の参考表示で、確定状態ではありません。「今後対応」は送信基盤や自動判定の整備後に対応予定です。
        </p>
        {STATUS_GROUPS.map((group) => {
          const rows = STATUS_ROWS.filter((r) => r.category === group.category);
          if (rows.length === 0) return null;
          return (
            <div key={group.category}>
              <h4 style={subTitleStyle}>{group.title}</h4>
              <p style={subDescStyle}>{group.description}</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>自動ステータス</th>
                      <th style={thStyle}>付与方法</th>
                      <th style={thStyle}>付与条件</th>
                      <th style={thStyle}>主な挙動</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label}>
                        <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.label}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{renderTriggerBadge(row)}</td>
                        <td style={tdStyle}>{row.condition}</td>
                        <td style={tdStyle}>{row.effect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      {/* C. 自動タグ一覧 */}
      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>自動タグ</h3>
        <p style={sectionDescStyle}>
          応募者ごとに0〜複数持つ補助ラベルです。自動ステータスと組み合わせて、なぜその扱いになっているか（充足求人だから／除外リスト該当だから等）を一覧で素早く確認するために使います。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>自動タグ</th>
                <th style={thStyle}>付与方法</th>
                <th style={thStyle}>付与条件</th>
              </tr>
            </thead>
            <tbody>
              {TAG_ROWS.map((row) => (
                <tr key={row.label}>
                  <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.label}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <span style={TRIGGER_AUTO}>自動で付与</span>
                  </td>
                  <td style={tdStyle}>{row.condition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AutomationSettings;
