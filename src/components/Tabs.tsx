import React, { useState } from 'react';

interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
}

const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.key || '');

  const activeContent = tabs.find((t) => t.key === activeTab)?.content;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid #e5e7eb',
          gap: '0',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.625rem 1.25rem',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-primary, #3B82F6)' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? 'var(--color-primary, #3B82F6)' : '#6b7280',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ paddingTop: '1rem' }}>{activeContent}</div>
    </div>
  );
};

export default Tabs;
