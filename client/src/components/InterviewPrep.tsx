import { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, Edit, Trash, Save, X } from 'lucide-react';
import api from '../api';

interface InterviewQuestion {
    id: number;
    type: string;
    question: string;
    answer: string | null;
    created_at: string;
    updated_at: string;
}

export default function InterviewPrep() {
    const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
    const [activeTab, setActiveTab] = useState<'technical' | 'non-technical'>('technical');
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

    // Form State for new/editing questions
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({ question: '', answer: '' });

    const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, field: 'question' | 'answer') => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const target = e.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;

            if (start !== null && end !== null) {
                const newValue = formData[field].substring(0, start) + '\t' + formData[field].substring(end);
                setFormData({ ...formData, [field]: newValue });

                setTimeout(() => {
                    target.selectionStart = target.selectionEnd = start + 1;
                }, 0);
            }
        }
    };

    useEffect(() => {
        fetchQuestions();
    }, []);

    const fetchQuestions = async () => {
        try {
            const response = await api.get('/interview-questions');
            if (Array.isArray(response.data)) {
                setQuestions(response.data);
            } else {
                console.error('Expected array from API, got:', response.data);
                setQuestions([]);
            }
        } catch (error) {
            console.error('Error fetching questions:', error);
            setQuestions([]);
        }
    };

    const toggleExpand = (id: number) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedIds(newExpanded);
    };

    const handleSave = async () => {
        if (!formData.question.trim()) {
            alert('Question text is required.');
            return;
        }

        try {
            const payload = {
                type: activeTab,
                question: formData.question,
                answer: formData.answer
            };
            console.log('Sending payload:', payload);

            if (editingId) {
                await api.put(`/interview-questions/${editingId}`, payload);
            } else {
                await api.post('/interview-questions', payload);
            }

            setFormData({ question: '', answer: '' });
            setIsAdding(false);
            setEditingId(null);
            fetchQuestions();
        } catch (error: any) {
            console.error('Error saving question:', error);
            alert(`Failed to save question: ${error.response?.data?.error || error.message}`);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this question?')) return;
        try {
            await api.delete(`/interview-questions/${id}`);
            fetchQuestions();
        } catch (error) {
            console.error('Error deleting question:', error);
        }
    };

    const startEdit = (q: InterviewQuestion) => {
        setEditingId(q.id);
        setFormData({ question: q.question, answer: q.answer || '' });
        setIsAdding(true);
        // Ensure the item is expanded so we see the edit form clearly
        if (!expandedIds.has(q.id)) {
            toggleExpand(q.id);
        }
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setEditingId(null);
        setFormData({ question: '', answer: '' });
    };

    const filteredQuestions = questions.filter(q => q.type === activeTab);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', color: '#fbbf24', margin: 0 }}>Interview Prep</h1>
                <button
                    onClick={() => {
                        setIsAdding(true);
                        setEditingId(null);
                        setFormData({ question: '', answer: '' });
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', color: '#0f1115',
                        border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
                    }}
                >
                    <Plus size={20} />
                    Add Question
                </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #2d3139' }}>
                {(['technical', 'non-technical'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => {
                            setActiveTab(tab);
                            setIsAdding(false);
                            setEditingId(null);
                        }}
                        style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab ? '2px solid #fbbf24' : '2px solid transparent',
                            color: activeTab === tab ? '#fbbf24' : '#9ca3af',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab ? 600 : 400,
                            fontSize: '1rem',
                            textTransform: 'capitalize',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.replace('-', ' ')}
                    </button>
                ))}
            </div>

            {isAdding && !editingId && (
                <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem', border: '1px solid #2d3139' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#e5e7eb', fontSize: '1.25rem' }}>
                        New {activeTab.replace('-', ' ')} Question
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Question</label>
                            <input
                                type="text"
                                placeholder="e.g. Can you explain the React lifecycle?"
                                value={formData.question}
                                onChange={e => setFormData({ ...formData, question: e.target.value })}
                                onKeyDown={e => handleTab(e, 'question')}
                                style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Answer / Notes (Bulleted list recommended)</label>
                            <textarea
                                placeholder="- Detail 1&#10;- Detail 2"
                                value={formData.answer}
                                onChange={e => setFormData({ ...formData, answer: e.target.value })}
                                onKeyDown={e => handleTab(e, 'answer')}
                                style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '150px', fontFamily: 'inherit' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                            <button
                                onClick={cancelEdit}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}
                            >
                                <X size={20} />
                                Cancel
                            </button>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleSave();
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', color: '#0f1115',
                                    border: 'none', borderRadius: '6px', fontWeight: 'bold',
                                    cursor: !formData.question.trim() ? 'not-allowed' : 'pointer',
                                    opacity: !formData.question.trim() ? 0.6 : 1
                                }}
                                disabled={!formData.question.trim()}
                            >
                                <Save size={20} />
                                Save Question
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredQuestions.length === 0 && !isAdding ? (
                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#1a1d24', borderRadius: '8px', color: '#9ca3af', border: '1px dashed #2d3139' }}>
                        No questions added yet. Click "Add Question" to start preparing!
                    </div>
                ) : (
                    filteredQuestions.map(q => {
                        const isExpanded = expandedIds.has(q.id);
                        const isEditing = editingId === q.id;

                        return (
                            <div key={q.id} style={{ backgroundColor: '#1a1d24', borderRadius: '8px', border: '1px solid #2d3139', overflow: 'hidden' }}>
                                <div
                                    style={{
                                        padding: '1rem 1.5rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        backgroundColor: isExpanded ? '#0f1115' : 'transparent',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onClick={() => !isEditing && toggleExpand(q.id)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                        {isExpanded ? <ChevronUp size={24} color="#fbbf24" /> : <ChevronDown size={24} color="#9ca3af" />}
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: isExpanded ? '#fbbf24' : '#e5e7eb' }}>
                                            {q.question}
                                        </h3>
                                    </div>

                                    {!isEditing && (
                                        <div style={{ display: 'flex', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => startEdit(q)}
                                                title="Edit Question"
                                                style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', borderRadius: '4px' }}
                                                onMouseEnter={e => e.currentTarget.style.color = '#fbbf24'}
                                                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(q.id)}
                                                title="Delete Question"
                                                style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', borderRadius: '4px' }}
                                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                                            >
                                                <Trash size={18} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {isExpanded && (
                                    <div style={{ padding: '1.5rem', borderTop: '1px solid #2d3139', backgroundColor: '#1a1d24' }}>
                                        {isEditing ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Question</label>
                                                    <input
                                                        type="text"
                                                        value={formData.question}
                                                        onChange={e => setFormData({ ...formData, question: e.target.value })}
                                                        onKeyDown={e => handleTab(e, 'question')}
                                                        style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Answer / Notes (Bulleted list recommended)</label>
                                                    <textarea
                                                        value={formData.answer}
                                                        onChange={e => setFormData({ ...formData, answer: e.target.value })}
                                                        onKeyDown={e => handleTab(e, 'answer')}
                                                        style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', minHeight: '150px', fontFamily: 'inherit' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                                    <button
                                                        onClick={cancelEdit}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}
                                                    >
                                                        <X size={20} />
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            handleSave();
                                                        }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                            padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', color: '#0f1115',
                                                            border: 'none', borderRadius: '6px', fontWeight: 'bold',
                                                            cursor: !formData.question.trim() ? 'not-allowed' : 'pointer',
                                                            opacity: !formData.question.trim() ? 0.6 : 1
                                                        }}
                                                        disabled={!formData.question.trim()}
                                                    >
                                                        <Save size={20} />
                                                        Save Changes
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ color: '#d1d5db', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                                {q.answer || <span style={{ color: '#6b7280', fontStyle: 'italic' }}>No answer or notes added yet. Click edit to add content.</span>}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
