import { useEffect, useState } from 'react';
import api from '../api';
import { Download, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';

export default function Settings() {
  const [username, setUsername] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [newIndustry, setNewIndustry] = useState('');
  const [allowPrerelease, setAllowPrerelease] = useState(false);
  const [showJobMap, setShowJobMap] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; confirmLabel?: string; confirmColor?: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadSettings().then(() => setInitialLoaded(true));
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (!initialLoaded) return;
    const timer = setTimeout(() => {
      saveSettings();
    }, 1000);
    return () => clearTimeout(timer);
  }, [username, statuses, allowPrerelease, showJobMap, initialLoaded]);

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ message, type });
    // For errors, keep the toast visible until the user closes it.
    if (type !== 'error') {
      window.setTimeout(() => {
        setToast((t) => (t?.message === message ? null : t));
      }, 2500);
    }
  }

  async function loadSettings() {
    try {
      const res = await api.get('/settings');
      setUsername(res.data.username || 'User');
      const statusStr = res.data.statuses || 'Wishlist,Applied,Interviewing,Offer,Rejected';
      setStatuses(statusStr.split(','));
      const rawIndustryStr: string | null | undefined = res.data.industries;

      // Always reset industries to fix any broken comma-separated entries
      // This ensures proper pipe-delimited format
      const defaultIndustries = [
        'Launch Vehicles',
        'Satellite Manufacturing',
        'Earth Observation & Remote Sensing',
        'Ground Segment & Ground Stations',
        'In-Space Services (On-Orbit Servicing, Refueling, Debris Removal)',
        'Space Infrastructure (Stations, Platforms, Habitats)',
        'Space Tourism & Human Spaceflight',
        'Space Robotics & Autonomy',
        'Space Situational Awareness (SSA) & Space Traffic Management',
        'Space Communications & Networking',
        'Space Exploration & Science Missions',
        'Defense & National Security Space',
        'Space Consulting, Analytics, & Research',
        'Space Software & Mission Operations',
        'Other Space-Related'
      ];

      // Seed defaults if settings are missing (first run / older DB)
      if (rawIndustryStr === undefined || rawIndustryStr === null) {
        setIndustries(defaultIndustries);
        // Save defaults to database with proper pipe delimiter
        await api.post('/settings', {
          industries: defaultIndustries.join('|')
        });
      } else if (!rawIndustryStr.trim()) {
        // Respect an intentionally empty list (e.g. user clicked "Clear All")
        setIndustries([]);
      } else {
        const industryStr = rawIndustryStr;
        // Check if using old comma format
        const hasCommas = industryStr.includes(',') && !industryStr.includes('|');
        const industryList = hasCommas ? [] : (industryStr.includes('|') ? industryStr.split('|').filter((i: string) => i.trim()) : [industryStr].filter((i: string) => i.trim()));

        if (industryList.length === 0 || hasCommas) {
          // Reset to defaults if using old comma format or empty list
          setIndustries(defaultIndustries);
          await api.post('/settings', {
            industries: defaultIndustries.join('|')
          });
        } else {
          setIndustries(industryList);
        }
      }

      // Load allow_prerelease setting
      const allowPrereleaseStr = res.data.allow_prerelease || 'false';
      setAllowPrerelease(allowPrereleaseStr === 'true');

      // Load job location map toggle (default ON if not set)
      const showJobMapStr = res.data.show_job_map;
      setShowJobMap(showJobMapStr === undefined || showJobMapStr === null ? true : showJobMapStr === 'true');

    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function saveSettings() {
    try {
      await api.post('/settings', {
        username,
        statuses: statuses.join(','),
        industries: industries.join('|'),
        allow_prerelease: allowPrerelease ? 'true' : 'false',
        show_job_map: showJobMap ? 'true' : 'false'
      });
      showToast('Settings saved!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Error saving settings', 'error');
    }
  }

  async function saveIndustries(nextIndustries: string[]) {
    try {
      await api.post('/settings', { industries: nextIndustries.join('|') });
      showToast('Industries saved', 'success');
    } catch (error) {
      console.error('Error saving industries:', error);
      showToast('Error saving industries', 'error');
    }
  }

  function addStatus() {
    if (newStatus.trim() && !statuses.includes(newStatus.trim())) {
      setStatuses(prev => [...prev, newStatus.trim()]);
      setNewStatus('');
    }
  }

  function removeStatus(status: string) {
    setStatuses(prev => prev.filter(s => s !== status));
  }

  async function addIndustry() {
    const trimmed = newIndustry.trim();
    if (trimmed && !industries.includes(trimmed)) {
      const next = [...industries, trimmed];
      setIndustries(next);
      setNewIndustry('');
      await saveIndustries(next);
    }
  }

  async function removeIndustry(industry: string) {
    const next = industries.filter(i => i !== industry);
    setIndustries(next);
    await saveIndustries(next);
  }

  async function exportData() {
    try {
      const res = await api.get('/export');
      const dataStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Export started', 'success');
    } catch (error) {
      console.error('Error exporting data:', error);
      showToast('Error exporting data', 'error');
    }
  }

  async function exportExcel() {
    try {
      const res = await api.get('/export/excel', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-tracker-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Excel export started', 'success');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      showToast('Error exporting to Excel', 'error');
    }
  }

  function resetDatabase() {
    setPendingConfirm({
      title: 'Reset database',
      message: 'Are you sure you want to reset the database? This will delete ALL data and cannot be undone!',
      confirmLabel: 'Continue',
      confirmColor: '#ef4444',
      onConfirm: () => {
        setPendingConfirm({
          title: 'Final warning',
          message: 'This is your last chance. Are you absolutely sure?',
          confirmLabel: 'Reset Everything',
          confirmColor: '#ef4444',
          onConfirm: async () => {
            setPendingConfirm(null);
            try {
              await api.post('/reset-database');
              showToast('Database reset. Reloading\u2026', 'success');
              window.setTimeout(() => window.location.reload(), 800);
            } catch (error) {
              console.error('Error resetting database:', error);
              showToast('Error resetting database', 'error');
            }
          }
        });
      }
    });
  }

  function handleCheckForUpdates() {
    try {
      const anyWindow = window as any;
      if (anyWindow.electronAPI && typeof anyWindow.electronAPI.checkForUpdates === 'function') {
        anyWindow.electronAPI.checkForUpdates();
        showToast('Checking for updates…', 'info');
      } else {
        showToast('Update check is only available in the desktop app.', 'info');
      }
    } catch (error) {
      console.error('Error triggering update check from settings:', error);
      showToast('Unable to trigger update check right now.', 'error');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#fbbf24' }}>Settings</h1>

      {/* Username */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Username</h2>
        <input
          type="text"
          value={username}
          onChange={(e) => {
            const val = e.target.value;
            if (val.toLowerCase() === 'pizzapie') {
              localStorage.setItem('debug_mode', 'true');
              window.dispatchEvent(new Event('debug_mode_changed'));
              showToast('Debug mode activated!', 'info');
            }
            setUsername(val);
          }}
          placeholder="Your name"
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '0.75rem',
            backgroundColor: '#0f1115',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '1rem'
          }}
        />
      </section>

      {/* Status Pipeline */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Status Pipeline</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addStatus()}
            placeholder="Add new status"
            style={{
              flex: 1,
              maxWidth: '300px',
              padding: '0.75rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          />
          <button
            onClick={addStatus}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#fbbf24',
              border: 'none',
              borderRadius: '6px',
              color: '#0f1115',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Add
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {statuses.map((status) => (
            <div
              key={status}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#0f1115',
                borderRadius: '6px',
                border: '1px solid #2d3139'
              }}
            >
              <span style={{ color: '#e5e7eb' }}>{status}</span>
              <button
                onClick={() => removeStatus(status)}
                style={{
                  padding: '0.25rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Job Detail Display */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Job Detail Display</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e7eb', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showJobMap}
            onChange={(e) => setShowJobMap(e.target.checked)}
            style={{ accentColor: '#fbbf24', width: 18, height: 18, borderRadius: 4 }}
          />
          <span>Show map preview for job locations</span>
        </label>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          When enabled, job detail pages will show a small US map with a pin for the job’s location.
        </p>
      </section>

      {/* Industry Categories */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Industry Categories</h2>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem' }}>
          These options are used for the <strong>Industry</strong> dropdown when adding or editing companies.
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={newIndustry}
            onChange={(e) => setNewIndustry(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addIndustry()}
            placeholder="Add new industry category"
            style={{
              flex: 1,
              maxWidth: '400px',
              padding: '0.75rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          />
          <button
            onClick={addIndustry}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#fbbf24',
              border: 'none',
              borderRadius: '6px',
              color: '#0f1115',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Add
          </button>
          {industries.length > 0 && (
            <button
              onClick={() => {
                setPendingConfirm({
                  title: 'Clear industries',
                  message: 'Are you sure you want to clear all industry categories?',
                  confirmLabel: 'Clear All',
                  confirmColor: '#ef4444',
                  onConfirm: async () => {
                    setPendingConfirm(null);
                    const next: string[] = [];
                    setIndustries(next);
                    await saveIndustries(next);
                  }
                });
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#ef4444',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {industries.map((industry) => (
            <div
              key={industry}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#0f1115',
                borderRadius: '6px',
                border: '1px solid #2d3139'
              }}
            >
              <span style={{ color: '#e5e7eb', fontSize: '0.875rem' }}>{industry}</span>
              <button
                onClick={() => removeIndustry(industry)}
                style={{
                  padding: '0.25rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                ×
              </button>
            </div>
          ))}
          {industries.length === 0 && (
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No categories yet. Add some industry categories to get started.</p>
          )}
        </div>
      </section>

      {/* Auto-Update Settings */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Auto-Update Settings</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: '#e5e7eb' }}>
            <input
              type="checkbox"
              checked={allowPrerelease}
              onChange={(e) => setAllowPrerelease(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                accentColor: '#fbbf24'
              }}
            />
            <span>Include pre-releases when checking for updates</span>
          </label>
          <button
            onClick={handleCheckForUpdates}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Check for Updates
          </button>
        </div>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          When enabled, the app will check for pre-release versions (beta, alpha, etc.) in addition to stable releases.
        </p>
        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem' }}>Version v2.1.0</p>
      </section>

      {/* Notifications & Email — link to dedicated page */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: '#e5e7eb' }}>Notifications &amp; Email</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
              Configure email reminders (Gmail or custom SMTP/AWS), desktop notification preferences, and summary thresholds.
            </p>
          </div>
          <Link
            to="/notifications-settings"
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 'bold',
              textDecoration: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            Open
          </Link>
        </div>
      </section>

      {/* Actions (Manual trigger if needed) */}
      <div style={{ display: 'none', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={saveSettings}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#fbbf24',
            border: 'none',
            borderRadius: '6px',
            color: '#0f1115',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Save Settings
        </button>
      </div>

      {/* Data Management */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Data Management</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={exportData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            <Download size={20} />
            Export JSON
          </button>
          <button
            onClick={exportExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#10b981',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            <Download size={20} />
            Export Excel
          </button>
          <button
            onClick={resetDatabase}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ef4444',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={20} />
            Reset Database
          </button>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            right: '1.25rem',
            bottom: '1.25rem',
            zIndex: 2000,
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            border: '1px solid #2d3139',
            backgroundColor: '#0f1115',
            color: '#e5e7eb',
            boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
            minWidth: '260px',
            maxWidth: '420px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: 999,
              backgroundColor:
                toast.type === 'success' ? '#34d399' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
              flexShrink: 0
            }}
          />
          <div style={{ fontSize: '0.9rem', lineHeight: 1.2, flex: 1 }}>{toast.message}</div>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            style={{
              padding: '0.25rem 0.4rem',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '1.1rem',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title || ''}
        message={pendingConfirm?.message || ''}
        confirmLabel={pendingConfirm?.confirmLabel}
        confirmColor={pendingConfirm?.confirmColor}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onCancel={() => setPendingConfirm(null)}
      />

    </div>
  );
}
