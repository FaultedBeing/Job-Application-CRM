import { useEffect, useState, useRef } from 'react';
import { debugLogger } from '../utils/debugLogger';
import { X, Trash2 } from 'lucide-react';

export default function DebugConsole() {
    const [isVisible, setIsVisible] = useState(localStorage.getItem('debug_mode') === 'true');
    const [logs, setLogs] = useState(debugLogger.getLogs());
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Listen for localStorage changes (e.g. from Settings)
        const handleStorageChange = () => {
            setIsVisible(localStorage.getItem('debug_mode') === 'true');
        };

        // Custom event for same-window updates
        const handleDebugModeToggle = () => {
            setIsVisible(localStorage.getItem('debug_mode') === 'true');
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('debug_mode_changed', handleDebugModeToggle);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('debug_mode_changed', handleDebugModeToggle);
        };
    }, []);

    useEffect(() => {
        if (!isVisible) return;

        const unsubscribe = debugLogger.subscribe(() => {
            setLogs([...debugLogger.getLogs()]);
        });

        // Check initial logs on mount
        setLogs([...debugLogger.getLogs()]);

        return unsubscribe;
    }, [isVisible]);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    if (!isVisible) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: '20px',
                left: '20px',
                width: '400px',
                maxHeight: '300px',
                backgroundColor: 'rgba(15, 17, 21, 0.95)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                backdropFilter: 'blur(4px)'
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.85rem'
                }}
            >
                <span>Debug Console</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => debugLogger.clear()}
                        title="Clear Logs"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px'
                        }}
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        onClick={() => {
                            localStorage.removeItem('debug_mode');
                            setIsVisible(false);
                            window.dispatchEvent(new Event('debug_mode_changed'));
                        }}
                        title="Close Debug Mode"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px'
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div
                style={{
                    padding: '12px',
                    overflowY: 'auto',
                    flex: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: '#e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}
            >
                {logs.length === 0 ? (
                    <span style={{ color: '#6b7280', fontStyle: 'italic' }}>No errors captured yet...</span>
                ) : (
                    logs.map(log => (
                        <div key={log.id} style={{ borderBottom: '1px solid #2d3139', paddingBottom: '4px' }}>
                            <span style={{ color: '#9ca3af', marginRight: '8px' }}>
                                [{log.timestamp.toLocaleTimeString()}]
                            </span>
                            <span style={{ color: '#fca5a5' }}>{log.message}</span>
                        </div>
                    ))
                )}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
}
