import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Plus, Edit, Trash2, Sun, Bell, AlertTriangle } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertDialog from './AlertDialog';
import { debugLog } from '../utils/debugLogger';

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
  no_posted_jobs?: boolean;
  no_appropriate_jobs?: boolean;
  financial_stability_warning?: boolean;
  excitement_rating?: number;
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
  nearest_reminder?: string;
}

interface Contact {
  id: number;
  name: string;
  role: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  nearest_reminder?: string;
  is_prospective?: number;
}

function ReminderCard({ reminder, onDelete }: { reminder: any, onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isPast = !!reminder.sent_at;

  if (isPast && !expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          padding: '0.5rem 1rem',
          marginBottom: '0.5rem',
          backgroundColor: '#0f1115',
          borderRadius: '6px',
          borderLeft: '3px solid #fbbf24',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontWeight: 'bold', fontSize: '0.85rem' }}>
          <Bell size={12} />
          Past Reminder
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#fbbf24' }}>
            Due: {new Date(reminder.due_at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(reminder.id);
            }}
            title="Delete reminder"
            style={{
              padding: '0.25rem',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#4b5563',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={isPast ? () => setExpanded(false) : undefined}
      style={{
        padding: '1rem',
        marginBottom: '0.5rem',
        backgroundColor: isPast ? '#0f1115' : '#1a1d24',
        borderRadius: '6px',
        border: isPast ? '1px solid #2d3139' : '1px solid #fbbf24',
        borderLeft: isPast ? '3px solid #fbbf24' : '4px solid #fbbf24',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '0.75rem',
        cursor: isPast ? 'pointer' : 'default',
        transition: 'all 0.2s'
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontWeight: 'bold' }}>
            <Bell size={16} />
            {isPast ? 'Past Reminder' : 'Upcoming Reminder'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#9ca3af' }}>
              <div style={{ color: isPast ? '#9ca3af' : '#fbbf24' }}>
                Due: {new Date(reminder.due_at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(reminder.id);
              }}
              title="Delete reminder"
              style={{
                padding: '0.25rem',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#4b5563',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <p style={{ color: '#e5e7eb', marginTop: '0.25rem' }}>{reminder.message}</p>
      </div>
    </div>
  );
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
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const [isNotesCollapsed, setIsNotesCollapsed] = useState(() => {
    if (!id) return true;
    const saved = localStorage.getItem(`notes_collapsed_${id}`);
    return saved === null ? true : saved === 'true';
  });
  const [isNotesEditing, setIsNotesEditing] = useState(false);

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
    setIsNotesEditing(false);
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
      setAlertMsg({ title: 'Error', message: 'Error saving notes' });
      setNotesDraft(company.notes || '');
    }
  }

  const toggleNotesCollapse = () => {
    const next = !isNotesCollapsed;
    setIsNotesCollapsed(next);
    localStorage.setItem(`notes_collapsed_${id}`, String(next));
  };

  function handleDeleteCompany() {
    if (!company) return;
    setPendingConfirm({
      title: 'Delete company',
      message: 'Delete this company? Jobs, contacts, and interactions will remain but will be unlinked from this company.',
      onConfirm: async () => {
        setPendingConfirm(null);
        try {
          await api.delete(`/companies/${company.id}`);
          navigate('/companies');
        } catch (error) {
          console.error('Error deleting company:', error);
          setAlertMsg({ title: 'Error', message: 'Error deleting company' });
        }
      }
    });
  }

  // Website is edited via the Edit Company form; no separate inline edit button here.

  async function handleUpdateCompany(updatedCompany: Company) {
    try {
      const { __follow_up: _ignored, ...companyPayload } = updatedCompany as any;
      await api.put(`/companies/${updatedCompany.id}`, companyPayload);
      setEditing(false);
      loadData();
    } catch (error) {
      console.error('Error updating company:', error);
      setAlertMsg({ title: 'Error', message: 'Error updating company' });
    }
  }

  if (!company) return <div>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate(-1)}
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
                    debugLog(`Failed to load company logo: ${(e.target as HTMLImageElement).src}`);
                  }}
                />
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fbbf24' }}>{company.name}</h1>
                {!!company.financial_stability_warning && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    marginBottom: '0.5rem'
                  }}>
                    <AlertTriangle size={14} />
                    Questionable Funds
                  </span>
                )}
                {!!company.no_posted_jobs && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}>
                    No Posted Jobs
                  </span>
                )}
                {!!company.no_appropriate_jobs && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(249, 115, 22, 0.15)',
                    color: '#fb923c',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid rgba(249, 115, 22, 0.3)'
                  }}>
                    No Appropriate Jobs
                  </span>
                )}
                {company.excitement_rating !== undefined && company.excitement_rating > 0 && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(251, 191, 36, 0.15)',
                    color: '#fbbf24',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid rgba(251, 191, 36, 0.3)'
                  }} title="Excitement Rating">
                    ★ {company.excitement_rating}
                  </span>
                )}
              </div>
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

          <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem', border: '1px solid #2d3139' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#e5e7eb' }}>Notes</h2>
              {!isNotesEditing && (
                <button
                  onClick={() => setIsNotesEditing(true)}
                  style={{
                    fontSize: '0.8rem',
                    color: '#fbbf24',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  Edit
                </button>
              )}
            </div>

            {isNotesEditing ? (
              <>
                <textarea
                  value={notesDraft}
                  autoFocus
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={handleSaveNotes}
                  placeholder="Click here to add notes about this company..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0f1115',
                    border: '1px solid #fbbf24',
                    borderRadius: '6px',
                    color: '#e5e7eb',
                    minHeight: '150px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    lineHeight: '1.5'
                  }}
                />
                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.5rem' }}>Notes save automatically when you click away.</p>
              </>
            ) : (
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setIsNotesEditing(true)}
                  style={{
                    backgroundColor: '#242832',
                    padding: '1rem',
                    borderRadius: '6px',
                    color: '#D1D5DB',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.95rem',
                    lineHeight: '1.6',
                    cursor: 'text',
                    minHeight: '60px',
                    maxHeight: isNotesCollapsed ? '200px' : 'none',
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'max-height 0.3s ease-out'
                  }}
                >
                  {company?.notes || <span style={{ color: '#6b7280' }}>Click here to add notes...</span>}

                  {isNotesCollapsed && (company?.notes?.length || 0) > 400 && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '60px',
                      background: 'linear-gradient(transparent, #242832)',
                      pointerEvents: 'none'
                    }} />
                  )}
                </div>

                {(company?.notes?.length || 0) > 400 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleNotesCollapse(); }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#9ca3af',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      marginTop: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    {isNotesCollapsed ? 'Show More ↓' : 'Show Less ↑'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Jobs */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>
                  Jobs ({jobs.length})
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                  <button
                    onClick={async () => {
                      try {
                        await api.put(`/companies/${company.id}`, {
                          ...company,
                          no_posted_jobs: !company.no_posted_jobs
                        });
                        loadData();
                      } catch (error) {
                        console.error('Error toggling no_posted_jobs:', error);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: company.no_posted_jobs ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                      border: company.no_posted_jobs ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #4b5563',
                      borderRadius: '6px',
                      color: company.no_posted_jobs ? '#f87171' : '#9ca3af',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                    title={company.no_posted_jobs ? 'Remove "No Posted Jobs" flag' : 'Mark as "No Posted Jobs"'}
                  >
                    {company.no_posted_jobs ? '✕ Clear Flag' : '⚑ No Posted Jobs'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await api.put(`/companies/${company.id}`, {
                          ...company,
                          no_appropriate_jobs: !company.no_appropriate_jobs
                        });
                        loadData();
                      } catch (error) {
                        console.error('Error toggling no_appropriate_jobs:', error);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: company.no_appropriate_jobs ? 'rgba(249, 115, 22, 0.15)' : 'transparent',
                      border: company.no_appropriate_jobs ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid #4b5563',
                      borderRadius: '6px',
                      color: company.no_appropriate_jobs ? '#fb923c' : '#9ca3af',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                    title={company.no_appropriate_jobs ? 'Remove "No Appropriate Jobs" flag' : 'Mark as "No Appropriate Jobs"'}
                  >
                    {company.no_appropriate_jobs ? '✕ Clear Flag' : '⚑ No Appropriate Jobs'}
                  </button>
                </div>
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
                        border: '1px solid #2d3139',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <h3 style={{ color: '#e5e7eb', marginBottom: '0.25rem' }}>{job.title}</h3>
                        {job.nearest_reminder && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', fontSize: '0.7rem', backgroundColor: '#1a1d24', padding: '2px 6px', borderRadius: '4px', border: '1px solid #2d3139' }}>
                            <Bell size={10} />
                            {new Date(job.nearest_reminder).toLocaleDateString()}
                          </div>
                        )}
                      </div>
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
                      onClick={() => navigate(`/contacts/${contact.id}`)}
                      style={{
                        padding: '1rem',
                        marginBottom: '0.5rem',
                        backgroundColor: '#0f1115',
                        borderRadius: '6px',
                        border: '1px solid #2d3139',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      <div>
                        <p style={{ fontWeight: 'bold' }}>
                          <span style={{ color: '#e5e7eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {contact.name}
                            {!!contact.is_prospective && (
                              <span style={{
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                fontSize: '0.6rem',
                                fontWeight: 'bold',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                textTransform: 'uppercase'
                              }}>
                                Prospective
                              </span>
                            )}
                          </span>
                        </p>
                        {contact.nearest_reminder && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                            <Bell size={12} />
                            Reminder: {new Date(contact.nearest_reminder).toLocaleDateString()}
                          </div>
                        )}
                        {contact.role && <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{contact.role}</p>}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}>
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{contact.phone}</p>}
                        {contact.linkedin_url && (
                          <a
                            href={contact.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
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

          {/* Company Activity Section */}
          <section style={{ marginTop: '2rem' }}>
            <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', border: '1px solid #2d3139' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb', marginBottom: '1rem' }}>Company Activity</h2>
              <ReminderSection companyId={company.id} companyName={company.name} onUpdate={loadData} />
            </div>
          </section>

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
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title || ''}
        message={pendingConfirm?.message || ''}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onCancel={() => setPendingConfirm(null)}
      />
      <AlertDialog
        open={alertMsg !== null}
        title={alertMsg?.title || ''}
        message={alertMsg?.message || ''}
        onClose={() => setAlertMsg(null)}
      />
    </div>
  );
}

function ReminderSection({ companyId, companyName, onUpdate }: { companyId: number; companyName: string; onUpdate: () => void }) {
  const [reminders, setReminders] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [notifyDesktop, setNotifyDesktop] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [followUpTimeZone, setFollowUpTimeZone] = useState<string>(getDefaultTimeZone());

  useEffect(() => {
    loadReminders();
  }, [companyId]);

  async function loadReminders() {
    try {
      const res = await api.get(`/companies/${companyId}/reminders`);
      setReminders(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error loading company reminders:', error);
    }
  }

  async function handleSetReminder() {
    if (!followUpAt) return;
    const dueIso = toUtcIsoFromLocal(followUpAt, followUpTimeZone) || new Date(followUpAt).toISOString();
    try {
      await api.post(`/companies/${companyId}/reminder`, {
        due_at: dueIso,
        message: followUpMessage.trim() || `Follow up with ${companyName}`,
        notify_desktop: notifyDesktop,
        notify_email: notifyEmail
      });
      setShowForm(false);
      setFollowUpAt('');
      setFollowUpMessage('');
      loadReminders();
      onUpdate();
    } catch (error) {
      console.error('Error setting reminder:', error);
    }
  }

  async function handleDeleteReminder(reminderId: number) {
    try {
      await api.delete(`/reminders/${reminderId}`);
      loadReminders();
      onUpdate();
    } catch (error) {
      console.error('Error deleting reminder:', error);
    }
  }

  return (
    <div>
      {/* Existing reminders */}
      {reminders.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          {reminders.map((reminder) => (
            <ReminderCard key={reminder.id} reminder={reminder} onDelete={handleDeleteReminder} />
          ))}
        </div>
      )}

      {/* Add reminder button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            color: '#e5e7eb',
            cursor: 'pointer',
            fontSize: '0.85rem',
            marginTop: reminders.length > 0 ? '0.5rem' : 0
          }}
        >
          <Bell size={14} />
          Set Reminder
        </button>
      ) : (
        <div style={{ padding: '1rem', backgroundColor: '#0f1115', borderRadius: '6px', border: '1px solid #2d3139', marginTop: reminders.length > 0 ? '0.5rem' : 0 }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={notifyDesktop} onChange={(e) => setNotifyDesktop(e.target.checked)} style={{ accentColor: '#fbbf24', width: 16, height: 16, borderRadius: 4 }} />
              Desktop notification
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} style={{ accentColor: '#fbbf24', width: 16, height: 16, borderRadius: 4 }} />
              Email me
            </label>
          </div>
          <input
            type="datetime-local"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            className="dark-datetime"
            style={{ width: '100%', padding: '0.75rem', marginBottom: '0.75rem' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
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
            placeholder={`Optional note (default: "Follow up with ${companyName}")`}
            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#1a1d24', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', marginBottom: '0.75rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleSetReminder}
              disabled={!followUpAt}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: !followUpAt ? '#4b5563' : '#fbbf24',
                border: 'none',
                borderRadius: '6px',
                color: '#0f1115',
                cursor: !followUpAt ? 'not-allowed' : 'pointer',
                fontWeight: 500
              }}
            >
              Save Reminder
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid #4b5563',
                borderRadius: '6px',
                color: '#9ca3af',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
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
    dark_logo_bg: company.dark_logo_bg ?? false,
    logo_url: company.logo_url,
    financial_stability_warning: !!company.financial_stability_warning,
    excitement_rating: company.excitement_rating || 0
  });
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

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
      ...company,
      name: formData.name,
      website: formData.website || '',
      industry: formData.industry || '',
      notes: formData.notes || '',
      location: formData.location.trim() ? formData.location.trim() : undefined,
      company_size: formData.company_size || undefined,
      employee_count: undefined,
      dark_logo_bg: formData.dark_logo_bg,
      logo_url: formData.logo_url,
      financial_stability_warning: formData.financial_stability_warning,
      excitement_rating: formData.excitement_rating
    });
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const formPayload = new FormData();
      formPayload.append('logo', file);
      const res = await api.post(`/companies/${company.id}/logo`, formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // The backend returns the updated company object
      setFormData(prev => ({ ...prev, logo_url: res.data.logo_url }));
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingLogo(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingLogo(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingLogo(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleLogoUpload(e.dataTransfer.files[0]);
    }
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
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Company Logo</label>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '8px',
              padding: '8px',
              backgroundColor: formData.dark_logo_bg ? '#e5e7eb' : '#0f1115',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isDraggingLogo ? '2px dashed #fbbf24' : '1px solid #2d3139',
              position: 'relative'
            }}
          >
            {isUploadingLogo ? (
              <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Uploading...</div>
            ) : formData.logo_url ? (
              <img
                src={formData.logo_url}
                alt={`${company.name} logo preview`}
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
            ) : (
              <div style={{ color: '#6b7280', fontSize: '0.8rem', textAlign: 'center' }}>No logo</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: '#2d3139',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500
                }}
              >
                Upload Manual Logo
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp, image/x-icon, .ico"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleLogoUpload(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>
            {formData.logo_url && (
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
                  fontSize: '0.8rem',
                  width: 'fit-content'
                }}
              >
                <Sun size={14} />
                <span>{formData.dark_logo_bg ? 'Light field for dark logos' : 'Dark field background'}</span>
              </button>
            )}
            <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
              Drag an image here, or upload one.
            </div>
          </div>
        </div>
      </div>
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
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Excitement Rating</label>
        <select
          value={formData.excitement_rating}
          onChange={(e) => setFormData({ ...formData, excitement_rating: parseInt(e.target.value) || 0 })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
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
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '100px' }}
        />
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f87171', fontWeight: 'bold', cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ width: '20px', height: '20px' }}
            checked={formData.financial_stability_warning}
            onChange={(e) => setFormData({ ...formData, financial_stability_warning: e.target.checked })}
          />
          Questionable Funds
        </label>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginLeft: '2.4rem', marginTop: '0.25rem' }}>
          Flag this company as having a potentially unstable financial situation.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button type="button" onClick={onCancel} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}>
          Save
        </button>
      </div>
    </form >
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
              Job Link / Email
            </label>
            <input
              type="text"
              value={formData.link}
              onChange={(e) => setFormData({ ...formData, link: e.target.value })}
              placeholder="https://... or hiring@company.com"
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
  const [formData, setFormData] = useState({ name: '', role: '', email: '', phone: '', linkedin_url: '', notes: '', is_prospective: 0 });


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
          <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="checkbox"
              id="is_prospective_company_add"
              checked={!!formData.is_prospective}
              onChange={(e) => setFormData({ ...formData, is_prospective: e.target.checked ? 1 : 0 })}
              style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
            />
            <label htmlFor="is_prospective_company_add" style={{ color: '#e5e7eb', cursor: 'pointer', fontSize: '0.9rem' }}>
              Prospective Contact
            </label>
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}>Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
