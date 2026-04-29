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
import ScreeningSettings from '@/client/pages/settings/ScreeningSettings';
import AccountSettings from '@/client/pages/settings/AccountSettings';
import MediaCostManagement from '@/client/pages/settings/MediaCostManagement';
import RecruitmentReport from '@/client/pages/RecruitmentReport';
import RecruitmentReportPrint from '@/client/pages/RecruitmentReportPrint';
import { hasActiveOption } from '@/utils/clientOptions';

const ReportNotContractedNotice: React.FC<{ feature: string }> = ({ feature }) => (
  <div style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: '720px', margin: '0 auto' }}>
    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
    <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
      {feature}は採用レポートオプションでご利用いただけます
    </h2>
    <p style={{ fontSize: '0.875rem', color: '#6B7280', lineHeight: 1.7, marginBottom: '1.5rem' }}>
      採用レポートオプションをご契約いただくと、応募〜採用までのファネル分析、月次推移、<br />
      媒体費用の費用対効果(CPA/CPH)、AI総評、PDF納品資料などの機能がご利用いただけます。<br />
      ご利用希望の方は担当営業までご連絡ください。
    </p>
    <div style={{ padding: '1rem 1.25rem', backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', textAlign: 'left' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 700, color: '#9A3412' }}>採用レポートオプション 含まれる機能</h3>
      <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.8125rem', color: '#9A3412', lineHeight: 1.8 }}>
        <li>採用ファネル分析（応募/有効/面接/内定/採用/稼働の自動集計）</li>
        <li>拠点・媒体・職種・年代別の多面分析</li>
        <li>ステップ別到達率/通過率（ボトルネック自動検出）</li>
        <li>月次採用目標 達成率/着地ヨミ</li>
        <li>媒体費用管理 × CPA/CPH 自動算出</li>
        <li>RISOTTO AI による総評生成</li>
        <li>本番納品PDF出力（A4横30ページ）/ Excel出力</li>
      </ul>
    </div>
  </div>
);

const AuthenticatedApp: React.FC = () => {
  const { client, logout } = useAuth();
  const isPrintRoute = window.location.pathname.startsWith('/reports/print');
  const reportEnabled = hasActiveOption(client, 'recruitmentReport');

  if (isPrintRoute) {
    // 印刷ビューはサイドバー無しのフル画面（オプション未契約なら誘導画面）
    if (!reportEnabled) return <ReportNotContractedNotice feature="採用レポート" />;
    return (
      <Routes>
        <Route path="/reports/print" element={<RecruitmentReportPrint />} />
      </Routes>
    );
  }

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
          <Route path="/reports" element={reportEnabled ? <RecruitmentReport /> : <ReportNotContractedNotice feature="採用レポート" />} />
          <Route path="/statuses" element={<StatusManagement />} />
          <Route path="/sources" element={<SourceManagement />} />
          <Route path="/media-costs" element={reportEnabled ? <MediaCostManagement /> : <ReportNotContractedNotice feature="媒体費用管理" />} />
          <Route path="/bases" element={<BaseManagement />} />
          <Route path="/jobs" element={<JobManagement />} />
          <Route path="/settings/hearing" element={<HearingManagement />} />
          <Route path="/settings/filter" element={<FilterConditionSettings />} />
          <Route path="/settings/exclusion" element={<ExclusionList />} />
          <Route path="/settings/email-templates" element={<EmailTemplateManagement />} />
          <Route path="/settings/chatbot" element={<ChatbotManagement />} />
          <Route path="/settings/screening" element={<ScreeningSettings />} />
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
