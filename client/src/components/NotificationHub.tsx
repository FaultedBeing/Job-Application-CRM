import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, X, ExternalLink, Check } from 'lucide-react';
import api from '../api';

type NotificationItem = {
  id: number;
  title?: string | null;
  message: string;
  link_path?: string | null;
  due_at: string;
  read_at?: string | null;
  dismissed_at?: string | null;
};

function formatDue(dueAt: string) {
  try {
    return new Date(dueAt).toLocaleString();
  } catch (_e) {
    return dueAt;
  }
}

export default function NotificationHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const hasNotificationsQuery = useMemo(() => {
    return new URLSearchParams(location.search).get('notifications') === '1';
  }, [location.search]);

  async function refreshUnread() {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnread(res.data.unread || 0);
    } catch (_e) {
      // ignore
    }
  }

  async function refreshList() {
    setLoading(true);
    try {
      const res = await api.get('/notifications', { params: { limit: 50, offset: 0 } });
      setItems(res.data || []);
    } catch (_e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function tick() {
      refreshUnread();
      if (open) {
        refreshList();
      }
    }
    tick();
    const t = window.setInterval(tick, 15_000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    function handleUpdated() {
      refreshUnread();
      if (open) {
        refreshList();
      }
    }
    window.addEventListener('notifications-updated', handleUpdated);
    return () => window.removeEventListener('notifications-updated', handleUpdated);
  }, [open]);

  useEffect(() => {
    if (!hasNotificationsQuery) return;
    setOpen(true);
    refreshList();
    refreshUnread();
    // We intentionally do not strip the query param automatically.
  }, [hasNotificationsQuery]);

  useEffect(() => {
    if (!open) return;
    refreshList();
    refreshUnread();
  }, [open]);

  async function markRead(id: number) {
    try {
      await api.post(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (_e) {
      // ignore
    }
  }

  async function dismiss(id: number) {
    try {
      await api.post(`/notifications/${id}/dismiss`);
      setItems((prev) => {
        const wasUnread = prev.find((n) => n.id === id)?.read_at == null;
        if (wasUnread) setUnread((u) => Math.max(0, u - 1));
        return prev.filter((n) => n.id !== id);
      });
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (_e) {
      // ignore
    }
  }

  async function dismissAll() {
    try {
      await api.post('/notifications/dismiss-all');
      setItems([]);
      setUnread(0);
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (_e) {
      // ignore
    }
  }

  async function openNotification(n: NotificationItem) {
    await markRead(n.id);
    setOpen(false);
    navigate(n.link_path || '/');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        style={{
          position: 'relative',
          backgroundColor: 'transparent',
          border: '1px solid #2d3139',
          borderRadius: '10px',
          padding: '0.55rem 0.75rem',
          cursor: 'pointer',
          color: '#e5e7eb',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        <Bell size={18} />
        <span style={{ fontSize: '0.9rem' }}>Alerts</span>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              minWidth: '22px',
              height: '22px',
              padding: '0 6px',
              backgroundColor: '#ef4444',
              color: '#fff',
              borderRadius: 999,
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #0f1115'
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 3000,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: '480px',
              maxWidth: '92vw',
              height: '100%',
              backgroundColor: '#0f1115',
              borderLeft: '1px solid #2d3139',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #2d3139',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem'
              }}
            >
              <div>
                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1.1rem' }}>Notifications</div>
                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                  {unread > 0 ? `${unread} unread` : 'All caught up'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {items.length > 0 && (
                  <button
                    onClick={dismissAll}
                    style={{ backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#9ca3af', padding: '0.25rem 0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{ backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                  aria-label="Close notifications"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
              {loading ? (
                <div style={{ color: '#9ca3af' }}>Loading…</div>
              ) : items.length === 0 ? (
                <div style={{ color: '#9ca3af' }}>No notifications.</div>
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {items.map((n) => {
                    const isUnread = !n.read_at;
                    return (
                      <div
                        key={n.id}
                        style={{
                          backgroundColor: '#1a1d24',
                          border: `1px solid ${isUnread ? '#fbbf24' : '#2d3139'}`,
                          borderRadius: '12px',
                          padding: '0.9rem 1rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '1rem' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#e5e7eb', fontWeight: 700, marginBottom: '0.15rem' }}>
                              {n.title || 'Reminder'}
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                              Due: {formatDue(n.due_at)}
                            </div>
                            <div style={{ color: '#e5e7eb', lineHeight: 1.35 }}>{n.message}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                          {isUnread && (
                            <button
                              onClick={() => markRead(n.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.4rem 0.7rem',
                                borderRadius: '8px',
                                border: '1px solid #2d3139',
                                backgroundColor: 'transparent',
                                color: '#9ca3af',
                                cursor: 'pointer'
                              }}
                              title="Mark as read"
                            >
                              <Check size={14} />
                              Read
                            </button>
                          )}
                          <button
                            onClick={() => openNotification(n)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.4rem 0.7rem',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#3b82f6',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                            title="Open"
                          >
                            <ExternalLink size={14} />
                            Open
                          </button>
                          <button
                            onClick={() => dismiss(n.id)}
                            style={{
                              padding: '0.4rem 0.7rem',
                              borderRadius: '8px',
                              border: '1px solid #4b5563',
                              backgroundColor: 'transparent',
                              color: '#f87171',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                            title="Dismiss"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

