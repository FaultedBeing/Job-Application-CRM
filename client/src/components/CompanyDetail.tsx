import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Plus, Edit, Trash2, Sun } from 'lucide-react';

interface Company {
  id: number;
  name: string;
  website: string;
  industry: string;
  notes: string;
  location?: string;
  logo_url?: string;
  employee_count?: number;
  company_size?: string;
  dark_logo_bg?: boolean;
  __follow_up?: { due_at: string; message?: string; notify_desktop?: boolean; notify_email?: boolean } | null;
}

type TimezoneOption = { id: string; label: string };

function getDefaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const BASE_TIMEZONES: TimezoneOption[] = [
  { id: 'America/Los_Angeles', label: 'PT – Los Angeles' },
  { id: 'America/Denver', label: 'MT – Denver' },
  { id: 'America/Chicago', label: 'CT – Houston' },
  { id: 'America/New_York', label: 'ET – New York' },
  { id: 'Europe/London', label: 'UK – London (GMT/BST)' },
  { id: 'Europe/Berlin', label: 'EU – Berlin (CET/CEST)' },
  { id: 'UTC', label: 'UTC' }
];

const COMMON_TIMEZONES: TimezoneOption[] = (() => {
  const current = getDefaultTimeZone();
  if (!current) return BASE_TIMEZONES;
  if (BASE_TIMEZONES.some((tz) => tz.id === current)) return BASE_TIMEZONES;
  return [{ id: current, label: `${current} (current)` }, ...BASE_TIMEZONES];
})();

function toUtcIsoFromLocal(localValue: string, timeZone: string): string | null {
  if (!localValue) return null;
  const [datePart, timePart] = localValue.split('T');
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split('-').map((n) => parseInt(n, 10));
  const [hh, mm] = timePart.split(':').map((n) => parseInt(n, 10));
  if (!y || !m || !d || isNaN(hh) || isNaN(mm)) return null;

  const desiredUtc = Date.UTC(y, m - 1, d, hh, mm);
  let guess = desiredUtc;

  for (let i = 0; i < 3; i++) {
    const dt = new Date(guess);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = fmt.formatToParts(dt);
    const vals: any = {};
    for (const p of parts) {
      if (p.type !== 'literal') {
        vals[p.type] = parseInt(p.value, 10);
      }
    }
    if (!vals.year) break;
    const actualUtc = Date.UTC(vals.year, (vals.month || 1) - 1, vals.day || 1, vals.hour || 0, vals.minute || 0);
    const diffMinutes = (actualUtc - desiredUtc) / 60000;
    if (Math.abs(diffMinutes) < 1) break;
    guess -= diffMinutes * 60000;
  }

  return new Date(guess).toISOString();
}

interface Job {
  id: number;
  title: string;
  location?: string;
  status: string;
  excitement_score: number;
  fit_score: number;
}

