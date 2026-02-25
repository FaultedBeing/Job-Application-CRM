import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import NotificationHub from './NotificationHub';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0f1115' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden', marginLeft: '250px' }}>
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
          <NotificationHub />
        </header>
        <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>{children}</main>
      </div>
    </div>
  );
}
