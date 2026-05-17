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

interface StatusRow {
  label: string;
  trigger: 'auto' | 'manual' | 'candidate';
  triggerLabel: string;
  condition: string;
  effect: string;
}

const STATUS_ROWS: StatusRow[] = [
  {
    label: '充足受付',
    trigger: 'auto',
    triggerLabel: '自動で付与',
    condition: '拠点×職種が「充足」になっている応募が登録されたとき',
    effect: '面接導線停止 / 充足返信メール導線',
  },
  {
    label: '選考対象外',
    trigger: 'auto',
    triggerLabel: '自動で付与',
    condition: '除外リスト該当、または応募条件外の応募が登録されたとき',
    effect: '面接導線停止',
  },
  {
    label: '反応なし候補',
    trigger: 'candidate',
    triggerLabel: '候補表示のみ',
    condition: '最終連絡から判定日数を超過した応募',
    effect: '一覧 / 詳細でバッジ表示。自動確定はしない',
  },
  {
    label: '反応なし',
    trigger: 'manual',
    triggerLabel: '手動で切替',
    condition: '応募者詳細から「反応なしにする」で切替',
    effect: '追客管理用。通常の選考フローから外して管理',
  },
  {
    label: '追いかけ中',
    trigger: 'manual',
    triggerLabel: '手動で切替',
    condition: '応募者詳細から「追いかけ中にする」で切替',
    effect: '追客管理用。再アプローチ中であることを明示',
  },
  {
    label: '面接終了',
    trigger: 'manual',
    triggerLabel: '手動で切替',
    condition: '応募者詳細から「面接終了にする」で切替',
    effect: '面接結果管理用',
  },
  {
    label: '面接欠席',
    trigger: 'manual',
    triggerLabel: '手動で切替',
    condition: '応募者詳細から「面接欠席にする」で切替',
    effect: '面接結果管理用',
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
  return <span style={TRIGGER_MANUAL}>{row.triggerLabel}</span>;
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
          応募者ごとに1つだけ持つ自動処理の現在状態です。自動で付与されるものと、応募者詳細から手動で切り替えるものがあります。「反応なし候補」は判定日数を超えた応募の参考表示で、確定状態ではありません。
        </p>
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
              {STATUS_ROWS.map((row) => (
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
