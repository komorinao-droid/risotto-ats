import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSnapshots,
  getSnapshotConfig,
  saveSnapshotConfig,
  takeSnapshot,
} from '@/utils/storage';
import type { DailySnapshot, SnapshotConfig } from '@/types';

const SnapshotHistory: React.FC = () => {
  const { client } = useAuth();
  const clientId = client?.id ?? '';

  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [config, setConfig] = useState<SnapshotConfig>({ enabled: true, scheduleTime: '18:00' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [manualSaved, setManualSaved] = useState(false);

  const reload = useCallback(() => {
    setSnapshots(getSnapshots(clientId));
    setConfig(getSnapshotConfig(clientId));
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

  const handleSaveConfig = () => {
    saveSnapshotConfig(clientId, config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleManualSave = () => {
    takeSnapshot(clientId);
    reload();
    setManualSaved(true);
    setTimeout(() => setManualSaved(false), 2000);
  };

  // CSV ダウンロード（一覧サマリー）
  const handleDownloadCSV = () => {
    const header = ['日付', '保存時刻', '総応募者数', 'アクティブ', '当日新規'];
    const rows = snapshots.map(s => [
      s.date,
      new Date(s.savedAt).toLocaleTimeString('ja-JP'),
      s.totalApplicants,
      s.activeApplicants,
      s.newApplicantsToday,
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `進捗履歴_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV ダウンロード（個別スナップショット詳細）
  const handleDownloadDetail = (s: DailySnapshot) => {
    const lines: string[] = [
      `RISOTTO ATS 日次進捗レポート`,
      `日付,${s.date}`,
      `保存時刻,${new Date(s.savedAt).toLocaleString('ja-JP')}`,
      ``,
      `【サマリー】`,
      `総応募者数,${s.totalApplicants}`,
      `アクティブ,${s.activeApplicants}`,
      `当日新規,${s.newApplicantsToday}`,
      ``,
      `【ステータス別】`,
      'ステータス,件数',
      ...s.statusCounts.map(c => `${c.status},${c.count}`),
      ``,
      `【媒体別】`,
      '媒体,件数',
      ...s.sourceCounts.map(c => `${c.source},${c.count}`),
      ``,
      `【拠点別】`,
      '拠点,件数',
      ...s.baseCounts.map(c => `${c.base},${c.count}`),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `進捗_${s.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1f2937', marginBottom: '24px' }}>
        📊 日次進捗保存
      </h1>

      {/* 設定カード */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '16px' }}>
          ⏰ 自動保存設定
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
            />
            <span style={{ fontSize: '0.9rem', color: '#374151' }}>毎日自動保存を有効にする</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: '#374151' }}>保存時刻：</span>
            <input
              type="time"
              value={config.scheduleTime}
              onChange={e => setConfig(c => ({ ...c, scheduleTime: e.target.value }))}
              disabled={!config.enabled}
              style={{
                padding: '6px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.9rem',
                color: config.enabled ? '#1f2937' : '#9ca3af',
                background: config.enabled ? '#fff' : '#f9fafb',
              }}
            />
          </label>
          <button
            onClick={handleSaveConfig}
            style={{
              padding: '7px 18px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {saved ? '✓ 保存しました' : '設定を保存'}
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '10px', lineHeight: 1.6 }}>
          ※ アプリが開いている間、指定した時刻に自動でその日の進捗をスナップショット保存します。<br/>
          　アプリが閉じているとき（ブラウザを開いていないとき）は保存されません。
        </p>
      </div>

      {/* 手動保存 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleManualSave}
            style={{
              padding: '8px 20px',
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {manualSaved ? '✓ 保存しました' : '📸 今すぐ保存'}
          </button>
          {snapshots.length > 0 && (
            <button
              onClick={handleDownloadCSV}
              style={{
                padding: '8px 20px',
                background: '#fff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              📥 CSV一括ダウンロード
            </button>
          )}
        </div>
        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          保存済み: {snapshots.length} 件（最大365日）
        </span>
      </div>

      {/* スナップショット一覧 */}
      {snapshots.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '2px dashed #e5e7eb',
          borderRadius: '12px',
          padding: '48px',
          textAlign: 'center',
          color: '#9ca3af',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📭</div>
          <p style={{ fontSize: '0.95rem' }}>まだスナップショットがありません。</p>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>「今すぐ保存」ボタンか、指定時刻の自動保存でデータが蓄積されます。</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {snapshots.map(s => (
            <div
              key={s.id}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {/* ヘッダー行 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  cursor: 'pointer',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1f2937' }}>
                    {s.date}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    保存: {formatTime(s.savedAt)}
                  </span>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: '#eff6ff', color: '#2563eb',
                      padding: '2px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                    }}>
                      総数 {s.totalApplicants}
                    </span>
                    <span style={{
                      background: '#f0fdf4', color: '#16a34a',
                      padding: '2px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                    }}>
                      活性 {s.activeApplicants}
                    </span>
                    {s.newApplicantsToday > 0 && (
                      <span style={{
                        background: '#fef3c7', color: '#92400e',
                        padding: '2px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                      }}>
                        当日 +{s.newApplicantsToday}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); handleDownloadDetail(s); }}
                    style={{
                      padding: '5px 14px',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      color: '#374151',
                    }}
                  >
                    📥 CSV
                  </button>
                  <span style={{ color: '#9ca3af', fontSize: '1rem' }}>
                    {expanded === s.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* 詳細展開 */}
              {expanded === s.id && (
                <div style={{
                  borderTop: '1px solid #f3f4f6',
                  padding: '16px 20px',
                  background: '#fafafa',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '16px',
                }}>
                  {/* ステータス別 */}
                  <div>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ステータス別
                    </h4>
                    {s.statusCounts.map(c => (
                      <div key={c.status} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#374151', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span>{c.status}</span>
                        <span style={{ fontWeight: 600 }}>{c.count}</span>
                      </div>
                    ))}
                  </div>

                  {/* 媒体別 */}
                  <div>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      媒体別
                    </h4>
                    {s.sourceCounts.map(c => (
                      <div key={c.source} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#374151', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span>{c.source}</span>
                        <span style={{ fontWeight: 600 }}>{c.count}</span>
                      </div>
                    ))}
                  </div>

                  {/* 拠点別 */}
                  {s.baseCounts.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        拠点別
                      </h4>
                      {s.baseCounts.map(c => (
                        <div key={c.base} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#374151', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <span>{c.base}</span>
                          <span style={{ fontWeight: 600 }}>{c.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SnapshotHistory;
