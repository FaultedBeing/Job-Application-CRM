import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Edit, Plus, Upload, Trash2, ExternalLink, Pencil, Check, X, Bell } from 'lucide-react';
import LocationMap from './LocationMap';
import ConfirmDialog from './ConfirmDialog';
import AlertDialog from './AlertDialog';
import { debugLog } from '../utils/debugLogger';

interface Job {
  id: number;
  title: string;
  company_name: string;
  company_id?: number;
  company?: {
    logo_url?: string;
    dark_logo_bg?: boolean;
  };
  location?: string;
  status: string;
  link: string;
  description: string;
  notes: string;
  excitement_score: number;
  fit_score: number;
  created_at: string;
}

interface Contact {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  nearest_reminder?: string;
}

interface Interaction {
  id: number;
  job_id?: number;
  type: string;
  content: string;
  date: string;
  contact_name?: string;
  follow_up_at?: string | null;
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

interface Document {
  id: number;
  filename: string;
  path: string;
  type: string;
  created_at: string;
}

interface Reminder {
  id: number;
  entity_type: string;
  entity_id: number;
  source: string;
  due_at: string;
  message: string;
  link_path?: string;
  notify_desktop: number;
  notify_email: number;
  contact_id?: number;
  contact_name?: string;
  sent_at?: string;
  created_at: string;
}

function ReminderCard({ reminder, onDelete }: { reminder: Reminder, onDelete: (id: number) => void }) {
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
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontWeight: 'bold', fontSize: '0.9rem' }}>
          <Bell size={14} />
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
        cursor: isPast ? 'pointer' : 'default'
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
        {reminder.contact_name && (
          <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.1rem', marginBottom: '0.5rem' }}>
            <strong>With:</strong> {reminder.contact_name}
          </div>
        )}
        <p style={{ color: '#e5e7eb', marginTop: '0.25rem' }}>{reminder.message}</p>
      </div>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [jobNotes, setJobNotes] = useState('');
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocType, setEditDocType] = useState('');
  const [showJobMap, setShowJobMap] = useState(true);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (id) {
      loadData();
      loadStatuses();
    }
  }, [id]);

  async function loadData() {
    try {
      const [jobRes, contactsRes, documentsRes, remindersRes] = await Promise.all([
        api.get(`/jobs/${id}`),
        api.get(`/jobs/${id}/contacts`),
        api.get(`/jobs/${id}/documents`),
        api.get(`/jobs/${id}/reminders`)
      ]);

      setJob(jobRes.data);
      setJobNotes(jobRes.data.notes || '');
      setContacts(contactsRes.data);
      // Get all interactions and filter for this job
      const allInteractions = await api.get('/interactions');
      const filteredInteractions = Array.isArray(allInteractions.data) ? allInteractions.data.filter((i: any) => i.job_id === parseInt(id!)) : [];
      setInteractions(filteredInteractions);
      setDocuments(Array.isArray(documentsRes.data) ? documentsRes.data : []);
      setReminders(Array.isArray(remindersRes.data) ? remindersRes.data : []);
    } catch (error) {
      console.error('Error loading job:', error);
    }
  }

  async function loadStatuses() {
    try {
      const res = await api.get('/settings');
      const statusStr = res.data.statuses || 'Wishlist,Applied,Interviewing,Offer,Rejected';
      setStatuses(statusStr.split(','));
      const showJobMapStr = res.data.show_job_map;
      setShowJobMap(showJobMapStr === undefined || showJobMapStr === null ? true : showJobMapStr === 'true');
    } catch (error) {
      setStatuses(['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected']);
      setShowJobMap(true);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!job) return;
    try {
      await api.put(`/jobs/${job.id}`, { ...job, status: newStatus });
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function handleSaveJob(updatedJob: Job) {
    try {
      await api.put(`/jobs/${updatedJob.id}`, updatedJob);
      setEditing(false);
      loadData();
    } catch (error) {
      console.error('Error saving job:', error);
      setAlertMsg({ title: 'Error', message: 'Error saving job' });
    }
  }

  async function handleAddContact(data: any) {
    try {
      await api.post('/contacts', { ...data, job_id: parseInt(id!) });
      setShowAddContact(false);
      loadData();
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  }

  async function handleAddInteraction(data: any) {
    try {
      await api.post('/interactions', { ...data, job_id: parseInt(id!) });
      setShowAddInteraction(false);
      loadData();
    } catch (error) {
      console.error('Error adding interaction:', error);
    }
  }

  async function handleAddReminder(data: any) {
    try {
      await api.post(`/jobs/${id}/reminder`, data);
      setShowAddReminder(false);
      loadData();
    } catch (error) {
      console.error('Error adding reminder:', error);
      setAlertMsg({ title: 'Error', message: 'Error adding reminder: ' + (error as any).message });
    }
  }

  function handleDeleteReminder(reminderId: number) {
    setPendingConfirm({
      title: 'Delete reminder',
      message: 'Are you sure you want to delete this reminder?',
      onConfirm: async () => {
        setPendingConfirm(null);
        try {
          await api.delete(`/reminders/${reminderId}`);
          loadData();
        } catch (error) {
          console.error('Error deleting reminder:', error);
          setAlertMsg({ title: 'Error', message: 'Error deleting reminder' });
        }
      }
    });
  }

  const [confirmInteractionId, setConfirmInteractionId] = useState<number | null>(null);

  async function handleDeleteInteractionConfirmed() {
    if (confirmInteractionId == null) return;
    try {
      await api.delete(`/interactions/${confirmInteractionId}`);
      setConfirmInteractionId(null);
      loadData();
    } catch (error) {
      console.error('Error deleting interaction:', error);
      setAlertMsg({ title: 'Error', message: 'Error deleting interaction' });
    }
  }

  async function handleUploadDocument(file: File, type: string) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      await api.post(`/jobs/${id}/documents`, formData);
      loadData();
    } catch (error) {
      console.error('Error uploading document:', error);
      const anyErr = error as any;
      const serverMessage = anyErr?.response?.data?.error || anyErr?.message || 'Unknown error';
      setAlertMsg({ title: 'Upload error', message: `There was a problem uploading that file:\n\n${serverMessage}` });
    }
  }

  function handleDeleteDocument(docId: number) {
    setPendingConfirm({
      title: 'Delete document',
      message: 'Are you sure you want to delete this document?',
      onConfirm: async () => {
        setPendingConfirm(null);
        try {
          await api.delete(`/documents/${docId}`);
          loadData();
        } catch (error) {
          console.error('Error deleting document:', error);
        }
      }
    });
  }

  function startEditingDoc(doc: Document) {
    setEditingDocId(doc.id);
    setEditDocName(doc.filename);
    setEditDocType(doc.type);
  }

  function cancelEditingDoc() {
    setEditingDocId(null);
    setEditDocName('');
    setEditDocType('');
  }

  async function handleSaveDocEdit(docId: number) {
    if (!editDocName.trim()) return;
    try {
      await api.put(`/documents/${docId}`, { filename: editDocName.trim(), type: editDocType });
      setEditingDocId(null);
      loadData();
    } catch (error) {
      console.error('Error renaming document:', error);
    }
  }

  async function handleSaveJobNotes() {
    if (!job) return;
    if (jobNotes === (job.notes || '')) return;

    try {
      const res = await api.put(`/jobs/${job.id}`, {
        ...job,
        notes: jobNotes
      });
      setJob(res.data);
      setJobNotes(res.data.notes || '');
    } catch (error) {
      console.error('Error saving notes:', error);
      setAlertMsg({ title: 'Error', message: 'Error saving notes' });
      setJobNotes(job.notes || '');
    }
  }

  function handleDeleteJob() {
    if (!job) return;
    setPendingConfirm({
      title: 'Delete job',
      message: 'Are you sure you want to delete this job?',
      onConfirm: async () => {
        setPendingConfirm(null);
        try {
          await api.delete(`/jobs/${job.id}`);
          navigate('/applications');
        } catch (error) {
          console.error('Error deleting job:', error);
          setAlertMsg({ title: 'Error', message: 'Error deleting job' });
        }
      }
    });
  }

  function handleDeleteContact(contactId: number) {
    setPendingConfirm({
      title: 'Delete contact',
      message: 'Are you sure you want to delete this contact?',
      onConfirm: async () => {
        setPendingConfirm(null);
        try {
          await api.delete(`/contacts/${contactId}`);
          loadData();
        } catch (error) {
          console.error('Error deleting contact:', error);
          setAlertMsg({ title: 'Error', message: 'Error deleting contact' });
        }
      }
    });
  }

  if (!job) return <div>Loading...</div>;

  return (
    <div>
      <button
        onClick={() => navigate('/applications')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
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

      {!editing ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
              {job.company?.logo_url && (
                <img
                  src={job.company.logo_url}
                  alt={`${job.company_name} logo`}
                  style={{
                    width: '50px',
                    height: '50px',
                    objectFit: 'contain',
                    backgroundColor: job.company.dark_logo_bg ? '#e5e7eb' : '#0f1115',
                    padding: '6px',
                    borderRadius: '6px'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    debugLog(`Failed to load company logo: ${(e.target as HTMLImageElement).src}`);
                  }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.35rem', color: '#fbbf24' }}>{job.title}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '1.1rem', color: '#9ca3af', margin: 0 }}>{job.company_name}</p>
                    {job.location && (
                      <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.1rem', marginBottom: 0 }}>{job.location}</p>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.35rem 0.8rem',
                      borderRadius: '999px',
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span style={{ color: '#fbbf24' }}>★ Excitement: {job.excitement_score}</span>
                    <span style={{ color: '#34d399' }}>● Fit: {job.fit_score}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <button
                onClick={() => setEditing(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#1a1d24',
                  border: '1px solid #2d3139',
                  borderRadius: '6px',
                  color: '#e5e7eb',
                  cursor: 'pointer'
                }}
              >
                <Edit size={20} />
                Edit
              </button>
              <button
                onClick={handleDeleteJob}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
            <div>
              <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Details</h2>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Status</label>
                  <select
                    value={job.status}
                    onChange={(e) => updateStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      marginTop: '0.5rem',
                      backgroundColor: '#0f1115',
                      border: '1px solid #2d3139',
                      borderRadius: '6px',
                      color: '#e5e7eb'
                    }}
                  >
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Location</label>
                  <div style={{ color: job.location ? '#e5e7eb' : '#6b7280', marginTop: '0.5rem' }}>
                    {job.location || '—'}
                  </div>
                  {job.location && showJobMap && <LocationMap location={job.location} height={220} />}
                </div>
                {job.link && (
                  <div style={{ marginBottom: '1rem' }}>
                    <button
                      onClick={() => {
                        let finalLink = job.link.trim();
                        if (finalLink.includes('@') && !finalLink.includes('://') && !finalLink.toLowerCase().startsWith('mailto:')) {
                          finalLink = `mailto:${finalLink}`;
                        } else if (!finalLink.includes('://') && !finalLink.toLowerCase().startsWith('mailto:')) {
                          finalLink = `https://${finalLink}`;
                        }

                        if ((window as any).electronAPI?.openExternal) {
                          (window as any).electronAPI.openExternal(finalLink);
                        } else {
                          window.open(finalLink, '_blank');
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.6rem 1.2rem',
                        backgroundColor: '#1a1d24',
                        border: '1px solid #2d3139',
                        borderRadius: '6px',
                        color: '#fbbf24',
                        fontSize: '0.95rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textDecoration: 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2d3139';
                        e.currentTarget.style.borderColor = '#fbbf24';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#1a1d24';
                        e.currentTarget.style.borderColor = '#2d3139';
                      }}
                      title="Open job posting or email"
                    >
                      <ExternalLink size={16} />
                      {job.link.includes('@') && !job.link.includes('://') ? 'Email Application' : 'View Job Posting'}
                    </button>
                  </div>
                )}
                {job.description && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Description</label>
                    <p style={{ color: '#e5e7eb', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{job.description}</p>
                  </div>
                )}
                <div>
                  <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Notes</label>
                  <textarea
                    value={jobNotes}
                    onChange={(e) => setJobNotes(e.target.value)}
                    onBlur={handleSaveJobNotes}
                    placeholder="Click here to add notes about this job..."
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
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
              </div>

              {/* Activity Log */}
              <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>Activity Log</h2>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={() => setShowAddReminder(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        backgroundColor: 'transparent',
                        border: '1px solid #fbbf24',
                        borderRadius: '6px',
                        color: '#fbbf24',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={16} />
                      Add Reminder
                    </button>
                    <button
                      onClick={() => setShowAddInteraction(true)}
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
                      Add Activity
                    </button>
                  </div>
                </div>
                {reminders.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    {reminders.map((reminder) => (
                      <ReminderCard key={reminder.id} reminder={reminder} onDelete={handleDeleteReminder} />
                    ))}
                  </div>
                )}
                {interactions.length === 0 ? (
                  <p style={{ color: '#9ca3af' }}>No interactions yet.</p>
                ) : (
                  <div>
                    {interactions.map((interaction) => (
                      <div
                        key={interaction.id}
                        style={{
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#0f1115',
                          borderRadius: '6px',
                          borderLeft: '3px solid #fbbf24',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: '0.35rem',
                              gap: '0.75rem'
                            }}
                          >
                            <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{interaction.type}</span>
                            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#9ca3af' }}>
                              <div>Action: {new Date(interaction.date).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                              {interaction.follow_up_at && (
                                <div style={{ color: '#fbbf24' }}>
                                  Reminder: {new Date(interaction.follow_up_at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                                </div>
                              )}
                            </div>
                          </div>
                          {interaction.contact_name && (
                            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                              With: {interaction.contact_name}
                            </p>
                          )}
                          <p style={{ color: '#e5e7eb' }}>{interaction.content}</p>
                        </div>
                        <button
                          onClick={() => setConfirmInteractionId(interaction.id)}
                          title="Delete activity"
                          style={{
                            alignSelf: 'flex-start',
                            padding: '0.25rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#4b5563',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              {/* Contacts */}
              <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>Contacts</h2>
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
                    Add
                  </button>
                </div>
                {contacts.length === 0 ? (
                  <p style={{ color: '#9ca3af' }}>No contacts yet.</p>
                ) : (
                  <div>
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        style={{
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#0f1115',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '0.75rem'
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 'bold' }}>
                            <Link
                              to={`/contacts/${contact.id}`}
                              style={{ color: '#e5e7eb', textDecoration: 'none', fontWeight: 'bold' }}
                            >
                              {contact.name}
                            </Link>
                            {contact.nearest_reminder && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                                <Bell size={10} />
                                {new Date(contact.nearest_reminder).toLocaleDateString()}
                              </div>
                            )}
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
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '0.25rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer'
                          }}
                          title="Delete contact"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documents */}
              <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>Documents</h2>
                  <DocumentUpload onUpload={handleUploadDocument} />
                </div>
                {documents.length === 0 ? (
                  <p style={{ color: '#9ca3af' }}>No documents yet.</p>
                ) : (
                  <div>
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#0f1115',
                          borderRadius: '6px'
                        }}
                      >
                        {editingDocId === doc.id ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                              <input
                                type="text"
                                value={editDocName}
                                onChange={(e) => setEditDocName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDocEdit(doc.id); if (e.key === 'Escape') cancelEditingDoc(); }}
                                autoFocus
                                style={{
                                  flex: 1,
                                  padding: '4px 8px',
                                  backgroundColor: '#1a1d24',
                                  border: '1px solid #fbbf24',
                                  borderRadius: '4px',
                                  color: '#e5e7eb',
                                  fontSize: '0.875rem'
                                }}
                              />
                              <select
                                value={editDocType}
                                onChange={(e) => setEditDocType(e.target.value)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#1a1d24',
                                  border: '1px solid #2d3139',
                                  borderRadius: '4px',
                                  color: '#e5e7eb',
                                  fontSize: '0.75rem'
                                }}
                              >
                                <option value="Resume">Resume</option>
                                <option value="Cover Letter">Cover Letter</option>
                                <option value="Portfolio">Portfolio</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem', flexShrink: 0 }}>
                              <button onClick={() => handleSaveDocEdit(doc.id)} title="Save" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer' }}><Check size={16} /></button>
                              <button onClick={cancelEditingDoc} title="Cancel" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><X size={16} /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <a
                                href={`/uploads/${doc.path ? doc.path.split(/[\\/]/).pop() : doc.filename}`}
                                target="_blank"
                                style={{ color: '#3b82f6', textDecoration: 'none' }}
                              >
                                {doc.filename}
                              </a>
                              <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{doc.type}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                              <button onClick={() => startEditingDoc(doc)} title="Rename" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}><Pencil size={14} /></button>
                              <button onClick={() => handleDeleteDocument(doc.id)} style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <EditJobForm job={job} onSave={handleSaveJob} onCancel={() => setEditing(false)} />
      )}

      {showAddContact && (
        <AddContactModal
          jobId={parseInt(id!)}
          onClose={() => setShowAddContact(false)}
          onSave={handleAddContact}
        />
      )}

      {showAddInteraction && (
        <AddInteractionModal
          jobId={parseInt(id!)}
          contacts={contacts}
          onClose={() => setShowAddInteraction(false)}
          onSave={handleAddInteraction}
        />
      )}

      {showAddReminder && (
        <AddReminderModal
          jobId={parseInt(id!)}
          contacts={contacts}
          onClose={() => setShowAddReminder(false)}
          onSave={handleAddReminder}
        />
      )}
      <ConfirmDialog
        open={confirmInteractionId !== null}
        title="Delete activity"
        message="This will remove this activity entry from the log. This will not delete any related job, company, or contact."
        onConfirm={handleDeleteInteractionConfirmed}
        onCancel={() => setConfirmInteractionId(null)}
      />
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

function EditJobForm({ job, onSave, onCancel }: { job: Job; onSave: (job: Job) => void; onCancel: () => void }) {
  const [formData, setFormData] = useState(job);
  const [statuses, setStatuses] = useState<string[]>([]);

  useEffect(() => {
    async function loadStatuses() {
      try {
        const res = await api.get('/settings');
        const statusStr = res.data.statuses || 'Wishlist,Applied,Interviewing,Offer,Rejected';
        setStatuses(statusStr.split(','));
      } catch (error) {
        setStatuses(['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected']);
      }
    }
    loadStatuses();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formData);
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Edit Job</h2>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Company Name *</label>
        <input
          type="text"
          required
          value={formData.company_name}
          onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Job Title *</label>
        <input
          type="text"
          required
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Location</label>
        <input
          type="text"
          value={formData.location || ''}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="City, State/Country (or Remote)"
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Status</label>
        <select
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        >
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Job Link / Email</label>
        <input
          type="text"
          value={formData.link || ''}
          onChange={(e) => setFormData({ ...formData, link: e.target.value })}
          placeholder="https://... or hiring@company.com"
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '100px' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Notes</label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '100px' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Excitement Score</label>
          <input
            type="number"
            min="0"
            max="5"
            value={formData.excitement_score}
            onChange={(e) => setFormData({ ...formData, excitement_score: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Fit Score</label>
          <input
            type="number"
            min="0"
            max="5"
            value={formData.fit_score}
            onChange={(e) => setFormData({ ...formData, fit_score: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
          />
        </div>
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

function DocumentUpload({ onUpload }: { onUpload: (file: File, type: string) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('Other');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFile) {
      onUpload(selectedFile, docType);
      setShowModal(false);
      setSelectedFile(null);
      setDocType('Other');
    }
  }

  function handleClose() {
    setShowModal(false);
    setSelectedFile(null);
    setDocType('Other');
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
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
        <Upload size={16} />
        Upload
      </button>
      {showModal && (
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
          onClick={handleClose}
        >
          <div
            style={{
              backgroundColor: '#1a1d24',
              padding: '2rem',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '460px',
              border: '1px solid #2d3139'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#fbbf24' }}>Attach Document</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Upload a document specific to this job (resume, cover letter, etc.).
            </p>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0f1115',
                    border: '1px solid #2d3139',
                    borderRadius: '6px',
                    color: '#e5e7eb'
                  }}
                >
                  <option value="Resume">Resume</option>
                  <option value="Cover Letter">Cover Letter</option>
                  <option value="Portfolio">Portfolio</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>
                  File
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
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
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleClose}
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
                  disabled={!selectedFile}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: selectedFile ? '#fbbf24' : '#4b5563',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#0f1115',
                    fontWeight: 'bold',
                    cursor: selectedFile ? 'pointer' : 'not-allowed'
                  }}
                >
                  Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function AddContactModal({ jobId, onClose, onSave }: { jobId: number; onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', role: '', email: '', phone: '', linkedin_url: '', notes: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...formData, job_id: jobId });
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

function AddInteractionModal({ jobId: _jobId, contacts, onClose, onSave }: { jobId: number; contacts: Contact[]; onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ type: 'Email', content: '', contact_id: '' });
  const [enableFollowUp, setEnableFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [notifyDesktop, setNotifyDesktop] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [followUpTimeZone, setFollowUpTimeZone] = useState<string>(getDefaultTimeZone());
  const [interactionDate, setInteractionDate] = useState<string>(() => new Date().toISOString().slice(0, 16));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dueIso =
      enableFollowUp && followUpAt
        ? toUtcIsoFromLocal(followUpAt, followUpTimeZone) || new Date(followUpAt).toISOString()
        : null;
    onSave({
      ...formData,
      contact_id: formData.contact_id ? parseInt(formData.contact_id) : null,
      follow_up_at: dueIso,
      follow_up_message: enableFollowUp ? followUpMessage : null,
      notify_desktop: enableFollowUp ? notifyDesktop : null,
      notify_email: enableFollowUp ? notifyEmail : null,
      date: interactionDate ? new Date(interactionDate).toISOString() : undefined
    });
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: '#1a1d24', padding: '2rem', borderRadius: '8px', width: '90%', maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Add Interaction</h2>
        <form onSubmit={handleSubmit}>
          <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}>
            <option value="Email">Email</option>
            <option value="Call">Call</option>
            <option value="Interview">Interview</option>
            <option value="Note">Note</option>
          </select>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: '#e5e7eb', fontSize: '0.85rem' }}>When did this happen?</label>
            <input
              type="datetime-local"
              value={interactionDate}
              onChange={(e) => setInteractionDate(e.target.value)}
              className="dark-datetime"
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <select value={formData.contact_id} onChange={(e) => setFormData({ ...formData, contact_id: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}>
            <option value="">No contact</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <textarea placeholder="Content" required value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '100px' }} />
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
                  placeholder="Optional reminder note"
                  style={{ width: '100%', padding: '0.75rem', backgroundColor: '#1a1d24', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
                />
              </div>
            )}
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

function AddReminderModal({ jobId: _jobId, contacts, onClose, onSave }: { jobId: number; contacts: Contact[]; onClose: () => void; onSave: (data: any) => void }) {
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [contactId, setContactId] = useState('');
  const [notifyDesktop, setNotifyDesktop] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [followUpTimeZone, setFollowUpTimeZone] = useState<string>(getDefaultTimeZone());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpAt) return;
    const dueIso = toUtcIsoFromLocal(followUpAt, followUpTimeZone) || new Date(followUpAt).toISOString();
    onSave({
      due_at: dueIso,
      message: followUpMessage,
      contact_id: contactId ? parseInt(contactId) : null,
      notify_desktop: notifyDesktop,
      notify_email: notifyEmail
    });
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: '#1a1d24', padding: '2rem', borderRadius: '8px', width: '90%', maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Add Reminder</h2>
        <form onSubmit={handleSubmit}>

          <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <label style={{ color: '#e5e7eb', fontSize: '0.9rem' }}>When</label>
            <input
              type="datetime-local"
              required
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
                  <option key={tz.id} value={tz.id}>{tz.label}</option>
                ))}
              </select>
            </div>

            <label style={{ color: '#e5e7eb', fontSize: '0.9rem', marginTop: '0.5rem' }}>Contact (Optional)</label>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}>
              <option value="">No contact</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label style={{ color: '#e5e7eb', fontSize: '0.9rem', marginTop: '0.5rem' }}>Message / Note</label>
            <input
              type="text"
              value={followUpMessage}
              onChange={(e) => setFollowUpMessage(e.target.value)}
              placeholder="e.g. Follow up with hiring manager"
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#1a1d24', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
            />

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', cursor: 'pointer' }}>
                <input type="checkbox" checked={notifyDesktop} onChange={(e) => setNotifyDesktop(e.target.checked)} style={{ accentColor: '#fbbf24', width: 16, height: 16, borderRadius: 4 }} />
                Desktop notification
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', cursor: 'pointer' }}>
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} style={{ accentColor: '#fbbf24', width: 16, height: 16, borderRadius: 4 }} />
                Email me (requires email setup)
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}>Add Reminder</button>
          </div>
        </form>
      </div>
    </div>
  );
}
