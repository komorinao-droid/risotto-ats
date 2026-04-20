import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  Calendar,
  Tags,
  Megaphone,
  Building2,
  Briefcase,
  Settings,
  ChevronUp,
  ChevronDown,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import type { Client } from '@/types';

interface SidebarProps {
  client: Client | null;
  onLogout: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon | null;
  permission?: keyof Client['permissions'];
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { path: '/applicants', label: '応募者管理', icon: Users },
  { path: '/progress', label: '進捗ボード', icon: KanbanSquare },
  { path: '/calendar', label: '面接カレンダー', icon: Calendar },
  { path: '/statuses', label: 'ステータス管理', icon: Tags, permission: 'status' },
  { path: '/sources', label: '応募媒体管理', icon: Megaphone, permission: 'source' },
  { path: '/bases', label: '拠点管理', icon: Building2, permission: 'base' },
  { path: '/jobs', label: '職種管理', icon: Briefcase, permission: 'job' },
  {
    path: '/settings',
    label: '設定',
    icon: Settings,
    children: [
      { path: '/settings/hearing', label: 'ヒアリング', icon: null, permission: 'hearing' },
      { path: '/settings/filter', label: 'フィルタ条件', icon: null, permission: 'filtercond' },
      { path: '/settings/exclusion', label: '除外リスト', icon: null, permission: 'exclusion' },
      { path: '/settings/email-templates', label: 'メールテンプレート', icon: null, permission: 'mailtemplate' },
      { path: '/settings/chatbot', label: 'チャットボット', icon: null, permission: 'chatbot' },
      { path: '/settings/account', label: 'アカウント', icon: null },
    ],
  },
];

function hasPermission(client: Client | null, permission?: keyof Client['permissions']): boolean {
  if (!permission) return true;
  if (!client) return false;
  if (client.accountType === 'parent') return true;
  return !!client.permissions[permission];
}

const linkStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '0.875rem',
  color: isActive ? '#fff' : '#374151',
  backgroundColor: isActive ? 'var(--color-primary, #F97316)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
  transition: 'background-color 0.15s',
});

const Sidebar: React.FC<SidebarProps> = ({ client, onLogout }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const renderNavItem = (item: NavItem) => {
    if (!hasPermission(client, item.permission)) return null;

    const Icon = item.icon;

    if (item.children) {
      const visibleChildren = item.children.filter((child) =>
        hasPermission(client, child.permission)
      );
      if (visibleChildren.length === 0) return null;

      return (
        <div key={item.path}>
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '6px',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#374151',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {Icon && <Icon size={16} strokeWidth={2} />}
              {item.label}
            </span>
            {settingsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {settingsOpen && (
            <div style={{ paddingLeft: '1.25rem' }}>
              {visibleChildren.map((child) => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  onClick={() => setMobileOpen(false)}
                  style={({ isActive }) => linkStyle(isActive)}
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === '/'}
        onClick={() => setMobileOpen(false)}
        style={({ isActive }) => linkStyle(isActive)}
      >
        {Icon && <Icon size={16} strokeWidth={2} />}
        <span>{item.label}</span>
      </NavLink>
    );
  };

  const sidebarContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '1.25rem 1rem',
          borderBottom: '1px solid #e5e7eb',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--color-primary, #F97316)',
            letterSpacing: '0.05em',
          }}
        >
          RISOTTO
        </h1>
        {client && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {client.companyName}
          </div>
        )}
      </div>

      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.75rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.125rem',
        }}
      >
        {NAV_ITEMS.map(renderNavItem)}
      </nav>

      <div
        style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <button
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            backgroundColor: '#fff',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            color: '#6b7280',
          }}
        >
          ログアウト
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* モバイルハンバーガー */}
      <button
        className="sidebar-hamburger"
        onClick={() => setMobileOpen(true)}
        style={{
          position: 'fixed',
          top: '0.75rem',
          left: '0.75rem',
          zIndex: 1001,
          display: 'none',
          width: '2.5rem',
          height: '2.5rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          backgroundColor: '#fff',
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <Menu size={20} />
      </button>

      {/* モバイルオーバーレイ */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 998,
          }}
        />
      )}

      {/* サイドバー */}
      <aside
        className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}
        style={{
          width: '240px',
          minWidth: '240px',
          height: '100vh',
          backgroundColor: '#f9fafb',
          borderRight: '1px solid #e5e7eb',
          position: 'sticky',
          top: 0,
          overflowY: 'auto',
        }}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
