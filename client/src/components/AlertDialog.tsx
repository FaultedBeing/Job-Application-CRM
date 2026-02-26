
interface AlertDialogProps {
    open: boolean;
    title: string;
    message: string;
    onClose: () => void;
}

export default function AlertDialog({ open, title, message, onClose }: AlertDialogProps) {
    if (!open) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: '#1a1d24',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    width: '90%',
                    maxWidth: '420px',
                    border: '1px solid #2d3139',
                    boxShadow: '0 20px 45px rgba(0,0,0,0.6)'
                }}
            >
                <h2 style={{ fontSize: '1.1rem', color: '#fbbf24', marginBottom: '0.75rem' }}>{title}</h2>
                <p style={{ color: '#e5e7eb', fontSize: '0.95rem', marginBottom: '1.25rem', whiteSpace: 'pre-wrap' }}>
                    {message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#fbbf24',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#0f1115',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 600
                        }}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
