import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Applicant, ClientData } from '@/types';

/* ============================
   KanbanBoard - カンバンボード
   ============================ */

// ---------- helpers ----------

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [{ value: '', label: '全期間' }];
  for (let i = -12; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const val = `${y}-${String(m).padStart(2, '0')}`;
    options.push({ value: val, label: `${y}年${m}月` });
  }
  return options;
}

function applicantMatchesMonth(a: Applicant, ym: string): boolean {
  if (!ym) return true;
  if (!a.date) return false;
  return a.date.startsWith(ym);
}

// ---------- component ----------

const KanbanBoard: React.FC = () => {
  const { clientData, updateClientData } = useAuth();
  const [monthFilter, setMonthFilter] = useState('');
  const [dragApplicantId, setDragApplicantId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const dragCounterRef = useRef<Record<string, number>>({});

  const statuses = useMemo(() => {
    if (!clientData) return [];
    return [...clientData.statuses].sort((a, b) => a.order - b.order);
  }, [clientData]);

  const applicants = useMemo(() => {
    if (!clientData) return [];
    return clientData.applicants.filter((a) => applicantMatchesMonth(a, monthFilter));
  }, [clientData, monthFilter]);

  const applicantsByStatus = useMemo(() => {
    const map: Record<string, Applicant[]> = {};
    for (const s of statuses) {
      map[s.name] = [];
    }
    for (const a of applicants) {
      if (map[a.stage]) {
        map[a.stage].push(a);
      }
    }
    return map;
  }, [applicants, statuses]);

  const sourceColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    if (clientData) {
      for (const s of clientData.sources) {
        m[s.name] = s.color;
      }
    }
    return m;
  }, [clientData]);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  // --- drag handlers ---
  const handleDragStart = useCallback((e: React.DragEvent, applicantId: number) => {
    setDragApplicantId(applicantId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(applicantId));
    // Make the drag image semi-transparent
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '1';
    setDragApplicantId(null);
    setDragOverStatus(null);
    dragCounterRef.current = {};
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, statusName: string) => {
    e.preventDefault();
    if (!dragCounterRef.current[statusName]) {
      dragCounterRef.current[statusName] = 0;
    }
    dragCounterRef.current[statusName]++;
    setDragOverStatus(statusName);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, statusName: string) => {
    e.preventDefault();
    if (dragCounterRef.current[statusName]) {
      dragCounterRef.current[statusName]--;
    }
    if ((dragCounterRef.current[statusName] || 0) <= 0) {
      dragCounterRef.current[statusName] = 0;
      setDragOverStatus((prev) => (prev === statusName ? null : prev));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetStatus: string) => {
      e.preventDefault();
      setDragOverStatus(null);
      dragCounterRef.current = {};

      const idStr = e.dataTransfer.getData('text/plain');
      const applicantId = Number(idStr);
      if (!applicantId) return;

      updateClientData((data: ClientData) => {
        const idx = data.applicants.findIndex((a) => a.id === applicantId);
        if (idx === -1) return data;
        if (data.applicants[idx].stage === targetStatus) return data;
        const updated = [...data.applicants];
        updated[idx] = { ...updated[idx], stage: targetStatus };
        return { ...data, applicants: updated };
      });
    },
    [updateClientData]
  );

  if (!clientData) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>データを読み込み中...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>カンバンボード</h2>
        <div style={styles.filterRow}>
          <label style={styles.filterLabel}>応募月:</label>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={styles.select}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span style={styles.countText}>
            {applicants.length}件
          </span>
        </div>
      </div>

      {/* Board */}
      <div style={styles.board}>
        {statuses.map((status) => {
          const cards = applicantsByStatus[status.name] || [];
          const isOver = dragOverStatus === status.name;
          return (
            <div
              key={status.id}
              style={{
                ...styles.column,
                borderTop: `3px solid ${status.color}`,
                backgroundColor: isOver
                  ? hexToRgba(status.color, 0.08)
                  : '#f9fafb',
                transition: 'background-color 0.15s ease',
              }}
              onDragEnter={(e) => handleDragEnter(e, status.name)}
              onDragLeave={(e) => handleDragLeave(e, status.name)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, status.name)}
            >
              {/* Column header */}
              <div style={styles.columnHeader}>
                <span style={styles.columnTitle}>{status.name}</span>
                <span
                  style={{
                    ...styles.badge,
                    backgroundColor: hexToRgba(status.color, 0.15),
                    color: status.color,
                  }}
                >
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div style={styles.cardList}>
                {cards.map((a) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, a.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      ...styles.card,
                      opacity: dragApplicantId === a.id ? 0.4 : 1,
                    }}
                  >
                    <div style={styles.cardTop}>
                      <div
                        style={{
                          ...styles.avatar,
                          backgroundColor: status.color,
                        }}
                      >
                        {getInitials(a.name)}
                      </div>
                      <div style={styles.cardInfo}>
                        <div style={styles.cardName}>{a.name}</div>
                        <div style={styles.cardJob}>{a.job || '未設定'}</div>
                      </div>
                    </div>
                    <div style={styles.cardBottom}>
                      {a.src && (
                        <span
                          style={{
                            ...styles.srcChip,
                            backgroundColor: hexToRgba(
                              sourceColorMap[a.src] || '#6b7280',
                              0.12
                            ),
                            color: sourceColorMap[a.src] || '#6b7280',
                          }}
                        >
                          {a.src}
                        </span>
                      )}
                      {a.date && (
                        <span style={styles.cardDate}>
                          {a.date.slice(5).replace('-', '/')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <div style={styles.emptyColumn}>
                    該当なし
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- styles ----------

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '1.5rem',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#111827',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  filterLabel: {
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: '#6b7280',
    whiteSpace: 'nowrap',
  },
  select: {
    padding: '0.375rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.8125rem',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  countText: {
    fontSize: '0.8125rem',
    color: '#6b7280',
    marginLeft: '0.5rem',
  },

  board: {
    display: 'flex',
    gap: '0.75rem',
    flex: 1,
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: '0.5rem',
  },
  column: {
    flex: '0 0 240px',
    minWidth: '240px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 0.75rem 0.5rem',
  },
  columnTitle: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#374151',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    borderRadius: '11px',
    fontSize: '0.6875rem',
    fontWeight: 700,
    padding: '0 6px',
  },

  cardList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 0.5rem 0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '0.75rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    cursor: 'grab',
    transition: 'box-shadow 0.15s, opacity 0.15s',
    border: '1px solid #e5e7eb',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    marginBottom: '0.5rem',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '0.6875rem',
    fontWeight: 700,
    flexShrink: 0,
  },
  cardInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  cardName: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardJob: {
    fontSize: '0.6875rem',
    color: '#6b7280',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardBottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.375rem',
  },
  srcChip: {
    display: 'inline-block',
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.6875rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '140px',
  },
  cardDate: {
    fontSize: '0.6875rem',
    color: '#9ca3af',
    whiteSpace: 'nowrap',
  },
  emptyColumn: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '0.75rem',
    padding: '2rem 0',
  },
};

export default KanbanBoard;
