import React, { useState } from 'react';
import KanbanBoard from '@/client/pages/KanbanBoard';
import MonthlyReport from '@/client/pages/MonthlyReport';
import WeeklyReport from '@/client/pages/WeeklyReport';

type Tab = 'board' | 'monthly' | 'weekly';

const TAB_ITEMS: { key: Tab; label: string }[] = [
  { key: 'board', label: 'ボード' },
  { key: 'monthly', label: '月次レポート' },
  { key: 'weekly', label: '週次レポート' },
];

const ProgressBoard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('board');

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.625rem 1.25rem',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.875rem',
    color: active ? '#3B82F6' : '#6b7280',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? '#3B82F6' : 'transparent'}`,
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div>
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#fff',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={tabStyle(activeTab === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === 'board' && <KanbanBoard />}
        {activeTab === 'monthly' && <MonthlyReport />}
        {activeTab === 'weekly' && <WeeklyReport />}
      </div>
    </div>
  );
};

export default ProgressBoard;
