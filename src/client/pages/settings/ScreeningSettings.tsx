import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Plus, X, ArrowUp, ArrowDown, Trash2, BarChart3, AlertTriangle, CheckCircle2, Star, Ban, MessageSquare, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ScreeningCriteria,
  ScoringAxis,
  CriteriaItem,
  CriteriaImportance,
} from '@/types';
import { defaultAxes, migrateToAxes, normalizeWeights, genId } from '@/utils/screeningDefaults';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  marginBottom: '0.25rem',
  color: '#374151',
};

const helpStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#6b7280',
  marginBottom: '0.5rem',
};

const SHARED = '__shared__';
const MAX_AXES = 8;
const MIN_AXES = 3;

const defaultCriteria = (): ScreeningCriteria => ({
  enabled: false,
  evaluationPoints: '',
  requiredQualities: '',
  ngQualities: '',
  passThreshold: 75,
  rejectThreshold: 30,
  axes: defaultAxes(),
  byJob: {},
});

const ScreeningSettings: React.FC = () => {
  const { clientData, updateClientData, client } = useAuth();
  const [form, setForm] = useState<ScreeningCriteria>(defaultCriteria());
  const [scope, setScope] = useState<string>(SHARED);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (clientData?.screeningCriteria) {
      const c = clientData.screeningCriteria;
      const merged: ScreeningCriteria = {
        ...defaultCriteria(),
        ...c,
        axes: migrateToAxes(c),
        byJob: c.byJob || {},
      };
      setForm(merged);
      // 最初の軸だけ展開
      if (merged.axes && merged.axes.length > 0) {
        setExpanded(new Set([merged.axes[0].id]));
      }
    }
  }, [clientData]);

  const isChild = client?.accountType === 'child';
  const jobs = useMemo(() => clientData?.jobs || [], [clientData]);

  if (isChild) {
    return (
      <div style={{ padding: '2rem', color: '#6b7280' }}>
        AIスクリーニング設定は本部アカウントのみ編集できます。
      </div>
    );
  }

  const isJobScope = scope !== SHARED;

  // 表示中スコープの軸を取得
  const visibleAxes: ScoringAxis[] = isJobScope
    ? (form.byJob?.[scope]?.axes ?? form.axes ?? defaultAxes())
    : (form.axes ?? defaultAxes());
  const overrideExists = isJobScope && !!form.byJob?.[scope]?.axes;

  const setVisibleAxes = (next: ScoringAxis[]) => {
    if (isJobScope) {
      setForm((f) => ({
        ...f,
        byJob: {
          ...(f.byJob || {}),
          [scope]: { ...(f.byJob?.[scope] || { evaluationPoints: '', requiredQualities: '', ngQualities: '' }), axes: next },
        },
      }));
    } else {
      setForm((f) => ({ ...f, axes: next }));
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateAxis = (axisId: string, mutator: (a: ScoringAxis) => ScoringAxis) => {
    setVisibleAxes(visibleAxes.map((a) => (a.id === axisId ? mutator(a) : a)));
  };

  const addAxis = () => {
    if (visibleAxes.length >= MAX_AXES) return;
    const newAxis: ScoringAxis = {
      id: genId('ax_'),
      name: '新規軸',
      description: '',
      weight: 10,
      guidance: '',
      requirements: [],
      preferences: [],
      avoidances: [],
    };
    const next = normalizeWeights([...visibleAxes, newAxis]);
    setVisibleAxes(next);
    setExpanded((s) => new Set([...s, newAxis.id]));
  };

  const removeAxis = (axisId: string) => {
    if (visibleAxes.length <= MIN_AXES) {
      window.alert(`最低${MIN_AXES}軸は必要です`);
      return;
    }
    if (!window.confirm('この軸を削除しますか？')) return;
    setVisibleAxes(normalizeWeights(visibleAxes.filter((a) => a.id !== axisId)));
  };

  const moveAxis = (axisId: string, direction: -1 | 1) => {
    const idx = visibleAxes.findIndex((a) => a.id === axisId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= visibleAxes.length) return;
    const next = [...visibleAxes];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setVisibleAxes(next);
  };

  const save = () => {
    // ウェイト正規化
    const finalForm: ScreeningCriteria = { ...form };
    if (finalForm.axes) finalForm.axes = normalizeWeights(finalForm.axes);
    if (finalForm.byJob) {
      const fixed: typeof finalForm.byJob = {};
      Object.entries(finalForm.byJob).forEach(([k, v]) => {
        fixed[k] = { ...v, axes: v.axes ? normalizeWeights(v.axes) : v.axes };
      });
      finalForm.byJob = fixed;
    }
    updateClientData((data) => ({ ...data, screeningCriteria: finalForm }));
    setForm(finalForm);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const removeOverride = () => {
    if (!isJobScope) return;
    if (!window.confirm(`「${scope}」の職種別スクリーニング基準を削除し、全社デフォルトに戻しますか？`)) return;
    setForm((f) => {
      const next = { ...(f.byJob || {}) };
      delete next[scope];
      return { ...f, byJob: next };
    });
  };

  const totalWeight = visibleAxes.reduce((s, a) => s + (a.weight || 0), 0);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '880px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Sparkles size={20} color="#9333EA" />
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>AIスクリーニング設定</h2>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: 0, marginBottom: '1rem' }}>
        評価軸ごとに必須・望ましい・避けたい要件を設定すると、応募者詳細の「AIスクリーニング」タブでRISOTTO AIが多軸スコアを算出します。
      </p>

      {/* スコープセレクタ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>編集スコープ:</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '240px' }}>
          <option value={SHARED}>全社デフォルト</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.name}>
              職種別: {j.name}{form.byJob?.[j.name]?.axes ? '（カスタム済）' : ''}
            </option>
          ))}
        </select>
        {isJobScope && overrideExists && (
          <button
            onClick={removeOverride}
            style={{ padding: '0.375rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer' }}
          >
            この職種の設定を削除
          </button>
        )}
      </div>

      {isJobScope && !overrideExists && (
        <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.8125rem', color: '#92400E', marginBottom: '0.75rem' }}>
          現在「{scope}」の職種別設定はありません。下に表示しているのは全社デフォルトの内容です。<strong>編集して保存すると職種別設定が新規作成されます。</strong>
        </div>
      )}

      {/* 全社共通: enabled トグル */}
      {!isJobScope && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9375rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            AIスクリーニング機能を有効化
          </label>
        </div>
      )}

      {/* 評価軸セクション */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: '#111827', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
          <BarChart3 size={16} />
          評価軸（{visibleAxes.length}軸 / 合計 {totalWeight}%）
        </h3>
        {visibleAxes.length < MAX_AXES && (
          <button
            onClick={addAxis}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Plus size={14} /> 評価軸を追加
          </button>
        )}
      </div>

      {totalWeight !== 100 && (
        <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.75rem', color: '#92400E', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <AlertTriangle size={14} />
          ウェイト合計が {totalWeight}% です。保存時に100%に自動調整されます。
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {visibleAxes.map((axis, idx) => (
          <AxisCard
            key={axis.id}
            axis={axis}
            isExpanded={expanded.has(axis.id)}
            isFirst={idx === 0}
            isLast={idx === visibleAxes.length - 1}
            onToggle={() => toggleExpand(axis.id)}
            onUpdate={(mutator) => updateAxis(axis.id, mutator)}
            onRemove={() => removeAxis(axis.id)}
            onMoveUp={() => moveAxis(axis.id, -1)}
            onMoveDown={() => moveAxis(axis.id, 1)}
          />
        ))}
      </div>

      {/* しきい値（全社共通のみ） */}
      {!isJobScope && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.625rem', fontSize: '0.9375rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <Target size={16} />
            しきい値（全社共通）
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>合格推奨スコア</label>
              <div style={helpStyle}>このスコア以上で「合格推奨」</div>
              <input
                type="number"
                min={0}
                max={100}
                value={form.passThreshold}
                onChange={(e) => setForm((f) => ({ ...f, passThreshold: Number(e.target.value) || 0 }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>不合格推奨スコア</label>
              <div style={helpStyle}>このスコア以下で「不合格推奨」</div>
              <input
                type="number"
                min={0}
                max={100}
                value={form.rejectThreshold}
                onChange={(e) => setForm((f) => ({ ...f, rejectThreshold: Number(e.target.value) || 0 }))}
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem' }}>
        {saved && <span style={{ fontSize: '0.8125rem', color: '#059669' }}>保存しました</span>}
        <button
          onClick={save}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: 'var(--color-primary, #F97316)',
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          保存
        </button>
      </div>

      <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.8125rem', color: '#92400E' }}>
        <strong>運用メモ:</strong> AI評価は判断補助です。最終的な合否判断は人間が行ってください。
        評価実行時は「応募者の職種」に対応した基準が自動で使われます。
      </div>
    </div>
  );
};

/* =======================================
   AxisCard
   ======================================= */
interface AxisCardProps {
  axis: ScoringAxis;
  isExpanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onUpdate: (mutator: (a: ScoringAxis) => ScoringAxis) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const AxisCard: React.FC<AxisCardProps> = ({ axis, isExpanded, isFirst, isLast, onToggle, onUpdate, onRemove, onMoveUp, onMoveDown }) => {
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
      {/* ヘッダー */}
      <div
        style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', backgroundColor: isExpanded ? '#FAF5FF' : '#fff', borderBottom: isExpanded ? '1px solid #E9D5FF' : 'none' }}
        onClick={onToggle}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <input
          type="text"
          value={axis.name}
          onChange={(e) => onUpdate((a) => ({ ...a, name: e.target.value }))}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: '0.9375rem',
            fontWeight: 700,
            marginLeft: '0.5rem',
            outline: 'none',
            color: '#111827',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
          <label style={{ fontSize: '0.75rem', color: '#6B7280' }}>重要度</label>
          <input
            type="number"
            min={0}
            max={100}
            value={axis.weight}
            onChange={(e) => onUpdate((a) => ({ ...a, weight: Number(e.target.value) || 0 }))}
            style={{ width: '60px', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem', textAlign: 'right' }}
          />
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>%</span>
          <button onClick={onMoveUp} disabled={isFirst} style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: isFirst ? 'not-allowed' : 'pointer', opacity: isFirst ? 0.3 : 1 }}><ArrowUp size={14} /></button>
          <button onClick={onMoveDown} disabled={isLast} style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: isLast ? 'not-allowed' : 'pointer', opacity: isLast ? 0.3 : 1 }}><ArrowDown size={14} /></button>
          <button onClick={onRemove} style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC2626' }}><Trash2 size={14} /></button>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>説明</label>
            <input
              type="text"
              value={axis.description || ''}
              onChange={(e) => onUpdate((a) => ({ ...a, description: e.target.value }))}
              placeholder="この軸の説明（UIや AIの参考に）"
              style={inputStyle}
            />
          </div>

          {/* 必須要件 */}
          <ItemListEditor
            title={<><CheckCircle2 size={14} color="#059669" /> 必須要件</>}
            items={axis.requirements}
            onChange={(items) => onUpdate((a) => ({ ...a, requirements: items }))}
            withImportance={false}
          />

          {/* 望ましい要件 */}
          <ItemListEditor
            title={<><Star size={14} color="#F59E0B" /> 望ましい要件</>}
            items={axis.preferences}
            onChange={(items) => onUpdate((a) => ({ ...a, preferences: items }))}
            withImportance={true}
          />

          {/* 避けたい要件 */}
          <ItemListEditor
            title={<><Ban size={14} color="#DC2626" /> 避けたい要件</>}
            items={axis.avoidances}
            onChange={(items) => onUpdate((a) => ({ ...a, avoidances: items }))}
            withImportance={true}
          />

          <div>
            <label style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <MessageSquare size={14} />
              補足指示（AI向け）
            </label>
            <textarea
              value={axis.guidance || ''}
              onChange={(e) => onUpdate((a) => ({ ...a, guidance: e.target.value }))}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
              placeholder="この軸の評価で特に意識してほしい点"
            />
          </div>
        </div>
      )}
    </div>
  );
};

/* =======================================
   ItemListEditor
   ======================================= */
interface ItemListEditorProps {
  title: React.ReactNode;
  items: CriteriaItem[];
  onChange: (items: CriteriaItem[]) => void;
  withImportance: boolean;
}

const ItemListEditor: React.FC<ItemListEditorProps> = ({ title, items, onChange, withImportance }) => {
  const [adding, setAdding] = useState(false);

  const updateItem = (id: string, mutator: (it: CriteriaItem) => CriteriaItem) => {
    onChange(items.map((it) => (it.id === id ? mutator(it) : it)));
  };
  const removeItem = (id: string) => onChange(items.filter((it) => it.id !== id));
  const addItem = (newItem: CriteriaItem) => {
    onChange([...items, newItem]);
    setAdding(false);
  };

  return (
    <div>
      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            withImportance={withImportance}
            onUpdate={(m) => updateItem(it.id, m)}
            onRemove={() => removeItem(it.id)}
          />
        ))}
        {adding ? (
          <NewItemForm withImportance={withImportance} onCancel={() => setAdding(false)} onAdd={addItem} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{ padding: '0.375rem 0.625rem', border: '1px dashed #d1d5db', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#6B7280', textAlign: 'left' }}
          >
            <Plus size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
            項目を追加
          </button>
        )}
      </div>
    </div>
  );
};

