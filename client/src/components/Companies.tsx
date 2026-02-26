import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Search, Bell, Upload, Download } from 'lucide-react';
import AlertDialog from './AlertDialog';
import { debugLog } from '../utils/debugLogger';

interface Company {
  id: number;
  name: string;
  website: string;
  industry: string;
  job_count: number;
  latest_status: string;
  logo_url?: string;
  employee_count?: number;
  company_size?: string;
  last_interaction?: string;
  dark_logo_bg?: boolean;
  no_posted_jobs?: boolean;
  no_appropriate_jobs?: boolean;
  location?: string;
  nearest_reminder?: string;
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'jobs' | 'industry'>('recent');
  const [showAddModal, setShowAddModal] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    try {
      const res = await api.get('/companies');
      setCompanies(res.data);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  }

  function formatWebsiteDisplay(url?: string | null) {
    if (!url) return '';
    let display = url.trim();
    // Only remove https://, keep www.
    display = display.replace(/^https?:\/\//i, '');
    return display;
  }

  function getWebsiteHref(url?: string | null) {
    if (!url) return '#';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/import/companies', formData);
      const { imported, skipped, newIndustries } = res.data;
      let msg = `Imported ${imported} compan${imported === 1 ? 'y' : 'ies'}.`;
      if (skipped > 0) msg += `\n${skipped} skipped (duplicates or empty).`;
      if (newIndustries?.length > 0) msg += `\n${newIndustries.length} new industr${newIndustries.length === 1 ? 'y' : 'ies'} added.`;
      setAlertMsg({ title: 'Import complete', message: msg });
      loadCompanies();
    } catch (error: any) {
      const serverMsg = error?.response?.data?.error || error?.message || 'Unknown error';
      setAlertMsg({ title: 'Import failed', message: serverMsg });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleExportExcel() {
    try {
      const res = await api.get('/export/excel', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-tracker-companies-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      setAlertMsg({ title: 'Error', message: 'Error exporting to Excel' });
    }
  }

  const sortedCompanies = useMemo(() => {
    let result = [...companies];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'jobs') {
        return (b.job_count || 0) - (a.job_count || 0);
      }
      if (sortBy === 'industry') {
        return (a.industry || '').localeCompare(b.industry || '');
      }
      const aTime = a.last_interaction ? new Date(a.last_interaction).getTime() : 0;
      const bTime = b.last_interaction ? new Date(b.last_interaction).getTime() : 0;
      return bTime - aTime;
    });

    return result;
  }, [companies, sortBy, searchTerm]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#fbbf24' }}>Companies</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: 'transparent',
              color: '#34d399',
              border: '1px solid #34d399',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: importing ? 'not-allowed' : 'pointer',
              opacity: importing ? 0.6 : 1
            }}
          >
            <Upload size={16} />
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button
            onClick={handleExportExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: 'transparent',
              color: '#10b981',
              border: '1px solid #10b981',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            <Download size={16} />
            Export Excel
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#fbbf24',
              color: '#0f1115',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Add Company
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '10px', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search companies by name or industry..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 1rem 0.6rem 2.5rem',
              backgroundColor: '#1a1d24',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb',
              fontSize: '0.95rem'
            }}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: '0.6rem 1rem',
            backgroundColor: '#1a1d24',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '0.95rem',
            cursor: 'pointer',
            minWidth: '210px'
          }}
        >
          <option value="recent">Sort by Recent Activity</option>
          <option value="name">Sort by Name (A–Z)</option>
          <option value="jobs">Sort by Job Count</option>
          <option value="industry">Sort by Industry</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {sortedCompanies.map((company) => (
          <Link
            key={company.id}
            to={`/company/${company.id}`}
            style={{
              display: 'block',
              padding: '1.5rem',
              backgroundColor: '#1a1d24',
              borderRadius: '8px',
              border: '1px solid #2d3139',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = '#fbbf24';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#2d3139';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.5rem' }}>
              {company.logo_url && (
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '4px',
                    padding: '4px',
                    backgroundColor: company.dark_logo_bg ? '#e5e7eb' : '#0f1115',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <img
                    src={company.logo_url}
                    alt={`${company.name} logo`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      debugLog(`Failed to load company logo: ${(e.target as HTMLImageElement).src}`);
                    }}
                  />
                </div>
              )}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.25rem', color: '#e5e7eb', margin: 0 }}>
                    {company.name}
                  </h3>
                  {!!company.no_posted_jobs && (
                    <span style={{
                      display: 'inline-flex',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      whiteSpace: 'nowrap'
                    }}>
                      No Posted Jobs
                    </span>
                  )}
                  {!!company.no_appropriate_jobs && (
                    <span style={{
                      display: 'inline-flex',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(249, 115, 22, 0.15)',
                      color: '#fb923c',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      border: '1px solid rgba(249, 115, 22, 0.3)',
                      whiteSpace: 'nowrap'
                    }}>
                      No Appropriate Jobs
                    </span>
                  )}
                </div>
                {company.nearest_reminder && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', backgroundColor: '#fbbf2420', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', flexShrink: 0 }} title="Upcoming Reminder">
                    <Bell size={12} />
                    {new Date(company.nearest_reminder).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
            {company.industry && (
              <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>{company.industry}</p>
            )}
            {(company.employee_count || company.company_size) && (
              <p style={{ color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                {company.company_size || `${company.employee_count} employees`}
              </p>
            )}
            {company.website && (
              <a
                href={getWebsiteHref(company.website)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}
              >
                {formatWebsiteDisplay(company.website)}
              </a>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
              <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                {company.job_count} job{company.job_count !== 1 ? 's' : ''}
              </span>
              {company.latest_status && (
                <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Latest: {company.latest_status}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {companies.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          No companies yet. Companies are created automatically when you add jobs.
        </div>
      )}

      {showAddModal && (
        <AddCompanyModal
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            try {
              await api.post('/companies', data);
              setShowAddModal(false);
              loadCompanies();
            } catch (error) {
              console.error('Error adding company:', error);
              setAlertMsg({ title: 'Error', message: 'Error adding company' });
            }
          }}
        />
      )}
      <AlertDialog
        open={alertMsg !== null}
        title={alertMsg?.title || ''}
        message={alertMsg?.message || ''}
        onClose={() => setAlertMsg(null)}
      />
    </div>
  );
}

function AddCompanyModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    industry: '',
    location: '',
    notes: '',
    company_size: ''
  });
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);

  useEffect(() => {
    loadIndustryOptions();
  }, []);

  async function loadIndustryOptions() {
    const fallback = [
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

    try {
      const res = await api.get('/settings');
      const industryStr = res.data.industries || '';
      // Support both comma (old format) and pipe (new format) for backward compatibility
      const delimiter = industryStr.includes('|') ? '|' : ',';
      const options = industryStr ? industryStr.split(delimiter).filter((i: string) => i.trim()) : [];
      setIndustryOptions(options.length > 0 ? options : fallback);
    } catch (error) {
      console.error('Error loading industry options:', error);
      setIndustryOptions(fallback);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: formData.name,
      website: formData.website || null,
      industry: formData.industry || null,
      location: formData.location.trim() ? formData.location.trim() : null,
      notes: formData.notes || null,
      company_size: formData.company_size || null,
      employee_count: null
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1d24',
          borderRadius: '8px',
          padding: '2rem',
          width: '90%',
          maxWidth: '520px',
          border: '1px solid #2d3139'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Add Company</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Company Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Industry</label>
            <select
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            >
              <option value="">Select industry</option>
              {industryOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Based out of</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="City, State/Country"
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Company Size</label>
            <select
              value={formData.company_size}
              onChange={(e) => setFormData({ ...formData, company_size: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            >
              <option value="">Select size</option>
              <option value="1–10">1–10</option>
              <option value="11–50">11–50</option>
              <option value="51–200">51–200</option>
              <option value="201–500">201–500</option>
              <option value="501–1000">501–1000</option>
              <option value="1001–5000">1001–5000</option>
              <option value="5001–10000">5001–10000</option>
              <option value="10001+">10001+</option>
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb',
                minHeight: '80px'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
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
        </form>
      </div>
    </div>
  );
}
