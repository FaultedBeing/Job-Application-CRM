import { useEffect, useState } from 'react';
import { useSessionStorage } from '../utils/useSessionStorage';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Plus, Edit, Calendar, Trash2, Search, Bell, Upload, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertDialog from './AlertDialog';
import { debugLog } from '../utils/debugLogger';

interface Contact {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  social_platform?: string;
  social_handle?: string;
  company_name: string;
  company_logo_url?: string;
  company_dark_logo_bg?: boolean;
  notes?: string;
  email_draft?: string;
  next_check_in?: string;
  last_interaction?: string;
  nearest_reminder?: string;
  is_prospective?: number;
}

interface CompanyOption {
  id: number;
  name: string;
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
  contact_id?: number | null;
  contact_name?: string;
  sent_at?: string;
  created_at: string;
}

interface Interaction {
  id: number;
  type: string;
  content: string;
  date: string;
  follow_up_at?: string | null;
}

interface EmailDraft {
  id: number;
  contact_id: number;
  content: string;
  created_at: string;
  updated_at: string;
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

function formatPhoneNumber(phone: string) {
  const cleaned = ('' + phone).replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]})-${match[2]}-${match[3]}`;
  }
  return phone;
}

function ensureAbsoluteUrl(url: string) {
  if (url.toLowerCase().startsWith('www.')) {
    return `https://${url}`;
  }
  return url;
}

