import React, { useState, useEffect } from 'react';
import {
    Cloud,
    Key,
    UserPlus,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    ChevronLeft,
    Server,
    ShieldCheck,
    Zap,
    Download
} from 'lucide-react';

interface CloudSetupWizardProps {
    onComplete: () => void;
}

type Step = 'welcome' | 'path-selection' | 'admin-supabase' | 'joiner-auth' | 'migration' | 'serverless-guide' | 'finalizing';

const CloudSetupWizard: React.FC<CloudSetupWizardProps> = ({ onComplete }) => {
    const [step, setStep] = useState<Step>('welcome');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localCount, setLocalCount] = useState(0);

    // Admin Form State
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');

    // Joiner Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        // Clear error when switching steps
        setError(null);
    }, [step]);

    const checkLocalData = async () => {
        try {
            const res = await fetch('/api/sync/local-count');
            const data = await res.json();
            setLocalCount(data.count);
            if (data.count > 0) {
                setStep('migration');
            } else {
                setStep('serverless-guide');
            }
        } catch (err) {
            setStep('serverless-guide');
        }
    };

    const handleSaveAdminConfig = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': 'admin'
                },
                body: JSON.stringify({
                    supabase_url: supabaseUrl.trim(),
                    supabase_key: supabaseKey.trim(),
                    cloud_mode: 'admin'
                }),
            });

            if (!response.ok) throw new Error('Failed to save configuration');

            localStorage.setItem('cloud_user_id', 'admin');

            // Trigger sync engine re-init
            await fetch('/api/sync/trigger', {
                method: 'POST',
                headers: { 'X-User-Id': 'admin' }
            });

            await checkLocalData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleJoinerAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            localStorage.setItem('cloud_user_id', email);

            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': email
                },
                body: JSON.stringify({
                    cloud_mode: 'joiner'
                }),
            });

            if (!response.ok) throw new Error('Authentication failed');

            await checkLocalData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMigrate = async () => {
        setLoading(true);
        const userId = localStorage.getItem('cloud_user_id') || 'admin';
        try {
            await fetch('/api/sync/migrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': userId
                },
                body: JSON.stringify({ userId })
            });
            setStep('serverless-guide');
        } catch (err) {
            setError('Migration failed, but you can retry later in Settings.');
            setStep('serverless-guide');
        } finally {
            setLoading(false);
        }
    };


    // --- Styles ---
    const colors = {
        bg: '#0f1115',
        card: '#1a1d24',
        border: '#2d3139',
        amber: '#fbbf24',
        text: '#e5e7eb',
        muted: '#9ca3af',
        error: '#ef4444'
    };

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: colors.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    };

    const cardStyle: React.CSSProperties = {
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '16px',
        padding: '3rem',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        position: 'relative',
        overflowY: 'auto'
    };

    const buttonStyle: React.CSSProperties = {
        backgroundColor: colors.amber,
        color: '#000',
        border: 'none',
        borderRadius: '8px',
        padding: '0.75rem 1.5rem',
        fontWeight: 'bold',
        fontSize: '1rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        transition: 'all 0.2s'
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        backgroundColor: '#0f1115',
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        color: colors.text,
        fontSize: '1rem',
        outline: 'none'
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '0.75rem',
        fontWeight: 'bold',
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '0.5rem'
    };

    const renderStep = () => {
        switch (step) {
            case 'welcome':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ padding: '1.5rem', backgroundColor: '#fbbf2415', borderRadius: '50%', color: colors.amber }}>
                                <Cloud size={64} />
                            </div>
                        </div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem' }}>
                            Job CRM <span style={{ color: colors.amber }}>Cloud</span>
                        </h1>
                        <p style={{ color: colors.muted, lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: '400px', margin: '0 auto 2.5rem' }}>
                            Synchronize your applications across devices and take your search to the next level.
                        </p>
                        <button
                            style={{ ...buttonStyle, margin: '0 auto' }}
                            onClick={() => setStep('path-selection')}
                        >
                            Get Started <ChevronRight size={20} />
                        </button>
                    </div>
                );

            case 'path-selection':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '1rem' }}>Choose Your Role</h2>

                        <div
                            style={{
                                padding: '1.5rem',
                                backgroundColor: '#0f1115',
                                border: `1px solid ${colors.border}`,
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onClick={() => setStep('admin-supabase')}
                        >
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ color: colors.amber }}><ShieldCheck size={28} /></div>
                                <div>
                                    <h3 style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>The Architect</h3>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: colors.muted }}>Setting up a new cloud workspace with my own Supabase credentials.</p>
                                </div>
                                <div style={{ marginLeft: 'auto', color: colors.muted }}><ChevronRight /></div>
                            </div>
                        </div>

                        <div
                            style={{
                                padding: '1.5rem',
                                backgroundColor: '#0f1115',
                                border: `1px solid ${colors.border}`,
                                borderRadius: '12px',
                                cursor: 'pointer'
                            }}
                            onClick={() => setStep('joiner-auth')}
                        >
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ color: '#10b981' }}><UserPlus size={28} /></div>
                                <div>
                                    <h3 style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>The Joiner</h3>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: colors.muted }}>Invited to an existing workspace. I have an account ready.</p>
                                </div>
                                <div style={{ marginLeft: 'auto', color: colors.muted }}><ChevronRight /></div>
                            </div>
                        </div>

                        <button
                            onClick={() => setStep('welcome')}
                            style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        >
                            <ChevronLeft size={16} /> Welcome Screen
                        </button>
                    </div>
                );

            case 'admin-supabase':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Supabase Config</h2>
                        <p style={{ color: colors.muted, fontSize: '0.9rem', margin: 0 }}>Enter your Supabase URL and API Key from your project dashboard.</p>

                        <div>
                            <label style={labelStyle}>Project URL</label>
                            <input
                                style={inputStyle}
                                value={supabaseUrl}
                                onChange={(e) => setSupabaseUrl(e.target.value)}
                                placeholder="https://your-project.supabase.co"
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>Anon / Public Key</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    style={{ ...inputStyle, paddingRight: '3rem' }}
                                    type="password"
                                    value={supabaseKey}
                                    onChange={(e) => setSupabaseKey(e.target.value)}
                                    placeholder="eyJhbGciOiJIUzI1NiIs..."
                                />
                                <Key size={18} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: colors.border }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                            <button onClick={() => setStep('path-selection')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer' }}>Back</button>
                            <button
                                onClick={handleSaveAdminConfig}
                                disabled={loading || !supabaseUrl || !supabaseKey}
                                style={{ ...buttonStyle, opacity: (loading || !supabaseUrl || !supabaseKey) ? 0.6 : 1 }}
                            >
                                {loading ? 'Saving...' : 'Next Step'} <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                );

            case 'joiner-auth':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Cloud Login</h2>

                        <div>
                            <label style={labelStyle}>Email Address</label>
                            <input
                                style={inputStyle}
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>Password</label>
                            <input
                                style={inputStyle}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            onClick={handleJoinerAuth}
                            disabled={loading || !email || !password}
                            style={{ ...buttonStyle, width: '100%', justifyContent: 'center', marginTop: '1rem', opacity: (loading || !email || !password) ? 0.6 : 1 }}
                        >
                            {loading ? 'Authenticating...' : 'Sign In'}
                        </button>

                        <button onClick={() => setStep('path-selection')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', margin: '0 auto' }}>Go Back</button>
                    </div>
                );

            case 'migration':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '1.5rem', color: colors.amber }}><Server size={48} style={{ margin: '0 auto' }} /></div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Migrate Local Data?</h2>
                        <p style={{ color: colors.muted, lineHeight: 1.6, marginBottom: '2rem' }}>
                            We found <strong>{localCount}</strong> records on this device. Would you like to upload them to your cloud account?
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button style={buttonStyle} onClick={handleMigrate} disabled={loading}>
                                {loading ? 'Migrating...' : 'Yes, Migrate My Data'}
                            </button>
                            <button
                                onClick={() => setStep('serverless-guide')}
                                style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer' }}
                            >
                                Skip for now
                            </button>
                        </div>
                    </div>
                );

            case 'serverless-guide':
                return (
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: colors.amber }}>
                            <Zap size={32} />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Serverless Notifications</h2>
                        </div>
                        <p style={{ color: colors.muted, fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            To receive Discord summaries and Emails even when this app is closed, you can set up a free <strong>AWS Lambda</strong>.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Step 1: Download ZIP */}
                            <div style={{ padding: '1.5rem', backgroundColor: '#0f1115', border: `1px solid ${colors.border}`, borderRadius: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: colors.text, fontWeight: 800, marginBottom: '0.75rem', fontSize: '1.1rem' }}>
                                    <Download size={20} className="text-amber-400" /> 1. Download Your Blueprint
                                </div>
                                <p style={{ color: colors.muted, fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                                    We've pre-bundled everything (code + libraries) into a single ZIP file for you.
                                </p>
                                <a
                                    href="/api/download/lambda"
                                    download="lambda-deployment.zip"
                                    style={{ ...buttonStyle, display: 'inline-flex', textDecoration: 'none' }}
                                >
                                    <Download size={18} /> Download Deployment package (.zip)
                                </a>
                            </div>

                            {/* Step 2: Create Function */}
                            <div style={{ padding: '1rem', borderLeft: `3px solid ${colors.amber}`, backgroundColor: '#1a1d24' }}>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold' }}>2. Create the Lambda</h4>
                                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: colors.muted, lineHeight: 1.6 }}>
                                    <li>Go to the <strong style={{ color: colors.text }}>AWS Lambda Console</strong>.</li>
                                    <li>Click <strong style={{ color: colors.text }}>Create function</strong> (orange button).</li>
                                    <li>Keep "Author from scratch" selected.</li>
                                    <li>Name it <code style={{ color: colors.amber }}>job-tracker-notifications</code>.</li>
                                    <li>Runtime: Select <strong style={{ color: colors.text }}>Node.js 20.x</strong>.</li>
                                    <li>Click <strong style={{ color: colors.text }}>Create function</strong>.</li>
                                </ol>
                            </div>

                            {/* Step 3: Upload and Configure */}
                            <div style={{ padding: '1rem', borderLeft: `3px solid ${colors.amber}`, backgroundColor: '#1a1d24' }}>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold' }}>3. Upload and Configure</h4>
                                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: colors.muted, lineHeight: 1.6 }}>
                                    <li>In the <strong style={{ color: colors.text }}>Code</strong> tab, click <strong style={{ color: colors.text }}>Upload from</strong> → <strong style={{ color: colors.text }}>.zip file</strong>.</li>
                                    <li>Select the <strong style={{ color: colors.text }}>lambda-deployment.zip</strong> you downloaded earlier.</li>
                                    <li>Go to the <strong style={{ color: colors.text }}>Configuration</strong> tab → <strong style={{ color: colors.text }}>Environment variables</strong>.</li>
                                    <li>Add <code style={{ color: colors.amber }}>SUPABASE_URL</code> and <code style={{ color: colors.amber }}>SUPABASE_SERVICE_ROLE_KEY</code> (find these in your Supabase Dashboard).</li>
                                    <li>In <strong style={{ color: colors.text }}>General configuration</strong>, click Edit and change the Timeout to <strong style={{ color: colors.text }}>30 seconds</strong>.</li>
                                </ol>
                            </div>

                            {/* Step 4: Schedule */}
                            <div style={{ padding: '1rem', borderLeft: `3px solid ${colors.amber}`, backgroundColor: '#1a1d24' }}>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold' }}>4. Schedule (EventBridge)</h4>
                                <p style={{ color: colors.muted, fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                                    This makes your cloud tracker "alive" to send notifications even when your app is closed.
                                    Click <strong style={{ color: colors.text }}>Add trigger</strong> and select <strong style={{ color: colors.text }}>EventBridge</strong>:
                                </p>
                                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: colors.muted, lineHeight: 1.6 }}>
                                    <li>Select <strong style={{ color: colors.text }}>Create new rule</strong>.</li>
                                    <li>Rule type: <strong style={{ color: colors.text }}>Schedule</strong>.</li>
                                    <li>Schedule expression: <code style={{ color: colors.amber }}>rate(1 minute)</code> (or <code style={{ color: colors.amber }}>5 minutes</code>).</li>
                                    <li style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>* Don't worry, the Daily Summary will still only send once per day (at 1 AM UTC)!</li>
                                    <li>Click <strong style={{ color: colors.text }}>Add</strong>.</li>
                                </ul>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                            <button style={buttonStyle} onClick={() => setStep('finalizing')}>
                                All Done! <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                );

            case 'finalizing':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '2rem', color: '#10b981' }}>
                            <CheckCircle2 size={72} style={{ margin: '0 auto' }} />
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Setup Complete</h2>
                        <p style={{ color: colors.muted, lineHeight: 1.6, marginBottom: '2.5rem' }}>
                            Your cloud workspace is connected. Desktop notifications and background sync are now active.
                        </p>
                        <button
                            style={{ ...buttonStyle, margin: '0 auto', padding: '1rem 3rem' }}
                            onClick={() => {
                                // Trigger the tray/minimization tip in the desktop app
                                try {
                                    (window as any).electron?.ipcRenderer?.send('show-welcome-tip');
                                } catch (e) {
                                    console.warn('Failed to send show-welcome-tip IPC:', e);
                                }
                                onComplete();
                            }}
                        >
                            Enter Workspace
                        </button>
                    </div>
                );
        }
    };

    return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                {renderStep()}

                {error && (
                    <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#ef444415', border: `1px solid ${colors.error}`, borderRadius: '8px', color: colors.error, fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}
            </div>

            <style>{`
                button:hover { opacity: 0.9; transform: translateY(-1px); }
                button:active { transform: translateY(0); }
                input:focus { border-color: #fbbf24 !important; }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #0f1115; }
                ::-webkit-scrollbar-thumb { background: #2d3139; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #3d4149; }
            `}</style>
        </div>
    );
};

export default CloudSetupWizard;
