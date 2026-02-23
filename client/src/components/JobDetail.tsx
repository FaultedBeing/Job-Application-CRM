import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Edit, Plus, Upload, Trash2 } from 'lucide-react';

interface Job {
  id: number;
  title: string;
  company_name: string;
  company_id?: number;
  company?: {
    logo_url?: string;
  };
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
}

interface Interaction {
  id: number;
  job_id?: number;
  type: string;
  content: string;
  date: string;
  contact_name?: string;
}

interface Document {
  id: number;
  filename: string;
  type: string;
  created_at: string;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [jobNotes, setJobNotes] = useState('');

  useEffect(() => {
    if (id) {
      loadData();
      loadStatuses();
    }
  }, [id]);

  async function loadData() {
    try {
      const [jobRes, contactsRes, documentsRes] = await Promise.all([
        api.get(`/jobs/${id}`),
        api.get(`/jobs/${id}/contacts`),
        api.get(`/jobs/${id}/documents`)
      ]);

      setJob(jobRes.data);
      setJobNotes(jobRes.data.notes || '');
      setContacts(contactsRes.data);
      // Get all interactions and filter for this job
      const allInteractions = await api.get('/interactions');
      const filteredInteractions = allInteractions.data.filter((i: any) => i.job_id === parseInt(id!));
      setInteractions(filteredInteractions);
      setDocuments(documentsRes.data);
    } catch (error) {
      console.error('Error loading job:', error);
    }
  }

  async function loadStatuses() {
    try {
      const res = await api.get('/settings');
      const statusStr = res.data.statuses || 'Wishlist,Applied,Interviewing,Offer,Rejected';
      setStatuses(statusStr.split(','));
    } catch (error) {
      setStatuses(['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected']);
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
      alert('Error saving job');
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

  async function handleUploadDocument(file: File, type: string) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      await api.post(`/jobs/${id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      loadData();
    } catch (error) {
      console.error('Error uploading document:', error);
    }
  }

  async function handleDeleteDocument(docId: number) {
    if (!confirm('Delete this document?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      loadData();
    } catch (error) {
      console.error('Error deleting document:', error);
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
      alert('Error saving notes');
      setJobNotes(job.notes || '');
    }
  }

  async function handleDeleteJob() {
    if (!job) return;
    if (!confirm('Delete this job?')) return;

    try {
      await api.delete(`/jobs/${job.id}`);
      navigate('/applications');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Error deleting job');
    }
  }

  async function handleDeleteContact(contactId: number) {
    if (!confirm('Delete this contact?')) return;
    try {
      await api.delete(`/contacts/${contactId}`);
      loadData();
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Error deleting contact');
    }
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {job.company?.logo_url && (
                <img
                  src={job.company.logo_url}
                  alt={`${job.company_name} logo`}
                  style={{
                    width: '50px',
                    height: '50px',
                    objectFit: 'contain',
                    backgroundColor: '#0f1115',
                    padding: '6px',
                    borderRadius: '6px'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fbbf24' }}>{job.title}</h1>
                <p style={{ fontSize: '1.25rem', color: '#9ca3af' }}>{job.company_name}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
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
                  <label style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Scores</label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <span style={{ color: '#fbbf24' }}>★ Excitement: {job.excitement_score}</span>
                    <span style={{ color: '#34d399' }}>● Fit: {job.fit_score}</span>
                  </div>
                </div>
                {job.link && (
                  <div style={{ marginBottom: '1rem' }}>
                    <a href={job.link} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                      View Job Posting
                    </a>
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
                        {interaction.contact_name && (
                          <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                            With: {interaction.contact_name}
                          </p>
                        )}
                        <p style={{ color: '#e5e7eb' }}>{interaction.content}</p>
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
                          <p style={{ color: '#e5e7eb', fontWeight: 'bold' }}>{contact.name}</p>
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
                        <div>
                          <a
                            href={`/uploads/${doc.filename}`}
                            target="_blank"
                            style={{ color: '#3b82f6', textDecoration: 'none' }}
                          >
                            {doc.filename}
                          </a>
                          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{doc.type}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          style={{
                            padding: '0.25rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
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
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Job Link</label>
        <input
          type="url"
          value={formData.link || ''}
          onChange={(e) => setFormData({ ...formData, link: e.target.value })}
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const type = prompt('Document type (Resume, Cover Letter, Other):') || 'Other';
      onUpload(file, type);
      setShowModal(false);
    }
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div style={{ backgroundColor: '#1a1d24', padding: '2rem', borderRadius: '8px' }} onClick={(e) => e.stopPropagation()}>
            <input type="file" onChange={handleFileSelect} style={{ color: '#e5e7eb' }} />
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...formData, contact_id: formData.contact_id ? parseInt(formData.contact_id) : null });
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
          <select value={formData.contact_id} onChange={(e) => setFormData({ ...formData, contact_id: e.target.value })} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}>
            <option value="">No contact</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