export default function Contacts() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [editing, setEditing] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<number | 'new' | null>(null);
  const [currentDraftContent, setCurrentDraftContent] = useState('');
  const [sortBy, setSortBy] = useSessionStorage<'recent' | 'name' | 'company' | 'no_company'>('contacts_sortBy', 'recent');
  const [showAddContact, setShowAddContact] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [sortOrder, setSortOrder] = useSessionStorage<'asc' | 'desc'>('contacts_sortOrder', 'desc');
  const [loading, setLoading] = useState(false);
  const [expandedDraftId, setExpandedDraftId] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);



  useEffect(() => {
    if (id) {
      loadContactDetail();
    } else {
      loadContactsAndCompanies();
    }
  }, [id]);

  async function loadContactsAndCompanies() {
    setLoading(true);
    try {

      const [contactsRes, companiesRes] = await Promise.all([
        api.get('/contacts'),
        api.get('/companies')
      ]);
      setContacts(contactsRes.data);
      setCompanies(
        companiesRes.data.map((c: any) => ({
          id: c.id,
          name: c.name
        }))
      );
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadContactDetail() {
    setLoading(true);
    setSelectedContact(null);
    setNotFound(false);
    setEditing(false); // Always start in view mode when navigating to a contact
    try {
      // Load main contact details first
      const contactRes = await api.get(`/contacts/${id}`);
      setSelectedContact(contactRes.data);
      setNotesDraft(contactRes.data.notes || '');

      // Load subsidiary data in parallel, but handle them safely
      const [interactionsRes, remindersRes, draftsRes] = await Promise.allSettled([
        api.get(`/contacts/${id}/interactions`),
        api.get(`/contacts/${id}/reminders`),
        api.get(`/contacts/${id}/email-drafts`)
      ]);

      setInteractions(interactionsRes.status === 'fulfilled' ? interactionsRes.value.data : []);
      setReminders(remindersRes.status === 'fulfilled' ? remindersRes.value.data : []);
      setEmailDrafts(draftsRes.status === 'fulfilled' ? draftsRes.value.data : []);
    } catch (error) {
      console.error('Error loading contact:', error);
      setSelectedContact(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateContact(updatedContact: Contact) {
    try {
      await api.put(`/contacts/${updatedContact.id}`, updatedContact);
      setEditing(false);
      if (id) {
        loadContactDetail();
      } else {
        loadContactsAndCompanies();
      }
    } catch (error) {
      console.error('Error updating contact:', error);
      setAlertMsg({ title: 'Error', message: 'Error updating contact' });
    }
  }

  async function handleAddInteraction(data: any) {
    try {
      await api.post('/interactions', { ...data, contact_id: parseInt(id!) });
      setShowAddInteraction(false);
      loadContactDetail();
    } catch (error) {
      console.error('Error adding interaction:', error);
    }
  }

  async function handleAddReminder(data: any) {
    try {
      await api.post(`/contacts/${id}/reminders`, data);
      setShowAddReminder(false);
      loadContactDetail();
    } catch (error) {
      console.error('Error adding reminder:', error);
      setAlertMsg({ title: 'Error', message: 'Failed to add reminder. Please try again.' });
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
          if (id) {
            loadContactDetail();
          } else {
            loadContactsAndCompanies();
          }
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
      if (id) {
        loadContactDetail();
      }
    } catch (error) {
      console.error('Error deleting interaction:', error);
      setAlertMsg({ title: 'Error', message: 'Error deleting interaction' });
    }
  }

  async function handleSaveNotesInline() {
    if (!selectedContact) return;
    if (notesDraft === (selectedContact.notes || '')) return;

    try {
      const res = await api.put(`/contacts/${selectedContact.id}`, {
        ...selectedContact,
        notes: notesDraft
      });
      setSelectedContact(res.data);
      setNotesDraft(res.data.notes || '');
    } catch (error) {
      console.error('Error saving notes:', error);
      setAlertMsg({ title: 'Error', message: 'Error saving notes' });
      setNotesDraft(selectedContact.notes || '');
    }
  }

  async function handleSaveDraft() {
    if (!id || !currentDraftContent.trim()) {
      setEditingDraftId(null);
      return;
    }

    try {
      if (editingDraftId === 'new') {
        await api.post(`/contacts/${id}/email-drafts`, { content: currentDraftContent });
      } else if (typeof editingDraftId === 'number') {
        await api.put(`/email-drafts/${editingDraftId}`, { content: currentDraftContent });
      }
      setEditingDraftId(null);
      setCurrentDraftContent('');
      const draftsRes = await api.get(`/contacts/${id}/email-drafts`);
      setEmailDrafts(Array.isArray(draftsRes.data) ? draftsRes.data : []);
    } catch (error) {
      console.error('Error saving draft:', error);
      setAlertMsg({ title: 'Error', message: 'Failed to save draft' });
    }
  }

  async function handleDeleteDraft(draftId: number) {
    try {
      await api.delete(`/email-drafts/${draftId}`);
      const draftsRes = await api.get(`/contacts/${id}/email-drafts`);
      setEmailDrafts(Array.isArray(draftsRes.data) ? draftsRes.data : []);
    } catch (error) {
      console.error('Error deleting draft:', error);
      setAlertMsg({ title: 'Error', message: 'Failed to delete draft' });
    }
  }

  function startEditingDraft(draft: EmailDraft) {
    setEditingDraftId(draft.id);
    setCurrentDraftContent(draft.content);
  }

  function startNewDraft() {
    setEditingDraftId('new');
    setCurrentDraftContent('');
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/import/contacts', formData);
      const { imported, skipped, errors } = res.data;
      let msg = `Imported ${imported} contact${imported === 1 ? '' : 's'}.`;
      if (skipped > 0) msg += `\n${skipped} skipped.`;
      if (errors && errors.length > 0) msg += `\nErrors: ${errors.length}`;
      setAlertMsg({ title: 'Import complete', message: msg });
      loadContactsAndCompanies();
    } catch (error: any) {
      const serverMsg = error?.response?.data?.error || error?.message || 'Unknown error';
      setAlertMsg({ title: 'Import failed', message: serverMsg });
    } finally {
      setImporting(false);
      const input = document.getElementById('contact-import-input') as HTMLInputElement;
      if (input) input.value = '';
    }
  }

  function handleDeleteContact(contactId: number) {
    setPendingConfirm({
      title: 'Delete contact',
      message: 'Are you sure you want to delete this contact?',
      onConfirm: async () => {
        setPendingConfirm(null);
        try {
          await api.delete(`/contacts/${contactId}`);
          if (id) {
            navigate('/contacts');
          } else {
            loadContactsAndCompanies();
          }
        } catch (error) {
          console.error('Error deleting contact:', error);
          setAlertMsg({ title: 'Error', message: 'Error deleting contact' });
        }
      }
    });
  }

  // Details view
  if (id) {
    if (loading && !selectedContact) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#fbbf24' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Loading contact details...</div>
        </div>
      );
    }

    if (notFound && !loading) {
      return (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: '#1a1d24', borderRadius: '8px', border: '1px solid #2d3139' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Contact Not Found</h2>
          <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>The contact you're looking for doesn't exist or has been removed.</p>
          <button
            onClick={() => navigate('/contacts')}
            style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Back to Contacts
          </button>
        </div>
      );
    }

    if (selectedContact) {

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
            <button
              onClick={() => handleDeleteContact(selectedContact.id)}
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

          {!editing ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '2rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h1 style={{ fontSize: '2rem', margin: 0, color: '#fbbf24' }}>{selectedContact.name}</h1>
                    {!!selectedContact.is_prospective && (
                      <span style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        textTransform: 'uppercase'
                      }}>
                        Prospective
                      </span>
                    )}
                  </div>
                  {selectedContact.role && (
                    <p style={{ fontSize: '1.25rem', color: '#9ca3af', marginBottom: '0.5rem' }}>{selectedContact.role}</p>
                  )}
                  {selectedContact.company_name && (
                    <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div>
                        <p style={{ color: '#9ca3af', marginBottom: '0.25rem' }}>{selectedContact.company_name}</p>
                        {selectedContact.company_logo_url && (
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '6px',
                              padding: '4px',
                              backgroundColor: selectedContact.company_dark_logo_bg ? '#e5e7eb' : '#0f1115',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid #2d3139'
                            }}
                          >
                            <img
                              src={selectedContact.company_logo_url}
                              alt={`${selectedContact.company_name} logo`}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                debugLog(`Failed to load company logo: ${(e.target as HTMLImageElement).src}`);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                <div>
                  {/* Contact Information */}
                  <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Contact Information</h2>
                    {selectedContact.email && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Email</label>
                        <a href={`mailto:${selectedContact.email}`} style={{ color: '#3b82f6', display: 'block', marginTop: '0.25rem' }}>
                          {selectedContact.email}
                        </a>
                      </div>
                    )}
                    {selectedContact.phone && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Phone</label>
                        <a href={`tel:${selectedContact.phone}`} style={{ color: '#3b82f6', display: 'block', marginTop: '0.25rem' }}>
                          {formatPhoneNumber(selectedContact.phone)}
                        </a>
                      </div>
                    )}
                    {selectedContact.linkedin_url && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>LinkedIn</label>
                        <a
                          href={ensureAbsoluteUrl(selectedContact.linkedin_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6', display: 'block', marginTop: '0.25rem' }}
                        >
                          View Profile
                        </a>
                      </div>
                    )}
                    {(selectedContact.social_platform || selectedContact.social_handle) && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Social Contact</label>
                        <p style={{ color: '#e5e7eb', marginTop: '0.25rem' }}>
                          <span style={{ fontWeight: 600, color: '#fbbf24' }}>{selectedContact.social_platform}:</span> {selectedContact.social_handle}
                        </p>
                      </div>
                    )}
                    {selectedContact.next_check_in && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: '#9ca3af', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={16} />
                          Next Check-in
                        </label>
                        <p style={{ color: '#e5e7eb', marginTop: '0.25rem' }}>
                          {new Date(selectedContact.next_check_in).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Activity Log */}
                  <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>Activity Log</h2>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                          onClick={() => setShowAddReminder(true)}
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
                          <Bell size={16} />
                          Add Reminder
                        </button>
                        <button
                          onClick={() => setShowAddInteraction(true)}
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
                          <Plus size={16} />
                          Log Activity
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
                                    <div style={{ color: '#fbbf24' }}>Reminder: {new Date(interaction.follow_up_at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                                  )}
                                </div>
                              </div>
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
                  {/* Notes */}
                  <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>Notes</h2>
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      onBlur={handleSaveNotesInline}
                      placeholder="Click here to add notes about this contact..."
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
                  {/* Email Draft Section */}
                  <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>Email Drafts</h2>
                      {editingDraftId === null && (
                        <button
                          onClick={startNewDraft}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.4rem 0.75rem',
                            backgroundColor: '#374151',
                            color: '#fbbf24',
                            border: '1px solid #4b5563',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                        >
                          <Plus size={14} />
                          New Draft
                        </button>
                      )}
                    </div>

                    {editingDraftId !== null && (
                      <div style={{ marginBottom: '1rem' }}>
                        <textarea
                          value={currentDraftContent}
                          onChange={(e) => setCurrentDraftContent(e.target.value)}
                          placeholder="Draft your email here..."
                          autoFocus
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: '#0f1115',
                            border: '1px solid #fbbf24',
                            borderRadius: '6px',
                            color: '#e5e7eb',
                            minHeight: '200px',
                            resize: 'vertical',
                            marginBottom: '0.5rem'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setEditingDraftId(null)}
                            style={{
                              padding: '0.4rem 1rem',
                              backgroundColor: 'transparent',
                              border: '1px solid #4b5563',
                              borderRadius: '4px',
                              color: '#e5e7eb',
                              fontSize: '0.85rem',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveDraft}
                            style={{
                              padding: '0.4rem 1rem',
                              backgroundColor: '#fbbf24',
                              border: 'none',
                              borderRadius: '4px',
                              color: '#0f1115',
                              fontWeight: 'bold',
                              fontSize: '0.85rem',
                              cursor: 'pointer'
                            }}
                          >
                            Save Draft
                          </button>
                        </div>
                      </div>
                    )}

                    {emailDrafts.length === 0 && editingDraftId === null ? (
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No drafts saved yet. Click "New Draft" to start writing.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {emailDrafts.map((draft) => {
                          const isExpanded = expandedDraftId === draft.id;
                          return (
                            <div
                              key={draft.id}
                              style={{
                                backgroundColor: '#0f1115',
                                border: '1px solid #2d3139',
                                borderRadius: '6px',
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                onClick={() => setExpandedDraftId(isExpanded ? null : draft.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.75rem 1rem',
                                  cursor: 'pointer',
                                  transition: 'background-color 0.15s',
                                  gap: '1rem'
                                }}
                                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1a1d24')}
                                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                              >
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  {isExpanded ? <ChevronDown size={16} color="#fbbf24" /> : <ChevronRight size={16} color="#9ca3af" />}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{
                                      color: isExpanded ? '#fbbf24' : '#e5e7eb',
                                      fontSize: '0.875rem',
                                      fontWeight: isExpanded ? 600 : 400,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      margin: 0
                                    }}>
                                      {draft.content.split('\n')[0] || '(Empty draft)'}
                                    </p>
                                    {!isExpanded && (
                                      <p style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: '0.1rem' }}>
                                        Last updated: {new Date(draft.updated_at).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingDraft(draft);
                                    }}
                                    title="Edit draft"
                                    style={{
                                      padding: '0.3rem',
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      color: '#9ca3af',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteDraft(draft.id);
                                    }}
                                    title="Delete draft"
                                    style={{
                                      padding: '0.3rem',
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      color: '#ef4444',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div style={{
                                  padding: '0.5rem 1rem 1rem 2.75rem',
                                  borderTop: '1px solid #2d3139',
                                  color: '#d1d5db',
                                  fontSize: '0.9rem',
                                  lineHeight: '1.5',
                                  whiteSpace: 'pre-wrap',
                                  backgroundColor: 'rgba(0,0,0,0.2)'
                                }}>
                                  {draft.content}
                                  <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '1rem', fontStyle: 'italic' }}>
                                    Updated at {new Date(draft.updated_at).toLocaleString()}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EditContactForm contact={selectedContact} onSave={handleUpdateContact} onCancel={() => setEditing(false)} />
          )}

          {showAddInteraction && (
            <AddInteractionModal
              contactId={parseInt(id!)}
              onClose={() => setShowAddInteraction(false)}
              onSave={handleAddInteraction}
            />
          )}

          {showAddReminder && selectedContact && (
            <AddReminderModal
              contactId={selectedContact.id}
              onClose={() => setShowAddReminder(false)}
              onSave={handleAddReminder}
            />
          )}

          <ConfirmDialog
            open={confirmInteractionId !== null}
            title="Delete activity"
            message="This will remove this activity entry from the log. This will not delete any related contact or company."
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
  }

  // ================= MAIN CONTACT LIST RENDER =================
  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    let cp = 0;
    if (sortBy === 'name') {
      cp = a.name.localeCompare(b.name);
    } else if (sortBy === 'company') {
      const coA = a.company_name || '';
      const coB = b.company_name || '';
      if (!coA && coB) cp = 1;
      else if (coA && !coB) cp = -1;
      else cp = coA.localeCompare(coB);
    } else if (sortBy === 'no_company') {
      const coA = a.company_name ? 1 : 0;
      const coB = b.company_name ? 1 : 0;
      cp = coA - coB;
    } else {
      // recent interaction
      const tA = a.last_interaction ? new Date(a.last_interaction).getTime() : 0;
      const tB = b.last_interaction ? new Date(b.last_interaction).getTime() : 0;
      cp = tB - tA; // default recent first
    }
    return sortOrder === 'asc' ? cp : -cp;
  });

  return (
    <div>
      <div className="responsive-header">
        <h1 style={{ fontSize: '2rem', color: '#fbbf24' }}>Contacts</h1>
        <div className="action-buttons">
          <div style={{ position: 'relative', flex: '1 1 300px' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 2.5rem',
                backgroundColor: '#1a1d24',
                border: '1px solid #2d3139',
                borderRadius: '8px',
                color: '#e5e7eb',
                fontSize: '0.95rem'
              }}
            />
          </div>
          <button
            onClick={() => setShowAddContact(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#fbbf24',
              border: 'none',
              borderRadius: '8px',
              color: '#0f1115',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'filter 0.15s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseOut={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            <Plus size={20} />
            Add Contact
          </button>
          <div style={{ position: 'relative' }}>
            <input
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              id="contact-import-input"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleImportFile(e.target.files[0]);
                }
              }}
            />
            <button
              onClick={() => document.getElementById('contact-import-input')?.click()}
              disabled={importing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                border: '1px solid #4b5563',
                borderRadius: '8px',
                color: '#e5e7eb',
                fontWeight: 'bold',
                cursor: importing ? 'wait' : 'pointer',
                opacity: importing ? 0.7 : 1,
                transition: 'background-color 0.15s'
              }}
              onMouseOver={(e) => !importing && (e.currentTarget.style.backgroundColor = '#1a1d24')}
              onMouseOut={(e) => !importing && (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Upload size={18} />
              {importing ? 'Importing...' : 'Import CSV'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <span style={{ color: '#9ca3af', fontSize: '0.9rem', fontWeight: 500 }}>Sort by:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: '0.4rem 0.75rem',
            backgroundColor: '#1a1d24',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          <option value="recent">Recent Interaction</option>
          <option value="name">Name</option>
          <option value="company">Company</option>
          <option value="no_company">No Company</option>
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
          style={{
            padding: '0.4rem',
            backgroundColor: '#1a1d24',
            border: '1px solid #2d3139',
            borderRadius: '6px',
            color: '#e5e7eb',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s'
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2d3139')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1a1d24')}
        >
          {sortOrder === 'asc' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {sortedContacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: '#1a1d24', borderRadius: '8px', border: '1px solid #2d3139' }}>
          <p style={{ color: '#9ca3af', fontSize: '1.1rem', marginBottom: '1.5rem' }}>
            {searchTerm ? 'No contacts match your search.' : 'No contacts added yet.'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowAddContact(true)}
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
              Add Your First Contact
            </button>
          )}
        </div>
      ) : (
        <div className="responsive-grid">
          {sortedContacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => navigate(`/contacts/${contact.id}`)}
              style={{
                backgroundColor: '#1a1d24',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid #2d3139',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
                e.currentTarget.style.border = '1px solid #fbbf24';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.border = '1px solid #2d3139';
              }}
            >
              {contact.company_logo_url && (
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '8px',
                    backgroundColor: contact.company_dark_logo_bg ? '#e5e7eb' : '#0f1115',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid #2d3139'
                  }}
                >
                  <img
                    src={contact.company_logo_url}
                    alt=""
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <h3 style={{ fontSize: '1.25rem', color: '#e5e7eb', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contact.name}
                  </h3>
                  {!!contact.is_prospective && (
                    <span style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      fontSize: '0.65rem',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      textTransform: 'uppercase',
                      flexShrink: 0
                    }}>
                      Prospective
                    </span>
                  )}
                </div>
                {contact.company_name && (
                  <p style={{ color: '#d1d5db', fontSize: '1rem', fontWeight: 500, marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contact.company_name}
                  </p>
                )}
                {contact.role && (
                  <p style={{ color: '#9ca3af', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contact.role}
                  </p>
                )}
                {contact.nearest_reminder && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fbbf24', fontSize: '0.8rem', backgroundColor: 'rgba(251, 191, 36, 0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', width: 'fit-content' }}>
                    <Bell size={12} />
                    <span>Due: {new Date(contact.nearest_reminder).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddContact && (
        <AddContactModal
          companies={companies}
          onClose={() => setShowAddContact(false)}
          onSave={async (data) => {
            try {
              await api.post('/contacts', data);
              setShowAddContact(false);
              loadContactsAndCompanies();
              setAlertMsg({ title: 'Success', message: 'Contact added successfully.' });
            } catch (error: any) {
              console.error('Error adding contact:', error);
              setAlertMsg({ title: 'Error', message: error?.response?.data?.error || 'Failed to add contact.' });
            }
          }}
        />
      )}

      {pendingConfirm && (
        <ConfirmDialog
          open={true}
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
          confirmLabel="Delete"
          confirmColor="#f87171"
        />
      )}

      {alertMsg && (
        <AlertDialog
          open={true}
          title={alertMsg.title}
          message={alertMsg.message}
          onClose={() => setAlertMsg(null)}
        />
      )}
    </div>
  );
}

function EditContactForm({ contact, onSave, onCancel }: { contact: Contact; onSave: (contact: Contact) => void; onCancel: () => void }) {
  const [formData, setFormData] = useState(contact);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formData);
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Edit Contact</h2>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Name *</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Role</label>
        <input
          type="text"
          value={formData.role || ''}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Email</label>
        <input
          type="email"
          value={formData.email || ''}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Phone</label>
        <input
          type="tel"
          value={formData.phone || ''}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>LinkedIn URL</label>
        <input
          type="url"
          value={formData.linkedin_url || ''}
          onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Social Contact</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={formData.social_platform || ''}
            onChange={(e) => setFormData({ ...formData, social_platform: e.target.value })}
            style={{ padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', width: '30%' }}
          >
            <option value="">Platform</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Twitter">Twitter</option>
            <option value="Facebook">Facebook</option>
            <option value="Discord">Discord</option>
            <option value="GitHub">GitHub</option>
            <option value="Other">Other</option>
          </select>
          <input
            type="text"
            placeholder="Username / Handle / Link"
            value={formData.social_handle || ''}
            onChange={(e) => setFormData({ ...formData, social_handle: e.target.value })}
            style={{ width: '70%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
          />
        </div>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Next Check-in Date</label>
        <input
          type="datetime-local"
          value={formData.next_check_in ? new Date(formData.next_check_in).toISOString().slice(0, 16) : ''}
          onChange={(e) => setFormData({ ...formData, next_check_in: e.target.value ? new Date(e.target.value).toISOString() : '' })}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
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
      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <input
          type="checkbox"
          id="is_prospective_edit"
          checked={!!formData.is_prospective}
          onChange={(e) => setFormData({ ...formData, is_prospective: e.target.checked ? 1 : 0 })}
          style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
        />
        <label htmlFor="is_prospective_edit" style={{ color: '#e5e7eb', cursor: 'pointer' }}>
          Prospective Contact
        </label>
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

function AddInteractionModal({ contactId: _contactId, onClose, onSave }: { contactId: number; onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ type: 'Email', content: '' });
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
            <option value="Meeting">Meeting</option>
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

function AddContactModal({
  companies,
  onClose,
  onSave
}: {
  companies: CompanyOption[];
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    email: '',
    phone: '',
    linkedin_url: '',
    social_platform: '',
    social_handle: '',
    notes: '',
    company_id: '',
    is_prospective: 0
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: formData.name,
      role: formData.role || null,
      email: formData.email || null,
      phone: formData.phone || null,
      linkedin_url: formData.linkedin_url || null,
      social_platform: formData.social_platform || null,
      social_handle: formData.social_handle || null,
      notes: formData.notes || null,
      company_id: formData.company_id ? Number(formData.company_id) : null,
      is_prospective: formData.is_prospective
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
          padding: '2rem',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '500px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Add Contact</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Name *"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          />
          <input
            type="text"
            placeholder="Role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          />
          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          />
          <input
            type="url"
            placeholder="LinkedIn URL"
            value={formData.linkedin_url}
            onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <select
              value={formData.social_platform}
              onChange={(e) => setFormData({ ...formData, social_platform: e.target.value })}
              style={{
                width: '30%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            >
              <option value="">Platform</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Twitter">Twitter</option>
              <option value="Facebook">Facebook</option>
              <option value="Discord">Discord</option>
              <option value="GitHub">GitHub</option>
              <option value="Other">Other</option>
            </select>
            <input
              type="text"
              placeholder="Username / Handle / Link"
              value={formData.social_handle}
              onChange={(e) => setFormData({ ...formData, social_handle: e.target.value })}
              style={{
                width: '70%',
                padding: '0.75rem',
                backgroundColor: '#0f1115',
                border: '1px solid #2d3139',
                borderRadius: '6px',
                color: '#e5e7eb'
              }}
            />
          </div>
          <select
            value={formData.company_id}
            onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb'
            }}
          >
            <option value="">No company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#0f1115',
              border: '1px solid #2d3139',
              borderRadius: '6px',
              color: '#e5e7eb',
              minHeight: '80px'
            }}
          />
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="checkbox"
              id="is_prospective_add"
              checked={!!formData.is_prospective}
              onChange={(e) => setFormData({ ...formData, is_prospective: e.target.checked ? 1 : 0 })}
              style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
            />
            <label htmlFor="is_prospective_add" style={{ color: '#e5e7eb', cursor: 'pointer' }}>
              Prospective Contact
            </label>
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
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
        <p style={{ color: '#e5e7eb', marginTop: '0.25rem' }}>{reminder.message}</p>
      </div>
    </div>
  );
}

function AddReminderModal({ contactId, onClose, onSave }: { contactId: number; onClose: () => void; onSave: (data: any) => void }) {
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [notifyDesktop, setNotifyDesktop] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [followUpTimeZone, setFollowUpTimeZone] = useState<string>(getDefaultTimeZone());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpAt || !followUpMessage.trim()) {
      alert('Please provide a date and message.');
      return;
    }
    const dueIso = toUtcIsoFromLocal(followUpAt, followUpTimeZone) || new Date(followUpAt).toISOString();
    onSave({
      contact_id: contactId,
      due_at: dueIso,
      message: followUpMessage,
      notify_desktop: notifyDesktop,
      notify_email: notifyEmail
    });
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: '#1a1d24', padding: '2rem', borderRadius: '8px', width: '90%', maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>Add Reminder</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
              <input
                type="datetime-local"
                required
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                className="dark-datetime"
                style={{ flex: 1, padding: '0.75rem' }}
              />
              <select
                value={followUpTimeZone}
                onChange={(e) => setFollowUpTimeZone(e.target.value)}
                style={{ padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>{tz.label}</option>
                ))}
              </select>
            </div>

            <label style={{ color: '#e5e7eb', fontSize: '0.9rem', marginTop: '0.5rem' }}>Message / Note</label>
            <input
              type="text"
              required
              value={followUpMessage}
              onChange={(e) => setFollowUpMessage(e.target.value)}
              placeholder="e.g. Catch up over coffee"
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

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}>Add Reminder</button>
          </div>
        </form>
      </div>
    </div>
  );
}

