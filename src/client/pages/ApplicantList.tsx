import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CalendarDays, ClipboardList, FolderOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Pagination from '@/components/Pagination';
import SearchableSelect from '@/components/SearchableSelect';
import AddApplicantModal from '@/client/components/AddApplicantModal';
import Modal from '@/components/Modal';
import { formatShortDate } from '@/utils/date';
import type { Applicant, InterviewEvent, PrefDateTime } from '@/types';

/** 旧フォーマット（string）と新フォーマット（PrefDateTime）両方に対応 */
function normalizePrefDate(d: PrefDateTime | string): PrefDateTime {
  if (typeof d === 'string') return { date: d, time: '' };
  return d;
}

// ─── Avatar helpers (gender-based) ───
function genderAvatarColor(gender: string): string {
  if (gender === '男' || gender === '男性') return '#3B82F6';
  if (gender === '女' || gender === '女性') return '#EC4899';
  return '#6B7280';
}

function genderAvatarIcon(gender: string): string {
  if (gender === '男' || gender === '男性') return '♂';
  if (gender === '女' || gender === '女性') return '♀';
  return '○';
}

// ─── CSV helpers ───
function escapeCSV(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function parseCSV(text: string): string[][] {
  // BOM removal
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < s.length && s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < s.length && s[i + 1] === '\n') i++;
        row.push(cell);
        cell = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

// ─── Duplicate detection (returns Map<applicantId, duplicateCount>) ───
function detectDuplicates(applicants: Applicant[]): Map<number, number> {
  const dupeCount = new Map<number, number>();
  const nameMap = new Map<string, number[]>();
  const phoneMap = new Map<string, number[]>();

  applicants.forEach((a) => {
    if (a.name) {
      const key = a.name.trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(a.id);
    }
    if (a.phone) {
      const key = a.phone.replace(/[-\s]/g, '');
      if (key) {
        if (!phoneMap.has(key)) phoneMap.set(key, []);
        phoneMap.get(key)!.push(a.id);
      }
    }
  });

  for (const ids of nameMap.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => {
        dupeCount.set(id, Math.max(dupeCount.get(id) || 0, ids.length));
      });
    }
  }
  for (const ids of phoneMap.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => {
        dupeCount.set(id, Math.max(dupeCount.get(id) || 0, ids.length));
      });
    }
  }
  return dupeCount;
}

// ─── CSV Export columns ───
const CSV_HEADERS = [
  '応募日', '氏名', 'フリガナ', 'ステータス', 'サブステータス', '有効/無効',
  'メール', '電話番号', '性別', '年齢', '生年月日', '現職',
  '職種', '媒体', '拠点', '面接日', 'アクティブ', '重複フラグ',
];

function applicantToCSVRow(a: Applicant, events: InterviewEvent[]): string[] {
  const evt = events.find((e) => e.applicantId === a.id);
  return [
    a.date, a.name, a.furigana, a.stage, a.subStatus,
    a.active ? '有効' : '無効', a.email, a.phone, a.gender,
    String(a.age || ''), a.birthDate, a.currentJob,
    a.job, a.src, a.base,
    evt ? evt.date : '', a.active ? '1' : '0', a.duplicate ? '1' : '0',
  ];
}

// ─── Import field mapping ───
const IMPORT_FIELDS = [
  { key: 'date', label: '応募日' },
  { key: 'name', label: '氏名' },
  { key: 'furigana', label: 'フリガナ' },
  { key: 'stage', label: 'ステータス' },
  { key: 'subStatus', label: 'サブステータス' },
  { key: 'activeStatus', label: '有効/無効' },
  { key: 'email', label: 'メール' },
  { key: 'phone', label: '電話番号' },
  { key: 'gender', label: '性別' },
  { key: 'age', label: '年齢' },
  { key: 'birthDate', label: '生年月日' },
  { key: 'currentJob', label: '現職' },
  { key: 'job', label: '職種' },
  { key: 'src', label: '媒体' },
  { key: 'base', label: '拠点' },
  { key: 'note', label: 'メモ' },
  { key: '_skip', label: '読み込まない' },
];

