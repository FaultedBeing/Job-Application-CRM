import { Link, useLocation } from 'react-router-dom';
import { Home, Briefcase, Building2, Users, FileText, Settings, Bell, FileQuestion, Cloud, Wifi, WifiOff, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../api';
import { isMobileLayout } from '../utils/env';

export const SIDEBAR_FULL_WIDTH = 250;
export const SIDEBAR_COLLAPSED_WIDTH = 60;

interface SidebarProps {
  isOpen: boolean;       // mobile: drawer open/closed
  isCollapsed: boolean;  // desktop: icon-only mode
  onToggle: () => void;          // mobile toggle
  onCollapseToggle: () => void;  // desktop collapse toggle
}

export default function Sidebar({ isOpen, isCollapsed, onToggle, onCollapseToggle }: SidebarProps) {
  const location = useLocation();
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [isMobile, setIsMobile] = useState(isMobileLayout());

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileLayout());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get('/sync/status');
        setSyncStatus(res.data);
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

  const collapsed = !isMobile && isCollapsed;
  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_FULL_WIDTH;

  return (
    <aside
      className={`sidebar-panel${isMobile ? (isOpen ? ' open' : '') : ''}`}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: `${width}px`,
        height: '100vh',
        backgroundColor: '#1a1d24',
        borderRight: '1px solid #2d3139',
        padding: '1.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 100,
        boxShadow: isMobile && isOpen ? '10px 0 25px rgba(0,0,0,0.5)' : 'none',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Header */}
      <div style={{
        padding: collapsed ? '0 0.75rem' : '0 1.5rem',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        minHeight: '36px'
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cloud size={24} color="#fbbf24" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fbbf24', margin: 0, whiteSpace: 'nowrap' }}>
              Job CRM <span style={{ fontStyle: 'italic', fontWeight: 900, fontSize: '1rem' }}>Cloud</span>
            </h1>
          </div>
        )}
        {collapsed && <Cloud size={22} color="#fbbf24" />}

        {/* Mobile: close button */}
        {isMobile && (
          <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0 }}>
            <X size={24} />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => { if (isMobile) onToggle(); }}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '0.75rem',
                padding: collapsed ? '0.75rem 0' : '0.75rem 1.5rem',
                color: isActive ? '#fbbf24' : '#9ca3af',
                backgroundColor: isActive ? '#2d3139' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.2s',
                borderLeft: !collapsed && isActive ? '3px solid #fbbf24' : !collapsed ? '3px solid transparent' : 'none',
                borderRight: collapsed && isActive ? '3px solid #fbbf24' : collapsed ? '3px solid transparent' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}
            >
              <Icon size={20} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Sync status (desktop expanded only) */}
      {!collapsed && (
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #2d3139',
          fontSize: '0.75rem',
          color: '#6b7280'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {syncStatus?.hasConfig ? (
              syncStatus.isSyncing ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
                  <Cloud size={14} /> Syncing...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                  <Wifi size={14} /> Synced
                </span>
              )
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af' }}>
                <WifiOff size={14} /> Offline
              </span>
            )}
          </div>
          {syncStatus?.lastSync && (
            <div>Last sync: {new Date(syncStatus.lastSync).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
          )}
        </div>
      )}

      {/* Desktop collapse toggle button */}
      {!isMobile && (
        <button
          onClick={onCollapseToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            margin: collapsed ? '0.75rem auto' : '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: 'none',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#6b7280',
            cursor: 'pointer',
            padding: '0.5rem',
            width: collapsed ? '36px' : 'auto',
            transition: 'all 0.2s',
            fontSize: '0.75rem'
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e5e7eb')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
        </button>
      )}
    </aside>
  );
}
