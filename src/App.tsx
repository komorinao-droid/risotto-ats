import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const AdminApp = lazy(() => import('./admin/AdminApp'));
const ClientApp = lazy(() => import('./client/ClientApp'));

const Loading: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontSize: '1.1rem',
    color: '#666',
  }}>
    読み込み中...
  </div>
);

const App: React.FC = () => {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<ClientApp />} />
      </Routes>
    </Suspense>
  );
};

export default App;