interface Contact {
  id: number;
  name: string;
  role: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddJob, setShowAddJob] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

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

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  useEffect(() => {
    setNotesDraft(company?.notes || '');
  }, [company]);

  async function loadData() {
    try {
      const [companyRes, jobsRes, contactsRes] = await Promise.all([
        api.get(`/companies/${id}`),
        api.get(`/companies/${id}/jobs`),
        api.get(`/companies/${id}/contacts`)
      ]);

      setCompany(companyRes.data);
      setJobs(jobsRes.data);
      setContacts(contactsRes.data);
    } catch (error) {
      console.error('Error loading company:', error);
    }
  }

  async function handleSaveNotes() {
    if (!company) return;
    if (notesDraft === (company.notes || '')) return;

    try {
      const res = await api.put(`/companies/${company.id}`, {
        ...company,
        notes: notesDraft
      });
      setCompany(res.data);
      setNotesDraft(res.data.notes || '');
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Error saving notes');
      setNotesDraft(company.notes || '');
    }
  }

  async function handleDeleteCompany() {
    if (!company) return;
    if (!confirm('Delete this company? Jobs, contacts, and interactions will remain but will be unlinked from this company.')) return;

    try {
      await api.delete(`/companies/${company.id}`);
      navigate('/companies');
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('Error deleting company');
    }
  }

  // Website is edited via the Edit Company form; no separate inline edit button here.

  async function handleUpdateCompany(updatedCompany: Company) {
    try {
      const followUp = updatedCompany.__follow_up;
      const { __follow_up: _ignored, ...companyPayload } = updatedCompany as any;

      // Update company fields
      await api.put(`/companies/${updatedCompany.id}`, companyPayload);

      // Optionally create/update follow-up reminder (only if provided)
      if (followUp?.due_at) {
        await api.post(`/companies/${updatedCompany.id}/reminder`, {
          due_at: followUp.due_at,
          message: (followUp.message || '').trim() || `Follow up with ${updatedCompany.name}`,
          notify_desktop: followUp.notify_desktop ?? true,
          notify_email: followUp.notify_email ?? false
        });
      }
      setEditing(false);
      loadData();
    } catch (error) {
      console.error('Error updating company:', error);
      alert('Error updating company');
    }
  }

  if (!company) return <div>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate('/companies')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#1a1d24',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb',
                cursor: 'pointer'
              }}
            >
              <Edit size={18} />
              Edit
            </button>
          )}
          <button
            onClick={handleDeleteCompany}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              border: '1px solid #4b5563',
              borderRadius: '6px',
              color: '#f87171',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={18} />
            Delete
          </button>
        </div>
      </div>

      {editing ? (
        <EditCompanyForm company={company} onSave={handleUpdateCompany} onCancel={() => setEditing(false)} />
      ) : (
        <>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        {company.logo_url && (
          <div style={{ display: 'inline-block' }}>
            <img
              src={company.logo_url}
              alt={`${company.name} logo`}
              style={{
                width: '60px',
                height: '60px',
                objectFit: 'contain',
                backgroundColor: company.dark_logo_bg ? '#e5e7eb' : '#0f1115',
                padding: '8px',
                borderRadius: '8px',
                transition: 'background-color 0.2s ease'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fbbf24' }}>{company.name}</h1>
          {company.industry && (
            <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>{company.industry}</p>
          )}
          {company.location && (
            <p style={{ color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              Based out of: <span style={{ color: '#e5e7eb' }}>{company.location}</span>
            </p>
          )}
          {(company.employee_count || company.company_size) && (
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              {company.company_size || `${company.employee_count} employees`}
            </p>
          )}
        </div>
      </div>
      <div style={{ marginBottom: '2rem' }}>
        {company.website ? (
          <a
            href={getWebsiteHref(company.website)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6' }}
          >
            {formatWebsiteDisplay(company.website)}
          </a>
        ) : (
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>No website set</span>
        )}
      </div>

      <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Notes</h2>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder="Click here to add notes about this company..."
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#0f1115',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            minHeight: '100px',
            resize: 'vertical'
          }}
        />
        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.5rem' }}>Notes save automatically when you click away.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Jobs */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>
              Jobs ({jobs.length})
            </h2>
            <button
              onClick={() => setShowAddJob(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#fbbf24',
                border: 'none',
                borderRadius: '6px',
                color: '#0f1115',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              Add Job
            </button>
          </div>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1rem' }}>
            {jobs.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No jobs at this company yet.</p>
            ) : (
              jobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/job/${job.id}`}
                  style={{
                    display: 'block',
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    backgroundColor: '#0f1115',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid #2d3139'
                  }}
                >
                  <h3 style={{ color: '#e5e7eb', marginBottom: '0.25rem' }}>{job.title}</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                      {job.status}
                      {job.location ? <span style={{ color: '#6b7280' }}> • {job.location}</span> : null}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <span style={{ color: '#fbbf24' }}>★ {job.excitement_score}</span>
                      <span style={{ color: '#34d399' }}>● {job.fit_score}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Contacts */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>
              Contacts ({contacts.length})
            </h2>
            <button
              onClick={() => setShowAddContact(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#fbbf24',
                border: 'none',
                borderRadius: '6px',
                color: '#0f1115',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              Add Contact
            </button>
          </div>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1rem' }}>
            {contacts.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No contacts at this company yet.</p>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  style={{
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    backgroundColor: '#0f1115',
                    borderRadius: '6px',
                    border: '1px solid #2d3139',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 'bold' }}>
                      <Link
                        to={`/contacts/${contact.id}`}
                        style={{ color: '#e5e7eb', textDecoration: 'none' }}
                      >
                        {contact.name}
                      </Link>
                    </p>
                    {contact.role && <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{contact.role}</p>}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}>
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{contact.phone}</p>}
                    {contact.linkedin_url && (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}
                      >
                        LinkedIn Profile
                      </a>
                    )}
                  </div>
                  {/* Contact deletion is managed from the Contacts page only */}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {showAddJob && (
        <AddJobModal
          companyName={company.name}
          onClose={() => setShowAddJob(false)}
          onSave={async (data) => {
            try {
              await api.post('/jobs', { ...data, company_id: parseInt(id!), company_name: company.name });
              setShowAddJob(false);
              loadData();
            } catch (error) {
              console.error('Error adding job:', error);
            }
          }}
        />
      )}

      {showAddContact && (
        <AddContactModal
          onClose={() => setShowAddContact(false)}
          onSave={async (data) => {
            try {
              await api.post('/contacts', { ...data, company_id: parseInt(id!) });
              setShowAddContact(false);
              loadData();
            } catch (error) {
              console.error('Error adding contact:', error);
            }
          }}
        />
      )}
        </>
      )}
    </div>
  );
}

function EditCompanyForm({ company, onSave, onCancel }: { company: Company; onSave: (company: Company) => void; onCancel: () => void }) {
  const [formData, setFormData] = useState({
    name: company.name,
    website: company.website || '',
    industry: company.industry || '',
    notes: company.notes || '',
    location: company.location || '',
    company_size: company.company_size || '',
    dark_logo_bg: company.dark_logo_bg ?? false
  });
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);
  const [enableFollowUp, setEnableFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [notifyDesktop, setNotifyDesktop] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [followUpTimeZone, setFollowUpTimeZone] = useState<string>(getDefaultTimeZone());

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
    const dueIso =
      enableFollowUp && followUpAt
        ? toUtcIsoFromLocal(followUpAt, followUpTimeZone) || new Date(followUpAt).toISOString()
        : undefined;
    onSave({
      ...company,
      name: formData.name,
      website: formData.website || '',
      industry: formData.industry || '',
      notes: formData.notes || '',
      location: formData.location.trim() ? formData.location.trim() : undefined,
      company_size: formData.company_size || undefined,
      employee_count: undefined,
      dark_logo_bg: formData.dark_logo_bg,
      __follow_up: enableFollowUp && dueIso ? { due_at: dueIso, message: followUpMessage, notify_desktop: notifyDesktop, notify_email: notifyEmail } : undefined
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Edit Company</h2>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Company Name *</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Website</label>
        <input
          type="url"
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          placeholder="https://example.com"
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Based out of</label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="City, State/Country"
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e7eb', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enableFollowUp}
            onChange={(e) => setEnableFollowUp(e.target.checked)}
            style={{ accentColor: '#fbbf24', width: 18, height: 18, borderRadius: 4 }}
          />
          Add follow-up reminder
        </label>
        {enableFollowUp && (
          <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', cursor: 'pointer' }}>
                <input type="checkbox" checked={notifyDesktop} onChange={(e) => setNotifyDesktop(e.target.checked)} style={{ accentColor: '#fbbf24', width: 16, height: 16, borderRadius: 4 }} />
                Desktop notification
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', cursor: 'pointer' }}>
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} style={{ accentColor: '#fbbf24', width: 16, height: 16, borderRadius: 4 }} />
                Email me (requires email setup in Settings)
              </label>
            </div>
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              className="dark-datetime"
              style={{ width: '100%', padding: '0.75rem' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.8rem' }}>
              <span>Time zone:</span>
              <select
                value={followUpTimeZone}
                onChange={(e) => setFollowUpTimeZone(e.target.value)}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: '#0f1115',
                  border: '1px solid #2d3139',
                  borderRadius: '4px',
                  color: '#e5e7eb',
                  fontSize: '0.8rem'
                }}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={followUpMessage}
              onChange={(e) => setFollowUpMessage(e.target.value)}
              placeholder={`Optional reminder note (default: "Follow up with ${company.name}")`}
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#1a1d24', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
            />
          </div>
        )}
      </div>
      {company.logo_url && (
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '8px',
              padding: '6px',
              backgroundColor: formData.dark_logo_bg ? '#e5e7eb' : '#0f1115',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #2d3139'
            }}
          >
            <img
              src={company.logo_url}
              alt={`${company.name} logo preview`}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, dark_logo_bg: !formData.dark_logo_bg })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              border: '1px solid #2d3139',
              backgroundColor: '#0f1115',
              color: '#e5e7eb',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            <Sun size={14} />
            <span>{formData.dark_logo_bg ? 'Light background for dark logos' : 'Dark background'}</span>
          </button>
        </div>
      )}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Industry</label>
        <select
          value={formData.industry}
          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
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
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
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
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '100px' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button type="button" onClick={onCancel} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}>
          Save
        </button>
      </div>
    </form>
  );
}

function AddJobModal({ companyName, onClose, onSave }: { companyName: string; onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
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
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#fbbf24' }}>
          Add Job
        </h2>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Adding job at <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{companyName}</span>
        </p>
        <form onSubmit={handleSubmit}>
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

function AddContactModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', role: '', email: '', phone: '', linkedin_url: '', notes: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formData);
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: '#1a1d24', padding: '2rem', borderRadius: '8px', width: '90%', maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Add Contact</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Name *" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }} />
          <input type="text" placeholder="Role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }} />
          <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }} />
          <input type="tel" placeholder="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }} />
          <input type="url" placeholder="LinkedIn URL" value={formData.linkedin_url} onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }} />
          <textarea placeholder="Notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '80px' }} />
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}>Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
