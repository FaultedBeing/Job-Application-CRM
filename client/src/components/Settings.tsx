import { useEffect, useState } from 'react';
import api from '../api';
import { Download, Trash2 } from 'lucide-react';

export default function Settings() {
  const [username, setUsername] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [newIndustry, setNewIndustry] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api.get('/settings');
      setUsername(res.data.username || 'User');
      const statusStr = res.data.statuses || 'Wishlist,Applied,Interviewing,Offer,Rejected';
      setStatuses(statusStr.split(','));
      const industryStr = res.data.industries || '';
      
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
      
      // Check if using old comma format or if industries look broken (too many entries suggests splitting)
      const hasCommas = industryStr.includes(',') && !industryStr.includes('|');
      const industryList = hasCommas ? [] : (industryStr.includes('|') ? industryStr.split('|').filter((i: string) => i.trim()) : []);
      const looksBroken = industryList.length > 20; // If more than 20 entries, likely broken from comma splitting
      
      if (industryList.length === 0 || hasCommas || looksBroken || !industryStr.includes('|')) {
        // Reset to defaults if empty, using old comma format, or looks broken
        setIndustries(defaultIndustries);
        // Save defaults to database with proper pipe delimiter
        await api.post('/settings', {
          industries: defaultIndustries.join('|')
        });
      } else {
        setIndustries(industryList);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function saveSettings() {
    try {
      await api.post('/settings', {
        username,
        statuses: statuses.join(','),
        industries: industries.join('|')
      });
      alert('Settings saved!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    }
  }

  function addStatus() {
    if (newStatus.trim() && !statuses.includes(newStatus.trim())) {
      setStatuses([...statuses, newStatus.trim()]);
      setNewStatus('');
    }
  }

  function removeStatus(status: string) {
    setStatuses(statuses.filter(s => s !== status));
  }

  function addIndustry() {
    if (newIndustry.trim() && !industries.includes(newIndustry.trim())) {
      setIndustries([...industries, newIndustry.trim()]);
      setNewIndustry('');
    }
  }

  function removeIndustry(industry: string) {
    setIndustries(industries.filter(i => i !== industry));
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
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Error exporting data');
    }
  }

  async function resetDatabase() {
    if (!confirm('Are you sure you want to reset the database? This will delete ALL data and cannot be undone!')) {
      return;
    }
    if (!confirm('This is your last chance. Are you absolutely sure?')) {
      return;
    }
    try {
      await api.post('/reset-database');
      alert('Database reset successfully. Please refresh the page.');
      window.location.reload();
    } catch (error) {
      console.error('Error resetting database:', error);
      alert('Error resetting database');
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
          onChange={(e) => setUsername(e.target.value)}
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

      {/* Space Industry Categories */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Space Industry Categories</h2>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem' }}>
          These options are used for the <strong>Industry</strong> dropdown when adding or editing companies. Focus them on aerospace and space‑sector subsectors that match your search focus.
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={newIndustry}
            onChange={(e) => setNewIndustry(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addIndustry()}
            placeholder="Add new space industry category"
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
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No categories yet. Add some space industry subsectors to get started.</p>
          )}
        </div>
      </section>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
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
            Export Data
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
    </div>
  );
}
