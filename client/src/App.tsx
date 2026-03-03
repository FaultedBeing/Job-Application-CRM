import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import JobBoard from './components/JobBoard';
import JobDetail from './components/JobDetail';
import Companies from './components/Companies';
import CompanyDetail from './components/CompanyDetail';
import Contacts from './components/Contacts';
import Documents from './components/Documents';
import Settings from './components/Settings';
import NotificationSettings from './components/NotificationSettings';
import InterviewPrep from './components/InterviewPrep';
import CloudSetupWizard from './components/CloudSetupWizard';
import { useState, useEffect } from 'react';

function App() {
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const checkCloud = async () => {
      try {
        const res = await fetch('/api/sync/status');
        const status = await res.json();
        // If the sync engine is initialized and has config, we're good
        setCloudConfigured(status.hasConfig);
      } catch (err) {
        console.error('Failed to check cloud status:', err);
        setCloudConfigured(false);
      }
    };
    checkCloud();
  }, []);

  if (cloudConfigured === null) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: '2rem',
          height: '2rem',
          border: '2px solid #3b82f6',
          borderBottomColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (cloudConfigured === false) {
    return <CloudSetupWizard onComplete={() => setCloudConfigured(true)} />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applications" element={<JobBoard />} />
          <Route path="/job/:id" element={<JobDetail />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/company/:id" element={<CompanyDetail />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<Contacts />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/interview-prep" element={<InterviewPrep />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notifications-settings" element={<NotificationSettings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
