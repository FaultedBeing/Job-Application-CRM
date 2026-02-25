import { Link, useLocation } from 'react-router-dom';
import { Home, Briefcase, Building2, Users, FileText, Settings, Bell } from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/applications', icon: Briefcase, label: 'Applications' },
    { path: '/companies', icon: Building2, label: 'Companies' },
    { path: '/contacts', icon: Users, label: 'Contacts' },
    { path: '/documents', icon: FileText, label: 'Documents' },
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
      <div style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>
          Job Tracker
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
    </aside>
  );
}
