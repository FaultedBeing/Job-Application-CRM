import { useEffect, useState } from 'react';
import api from '../api';
import { Download, Trash2, Cloud, Smartphone, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { isElectron } from '../utils/env';

export default function Settings() {
  const [username, setUsername] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [newIndustry, setNewIndustry] = useState('');
  const [allowPrerelease, setAllowPrerelease] = useState(false);
  const [enableLocalUpdates, setEnableLocalUpdates] = useState(false);
  const [showDebugSettings, setShowDebugSettings] = useState(false);
  const [showJobMap, setShowJobMap] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; confirmLabel?: string; confirmColor?: string; onConfirm: () => void } | null>(null);
  const [showMobileUrl, setShowMobileUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tailscaleIp, setTailscaleIp] = useState('');

  useEffect(() => {
    loadSettings().then(() => setInitialLoaded(true));
    setShowDebugSettings(localStorage.getItem('debug_mode_enabled') === 'true');
    fetchSyncStatus();
    // Fetch dynamic app version from main process
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setAppVersion).catch(console.error);
    } else {
      setAppVersion('Web (dev)');
    }
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (!initialLoaded) return;
    const timer = setTimeout(() => {
      saveSettings();
    }, 1000);
    return () => clearTimeout(timer);
  }, [username, statuses, allowPrerelease, enableLocalUpdates, showJobMap, autoLaunch, initialLoaded]);

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ message, type });
    // For errors, keep the toast visible until the user closes it.
    if (type !== 'error') {
      window.setTimeout(() => {
        setToast((t) => (t?.message === message ? null : t));
      }, 2500);
    }
  }

  async function fetchSyncStatus() {
    try {
      const res = await api.get('/sync/status');
      setSyncStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  }

  async function loadSettings() {
    try {
      const res = await api.get('/settings');
      setUsername(res.data.username || 'User');
      const statusStr = res.data.statuses || 'Wishlist,Applied,Interviewing,Offer,Rejected';
      setStatuses(statusStr.split(','));
      const rawIndustryStr: string | null | undefined = res.data.industries;

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

      if (rawIndustryStr === undefined || rawIndustryStr === null) {
        setIndustries(defaultIndustries);
        await api.post('/settings', {
          industries: defaultIndustries.join('|')
        });
      } else if (!rawIndustryStr.trim()) {
        setIndustries([]);
      } else {
        const industryStr = rawIndustryStr;
        const hasCommas = industryStr.includes(',') && !industryStr.includes('|');
        const industryList = hasCommas ? [] : (industryStr.includes('|') ? industryStr.split('|').filter((i: string) => i.trim()) : [industryStr].filter((i: string) => i.trim()));

        if (industryList.length === 0 || hasCommas) {
          setIndustries(defaultIndustries);
          await api.post('/settings', {
            industries: defaultIndustries.join('|')
          });
        } else {
          setIndustries(industryList);
        }
      }

      setAllowPrerelease(res.data.allow_prerelease === 'true');
      setEnableLocalUpdates(res.data.enable_local_updates === 'true');
      const showJobMapStr = res.data.show_job_map;
      setShowJobMap(showJobMapStr === undefined || showJobMapStr === null ? true : showJobMapStr === 'true');

      // Load Auto-launch setting
      const autoLaunchStr = res.data.auto_launch;
      setAutoLaunch(autoLaunchStr === undefined ? true : autoLaunchStr === 'true');

    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onUpdateAvailable((info: any) => {
        setUpdateInfo(info);
        setUpdateError(null);
      });

      window.electronAPI.onUpdateDownloaded((info: any) => {
        setUpdateInfo(info);
        setDownloaded(true);
        setDownloadProgress(null);
      });

      window.electronAPI.onDownloadProgress((progress: any) => {
        setDownloadProgress(progress.percent);
      });

      window.electronAPI.onUpdateError((err: string) => {
        setUpdateError(err);
        setDownloadProgress(null);
      });
    }
  }, []);

  async function saveSettings() {
    try {
      await api.post('/settings', {
        username,
        statuses: statuses.join(','),
        industries: industries.join('|'),
        allow_prerelease: allowPrerelease ? 'true' : 'false',
        enable_local_updates: enableLocalUpdates ? 'true' : 'false',
        show_job_map: showJobMap ? 'true' : 'false',
        auto_launch: autoLaunch ? 'true' : 'false'
      });

      if (window.electronAPI?.setAutoLaunch) {
        window.electronAPI.setAutoLaunch(autoLaunch);
      }
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
    <div style={{ paddingBottom: '2rem' }}>
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
              if (localStorage.getItem('debug_mode_enabled') !== 'true') {
                setShowDebugSettings(true);
                localStorage.setItem('debug_mode_enabled', 'true');
                showToast('Debug mode activated! Check settings below.', 'info');
                window.dispatchEvent(new Event('debug_mode_changed'));
              }
            } else {
              if (localStorage.getItem('debug_mode_enabled') === 'true') {
                setShowDebugSettings(false);
                localStorage.removeItem('debug_mode_enabled');
                localStorage.removeItem('debug_console_visible');
                showToast('Debug mode disabled.', 'info');
                window.dispatchEvent(new Event('debug_mode_changed'));
              }
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

      {/* Startup & Launch */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Startup & Launch</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e7eb', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoLaunch}
            onChange={(e) => setAutoLaunch(e.target.checked)}
            style={{ accentColor: '#fbbf24', width: 18, height: 18, borderRadius: 4 }}
          />
          <span>Launch application automatically on computer startup</span>
        </label>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          When enabled, the Job Tracker will start automatically and minimize to the system tray when you log in.
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
            disabled={downloadProgress !== null}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: downloadProgress !== null ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              opacity: downloadProgress !== null ? 0.6 : 1
            }}
          >
            Check for Updates
          </button>
        </div>

        {/* Update Status / Actions */}
        {(updateInfo || updateError) && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: '#0f1115',
            borderRadius: '6px',
            border: `1px solid ${updateError ? '#ef4444' : (downloaded ? '#10b981' : '#2d3139')}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: updateError ? '#f87171' : (downloaded ? '#10b981' : '#fbbf24'), marginBottom: '0.25rem' }}>
                  {updateError ? 'Update Error' : (downloaded ? 'Update Ready' : 'Update Available')}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#e5e7eb' }}>
                  {updateError ? updateError : (downloaded ? `v${updateInfo.version} is downloaded and ready.` : `A new version v${updateInfo.version} is available.`)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {!downloaded && !downloadProgress && !updateError && !updateInfo?.isLocal && (
                  <button
                    onClick={() => window.electronAPI.downloadUpdate()}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#fbbf24',
                      color: '#0f1115',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Download Update
                  </button>
                )}
                {updateInfo?.isLocal && !updateError && (
                  <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>
                    Local build detected. Run the installer manually.
                  </div>
                )}
                {downloaded && !updateInfo?.isLocal && (
                  <button
                    onClick={() => window.electronAPI.quitAndInstallUpdate()}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Restart & Install
                  </button>
                )}
              </div>
            </div>

            {downloadProgress !== null && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                  <span>Downloading...</span>
                  <span>{Math.round(downloadProgress)}%</span>
                </div>
                <div style={{ width: '100%', height: '4px', backgroundColor: '#111827', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${downloadProgress}%`, height: '100%', backgroundColor: '#fbbf24', transition: 'width 0.2s linear' }} />
                </div>
              </div>
            )}
          </div>
        )}

        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          When enabled, the app will check for pre-release versions (beta, alpha, etc.) in addition to stable releases.
        </p>
        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem' }}>
          Version {appVersion ? (appVersion.startsWith('v') || appVersion.startsWith('W') ? appVersion : `v${appVersion}`) : ''}
        </p>
        {showDebugSettings && (
          <button
            onClick={() => {
              localStorage.setItem('debug_console_visible', 'true');
              window.dispatchEvent(new Event('storage'));
              alert("Debug console restored. It will appear at the bottom of the screen.");
            }}
            style={{
              backgroundColor: '#374151',
              color: '#fff',
              border: '1px solid #4b5563',
              padding: '0.25rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              marginTop: '0.5rem',
              cursor: 'pointer'
            }}
          >
            Display Debug Console 🛠️
          </button>
        )}
      </section>

      {/* Debug Settings */}
      {showDebugSettings && (
        <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem', border: '1px dashed #fbbf24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#fbbf24', margin: 0 }}>Debug Settings 🛠️</h2>
            <button
              onClick={() => {
                setShowDebugSettings(false);
                localStorage.removeItem('debug_mode_enabled');
              }}
              style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Hide Debug Settings
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: '#e5e7eb' }}>
            <input
              type="checkbox"
              checked={enableLocalUpdates}
              onChange={(e) => setEnableLocalUpdates(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#fbbf24'
              }}
            />
            <span>Enable Local Update Check</span>
          </label>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            When enabled, the app will check for update files (latest.yml) in the application folder before checking GitHub.
          </p>
        </section>
      )}

      {/* Notifications & Email */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: '#e5e7eb' }}>Notifications &amp; Email</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
              Configure email reminders, desktop notifications, and bot settings.
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

      {/* Cloud Configuration */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem', border: '1px solid #fbbf2433' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.5rem', backgroundColor: '#fbbf241a', borderRadius: '8px', color: '#fbbf24' }}>
            <Cloud size={24} />
          </div>
          <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb', margin: 0 }}>Cloud Settings &amp; Configuration</h2>
        </div>
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#0f1115', borderRadius: '6px', border: '1px solid #2d3139' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Current Session Connection:</span>
            {syncStatus?.hasConfig ? (
              <span style={{ color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
                Online ({syncStatus.isSyncing ? 'Syncing...' : 'Synced'})
              </span>
            ) : (
              <span style={{ color: '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
                Offline / Not Configured
              </span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>User Identity:</span>
            <span style={{ color: '#e5e7eb', fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{localStorage.getItem('cloud_user_id') || 'None'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          {isElectron() && (
            <button
              onClick={async () => {
                try {
                  showToast('Preparing download...', 'info');
                  const res = await api.get('/download/lambda', { responseType: 'blob' });
                  const blob = new Blob([res.data], { type: 'application/zip' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'job-crm-lambda-blueprint.zip';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                  showToast('Blueprint downloaded successfully!', 'success');
                } catch (err: any) {
                  showToast('Failed to download blueprint', 'error');
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.75rem 1.25rem', backgroundColor: '#2d3139',
                color: '#e5e7eb', border: '1px solid #3b82f6', borderRadius: '6px',
                fontWeight: '600', cursor: 'pointer'
              }}
            >
              <Download size={18} />
              Lambda Blueprint
            </button>
          )}

          <button
            onClick={() => setShowMobileUrl(!showMobileUrl)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1.5rem', backgroundColor: '#fbbf241a',
              color: '#fbbf24', border: '1px solid #fbbf24',
              borderRadius: '6px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            <Smartphone size={18} />
            Mobile Sync
          </button>
        </div>

        {showMobileUrl && (
          <div style={{ padding: '1.5rem', backgroundColor: '#0f1115', borderRadius: '8px', border: '1px solid #fbbf2433' }}>
            <h3 style={{ fontSize: '1rem', color: '#fbbf24', marginBottom: '0.75rem' }}>Sync with your Phone</h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
              Enter your PC's Tailscale IP to generate a unique link. Open it on your phone to instantly log in.
            </p>
            <input
              type="text"
              placeholder="Ex: 100.123.45.67"
              value={tailscaleIp}
              onChange={(e) => setTailscaleIp(e.target.value)}
              style={{
                width: '100%', padding: '0.75rem', marginBottom: '1rem',
                backgroundColor: '#1a1d24', border: '1px solid #2d3139',
                borderRadius: '6px', color: '#e5e7eb'
              }}
            />
            {tailscaleIp && (
              <div style={{
                padding: '0.75rem 1rem', backgroundColor: '#1a1d24', borderRadius: '6px',
                border: '1px solid #2d3139', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: '1rem'
              }}>
                <code style={{ fontSize: '0.7rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {`http://${tailscaleIp}:3033/?set_user_id=${localStorage.getItem('cloud_user_id')}`}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`http://${tailscaleIp}:3033/?set_user_id=${localStorage.getItem('cloud_user_id')}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{ background: 'none', border: 'none', color: copied ? '#10b981' : '#fbbf24', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            )}
            <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
              Tip: Send this link to your phone and open it while Tailscale is running.
            </p>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={() => {
              setPendingConfirm({
                title: 'Sign Out / Reset Cloud',
                message: 'Are you sure you want to sign out? This will disconnect your device from the cloud and return you to the setup wizard. Your cloud data will not be deleted.',
                confirmLabel: 'Sign Out',
                confirmColor: '#ef4444',
                onConfirm: async () => {
                  try {
                    await api.post('/sync/reset');
                  } catch (e) {
                    console.warn('Backend reset failed or is unreachable:', e);
                  }
                  setPendingConfirm(null);
                  localStorage.removeItem('cloud_user_id');
                  showToast('Cloud session reset. Refreshing...', 'success');
                  window.setTimeout(() => window.location.reload(), 1000);
                }
              });
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1.25rem', backgroundColor: 'transparent',
              border: '1px solid #ef4444', borderRadius: '6px',
              color: '#ef4444', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Sign Out / Reset Session
          </button>
        </div>
      </section>



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
