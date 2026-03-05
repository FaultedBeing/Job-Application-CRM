import { ReactNode, useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import NotificationHub from './NotificationHub';
import DebugConsole from './DebugConsole';
import UpdateBanner from './UpdateBanner';
import { RefreshCw, Menu } from 'lucide-react';
import api from '../api';
import './Layout.css';
import { isElectron, isMobileLayout } from '../utils/env';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobileLayout());
  const [isMobile, setIsMobile] = useState(isMobileLayout());

  useEffect(() => {
    const handleResize = () => {
      const mobile = isMobileLayout();
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0f1115', position: 'relative' }}>
      {/* Mobile Sidebar Overlay */}
      {isMobile && isSidebarOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />

      <div
        className="main-content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          overflow: 'hidden',
          marginLeft: isMobile ? 0 : '250px',
          transition: 'margin-left 0.3s ease'
        }}
      >
        {isElectron() && <UpdateBanner />}
        <header
          style={{
            flexShrink: 0,
            padding: isMobile ? '0.75rem 1rem' : '1rem 2rem',
            borderBottom: '1px solid #2d3139',
            backgroundColor: '#0f1115',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 80
          }}
        >
          {/* Mobile Hamburguer */}
          <div style={{ display: isMobile ? 'block' : 'none' }}>
            <button
              onClick={toggleSidebar}
              style={{
                background: 'none',
                border: 'none',
                color: '#e5e7eb',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Menu size={24} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
            <button
              onClick={async () => {
                if (isSyncing) return;
                setIsSyncing(true);
                try {
                  await api.post('/sync/trigger');
                  // Let the UI spin for a minimum duration to give feedback
                  setTimeout(() => setIsSyncing(false), 1500);
                } catch (err) {
                  console.error('Manual sync failed:', err);
                  setIsSyncing(false);
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: isSyncing ? '#fbbf24' : '#9ca3af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem',
                borderRadius: '50%',
                transition: 'all 0.2s',
              }}
              title="Force Sync Now"
            >
              <RefreshCw size={20} className={isSyncing ? "animate-spin" : ""} />
            </button>
            <NotificationHub />
          </div>
        </header>
        <main style={{ flex: 1, padding: isMobile ? '1rem' : '2rem', overflowY: 'auto' }}>{children}</main>
      </div>
      {isElectron() && <DebugConsole />}
    </div>
  );
}
