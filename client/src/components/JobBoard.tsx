import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Plus, Search, Bell } from 'lucide-react';

interface Job {
  id: number;
  title: string;
  company_name: string;
  company_logo_url?: string;
  company_dark_logo_bg?: boolean;
  location?: string;
  status: string;
  excitement_score: number;
  fit_score: number;
  created_at: string;
  nearest_reminder?: string;
}

export default function JobBoard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'excitement' | 'fit'>('date');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    filterAndSort();
  }, [jobs, searchTerm, sortBy]);

  async function loadJobs() {
    try {
      const res = await api.get('/jobs');
      setJobs(res.data);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  function filterAndSort() {
    let filtered = [...jobs];

    // Filter
    if (searchTerm) {
      filtered = filtered.filter(job =>
        job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'excitement') {
        return b.excitement_score - a.excitement_score;
      } else {
        return b.fit_score - a.fit_score;
      }
    });

    setFilteredJobs(filtered);
  }

  async function handleAddJob(data: any) {
    try {
      await api.post('/jobs', data);
      setShowAddModal(false);
      loadJobs();
    } catch (error) {
      console.error('Error adding job:', error);
      alert('Error adding job');
    }
  }

  const statusColors: Record<string, string> = {
    'Wishlist': '#9ca3af',
    'Applied': '#3b82f6',
    'Interviewing': '#fbbf24',
    'Offer': '#34d399',
    'Rejected': '#ef4444'
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#fbbf24' }}>Job Applications</h1>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#fbbf24',
            color: '#0f1115',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          <Plus size={20} />
          Add Job
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search by title or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.5rem',
              backgroundColor: '#1a1d24',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb',
              fontSize: '1rem'
            }}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#1a1d24',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          <option value="date">Sort by Date</option>
          <option value="excitement">Sort by Excitement</option>
          <option value="fit">Sort by Fit</option>
        </select>
      </div>

      {/* Job Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {filteredJobs.map((job) => (
          <Link
            key={job.id}
            to={`/job/${job.id}`}
            style={{
              display: 'block',
              padding: '1.5rem',
              backgroundColor: '#1a1d24',
              borderRadius: '8px',
              border: '1px solid #2d3139',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'transform 0.2s',
              cursor: 'pointer'
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
              {job.company_logo_url && (
                <div style={{ flexShrink: 0, marginTop: '2px' }}>
                  <img
                    src={job.company_logo_url}
                    alt={`${job.company_name} logo`}
                    style={{
                      width: '32px',
                      height: '32px',
                      objectFit: 'contain',
                      backgroundColor: job.company_dark_logo_bg ? '#e5e7eb' : '#0f1115',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'block'
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: '#e5e7eb', lineHeight: '1.4' }}>
                    {job.title}
                  </h3>
                  {job.nearest_reminder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', backgroundColor: '#fbbf2420', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', flexShrink: 0 }} title="Upcoming Reminder">
                      <Bell size={12} />
                      {new Date(job.nearest_reminder).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  {job.company_name}
                  {job.location ? <span style={{ color: '#6b7280' }}> • {job.location}</span> : null}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.875rem',
                  backgroundColor: statusColors[job.status] + '20',
                  color: statusColors[job.status]
                }}
              >
                {job.status}
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <span style={{ color: '#fbbf24' }}>★ {job.excitement_score}</span>
                <span style={{ color: '#34d399' }}>● {job.fit_score}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredJobs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          {searchTerm ? 'No jobs match your search.' : 'No jobs yet. Add your first application!'}
        </div>
      )}

      {showAddModal && (
        <AddJobModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddJob}
        />
      )}
    </div>
  );
}

function AddJobModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    company_name: '',
    title: '',
    location: '',
    status: 'Wishlist',
    link: '',
    description: '',
    notes: '',
    excitement_score: 3,
    fit_score: 3
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formData);
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
          maxWidth: '500px',
          border: '1px solid #2d3139'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>
          Add New Job
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
              Company Name *
            </label>
            <input
              type="text"
              required
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
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
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
              Job Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="City, State/Country (or Remote)"
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
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            >
              <option value="Wishlist">Wishlist</option>
              <option value="Applied">Applied</option>
              <option value="Interviewing">Interviewing</option>
              <option value="Offer">Offer</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
              Job Link
            </label>
            <input
              type="url"
              value={formData.link}
              onChange={(e) => setFormData({ ...formData, link: e.target.value })}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
                Excitement Score
              </label>
              <input
                type="number"
                min="0"
                max="5"
                value={formData.excitement_score}
                onChange={(e) => setFormData({ ...formData, excitement_score: parseInt(e.target.value) })}
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
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
                Fit Score
              </label>
              <input
                type="number"
                min="0"
                max="5"
                value={formData.fit_score}
                onChange={(e) => setFormData({ ...formData, fit_score: parseInt(e.target.value) })}
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
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
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
              Add Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
