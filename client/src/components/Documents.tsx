import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Upload, Trash2, FileText, Building2, Briefcase, FolderOpen, Pencil, Check, X } from 'lucide-react';

interface Document {
  id: number;
  job_id: number | null;
  filename: string;
  path: string;
  type: string;
  created_at: string;
  job_title?: string;
  company_id?: number;
  company_name?: string;
}

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const res = await api.get('/documents');
      setDocuments(res.data);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  }

  async function handleUploadGeneral(file: File, type: string) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      await api.post('/documents/general', formData);
      setShowUpload(false);
      loadDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      // Try to surface the server error message if available
      const anyErr = error as any;
      const serverMessage = anyErr?.response?.data?.error || anyErr?.message || 'Unknown error';
      alert(`There was a problem uploading that file:\n\n${serverMessage}`);
    }
  }

  async function handleDelete(docId: number) {
    if (!confirm('Delete this document?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  }

  function startEditing(doc: Document) {
    setEditingDocId(doc.id);
    setEditName(doc.filename);
    setEditType(doc.type);
  }

  function cancelEditing() {
    setEditingDocId(null);
    setEditName('');
    setEditType('');
  }

  async function handleSaveEdit(docId: number) {
    if (!editName.trim()) return;
    try {
      await api.put(`/documents/${docId}`, { filename: editName.trim(), type: editType });
      setEditingDocId(null);
      loadDocuments();
    } catch (error) {
      console.error('Error renaming document:', error);
    }
  }

  function getDownloadFilename(doc: Document) {
    // Extract the actual stored filename from the full path
    const parts = doc.path.split(/[\\/]/);
    return parts[parts.length - 1];
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Split documents into general (no job) and job-linked
  const generalDocs = documents.filter(d => !d.job_id);
  const jobDocs = documents.filter(d => d.job_id);

  // Group job docs by company
  const docsByCompany = new Map<string, Document[]>();
  jobDocs.forEach(doc => {
    const companyKey = doc.company_name || 'Unlinked';
    if (!docsByCompany.has(companyKey)) {
      docsByCompany.set(companyKey, []);
    }
    docsByCompany.get(companyKey)!.push(doc);
  });

  // Sort company names alphabetically
  const sortedCompanies = Array.from(docsByCompany.keys()).sort((a, b) => {
    if (a === 'Unlinked') return 1;
    if (b === 'Unlinked') return -1;
    return a.localeCompare(b);
  });

  const typeColors: Record<string, string> = {
    'Resume': '#3b82f6',
    'Cover Letter': '#8b5cf6',
    'Portfolio': '#f59e0b',
    'Other': '#6b7280'
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fbbf24' }}>Documents</h1>
      </div>

      {/* General Documents Section */}
      <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FolderOpen size={22} style={{ color: '#fbbf24' }} />
            <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>General Documents</h2>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#fbbf24',
              border: 'none',
              borderRadius: '6px',
              color: '#0f1115',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            <Upload size={16} />
            Upload
          </button>
        </div>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Resumes, cover letters, and other general documents not tied to a specific job.
        </p>
        {generalDocs.length === 0 ? (
          <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>No general documents yet. Upload your resume or cover letter to get started.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {generalDocs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#0f1115',
                  borderRadius: '6px',
                  border: '1px solid #2d3139'
                }}
              >
                {editingDocId === doc.id ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <FileText size={18} style={{ color: '#6b7280', flexShrink: 0 }} />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(doc.id); if (e.key === 'Escape') cancelEditing(); }}
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
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
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
                      <button onClick={() => handleSaveEdit(doc.id)} title="Save" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer' }}><Check size={16} /></button>
                      <button onClick={cancelEditing} title="Cancel" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <FileText size={18} style={{ color: typeColors[doc.type] || '#6b7280', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <a
                          href={`/uploads/${getDownloadFilename(doc)}`}
                          target="_blank"
                          style={{ color: '#3b82f6', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {doc.filename}
                        </a>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            color: typeColors[doc.type] || '#6b7280',
                            backgroundColor: `${typeColors[doc.type] || '#6b7280'}15`,
                            padding: '1px 8px',
                            borderRadius: '4px',
                            fontWeight: 500
                          }}>
                            {doc.type}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatDate(doc.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button onClick={() => startEditing(doc)} title="Rename" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(doc.id)} title="Delete document" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Documents Section - Grouped by Company */}
      <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Briefcase size={22} style={{ color: '#3b82f6' }} />
          <h2 style={{ fontSize: '1.25rem', color: '#e5e7eb' }}>Job Documents</h2>
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>({jobDocs.length})</span>
        </div>

        {jobDocs.length === 0 ? (
          <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>No job-specific documents yet. Upload documents from individual job pages.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {sortedCompanies.map((companyName) => {
              const companyDocs = docsByCompany.get(companyName)!;
              const companyId = companyDocs[0]?.company_id;
              return (
                <div key={companyName}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Building2 size={16} style={{ color: '#9ca3af' }} />
                    {companyId ? (
                      <Link to={`/company/${companyId}`} style={{ color: '#fbbf24', textDecoration: 'none', fontWeight: 600, fontSize: '1rem' }}>
                        {companyName}
                      </Link>
                    ) : (
                      <span style={{ color: '#9ca3af', fontWeight: 600, fontSize: '1rem' }}>{companyName}</span>
                    )}
                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({companyDocs.length})</span>
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem', paddingLeft: '1.5rem' }}>
                    {companyDocs.map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.75rem 1rem',
                          backgroundColor: '#0f1115',
                          borderRadius: '6px',
                          border: '1px solid #2d3139'
                        }}
                      >
                        {editingDocId === doc.id ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                              <FileText size={18} style={{ color: '#6b7280', flexShrink: 0 }} />
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(doc.id); if (e.key === 'Escape') cancelEditing(); }}
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
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
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
                              <button onClick={() => handleSaveEdit(doc.id)} title="Save" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer' }}><Check size={16} /></button>
                              <button onClick={cancelEditing} title="Cancel" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><X size={16} /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                              <FileText size={18} style={{ color: typeColors[doc.type] || '#6b7280', flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <a
                                  href={`/uploads/${getDownloadFilename(doc)}`}
                                  target="_blank"
                                  style={{ color: '#3b82f6', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {doc.filename}
                                </a>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '2px' }}>
                                  <span style={{
                                    fontSize: '0.75rem',
                                    color: typeColors[doc.type] || '#6b7280',
                                    backgroundColor: `${typeColors[doc.type] || '#6b7280'}15`,
                                    padding: '1px 8px',
                                    borderRadius: '4px',
                                    fontWeight: 500
                                  }}>
                                    {doc.type}
                                  </span>
                                  {doc.job_title && (
                                    <Link
                                      to={`/job/${doc.job_id}`}
                                      style={{ fontSize: '0.75rem', color: '#9ca3af', textDecoration: 'none' }}
                                    >
                                      {doc.job_title}
                                    </Link>
                                  )}
                                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatDate(doc.created_at)}</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                              <button onClick={() => startEditing(doc)} title="Rename" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}><Pencil size={14} /></button>
                              <button onClick={() => handleDelete(doc.id)} title="Delete document" style={{ padding: '0.25rem', backgroundColor: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUpload={handleUploadGeneral}
        />
      )}
    </div>
  );
}

function UploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (file: File, type: string) => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('Resume');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFile) {
      onUpload(selectedFile, docType);
    }
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
          maxWidth: '460px',
          border: '1px solid #2d3139'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fbbf24' }}>
          Upload General Document
        </h2>
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
  );
}
