import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Plus, Edit, Calendar, Trash2, Search, Bell, Upload } from 'lucide-react';
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
  company_name: string;
  company_logo_url?: string;
  company_dark_logo_bg?: boolean;
  notes?: string;
  next_check_in?: string;
  last_interaction?: string;
  nearest_reminder?: string;
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
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'company' | 'no_company'>('recent');
  const [showAddContact, setShowAddContact] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const [importing, setImporting] = useState(false);


  useEffect(() => {
    if (id) {
      loadContactDetail();
    } else {
      loadContactsAndCompanies();
    }
  }, [id]);

  async function loadContactsAndCompanies() {
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
    }
  }

  async function loadContactDetail() {
    try {
      const [contactRes, interactionsRes, remindersRes] = await Promise.all([
        api.get(`/contacts/${id}`),
        api.get(`/contacts/${id}/interactions`),
        api.get(`/contacts/${id}/reminders`)
      ]);
      setSelectedContact(contactRes.data);
      setNotesDraft(contactRes.data.notes || '');
      setInteractions(Array.isArray(interactionsRes.data) ? interactionsRes.data : []);
      setReminders(Array.isArray(remindersRes.data) ? remindersRes.data : []);
    } catch (error) {
      console.error('Error loading contact:', error);
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

  // If viewing a specific contact detail
  if (id && selectedContact) {
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
                <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fbbf24' }}>{selectedContact.name}</h1>
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
                        {selectedContact.phone}
                      </a>
                    </div>
                  )}
                  {selectedContact.linkedin_url && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>LinkedIn</label>
                      <a
                        href={selectedContact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6', display: 'block', marginTop: '0.25rem' }}
                      >
                        View Profile
                      </a>
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

  // List view
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#fbbf24' }}>Contacts</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            id="contact-import-input"
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
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
            onClick={() => setShowAddContact(true)}
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
            Add Contact
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '10px', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search contacts by name, role, or company..."
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
        <div>
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
              minWidth: '220px'
            }}
          >
            <option value="recent">Sort by Recent Activity</option>
            <option value="name">Sort by Name (A–Z)</option>
            <option value="company">Sort by Company (A–Z)</option>
            <option value="no_company">No Company First</option>
          </select>
        </div>
      </div>

      {(() => {
        const q = searchTerm.trim().toLowerCase();
        const filtered = q
          ? contacts.filter((c) =>
            c.name.toLowerCase().includes(q) ||
            (c.role || '').toLowerCase().includes(q) ||
            (c.company_name || '').toLowerCase().includes(q)
          )
          : contacts;

        const sortedContacts = [...filtered].sort((a, b) => {
          if (sortBy === 'name') {
            return a.name.localeCompare(b.name);
          }
          if (sortBy === 'company') {
            return (a.company_name || '').localeCompare(b.company_name || '');
          }
          if (sortBy === 'no_company') {
            const aHas = !!a.company_name;
            const bHas = !!b.company_name;
            if (aHas === bHas) {
              const aTime = a.last_interaction ? new Date(a.last_interaction).getTime() : 0;
              const bTime = b.last_interaction ? new Date(b.last_interaction).getTime() : 0;
              return bTime - aTime;
            }
            return aHas ? 1 : -1; // no company first
          }
          // recent
          const aTime = a.last_interaction ? new Date(a.last_interaction).getTime() : 0;
          const bTime = b.last_interaction ? new Date(b.last_interaction).getTime() : 0;
          return bTime - aTime;
        });

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {sortedContacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => navigate(`/contacts/${contact.id}`)}
                style={{
                  padding: '1.5rem',
                  backgroundColor: '#1a1d24',
                  borderRadius: '8px',
                  border: '1px solid #2d3139',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem'
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
                <div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#e5e7eb' }}>
                    {contact.name}
                  </h3>
                  {contact.role && (
                    <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>{contact.role}</p>
                  )}
                  {contact.company_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {contact.company_logo_url && (
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            padding: '2px',
                            backgroundColor: contact.company_dark_logo_bg ? '#e5e7eb' : '#0f1115',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #2d3139',
                            flexShrink: 0
                          }}
                        >
                          <img
                            src={contact.company_logo_url}
                            alt={`${contact.company_name} logo`}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              debugLog(`Failed to load company logo: ${(e.target as HTMLImageElement).src}`);
                            }}
                          />
                        </div>
                      )}
                      <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
                        {contact.company_name}
                      </p>
                    </div>
                  )}
                  {contact.email && (
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      {contact.email}
                    </p>
                  )}
                  {contact.phone && (
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{contact.phone}</p>
                  )}
                  {contact.next_check_in && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontSize: '0.875rem' }}>
                      <Calendar size={16} />
                      Check-in: {new Date(contact.next_check_in).toLocaleDateString()}
                    </div>
                  )}
                  {contact.nearest_reminder && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontSize: '0.875rem' }}>
                      <Bell size={16} />
                      Reminder: {new Date(contact.nearest_reminder).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteContact(contact.id);
                  }}
                  style={{
                    alignSelf: 'flex-end',
                    padding: '0.25rem 0.5rem',
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
        );
      })()}

      {contacts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          No contacts yet. Add contacts from job detail pages or company pages.
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
            } catch (error) {
              console.error('Error adding contact:', error);
              setAlertMsg({ title: 'Error', message: 'Error adding contact' });
            }
          }}
        />
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
    notes: '',
    company_id: ''
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: formData.name,
      role: formData.role || null,
      email: formData.email || null,
      phone: formData.phone || null,
      linkedin_url: formData.linkedin_url || null,
      notes: formData.notes || null,
      company_id: formData.company_id ? Number(formData.company_id) : null
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
