import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Wallet, Plus, Trash2, Save, ChevronLeft, ChevronRight, Info } from 'lucide-react';

/**
 * 媒体費用管理: 月 × 媒体 のマトリクスで費用を入力
 *
 * - 行: 媒体名（settings の media 一覧から取得）
 * - 列: 月（YYYY-MM、過去24か月+今後3か月）
 * - 期間集計: ClientData.mediaCosts[YYYY-MM][sourceName] の値を合算
 */

const fmt = (n: number) => n.toLocaleString('ja-JP');

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.25rem 0.375rem',
  border: '1px solid #E5E7EB',
  borderRadius: '4px',
  fontSize: '0.75rem',
  textAlign: 'right',
  boxSizing: 'border-box',
};

const MediaCostManagement: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();

  // 表示する月リスト（センター月から前後にスクロール可能）
  const [centerMonth, setCenterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const visibleMonths = useMemo(() => generateMonthsAround(centerMonth, 6), [centerMonth]);

  const [draft, setDraft] = useState<{ [yearMonth: string]: { [src: string]: string } }>({});
  const [extraSources, setExtraSources] = useState<string[]>([]);
  const [newSourceName, setNewSourceName] = useState('');

  // 媒体一覧（既存ソース + mediaCosts に登録済みのソース + 追加された名前）
  const sources = useMemo(() => {
    const set = new Set<string>();
    (clientData?.sources || []).forEach((s) => set.add(s.name));
    Object.values(clientData?.mediaCosts || {}).forEach((monthly) => {
      Object.keys(monthly).forEach((k) => set.add(k));
    });
    extraSources.forEach((s) => set.add(s));
    return Array.from(set).sort();
  }, [clientData?.sources, clientData?.mediaCosts, extraSources]);

  // 表示用の値: draft があれば draft、なければ保存済み
  const getValue = (ym: string, src: string): string => {
    if (draft[ym] && draft[ym][src] !== undefined) return draft[ym][src];
    const saved = clientData?.mediaCosts?.[ym]?.[src];
    return saved !== undefined && saved !== null ? String(saved) : '';
  };

  const setValue = (ym: string, src: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [ym]: { ...(prev[ym] || {}), [src]: value },
    }));
  };

  const hasUnsaved = Object.keys(draft).length > 0;

  /** 全角数字→半角、カンマ/空白除去、上限値で正規化 */
  const parseAmount = (raw: string): number | null => {
    if (!raw) return null;
    // 全角数字を半角に変換
    const halfWidth = raw.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const cleaned = halfWidth.replace(/[,\s]/g, '');
    const num = parseInt(cleaned, 10);
    if (!Number.isFinite(num)) return null;
    if (num <= 0) return null;
    // 1億円以上は誤入力扱い（現実的にあり得ない月次媒体費）
    if (num > 100_000_000) return null;
    return num;
  };

  const save = () => {
    let invalidCount = 0;
    updateClientData((data) => {
      const newCosts = { ...(data.mediaCosts || {}) };
      Object.entries(draft).forEach(([ym, monthly]) => {
        const target = { ...(newCosts[ym] || {}) };
        Object.entries(monthly).forEach(([src, raw]) => {
          const trimmed = raw.trim();
          if (trimmed === '') {
            delete target[src];
            return;
          }
          const num = parseAmount(trimmed);
          if (num !== null) {
            target[src] = num;
          } else {
            invalidCount += 1;
            delete target[src];
          }
        });
        if (Object.keys(target).length > 0) newCosts[ym] = target;
        else delete newCosts[ym];
      });
      return { ...data, mediaCosts: newCosts };
    });
    setDraft({});
    if (invalidCount > 0) {
      alert(`${invalidCount} 件の不正値（負数 / 0 / 1億円超 / 数字以外）はスキップして保存しました。`);
    }
  };

  const addSource = () => {
    const name = newSourceName.trim();
    if (!name) return;
    setExtraSources((prev) => [...prev, name]);
    setNewSourceName('');
  };

  const removeSource = (src: string) => {
    if (!window.confirm(`媒体「${src}」の全期間の費用データを削除しますか？`)) return;
    updateClientData((data) => {
      const newCosts = { ...(data.mediaCosts || {}) };
      Object.keys(newCosts).forEach((ym) => {
        const target = { ...newCosts[ym] };
        delete target[src];
        if (Object.keys(target).length > 0) newCosts[ym] = target;
        else delete newCosts[ym];
      });
      return { ...data, mediaCosts: newCosts };
    });
    setExtraSources((prev) => prev.filter((s) => s !== src));
  };

  const shiftMonths = (n: number) => {
    const [y, m] = centerMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setCenterMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // 媒体ごとの合計（表示中の月だけ）
  const sourceTotal = (src: string) =>
    visibleMonths.reduce((sum, ym) => {
      const v = parseInt(getValue(ym, src).replace(/[,\s]/g, ''), 10);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

  // 月ごとの合計
  const monthTotal = (ym: string) =>
    sources.reduce((sum, src) => {
      const v = parseInt(getValue(ym, src).replace(/[,\s]/g, ''), 10);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

  const grandTotal = sources.reduce((s, src) => s + sourceTotal(src), 0);

  if (!client) return <div style={{ padding: '2rem' }}>読み込み中...</div>;

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Wallet size={20} color="#F97316" />
          媒体費用管理
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasUnsaved && (
            <span style={{ fontSize: '0.75rem', color: '#DC2626', alignSelf: 'center', marginRight: '0.5rem' }}>
              未保存の変更があります
            </span>
          )}
          <button
            onClick={save}
            disabled={!hasUnsaved}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: hasUnsaved ? '#F97316' : '#E5E7EB',
              color: hasUnsaved ? '#fff' : '#9CA3AF',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: hasUnsaved ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <Save size={14} />
            保存
          </button>
        </div>
      </div>

      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '6px', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8125rem', color: '#9A3412' }}>
        <Info size={14} style={{ marginTop: '0.125rem', flexShrink: 0 }} />
        <div>
          媒体ごとの月次費用を入力してください。レポート画面では指定期間内の費用が自動集計され、媒体別のCPA(応募1件あたり)/CPH(採用1名あたり)が算出されます。空欄は0円扱い。
        </div>
      </div>

      {/* 月ナビゲーション */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button onClick={() => shiftMonths(-6)} style={{ padding: '0.375rem 0.625rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <ChevronLeft size={12} />
          6ヶ月前
        </button>
        <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
          表示: {visibleMonths[0]} 〜 {visibleMonths[visibleMonths.length - 1]}
        </span>
        <button onClick={() => shiftMonths(6)} style={{ padding: '0.375rem 0.625rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          6ヶ月後
          <ChevronRight size={12} />
        </button>
        <button
          onClick={() => {
            const now = new Date();
            setCenterMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
          }}
          style={{ padding: '0.375rem 0.625rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#F9FAFB', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}
        >
          今月に戻す
        </button>
      </div>

      {/* 媒体追加 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input
          type="text"
          value={newSourceName}
          onChange={(e) => setNewSourceName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addSource(); }}
          placeholder="費用管理する媒体名（既存媒体は自動表示）"
          style={{ padding: '0.375rem 0.625rem', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '0.75rem', flex: 1, maxWidth: '300px' }}
        />
        <button onClick={addSource} style={{ padding: '0.375rem 0.625rem', border: 'none', borderRadius: '6px', backgroundColor: '#0EA5E9', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <Plus size={12} />
          媒体追加
        </button>
      </div>

      {/* マトリクス */}
      <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB' }}>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: '#F9FAFB', zIndex: 1, minWidth: '120px' }}>媒体</th>
              {visibleMonths.map((ym) => (
                <th key={ym} style={{ padding: '0.5rem 0.5rem', textAlign: 'right', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap', minWidth: '90px', fontWeight: 500, color: '#6B7280' }}>
                  {ym.slice(2).replace('-', '/')}
                </th>
              ))}
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap', minWidth: '100px', backgroundColor: '#FFF7ED', color: '#9A3412' }}>合計</th>
              <th style={{ padding: '0.5rem 0.5rem', borderBottom: '1px solid #E5E7EB', width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 ? (
              <tr><td colSpan={visibleMonths.length + 3} style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>媒体管理で媒体を登録するか、上の入力欄から媒体を追加してください。</td></tr>
            ) : (
              sources.map((src) => (
                <tr key={src}>
                  <td style={{ padding: '0.375rem 0.75rem', borderBottom: '1px solid #F3F4F6', position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1, fontWeight: 500 }}>
                    {src}
                  </td>
                  {visibleMonths.map((ym) => (
                    <td key={ym} style={{ padding: '0.25rem 0.375rem', borderBottom: '1px solid #F3F4F6' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getValue(ym, src)}
                        onChange={(e) => setValue(ym, src, e.target.value)}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '0.375rem 0.75rem', borderBottom: '1px solid #F3F4F6', textAlign: 'right', fontWeight: 600, color: '#9A3412', backgroundColor: '#FFF7ED' }}>
                    ¥{fmt(sourceTotal(src))}
                  </td>
                  <td style={{ padding: '0.375rem 0.5rem', borderBottom: '1px solid #F3F4F6', textAlign: 'center' }}>
                    <button
                      onClick={() => removeSource(src)}
                      title="この媒体の費用データを全期間削除"
                      style={{ padding: '0.25rem', border: 'none', backgroundColor: 'transparent', color: '#9CA3AF', cursor: 'pointer' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
            {sources.length > 0 && (
              <tr style={{ backgroundColor: '#FFF7ED', fontWeight: 700 }}>
                <td style={{ padding: '0.5rem 0.75rem', position: 'sticky', left: 0, backgroundColor: '#FFF7ED', zIndex: 1 }}>月合計</td>
                {visibleMonths.map((ym) => (
                  <td key={ym} style={{ padding: '0.5rem', textAlign: 'right', color: '#9A3412' }}>
                    {monthTotal(ym) > 0 ? `¥${fmt(monthTotal(ym))}` : '-'}
                  </td>
                ))}
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#9A3412', backgroundColor: '#FED7AA' }}>
                  ¥{fmt(grandTotal)}
                </td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '1rem', fontSize: '0.6875rem', color: '#9CA3AF' }}>
        ※ 表示期間外の月はスクロールで前後に移動できます。媒体の費用データは月単位で保存され、レポートの集計期間に応じて自動合算されます。
      </p>
    </div>
  );
};

function generateMonthsAround(center: string, halfWidth: number): string[] {
  const [y, m] = center.split('-').map(Number);
  const result: string[] = [];
  for (let i = -halfWidth; i < halfWidth; i++) {
    const d = new Date(y, m - 1 + i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

export default MediaCostManagement;