/* =======================================
   ItemRow（既存項目の表示・編集）
   ======================================= */
interface ItemRowProps {
  item: CriteriaItem;
  withImportance: boolean;
  onUpdate: (m: (it: CriteriaItem) => CriteriaItem) => void;
  onRemove: () => void;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, withImportance, onUpdate, onRemove }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.625rem', backgroundColor: '#F9FAFB', borderRadius: '6px', fontSize: '0.8125rem' }}>
      {withImportance && (
        <select
          value={item.importance || 1}
          onChange={(e) => onUpdate((it) => ({ ...it, importance: Number(e.target.value) as CriteriaImportance }))}
          style={{ padding: '0.125rem 0.25rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.75rem', minWidth: '60px' }}
        >
          <option value={1}>★</option>
          <option value={2}>★★</option>
          <option value={3}>★★★</option>
        </select>
      )}
      <ItemBodyEditor item={item} onUpdate={onUpdate} />
      <button onClick={onRemove} style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }}><X size={14} /></button>
    </div>
  );
};

/** type別の本文編集 */
const ItemBodyEditor: React.FC<{ item: CriteriaItem; onUpdate: (m: (it: CriteriaItem) => CriteriaItem) => void }> = ({ item, onUpdate }) => {
  if (item.type === 'number') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', flex: 1 }}>
        <input
          type="text"
          value={item.label}
          onChange={(e) => onUpdate((it) => ({ ...it, label: e.target.value }))}
          placeholder="例: 営業経験"
          style={{ flex: 1, padding: '0.125rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem' }}
        />
        <input
          type="number"
          value={item.numberValue ?? ''}
          onChange={(e) => onUpdate((it) => ({ ...it, numberValue: Number(e.target.value) || 0 }))}
          style={{ width: '60px', padding: '0.125rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem', textAlign: 'right' }}
        />
        <input
          type="text"
          value={item.numberUnit || ''}
          onChange={(e) => onUpdate((it) => ({ ...it, numberUnit: e.target.value }))}
          placeholder="単位"
          style={{ width: '50px', padding: '0.125rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem' }}
        />
        <select
          value={item.numberOperator || 'gte'}
          onChange={(e) => onUpdate((it) => ({ ...it, numberOperator: e.target.value as 'gte' | 'lte' | 'eq' }))}
          style={{ padding: '0.125rem 0.25rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.75rem' }}
        >
          <option value="gte">以上</option>
          <option value="lte">以下</option>
          <option value="eq">＝</option>
        </select>
      </span>
    );
  }
  if (item.type === 'text') {
    return (
      <input
        type="text"
        value={item.textValue || item.label}
        onChange={(e) => onUpdate((it) => ({ ...it, label: e.target.value, textValue: e.target.value }))}
        placeholder="例: 同業界からの転職を優先"
        style={{ flex: 1, padding: '0.125rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem' }}
      />
    );
  }
  // check
  return (
    <input
      type="text"
      value={item.label}
      onChange={(e) => onUpdate((it) => ({ ...it, label: e.target.value }))}
      placeholder="例: 自動車免許保持"
      style={{ flex: 1, padding: '0.125rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem' }}
    />
  );
};

