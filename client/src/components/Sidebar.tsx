import { Link, useLocation } from 'react-router-dom';
import { Home, Briefcase, Building2, Users, FileText, Settings, Bell, FileQuestion, Cloud, Wifi, WifiOff } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Sidebar() {
  const location = useLocation();
  const [syncStatus, setSyncStatus] = useState<any>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/sync/status');
        const data = await res.json();
        setSyncStatus(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/applications', icon: Briefcase, label: 'Applications' },
    { path: '/companies', icon: Building2, label: 'Companies' },
    { path: '/contacts', icon: Users, label: 'Contacts' },
    { path: '/documents', icon: FileText, label: 'Documents' },
    { path: '/interview-prep', icon: FileQuestion, label: 'Interview Prep' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/notifications-settings', icon: Bell, label: 'Notifications' }
  ];

  return (
    <aside style={{
      position: 'fixed',
      left: 0,
      top: 0,
      width: '250px',
      height: '100vh',
      backgroundColor: '#1a1d24',
      borderRight: '1px solid #2d3139',
      padding: '1.5rem 0',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      zIndex: 100
    }}>
      <div style={{ padding: '0 1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Cloud size={24} color="#fbbf24" />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24', margin: 0 }}>
          Job CRM <span style={{ fontStyle: 'italic', fontWeight: '900' }}>Cloud</span>
        </h1>
      </div>
      <nav style={{ flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1.5rem',
                color: isActive ? '#fbbf24' : '#9ca3af',
                backgroundColor: isActive ? '#2d3139' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.2s',
                borderLeft: isActive ? '3px solid #fbbf24' : '3px solid transparent'
              }}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{
        padding: '1.5rem',
        borderTop: '1px solid #2d3139',
        marginTop: 'auto',
        fontSize: '0.75rem',
        color: '#6b7280'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {syncStatus?.hasConfig ? (
            syncStatus.isSyncing ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
                <Cloud size={14} className="animate-pulse" />
                Syncing...
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                <Wifi size={14} />
                Synced
              </span>
            )
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af' }}>
              <WifiOff size={14} />
              Offline
            </span>
          )}
        </div>
        {syncStatus?.lastSync && (
          <div>Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}</div>
        )}
      </div>
    </aside>
  );
}
