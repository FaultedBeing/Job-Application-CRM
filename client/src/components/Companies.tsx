import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStorage } from '../utils/useSessionStorage';
import { Link } from 'react-router-dom';
import api from '../api';
import { Search, Bell, Upload, Download, Filter, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
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
  financial_stability_warning?: boolean;
  excitement_rating?: number;
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sortBy, setSortBy] = useSessionStorage<'recent' | 'name' | 'jobs' | 'industry' | 'excitement'>('companies_sortBy', 'recent');
  const [showAddModal, setShowAddModal] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [importing, setImporting] = useState(false);
  const [sortOrder, setSortOrder] = useSessionStorage<'asc' | 'desc'>('companies_sortOrder', 'desc');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    noPostedJobs: false,
    noAppropriateJobs: false,
    questionableFunds: false,
    industry: '',
    size: ''
  });
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

    // Apply advanced filters
    if (filters.noPostedJobs) {
      result = result.filter(c => c.no_posted_jobs);
    }
    if (filters.noAppropriateJobs) {
      result = result.filter(c => c.no_appropriate_jobs);
    }
    if (filters.questionableFunds) {
      result = result.filter(c => c.financial_stability_warning);
    }
    if (filters.industry) {
      result = result.filter(c => c.industry === filters.industry);
    }
    if (filters.size) {
      result = result.filter(c => c.company_size === filters.size);
    }

    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'jobs') {
        comparison = (a.job_count || 0) - (b.job_count || 0);
      } else if (sortBy === 'industry') {
        comparison = (a.industry || '').localeCompare(b.industry || '');
      } else if (sortBy === 'excitement') {
        comparison = (a.excitement_rating || 0) - (b.excitement_rating || 0);
      } else {
        const aTime = a.last_interaction ? new Date(a.last_interaction).getTime() : 0;
        const bTime = b.last_interaction ? new Date(b.last_interaction).getTime() : 0;
        comparison = aTime - bTime;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [companies, sortBy, sortOrder, searchTerm, filters]);

  return (
    <div>
      <div className="responsive-header">
        <h1 style={{ fontSize: '2rem', color: '#fbbf24', display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          Companies
          <span style={{ fontSize: '1rem', color: '#9ca3af', fontWeight: 'normal' }}>
            ({companies.length})
          </span>
        </h1>
        <div className="action-buttons">
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

      {/* Filters & Search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 300px' }}>
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
          <div style={{ display: 'flex', gap: '0.75rem', flex: '1 1 300px' }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1rem',
                backgroundColor: showFilters ? '#fbbf2420' : '#1a1d24',
                border: '1px solid',
                borderColor: showFilters ? '#fbbf24' : '#2d3139',
                borderRadius: '6px',
                color: showFilters ? '#fbbf24' : '#9ca3af',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              <Filter size={18} />
              Filters
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  flex: 1,
                  padding: '0.6rem 2.5rem 0.6rem 1rem',
                  backgroundColor: '#1a1d24',
                  border: '1px solid #2d3139',
                  borderRadius: '6px',
                  color: '#e5e7eb',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  minWidth: '0',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundSize: '1rem'
                }}
              >
                <option value="recent">Sort by Recent Activity</option>
                <option value="name">Sort by Name</option>
                <option value="jobs">Sort by Job Count</option>
                <option value="industry">Sort by Industry</option>
                <option value="excitement">Sort by Excitement</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  backgroundColor: '#1a1d24',
                  border: '1px solid #2d3139',
                  borderRadius: '6px',
                  color: '#fbbf24',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {sortOrder === 'asc' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <div style={{
            padding: '1.25rem',
            backgroundColor: '#1a1d24',
            border: '1px solid #2d3139',
            borderRadius: '8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Flags</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e7eb', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters.noPostedJobs}
                  onChange={(e) => setFilters({ ...filters, noPostedJobs: e.target.checked })}
                />
                No Posted Jobs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e7eb', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters.noAppropriateJobs}
                  onChange={(e) => setFilters({ ...filters, noAppropriateJobs: e.target.checked })}
                />
                No Appropriate Jobs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e7eb', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters.questionableFunds}
                  onChange={(e) => setFilters({ ...filters, questionableFunds: e.target.checked })}
                />
                Questionable Funds
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Industry</label>
              <select
                value={filters.industry}
                onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#0f1115',
                  border: '1px solid #2d3139',
                  borderRadius: '4px',
                  color: '#e5e7eb'
                }}
              >
                <option value="">All Industries</option>
                {Array.from(new Set(companies.map(c => c.industry).filter(Boolean))).map(ind => (
                  <option key={ind} value={ind!}>{ind}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Company Size</label>
              <select
                value={filters.size}
                onChange={(e) => setFilters({ ...filters, size: e.target.value })}
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#0f1115',
                  border: '1px solid #2d3139',
                  borderRadius: '4px',
                  color: '#e5e7eb'
                }}
              >
                <option value="">All Sizes</option>
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

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setFilters({ noPostedJobs: false, noAppropriateJobs: false, questionableFunds: false, industry: '', size: '' })}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'transparent',
                  border: '1px solid #4b5563',
                  borderRadius: '4px',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="responsive-grid">
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: 0 }}>
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
                      justifyContent: 'center',
                      flexShrink: 0
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{company.name}</h3>
                    {company.excitement_rating !== undefined && company.excitement_rating > 0 && (
                      <div style={{ display: 'flex', gap: '0.25rem', color: '#fbbf24', fontSize: '0.85rem', flexShrink: 0, marginLeft: '0.5rem' }} title="Excitement Rating">
                        ★ {company.excitement_rating}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0 }}>
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
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
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
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        No Appropriate Jobs
                      </span>
                    )}
                    {!!company.financial_stability_warning && (
                      <span style={{
                        display: 'inline-flex',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(239, 68, 68, 0.25)',
                        color: '#f87171',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        border: '1px solid #f87171',
                        whiteSpace: 'nowrap',
                        alignItems: 'center',
                        gap: '0.25rem',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        <AlertTriangle size={10} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Questionable Funds</span>
                      </span>
                    )}
                  </div>
                  {company.nearest_reminder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', backgroundColor: '#fbbf2420', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', flexShrink: 0, marginTop: '0.25rem', alignSelf: 'flex-start', maxWidth: '100%', overflow: 'hidden' }} title="Upcoming Reminder">
                      <Bell size={12} style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {new Date(company.nearest_reminder).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {company.industry && (
                  <p style={{ color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.industry}</p>
                )}
                {(company.employee_count || company.company_size) && (
                  <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.875rem' }}>
                    {company.company_size || `${company.employee_count} employees`}
                  </p>
                )}
                {company.website && (
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <a
                      href={getWebsiteHref(company.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}
                    >
                      {formatWebsiteDisplay(company.website)}
                    </a>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                  {company.job_count} job{company.job_count !== 1 ? 's' : ''}
                </span>
                {company.latest_status && (
                  <span style={{ color: '#9ca3af', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                    Latest: {company.latest_status}
                  </span>
                )}
              </div>
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
    company_size: '',
    financial_stability_warning: false,
    excitement_rating: 0
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
      financial_stability_warning: formData.financial_stability_warning ? 1 : 0,
      excitement_rating: formData.excitement_rating || 0,
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
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Excitement Rating</label>
            <select
              value={formData.excitement_rating}
              onChange={(e) => setFormData({ ...formData, excitement_rating: parseInt(e.target.value) || 0 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            >
              <option value="0">Unrated</option>
              <option value="1">1 - Low</option>
              <option value="2">2 - Fair</option>
              <option value="3">3 - Good</option>
              <option value="4">4 - High</option>
              <option value="5">5 - Must Have</option>
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
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f87171', fontWeight: 'bold', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: '18px', height: '18px' }}
                checked={formData.financial_stability_warning}
                onChange={(e) => setFormData({ ...formData, financial_stability_warning: e.target.checked })}
              />
              Questionable Funds
            </label>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '2.4rem', marginTop: '0.25rem' }}>
              Flag this company as having a potentially unstable financial situation.
            </p>
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
