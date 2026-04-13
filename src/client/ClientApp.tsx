import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import Login from '@/client/pages/Login';
import Dashboard from '@/client/pages/Dashboard';
import Calendar from '@/client/pages/Calendar';
import ApplicantList from '@/client/pages/ApplicantList';
import ApplicantDetail from '@/client/pages/ApplicantDetail';
import ProgressBoard from '@/client/pages/ProgressBoard';
import StatusManagement from '@/client/pages/settings/StatusManagement';
import SourceManagement from '@/client/pages/settings/SourceManagement';
import BaseManagement from '@/client/pages/settings/BaseManagement';
import JobManagement from '@/client/pages/settings/JobManagement';
import HearingManagement from '@/client/pages/settings/HearingManagement';
import FilterConditionSettings from '@/client/pages/settings/FilterConditionSettings';
import ExclusionList from '@/client/pages/settings/ExclusionList';
import EmailTemplateManagement from '@/client/pages/settings/EmailTemplateManagement';
import ChatbotManagement from '@/client/pages/settings/ChatbotManagement';
import AccountSettings from '@/client/pages/settings/AccountSettings';

const AuthenticatedApp: React.FC = () => {
  const { client, logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar client={client} onLogout={logout} />
      <main style={{ flex: 1, overflow: 'auto', backgroundColor: '#fff' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applicants" element={<ApplicantList />} />
          <Route path="/applicant" element={<ApplicantDetail />} />
          <Route path="/progress" element={<ProgressBoard />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/statuses" element={<StatusManagement />} />
          <Route path="/sources" element={<SourceManagement />} />
          <Route path="/bases" element={<BaseManagement />} />
          <Route path="/jobs" element={<JobManagement />} />
          <Route path="/settings/hearing" element={<HearingManagement />} />
          <Route path="/settings/filter" element={<FilterConditionSettings />} />
          <Route path="/settings/exclusion" element={<ExclusionList />} />
          <Route path="/settings/email-templates" element={<EmailTemplateManagement />} />
          <Route path="/settings/chatbot" element={<ChatbotManagement />} />
          <Route path="/settings/account" element={<AccountSettings />} />
        </Routes>
      </main>
    </div>
  );
};

const ClientApp: React.FC = () => {
  return (
    <AuthProvider>
      <ClientAppInner />
    </AuthProvider>
  );
};

const ClientAppInner: React.FC = () => {
  const { isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return <Login />;
  }

  return <AuthenticatedApp />;
};

export default ClientApp;
