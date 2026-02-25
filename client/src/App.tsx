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

function App() {
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
          <Route path="/settings" element={<Settings />} />
          <Route path="/notifications-settings" element={<NotificationSettings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