// ─── Main component ───
const ApplicantList: React.FC = () => {
  const navigate = useNavigate();
  const { clientData, updateClientData, logAction, client } = useAuth();

  // ─── State ───
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBase, setFilterBase] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterIntDateFrom, setFilterIntDateFrom] = useState('');
  const [filterIntDateTo, setFilterIntDateTo] = useState('');
  const [filterNeedsAction, setFilterNeedsAction] = useState(false);

  // CSV Import
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [importMapping, setImportMapping] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV Export
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'filtered' | 'all' | 'selected'>('filtered');

  if (!clientData) return null;

  const { applicants, events, statuses, bases } = clientData;
  // 子アカウントは自拠点のオーバーライド（あれば）を反映
  const sources = client?.accountType === 'child' && client.baseName && clientData.sourcesByBase?.[client.baseName]
    ? clientData.sourcesByBase[client.baseName]
    : clientData.sources;

  // ─── Duplicate detection ───
  const duplicateMap = useMemo(() => detectDuplicates(applicants), [applicants]);

  // ─── Flag ages (per-base with fallback to legacy global) ───
  const flagAgesByBase = useMemo(() => {
    const map: { [base: string]: Set<number> } = {};
    const fcs = clientData.filterConditions || {};
    Object.keys(fcs).forEach(base => {
      map[base] = new Set(fcs[base].flagAges || []);
    });
    return map;
  }, [clientData.filterConditions]);
  const legacyFlagAges = useMemo(
    () => new Set(clientData.filterCondition?.flagAges || []),
    [clientData.filterCondition?.flagAges]
  );
  const getFlagAgeSet = (baseName: string): Set<number> => {
    return flagAgesByBase[baseName] || legacyFlagAges;
  };

  // ─── Event map ───
  const eventMap = useMemo(() => {
    const map = new Map<number, InterviewEvent>();
    events.forEach((e) => {
      const existing = map.get(e.applicantId);
      if (!existing || e.date > existing.date) {
        map.set(e.applicantId, e);
      }
    });
    return map;
  }, [events]);

  // ─── Status color map ───
  const statusColorMap = useMemo(() => {
    const map = new Map<string, string>();
    statuses.forEach((s) => map.set(s.name, s.color));
    return map;
  }, [statuses]);

  // ─── Filter ───
  const filtered = useMemo(() => {
    let result = [...applicants];

    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(lower) ||
          a.furigana.toLowerCase().includes(lower) ||
          a.email.toLowerCase().includes(lower) ||
          a.phone.includes(searchText) ||
          a.base.toLowerCase().includes(lower)
      );
    }
    if (filterSource) {
      result = result.filter((a) => a.src === filterSource);
    }
    if (filterStatus) {
      result = result.filter((a) => a.stage === filterStatus);
    }
    if (filterBase) {
      result = result.filter((a) => a.base === filterBase);
    }
    if (filterDateFrom) {
      result = result.filter((a) => a.date >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter((a) => a.date <= filterDateTo);
    }
    if (filterIntDateFrom || filterIntDateTo) {
      result = result.filter((a) => {
        const evt = eventMap.get(a.id);
        if (!evt) return false;
        if (filterIntDateFrom && evt.date < filterIntDateFrom) return false;
        if (filterIntDateTo && evt.date > filterIntDateTo) return false;
        return true;
      });
    }
    if (filterNeedsAction) {
      result = result.filter((a) => a.needsAction);
    }

    // Sort by date descending
    result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return result;
  }, [
    applicants, searchText, filterSource, filterStatus, filterBase,
    filterDateFrom, filterDateTo, filterIntDateFrom, filterIntDateTo,
    filterNeedsAction, eventMap,
  ]);

  // ─── Pagination ───
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // ─── Selection ───
  const allPageSelected = paginated.length > 0 && paginated.every((a) => selectedIds.has(a.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((a) => next.add(a.id));
        return next;
      });
    }
  };

  // ─── Inline status change ───
  const handleStatusChange = useCallback(
    (applicantId: number, newStatus: string) => {
      let prevStage = '';
      let applicantName = '';
      updateClientData((data) => {
        const target = data.applicants.find((a) => a.id === applicantId);
        prevStage = target?.stage || '';
        applicantName = target?.name || String(applicantId);
        return {
          ...data,
          applicants: data.applicants.map((a) =>
            a.id === applicantId ? { ...a, stage: newStatus } : a
          ),
        };
      });
      logAction('applicant', 'ステータス変更', applicantName, `${prevStage} → ${newStatus}`);
    },
    [updateClientData, logAction]
  );

  // ─── Reset filters ───
  const resetFilters = () => {
    setSearchText('');
    setFilterSource('');
    setFilterStatus('');
    setFilterBase('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterIntDateFrom('');
    setFilterIntDateTo('');
    setFilterNeedsAction(false);
    setPage(1);
  };

  // ─── CSV Export ───
  const doExport = () => {
    let rows: Applicant[];
    if (exportMode === 'all') {
      rows = applicants;
    } else if (exportMode === 'selected') {
      rows = applicants.filter((a) => selectedIds.has(a.id));
    } else {
      rows = filtered;
    }

    const csvLines = [
      CSV_HEADERS.map(escapeCSV).join(','),
      ...rows.map((a) => applicantToCSVRow(a, events).map(escapeCSV).join(',')),
    ];
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `applicants_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportModalOpen(false);
  };

  // ─── CSV Import ───
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) return;
      setImportHeaders(parsed[0]);
      setImportRows(parsed.slice(1));
      // Auto-map by header name
      const mapping: Record<number, string> = {};
      parsed[0].forEach((h, i) => {
        const found = IMPORT_FIELDS.find(
          (f) => f.label === h.trim() || f.key === h.trim()
        );
        mapping[i] = found ? found.key : '_skip';
      });
      setImportMapping(mapping);
      setImportStep('mapping');
    };
    reader.readAsText(file, 'utf-8');
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const doImport = () => {
    const maxId = clientData.applicants.reduce((max, a) => Math.max(max, a.id), 0);
    const newApplicants: Applicant[] = [];

    importRows.forEach((row, idx) => {
      const a: Record<string, string> = {};
      row.forEach((val, ci) => {
        const fieldKey = importMapping[ci];
        if (fieldKey && fieldKey !== '_skip') {
          a[fieldKey] = val.trim();
        }
      });

      if (!a.name) return;

      newApplicants.push({
        id: maxId + idx + 1,
        name: a.name || '',
        furigana: a.furigana || '',
        email: a.email || '',
        phone: (a.phone || '').replace(/[-\s]/g, ''),
        gender: a.gender || '',
        age: (() => {
          if (!a.age) return '';
          const n = parseInt(a.age, 10);
          return Number.isNaN(n) ? '' : n;
        })(),
        birthDate: a.birthDate || '',
        currentJob: a.currentJob || '',
        date: a.date || new Date().toISOString().slice(0, 10),
        job: a.job || '',
        src: a.src || '',
        stage: a.stage || (statuses[0]?.name || ''),
        subStatus: a.subStatus || '',
        base: a.base || '',
        note: a.note || '',
        needsAction: false,
        actionDate: '',
        actionTime: '',
        actionMemo: '',
        prefDates: [],
        intResult: '',
        intMethod: '',
        active: true,
        duplicate: false,
        files: [],
        jobInfo: { jobId: '', jobNumber: '', productName: '', jobName: '', publishedJobType: '', companyName: '' },
        chatAnswers: [],
      });
    });

    if (newApplicants.length > 0) {
      updateClientData((data) => ({
        ...data,
        applicants: [...data.applicants, ...newApplicants],
      }));
      logAction('applicant', '応募者一括取込', `${newApplicants.length}件`);
    }

    setImportModalOpen(false);
    setImportStep('upload');
    setImportHeaders([]);
    setImportRows([]);
    setImportMapping({});
  };

  // ─── Base options for SearchableSelect ───
  const baseOptions = useMemo(
    () => bases.map((b) => ({ value: b.name, label: b.name })),
    [bases]
  );

  // ─── Shared styles ───
  const btnStyle: React.CSSProperties = {
    padding: '0.4375rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    color: '#374151',
    whiteSpace: 'nowrap',
  };

  const primaryBtnStyle: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: 'var(--color-primary, #F97316)',
    color: '#fff',
    border: 'none',
    fontWeight: 600,
  };

  const filterInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.4375rem 0.625rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.8125rem',
    boxSizing: 'border-box' as const,
  };

  const filterLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    color: '#6b7280',
  };

  return (
    <div style={{ padding: '1.25rem 1.5rem', maxWidth: '100%' }}>
      {/* ─── Header ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>応募者管理</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button style={btnStyle} onClick={() => setFilterOpen(!filterOpen)}>
            {filterOpen ? '検索を閉じる' : '検索・フィルタ'}
          </button>
          <button style={btnStyle} onClick={() => setExportModalOpen(true)}>
            CSVエクスポート
          </button>
          <button style={btnStyle} onClick={() => { setImportModalOpen(true); setImportStep('upload'); }}>
            CSVインポート
          </button>
          <button style={primaryBtnStyle} onClick={() => setShowAddModal(true)}>
            + 応募者を追加
          </button>
        </div>
      </div>

      {/* ─── Bulk actions ─── */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 1rem',
            backgroundColor: '#EFF6FF',
            borderRadius: '6px',
            marginBottom: '0.75rem',
            fontSize: '0.8125rem',
          }}
        >
          <span style={{ fontWeight: 500 }}>{selectedIds.size}件選択中</span>
          <button style={btnStyle} onClick={() => { logAction('email', 'SMS一括送信', `${selectedIds.size}件`); alert('SMS一括送信 (placeholder)'); }}>
            SMS送信
          </button>
          <button style={btnStyle} onClick={() => { logAction('email', 'メール一括送信', `${selectedIds.size}件`); alert('メール一括送信 (placeholder)'); }}>
            メール送信
          </button>
          <button
            style={{ ...btnStyle, color: '#6b7280', border: 'none', backgroundColor: 'transparent' }}
            onClick={() => setSelectedIds(new Set())}
          >
            選択解除
          </button>
        </div>
      )}

      {/* ─── Search / Filter Panel ─── */}
      {filterOpen && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: '#fafafa',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {/* Text search */}
            <div>
              <label style={filterLabelStyle}>テキスト検索</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                placeholder="氏名・メール・電話・拠点"
                style={filterInputStyle}
              />
            </div>

            {/* Source */}
            <div>
              <label style={filterLabelStyle}>応募媒体</label>
              <select
                value={filterSource}
                onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
                style={filterInputStyle}
              >
                <option value="">すべて</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label style={filterLabelStyle}>ステータス</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                style={filterInputStyle}
              >
                <option value="">すべて</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Base */}
            <div>
              <label style={filterLabelStyle}>拠点</label>
              <SearchableSelect
                options={baseOptions}
                value={filterBase}
                onChange={(v) => { setFilterBase(v); setPage(1); }}
                placeholder="すべて"
                allLabel="すべて"
              />
            </div>

            {/* Application date range */}
            <div>
              <label style={filterLabelStyle}>応募日FROM</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                style={filterInputStyle}
              />
            </div>
            <div>
              <label style={filterLabelStyle}>応募日TO</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                style={filterInputStyle}
              />
            </div>

            {/* Interview date range */}
            <div>
              <label style={filterLabelStyle}>面接日FROM</label>
              <input
                type="date"
                value={filterIntDateFrom}
                onChange={(e) => { setFilterIntDateFrom(e.target.value); setPage(1); }}
                style={filterInputStyle}
              />
            </div>
            <div>
              <label style={filterLabelStyle}>面接日TO</label>
              <input
                type="date"
                value={filterIntDateTo}
                onChange={(e) => { setFilterIntDateTo(e.target.value); setPage(1); }}
                style={filterInputStyle}
              />
            </div>

            {/* Needs action */}
            <div style={{ display: 'flex', alignItems: 'end', paddingBottom: '0.25rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={filterNeedsAction}
                  onChange={(e) => { setFilterNeedsAction(e.target.checked); setPage(1); }}
                />
                要対応のみ
              </label>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
            <button
              onClick={resetFilters}
              style={{
                ...btnStyle,
                color: '#6b7280',
                fontSize: '0.75rem',
              }}
            >
              リセット
            </button>
          </div>
        </div>
      )}

      {/* ─── Desktop Table ─── */}
      <div className="applicant-table-wrap">
        <table
          className="applicant-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.8125rem',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: '#f9fafb',
                borderBottom: '2px solid #e5e7eb',
              }}
            >
              <th style={{ padding: '0.5rem 0.375rem', width: '2rem', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th style={thStyle}>応募日</th>
              <th style={{ ...thStyle, minWidth: '160px' }}>氏名</th>
              <th style={thStyle}>年齢</th>
              <th style={thStyle}>拠点</th>
              <th style={thStyle}>職種</th>
              <th style={{ ...thStyle, minWidth: '120px' }}>ステータス</th>
              <th style={thStyle}>要対応</th>
              <th style={{ ...thStyle, minWidth: '200px' }}>面接日程</th>
              <th style={{ ...thStyle, width: '3rem', textAlign: 'center' }}>詳細</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#9ca3af',
                  }}
                >
                  該当する応募者がいません
                </td>
              </tr>
            ) : (
              paginated.map((a) => {
                const evt = eventMap.get(a.id);
                const isDupe = duplicateMap.has(a.id);
                const ageNum = typeof a.age === 'number' ? a.age : parseInt(String(a.age), 10);
                const isFlagAge = !isNaN(ageNum) && getFlagAgeSet(a.base).has(ageNum);
                const stColor = statusColorMap.get(a.stage) || '#6b7280';

                return (
                  <tr
                    key={a.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background-color 0.1s',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/applicant?applicant=${a.id}`)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '';
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '0.5rem 0.375rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>

                    {/* Date */}
                    <td style={tdStyle}>{formatShortDate(a.date)}</td>

                    {/* Name cell */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Avatar */}
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: genderAvatarColor(a.gender),
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {genderAvatarIcon(a.gender)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {a.name}
                            </span>
                            {isDupe && (
                              <span
                                title="重複の可能性あり"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: '#FEE2E2',
                                  color: '#DC2626',
                                  fontSize: '0.6rem',
                                  fontWeight: 600,
                                  padding: '0.0625rem 0.25rem',
                                  borderRadius: '3px',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}
                              >
                                重複
                              </span>
                            )}
                          </div>
                          {a.furigana && (
                            <div
                              style={{
                                fontSize: '0.6875rem',
                                color: '#9ca3af',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {a.furigana}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Age */}
                    <td style={tdStyle}>
                      {a.age !== '' && a.age !== undefined ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span style={isFlagAge ? { color: '#DC2626', fontWeight: 600 } : undefined}>
                            {a.age}
                          </span>
                          {isFlagAge && (
                            <span style={{
                              backgroundColor: '#FEE2E2',
                              color: '#DC2626',
                              fontSize: '0.6rem',
                              fontWeight: 600,
                              padding: '0.0625rem 0.25rem',
                              borderRadius: '3px',
                              whiteSpace: 'nowrap',
                            }}>要注意</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>-</span>
                      )}
                    </td>

                    {/* Base */}
                    <td style={tdStyle}>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                      >
                        {a.base || '-'}
                      </span>
                    </td>

                    {/* Job */}
                    <td style={tdStyle}>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                      >
                        {a.job || '-'}
                      </span>
                    </td>

                    {/* Status (inline select) */}
                    <td style={tdStyle}>
                      <select
                        value={a.stage}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                        style={{
                          padding: '0.1875rem 0.375rem',
                          border: '1px solid transparent',
                          borderRadius: '4px',
                          backgroundColor: stColor + '18',
                          color: stColor,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          maxWidth: '100%',
                          appearance: 'none' as const,
                          WebkitAppearance: 'none' as const,
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5L0 0h8z' fill='${encodeURIComponent(stColor)}'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 6px center',
                          paddingRight: '1.25rem',
                        }}
                      >
                        {statuses.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Needs Action */}
                    <td style={tdStyle}>
                      {a.needsAction ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.125rem 0.375rem',
                            backgroundColor: 'rgba(249,115,22,0.15)',
                            color: '#EA6C00',
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            borderRadius: '4px',
                            whiteSpace: 'nowrap',
                          }}>
                            {a.actionDate ? formatShortDate(a.actionDate) : '要対応'}
                            {a.actionTime ? ` ${a.actionTime}` : ''}
                          </span>
                          {a.actionMemo && (
                            <span style={{ fontSize: '0.625rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px', display: 'block' }}>
                              {a.actionMemo}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>-</span>
                      )}
                    </td>

                    {/* Interview date */}
                    <td style={tdStyle}>
                      {evt ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div>
                            <span style={{ fontSize: '0.6rem', color: '#15803D', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}><Check size={10} strokeWidth={3} /> 面接確定</span>
                            <div style={{ fontSize: '0.75rem', color: '#15803D', fontWeight: 500 }}>
                              {evt.date} {evt.start}{evt.end ? `〜${evt.end}` : ''}
                            </div>
                          </div>
                        </div>
                      ) : a.prefDates && a.prefDates.length > 0 ? (
                        <div>
                          <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}><CalendarDays size={10} /> 希望日程</span>
                          {a.prefDates.map((raw, i) => {
                            const d = normalizePrefDate(raw);
                            return (
                              <div key={i} style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                ● {d.date}{d.time ? ` ${d.time}` : ''}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>—</span>
                      )}
                    </td>

                    {/* Detail link */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(`/applicant?applicant=${a.id}`)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-primary, #F97316)',
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                          textDecoration: 'underline',
                          padding: '0.125rem',
                        }}
                      >
                        &rarr;
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Mobile Cards ─── */}
      <div className="applicant-cards">
        {paginated.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
            該当する応募者がいません
          </div>
        ) : (
          paginated.map((a) => {
            const evt = eventMap.get(a.id);
            const isDupe = duplicateMap.has(a.id);
            const stColor = statusColorMap.get(a.stage) || '#6b7280';

            return (
              <div
                key={a.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: selectedIds.has(a.id) ? '#EFF6FF' : '#fff',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/applicant?applicant=${a.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: genderAvatarColor(a.gender),
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {genderAvatarIcon(a.gender)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {a.name}
                      {isDupe && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#FEE2E2',
                            color: '#DC2626',
                            fontSize: '0.6rem',
                            fontWeight: 600,
                            padding: '0.0625rem 0.25rem',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          重複
                        </span>
                      )}
                    </div>
                    {a.furigana && (
                      <div style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{a.furigana}</div>
                    )}
                  </div>
                  <span
                    style={{
                      padding: '0.125rem 0.5rem',
                      borderRadius: '999px',
                      backgroundColor: stColor + '18',
                      color: stColor,
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.stage}
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.25rem 1rem',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                  }}
                >
                  <div>応募日: {formatShortDate(a.date)}</div>
                  <div>年齢: {a.age || '-'}</div>
                  <div>拠点: {a.base || '-'}</div>
                  <div>職種: {a.job || '-'}</div>
                  {evt && <div>面接: {formatShortDate(evt.date)}</div>}
                  <button
                    onClick={() => navigate(`/applicant?applicant=${a.id}`)}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.375rem 0.75rem',
                      backgroundColor: '#F97316',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    詳細を見る
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Pagination ─── */}
      <Pagination
        total={filtered.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* ─── Add Modal ─── */}
      <AddApplicantModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

      {/* ─── Export Modal ─── */}
      <Modal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="CSVエクスポート"
        width="440px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[
            { val: 'filtered' as const, label: `フィルタ結果のみ (${filtered.length}件)` },
            { val: 'all' as const, label: `全件 (${applicants.length}件)` },
            { val: 'selected' as const, label: `選択した応募者のみ (${selectedIds.size}件)` },
          ].map((opt) => (
            <label
              key={opt.val}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 0.75rem',
                border: '1px solid',
                borderColor: exportMode === opt.val ? 'var(--color-primary, #F97316)' : '#e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                backgroundColor: exportMode === opt.val ? '#EFF6FF' : '#fff',
              }}
            >
              <input
                type="radio"
                name="exportMode"
                checked={exportMode === opt.val}
                onChange={() => setExportMode(opt.val)}
              />
              {opt.label}
            </label>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => setExportModalOpen(false)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '0.8125rem',
              }}
            >
              キャンセル
            </button>
            <button
              onClick={doExport}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: 'var(--color-primary, #F97316)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              ダウンロード
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Import Modal ─── */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => { setImportModalOpen(false); setImportStep('upload'); }}
        title="応募者データを一括アップロード"
        width="720px"
      >
        {importStep === 'upload' && (
          <div>
            {/* フォーマット説明 */}
            <div style={{
              padding: '1rem 1.25rem',
              backgroundColor: '#FFF7ED',
              borderRadius: '8px',
              border: '1px dashed #FDBA74',
              marginBottom: '1.5rem',
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#EA580C' }}>CSVファイル形式：</span>
                <button
                  onClick={() => {
                    const headers = CSV_HEADERS;
                    const bom = '\uFEFF';
                    const csv = bom + headers.join(',') + '\n';
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'import_format.csv'; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: '#F97316',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <ClipboardList size={14} /> フォーマットDL
                </button>
              </div>
              <p style={{ fontSize: '0.8125rem', color: '#374151', margin: '0 0 0.75rem' }}>
                ヘッダー行（1行目）に以下の列名を含めてください：
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {CSV_HEADERS.map(col => (
                  <span key={col} style={{
                    padding: '0.25rem 0.625rem',
                    backgroundColor: '#fff',
                    border: '1px solid #FDBA74',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: '#374151',
                    fontWeight: 500,
                  }}>{col}</span>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.5rem 0 0' }}>
                ※「氏名」列は必須です。順番は自由です。
              </p>
            </div>

            {/* ファイル選択エリア */}
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 0.75rem' }}>CSVファイルを選択</h4>
            <div
              style={{
                border: '2px dashed #FDBA74',
                borderRadius: '12px',
                padding: '2.5rem 1rem',
                textAlign: 'center',
                backgroundColor: '#FFFBF5',
                cursor: 'pointer',
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                  const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleFileUpload(fakeEvent);
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: '#FB923C', opacity: 0.8 }}><FolderOpen size={36} /></div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.75rem' }}>
                CSVファイルをここへドロップ、またはクリックして選択
              </p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#F97316',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ファイルを選択
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>

            {/* 下部ボタン */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                disabled
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#F97316',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
              >
                ファイルを選択してください
              </button>
              <button
                onClick={() => { setImportModalOpen(false); setImportStep('upload'); }}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#fff',
                  color: '#F97316',
                  border: '1px solid #FDBA74',
                  borderRadius: '8px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {importStep === 'mapping' && (
          <div>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem', fontWeight: 500 }}>
              ヘッダーマッピング
            </p>
            <div
              style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>CSVヘッダー</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>マッピング先</th>
                  </tr>
                </thead>
                <tbody>
                  {importHeaders.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.375rem 0.5rem' }}>{h}</td>
                      <td style={{ padding: '0.375rem 0.5rem' }}>
                        <select
                          value={importMapping[i] || '_skip'}
                          onChange={(e) =>
                            setImportMapping((prev) => ({ ...prev, [i]: e.target.value }))
                          }
                          style={{
                            padding: '0.25rem 0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.8125rem',
                            width: '100%',
                          }}
                        >
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={() => setImportStep('upload')}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                }}
              >
                戻る
              </button>
              <button
                onClick={() => setImportStep('preview')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-primary, #F97316)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                プレビュー
              </button>
            </div>
          </div>
        )}

        {importStep === 'preview' && (
          <div>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem', fontWeight: 500 }}>
              プレビュー (最初の5件)
            </p>
            <div
              style={{
                maxHeight: '300px',
                overflowX: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {Object.entries(importMapping)
                      .filter(([, v]) => v !== '_skip')
                      .map(([colIdx, fieldKey]) => {
                        const field = IMPORT_FIELDS.find((f) => f.key === fieldKey);
                        return (
                          <th key={colIdx} style={{ padding: '0.375rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {field?.label || fieldKey}
                          </th>
                        );
                      })}
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      {Object.entries(importMapping)
                        .filter(([, v]) => v !== '_skip')
                        .map(([colIdx]) => (
                          <td key={colIdx} style={{ padding: '0.375rem 0.5rem', whiteSpace: 'nowrap' }}>
                            {row[Number(colIdx)] || ''}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.5rem' }}>
              合計 {importRows.length} 件を取り込みます
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={() => setImportStep('mapping')}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                }}
              >
                戻る
              </button>
              <button
                onClick={doImport}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#10B981',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                取り込み実行
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Responsive CSS ─── */}
      <style>{`
        .applicant-table-wrap { display: block; overflow-x: auto; }
        .applicant-cards { display: none; }

        @media (max-width: 900px) {
          .applicant-table th:nth-child(5),
          .applicant-table td:nth-child(5),
          .applicant-table th:nth-child(6),
          .applicant-table td:nth-child(6),
          .applicant-table th:nth-child(8),
          .applicant-table td:nth-child(8) {
            display: none;
          }
        }

        @media (max-width: 600px) {
          .applicant-table-wrap { display: none; }
          .applicant-cards { display: block; }
        }
      `}</style>
    </div>
  );
};

// ─── Shared table cell styles ───
const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.625rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.75rem',
  color: '#6b7280',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.625rem',
  verticalAlign: 'middle',
};

export default ApplicantList;
