import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Plus, Edit, Calendar, Trash2 } from 'lucide-react';

interface Contact {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  company_name: string;
  notes?: string;
  next_check_in?: string;
  last_interaction?: string;
}

interface CompanyOption {
  id: number;
  name: string;
}

interface Interaction {
  id: number;
  type: string;
  content: string;
  date: string;
}

export default function Contacts() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [editing, setEditing] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'company' | 'no_company'>('recent');
  const [showAddContact, setShowAddContact] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

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
      const [contactRes, interactionsRes] = await Promise.all([
        api.get(`/contacts/${id}`),
        api.get(`/contacts/${id}/interactions`)
      ]);
      setSelectedContact(contactRes.data);
      setNotesDraft(contactRes.data.notes || '');
      setInteractions(interactionsRes.data);
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
      alert('Error updating contact');
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
      alert('Error saving notes');
      setNotesDraft(selectedContact.notes || '');
    }
  }

  async function handleDeleteContact(contactId: number) {
    if (!confirm('Delete this contact?')) return;
    try {
      await api.delete(`/contacts/${contactId}`);
      if (id) {
        navigate('/contacts');
      } else {
        loadContactsAndCompanies();
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Error deleting contact');
    }
  }

  // If viewing a specific contact detail
  if (id && selectedContact) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button
            onClick={() => navigate('/contacts')}
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
                  <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>{selectedContact.company_name}</p>
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
                      Add
                    </button>
                  </div>
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
                            borderLeft: '3px solid #fbbf24'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{interaction.type}</span>
                            <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                              {new Date(interaction.date).toLocaleDateString()}
                            </span>
                          </div>
                          <p style={{ color: '#e5e7eb' }}>{interaction.content}</p>
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
      </div>
    );
  }

  // List view
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#fbbf24' }}>Contacts</h1>
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
          <option value="company">Sort by Company (A–Z)</option>
          <option value="no_company">No Company First</option>
        </select>
      </div>

      {(() => {
        const sortedContacts = [...contacts].sort((a, b) => {
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
                <p style={{ color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                  {contact.company_name}
                </p>
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
              alert('Error adding contact');
            }
          }}
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formData);
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
          <textarea placeholder="Content" required value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '100px' }} />
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
