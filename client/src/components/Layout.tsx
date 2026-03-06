import { ReactNode, useState, useEffect } from 'react';
import Sidebar, { SIDEBAR_FULL_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './Sidebar';
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
  const [isMobileOpen, setIsMobileOpen] = useState(false);   // mobile drawer open/closed
  const [isCollapsed, setIsCollapsed] = useState(false);      // desktop icon-only mode
  const [isMobile, setIsMobile] = useState(isMobileLayout());

  useEffect(() => {
    const handleResize = () => {
      const mobile = isMobileLayout();
      setIsMobile(mobile);
      // Close mobile drawer if resized to desktop
      if (!mobile) setIsMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sidebarWidth = isMobile ? 0 : (isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_FULL_WIDTH);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0f1115', position: 'relative' }}>

      {/* Mobile overlay — tap to close sidebar */}
      {isMobile && isMobileOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setIsMobileOpen(false)} />
      )}

      <Sidebar
        isOpen={isMobileOpen}
        isCollapsed={isCollapsed}
        onToggle={() => setIsMobileOpen(o => !o)}
        onCollapseToggle={() => setIsCollapsed(c => !c)}
      />

      <div
        className="main-content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          overflow: 'hidden',
          marginLeft: `${sidebarWidth}px`,
          transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
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
          {/* Hamburger — mobile only */}
          {isMobile && (
            <button
              onClick={() => setIsMobileOpen(o => !o)}
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
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
            {/* Manual sync button */}
            <button
              onClick={async () => {
                if (isSyncing) return;
                setIsSyncing(true);
                try {
                  await api.post('/sync/trigger');
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
                transition: 'all 0.2s'
              }}
              title="Force Sync Now"
            >
              <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
            </button>
            <NotificationHub />
          </div>
        </header>

        <main style={{ flex: 1, padding: isMobile ? '1rem' : '2rem', overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      {isElectron() && <DebugConsole />}
    </div>
  );
}