/* =======================================
   NewItemForm（項目追加）
   ======================================= */
const NewItemForm: React.FC<{ withImportance: boolean; onCancel: () => void; onAdd: (item: CriteriaItem) => void }> = ({ withImportance, onCancel, onAdd }) => {
  const [type, setType] = useState<'check' | 'number' | 'text'>('check');
  const [label, setLabel] = useState('');
  const [numberValue, setNumberValue] = useState<number>(0);
  const [numberOperator, setNumberOperator] = useState<'gte' | 'lte' | 'eq'>('gte');
  const [numberUnit, setNumberUnit] = useState('年');
  const [importance, setImportance] = useState<CriteriaImportance>(2);

  const submit = () => {
    if (!label.trim() && type !== 'text') return;
    const newItem: CriteriaItem = {
      id: genId('it_'),
      label: label.trim() || (type === 'text' ? '（フリー条件）' : '無題'),
      type,
      ...(withImportance ? { importance } : {}),
      ...(type === 'number' ? { numberValue, numberOperator, numberUnit } : {}),
      ...(type === 'text' ? { textValue: label.trim() } : {}),
    };
    onAdd(newItem);
  };

  return (
    <div style={{ padding: '0.625rem 0.75rem', border: '1px solid #FDBA74', backgroundColor: '#FFFBF5', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>タイプ:</span>
        {(['check', 'number', 'text'] as const).map((t) => (
          <label key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer' }}>
            <input type="radio" checked={type === t} onChange={() => setType(t)} />
            {t === 'check' ? 'チェック' : t === 'number' ? '数値' : 'フリーテキスト'}
          </label>
        ))}
        {withImportance && (
          <>
            <span style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: '0.5rem' }}>重要度:</span>
            <select value={importance} onChange={(e) => setImportance(Number(e.target.value) as CriteriaImportance)} style={{ padding: '0.125rem 0.25rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.75rem' }}>
              <option value={1}>★</option>
              <option value={2}>★★</option>
              <option value={3}>★★★</option>
            </select>
          </>
        )}
      </div>

      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={type === 'text' ? '条件を自由記述（例: 同業界からの転職を優先）' : '項目名（例: 法人営業経験）'}
        style={{ ...inputStyle, fontSize: '0.8125rem' }}
        autoFocus
      />

      {type === 'number' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="number"
            value={numberValue}
            onChange={(e) => setNumberValue(Number(e.target.value) || 0)}
            style={{ width: '80px', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem', textAlign: 'right' }}
          />
          <input
            type="text"
            value={numberUnit}
            onChange={(e) => setNumberUnit(e.target.value)}
            placeholder="単位"
            style={{ width: '60px', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem' }}
          />
          <select
            value={numberOperator}
            onChange={(e) => setNumberOperator(e.target.value as 'gte' | 'lte' | 'eq')}
            style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8125rem' }}
          >
            <option value="gte">以上</option>
            <option value="lte">以下</option>
            <option value="eq">＝</option>
          </select>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button onClick={onCancel} style={{ padding: '0.25rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>キャンセル</button>
        <button onClick={submit} style={{ padding: '0.25rem 0.625rem', border: 'none', borderRadius: '4px', backgroundColor: 'var(--color-primary, #F97316)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>追加</button>
      </div>
    </div>
  );
};

export default ScreeningSettings;
