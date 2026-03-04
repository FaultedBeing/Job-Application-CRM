import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import NotificationHub from './NotificationHub';
import DebugConsole from './DebugConsole';
import UpdateBanner from './UpdateBanner';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import api from '../api';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0f1115' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden', marginLeft: '250px' }}>
        <UpdateBanner />
        <header
          style={{
            flexShrink: 0,
            padding: '1rem 2rem',
            borderBottom: '1px solid #2d3139',
            backgroundColor: '#0f1115',
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
        <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>{children}</main>
      </div>
      <DebugConsole />
    </div>
  );
}
