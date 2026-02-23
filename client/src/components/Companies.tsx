import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

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
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'jobs' | 'industry'>('recent');
  const [showAddModal, setShowAddModal] = useState(false);

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

  const sortedCompanies = [...companies].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'jobs') {
      return (b.job_count || 0) - (a.job_count || 0);
    }
    if (sortBy === 'industry') {
      return (a.industry || '').localeCompare(b.industry || '');
    }
    // recent (last_interaction desc)
    const aTime = a.last_interaction ? new Date(a.last_interaction).getTime() : 0;
    const bTime = b.last_interaction ? new Date(b.last_interaction).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#fbbf24' }}>Companies</h1>
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#1a1d24',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '0.9rem',
            cursor: 'pointer'
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              {company.logo_url && (
                <img
                  src={company.logo_url}
                  alt={`${company.name} logo`}
                  style={{
                    width: '40px',
                    height: '40px',
                    objectFit: 'contain',
                    backgroundColor: '#0f1115',
                    padding: '4px',
                    borderRadius: '4px'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <h3 style={{ fontSize: '1.25rem', color: '#e5e7eb', margin: 0 }}>
                {company.name}
              </h3>
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
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}
              >
                {company.website}
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
              alert('Error adding company');
            }
          }}
        />
      )}
    </div>
  );
}

function AddCompanyModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    industry: '',
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
