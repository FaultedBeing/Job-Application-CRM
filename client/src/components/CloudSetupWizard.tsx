import React, { useState, useEffect, useCallback } from 'react';
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
    Download,
    Mail,
    Copy,
    RefreshCw,
    Lock,
    ExternalLink
} from 'lucide-react';

interface CloudSetupWizardProps {
    onComplete: () => void;
}

type Step = 'welcome' | 'path-selection' | 'admin-supabase' | 'joiner-auth' | 'migration' | 'ses-setup' | 'serverless-guide' | 'finalizing';

// Generate a random hex key using Web Crypto (available in browser)
function generateEncryptionKey(): string {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

    // Migration State
    const [existingCloudData, setExistingCloudData] = useState<{ exists: boolean; counts?: { companies: number; jobs: number } } | null>(null);
    const [sqlSchema, setSqlSchema] = useState<string>('');
    const [showSql, setShowSql] = useState(false);

    // SES Setup State
    const [sesRegion, setSesRegion] = useState('us-east-1');
    const [sesKeyId, setSesKeyId] = useState('');
    const [sesSecretKey, setSesSecretKey] = useState('');
    const [sesFrom, setSesFrom] = useState('');
    const [sesRecipient, setSesRecipient] = useState('');
    const [sesSmtpHost, setSesSmtpHost] = useState('');
    // Auto-generated encryption key — generated once on component mount, never changes during the wizard
    const [encryptionKey] = useState(() => generateEncryptionKey());
    const [sesTestBusy, setSesTestBusy] = useState(false);
    const [sesTestStatus, setSesTestStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [sesTestMsg, setSesTestMsg] = useState('');
    const [sesSkipped, setSesSkipped] = useState(false);

    // Copy feedback states
    const [copiedKey, setCopiedKey] = useState(false);
    const [copiedEnvVars, setCopiedEnvVars] = useState(false);

    useEffect(() => {
        setError(null);
    }, [step]);

    const checkLocalData = useCallback(async () => {
        setLoading(true);
        try {
            const userId = localStorage.getItem('cloud_user_id') || 'admin';
            const cloudCheckRes = await fetch('/api/sync/check-migration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const cloudData = await cloudCheckRes.json();
            setExistingCloudData(cloudData);

            const res = await fetch('/api/sync/local-count');
            const data = await res.json();
            setLocalCount(data.count);

            if (data.count > 0 || cloudData.exists) {
                setStep('migration');
            } else {
                setStep('ses-setup');
            }
        } catch (_err) {
            setStep('ses-setup');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSqlSchema = async () => {
        try {
            const res = await fetch('/supabase-schema.sql');
            const text = await res.text();
            setSqlSchema(text);
        } catch (err) {
            console.error('Failed to fetch SQL schema:', err);
        }
    };

    useEffect(() => {
        if (step === 'admin-supabase') fetchSqlSchema();
    }, [step]);

    const handleSaveAdminConfig = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/sync/setup-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supabase_url: supabaseUrl.trim(),
                    supabase_key: supabaseKey.trim()
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to apply configuration. Check your keys.');
            localStorage.setItem('cloud_user_id', data.user_id);
            await fetch('/api/sync/trigger', {
                method: 'POST',
                headers: { 'X-User-Id': data.user_id }
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
                headers: { 'Content-Type': 'application/json', 'X-User-Id': email },
                body: JSON.stringify({ cloud_mode: 'joiner' }),
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
                headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
                body: JSON.stringify({ userId })
            });
            setStep('ses-setup');
        } catch (_err) {
            setError('Migration failed, but you can retry later in Settings.');
            setStep('ses-setup');
        } finally {
            setLoading(false);
        }
    };

    const saveSesSettings = async () => {
        const userId = localStorage.getItem('cloud_user_id') || 'admin';
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
            body: JSON.stringify({
                ses_region: sesRegion || 'us-east-1',
                ses_key_id: sesKeyId || '',
                ses_secret_key: sesSecretKey || '',
                ses_from: sesFrom || '',
                ses_recipient: sesRecipient || '',
                ses_smtp_host: sesSmtpHost || '',
                supabase_encryption_key: encryptionKey  // stored locally only; never reaches Supabase
            })
        });
        // Trigger sync so the encrypted SES key reaches Supabase
        await fetch('/api/sync/trigger', {
            method: 'POST',
            headers: { 'X-User-Id': userId }
        });
    };

    const handleSesTest = async () => {
        setSesTestBusy(true);
        setSesTestStatus('idle');
        setSesTestMsg('');
        try {
            await saveSesSettings();
            const res = await fetch('/api/ses/send-test', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Test failed');
            setSesTestStatus('ok');
            setSesTestMsg(`✓ Test email sent to ${data.to}! Check your inbox.`);
        } catch (e: any) {
            setSesTestStatus('error');
            setSesTestMsg(e.message || 'Test email failed');
        } finally {
            setSesTestBusy(false);
        }
    };

    const handleSesSaveAndContinue = async () => {
        setLoading(true);
        try {
            await saveSesSettings();
            setStep('serverless-guide');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Env var block that Lambda needs
    const envVarBlock = [
        `SUPABASE_URL=${supabaseUrl || '<your-supabase-url>'}`,
        `SUPABASE_SERVICE_KEY=${supabaseKey || '<your-service-role-key>'}`,
        `SETTINGS_ENCRYPTION_KEY=${encryptionKey}`
    ].join('\n');

    // --- Styles ---
    const colors = {
        bg: '#0f1115',
        card: '#1a1d24',
        border: '#2d3139',
        amber: '#fbbf24',
        green: '#10b981',
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
        outline: 'none',
        boxSizing: 'border-box'
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
                            Synchronize your applications, get email reminders, and access your search from any device.
                        </p>
                        <button style={{ ...buttonStyle, margin: '0 auto' }} onClick={() => setStep('path-selection')}>
                            Get Started <ChevronRight size={20} />
                        </button>
                    </div>
                );

            case 'path-selection':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '1rem' }}>Choose Your Role</h2>

                        <div
                            style={{ padding: '1.5rem', backgroundColor: '#0f1115', border: `1px solid ${colors.border}`, borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
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
                            style={{ padding: '1.5rem', backgroundColor: '#0f1115', border: `1px solid ${colors.border}`, borderRadius: '12px', cursor: 'pointer' }}
                            onClick={() => setStep('joiner-auth')}
                        >
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ color: colors.green }}><UserPlus size={28} /></div>
                                <div>
                                    <h3 style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>The Joiner</h3>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: colors.muted }}>Invited to an existing workspace. I have an account ready.</p>
                                </div>
                                <div style={{ marginLeft: 'auto', color: colors.muted }}><ChevronRight /></div>
                            </div>
                        </div>

                        <button onClick={() => setStep('welcome')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
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
                            <input style={inputStyle} value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} placeholder="https://your-project.supabase.co" />
                        </div>

                        <div>
                            <label style={labelStyle}>Service Role Key (Secret)</label>
                            <div style={{ position: 'relative' }}>
                                <input style={{ ...inputStyle, paddingRight: '3rem' }} type="password" value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} placeholder="eyJhb..." />
                                <Key size={18} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: colors.border }} />
                            </div>
                        </div>

                        <div style={{ padding: '1rem', backgroundColor: '#fbbf2410', border: `1px solid ${colors.amber}33`, borderRadius: '8px', fontSize: '0.85rem', color: colors.muted }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: colors.amber, fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                <ShieldCheck size={16} /> Data Persistence
                            </div>
                            Your credentials are saved securely in your local AppData. They will persist automatically through future app updates.
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <button onClick={() => setShowSql(!showSql)} style={{ background: 'none', border: 'none', color: colors.amber, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0 }}>
                                <Zap size={16} /> {showSql ? 'Hide' : 'Show'} Database Setup Script (SQL)
                            </button>

                            {showSql && (
                                <div style={{ marginTop: '1rem' }}>
                                    <p style={{ fontSize: '0.8rem', color: colors.muted, marginBottom: '0.5rem' }}>Run this in your Supabase SQL Editor to prepare your tables:</p>
                                    <textarea readOnly style={{ ...inputStyle, height: '150px', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'pre' }} value={sqlSchema} />
                                    <button onClick={() => { navigator.clipboard.writeText(sqlSchema); alert('SQL Script copied to clipboard!'); }} style={{ ...buttonStyle, marginTop: '0.5rem', padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                                        Copy to Clipboard
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                            <button onClick={() => setStep('path-selection')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer' }}>Back</button>
                            <button onClick={handleSaveAdminConfig} disabled={loading || !supabaseUrl || !supabaseKey} style={{ ...buttonStyle, opacity: (loading || !supabaseUrl || !supabaseKey) ? 0.6 : 1 }}>
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
                            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
                        </div>
                        <div>
                            <label style={labelStyle}>Password</label>
                            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                        </div>
                        <button onClick={handleJoinerAuth} disabled={loading || !email || !password} style={{ ...buttonStyle, width: '100%', justifyContent: 'center', marginTop: '1rem', opacity: (loading || !email || !password) ? 0.6 : 1 }}>
                            {loading ? 'Authenticating...' : 'Sign In'}
                        </button>
                        <button onClick={() => setStep('path-selection')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', margin: '0 auto' }}>Go Back</button>
                    </div>
                );

            case 'migration': {
                const hasExistingData = existingCloudData?.exists;
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '1.5rem', color: hasExistingData ? colors.green : colors.amber }}>
                            {hasExistingData ? <CheckCircle2 size={48} style={{ margin: '0 auto' }} /> : <Server size={48} style={{ margin: '0 auto' }} />}
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                            {hasExistingData ? 'Cloud Data Found!' : 'Migrate Local Data?'}
                        </h2>
                        {hasExistingData ? (
                            <p style={{ color: colors.muted, lineHeight: 1.6, marginBottom: '2rem' }}>
                                We found <strong>{existingCloudData?.counts?.companies}</strong> companies and <strong>{existingCloudData?.counts?.jobs}</strong> jobs already in your cloud account.
                                <br /><br />
                                Your data is safe and ready. You can choose to migrate any <strong>{localCount}</strong> new local records now, or skip and proceed.
                            </p>
                        ) : (
                            <p style={{ color: colors.muted, lineHeight: 1.6, marginBottom: '2rem' }}>
                                We found <strong>{localCount}</strong> records on this device. Would you like to upload them to your cloud account?
                            </p>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button style={buttonStyle} onClick={handleMigrate} disabled={loading || (hasExistingData && localCount === 0)}>
                                {loading ? 'Migrating...' : localCount > 0 ? 'Migrate Local Records' : 'Nothing to Migrate'}
                            </button>
                            <button onClick={() => setStep('ses-setup')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer' }}>
                                {hasExistingData ? 'Proceed to Next Step' : 'Skip for now'}
                            </button>
                        </div>
                    </div>
                );
            }

            case 'ses-setup':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: colors.amber }}>
                            <Mail size={28} />
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Email Reminders</h2>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: colors.muted }}>Optional · Sends reminders even when your PC is off</p>
                            </div>
                        </div>

                        {/* Multiple Computers Warning */}
                        <div style={{ padding: '1rem', backgroundColor: '#fbbf2415', borderRadius: '8px', border: '1px solid #fbbf2444' }}>
                            <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertCircle size={16} /> 
                                Connecting a Second Computer?
                            </div>
                            <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                                If you already configured Email Reminders and deployed your Lambda from your <strong>primary computer</strong>, you must <strong>skip this step</strong>. The Cloud App relies on the encryption key generated on your primary PC. Simply click "Skip for now" to avoid overwriting your credentials!
                            </p>
                        </div>

                        {/* Auto-generated key callout */}
                        <div style={{ padding: '1rem', backgroundColor: '#10b98115', border: `1px solid ${colors.green}33`, borderRadius: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: colors.green, fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                <Lock size={16} /> Auto-Generated Encryption Key
                            </div>
                            <p style={{ color: colors.muted, fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
                                We've created a unique key to encrypt your SES password before it's stored in Supabase.
                                You'll need to copy this exact value into your Lambda's <code style={{ color: colors.amber }}>SETTINGS_ENCRYPTION_KEY</code> environment variable — that's it.
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <code style={{ flex: 1, backgroundColor: '#0f1115', padding: '0.6rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', color: colors.amber, overflowX: 'auto', display: 'block', border: `1px solid ${colors.border}` }}>
                                    {encryptionKey}
                                </code>
                                <button
                                    onClick={() => copyToClipboard(encryptionKey, setCopiedKey)}
                                    style={{ background: copiedKey ? colors.green : colors.border, border: 'none', borderRadius: '6px', padding: '0.6rem 0.75rem', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                                >
                                    {copiedKey ? '✓ Copied' : <Copy size={16} />}
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                                <label style={labelStyle}>AWS Region</label>
                                <input type="text" value={sesRegion} onChange={e => setSesRegion(e.target.value)} placeholder="us-east-1" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Custom SMTP Host (optional)</label>
                                <input type="text" value={sesSmtpHost} onChange={e => setSesSmtpHost(e.target.value)} placeholder={`Auto: email-smtp.${sesRegion || 'us-east-1'}.amazonaws.com`} style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>SMTP Username <span style={{ textTransform: 'none', fontWeight: 400, color: '#6b7280' }}>(from SES → SMTP Settings → Create Credentials)</span></label>
                                <input type="text" value={sesKeyId} onChange={e => setSesKeyId(e.target.value)} placeholder="AKIA..." style={inputStyle} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>SMTP Password</label>
                                <input type="password" value={sesSecretKey} onChange={e => setSesSecretKey(e.target.value)} placeholder="SES SMTP password (not your AWS secret key)" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>From Address <span style={{ color: colors.error, textTransform: 'none', fontWeight: 400 }}>*verified in SES</span></label>
                                <input type="email" value={sesFrom} onChange={e => setSesFrom(e.target.value)} placeholder="you@yourdomain.com" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Send Reminders To</label>
                                <input type="email" value={sesRecipient} onChange={e => setSesRecipient(e.target.value)} placeholder="Defaults to From address" style={inputStyle} />
                            </div>
                        </div>

                        {/* Test email button */}
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleSesTest}
                                disabled={sesTestBusy || !sesKeyId || !sesSecretKey || !sesFrom}
                                style={{ ...buttonStyle, backgroundColor: '#374151', color: '#fff', opacity: (sesTestBusy || !sesKeyId || !sesSecretKey || !sesFrom) ? 0.6 : 1 }}
                            >
                                {sesTestBusy ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={18} />}
                                {sesTestBusy ? 'Sending...' : 'Send Test Email'}
                            </button>
                            <a href="https://console.aws.amazon.com/ses/home#/smtp" target="_blank" rel="noreferrer" style={{ color: colors.muted, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}>
                                Open SES Console <ExternalLink size={14} />
                            </a>
                        </div>

                        {sesTestStatus !== 'idle' && (
                            <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', backgroundColor: sesTestStatus === 'ok' ? '#10b98115' : '#ef444415', border: `1px solid ${sesTestStatus === 'ok' ? colors.green : colors.error}44`, color: sesTestStatus === 'ok' ? colors.green : colors.error, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {sesTestStatus === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                {sesTestMsg}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                            <button onClick={() => { setSesSkipped(true); setStep('serverless-guide'); }} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '0.9rem' }}>
                                Skip for now
                            </button>
                            <button
                                onClick={handleSesSaveAndContinue}
                                disabled={loading}
                                style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}
                            >
                                {loading ? 'Saving...' : sesKeyId ? 'Save & Continue' : 'Continue Without Email'} <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                );

            case 'serverless-guide':
                return (
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: colors.amber }}>
                            <Zap size={32} />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Deploy the Lambda</h2>
                        </div>
                        <p style={{ color: colors.muted, fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            {sesSkipped
                                ? 'You can set up serverless email reminders at any time from Notification Settings.'
                                : 'One last step — deploy the Lambda so your reminders fire even when your PC is off.'}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Step 1: Download */}
                            <div style={{ padding: '1.25rem', backgroundColor: '#0f1115', border: `1px solid ${colors.border}`, borderRadius: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, marginBottom: '0.6rem', fontSize: '1rem' }}>
                                    <Download size={18} style={{ color: colors.amber }} /> 1. Download Lambda Package
                                </div>
                                <p style={{ color: colors.muted, fontSize: '0.85rem', marginBottom: '1rem' }}>Pre-bundled ZIP — everything included.</p>
                                <a href="/api/download/lambda" download="lambda-deployment.zip" style={{ ...buttonStyle, display: 'inline-flex', textDecoration: 'none' }}>
                                    <Download size={18} /> Download Deployment Package (.zip)
                                </a>
                            </div>

                            {/* Step 2 */}
                            <div style={{ padding: '1rem', borderLeft: `3px solid ${colors.amber}`, backgroundColor: '#1a1d24' }}>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold' }}>2. Create Lambda Function</h4>
                                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: colors.muted, lineHeight: 1.7 }}>
                                    <li>Go to <strong style={{ color: colors.text }}>AWS Lambda Console</strong> → <strong style={{ color: colors.text }}>Create function</strong></li>
                                    <li>Author from scratch · Name it <code style={{ color: colors.amber }}>job-crm-reminders</code> · Runtime: <strong style={{ color: colors.text }}>Node.js 20.x</strong></li>
                                    <li>Upload the ZIP in the <strong style={{ color: colors.text }}>Code</strong> tab → Upload from → .zip file</li>
                                    <li>Set handler to <code style={{ color: colors.amber }}>index.handler</code> (default)</li>
                                    <li>In <strong style={{ color: colors.text }}>General configuration</strong>, set Timeout to <strong style={{ color: colors.text }}>30 seconds</strong></li>
                                </ol>
                            </div>

                            {/* Step 3: Env vars — pre-filled with the user's actual values */}
                            <div style={{ padding: '1rem', borderLeft: `3px solid ${colors.green}`, backgroundColor: '#1a1d24' }}>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold' }}>3. Set Environment Variables</h4>
                                <p style={{ color: colors.muted, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                                    Copy these into Lambda → Configuration → Environment variables:
                                </p>
                                <div style={{ position: 'relative' }}>
                                    <pre style={{ margin: 0, backgroundColor: '#0f1115', border: `1px solid ${colors.border}`, padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', color: colors.amber, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                        {envVarBlock}
                                    </pre>
                                    <button
                                        onClick={() => copyToClipboard(envVarBlock, setCopiedEnvVars)}
                                        style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', backgroundColor: copiedEnvVars ? colors.green : '#374151', border: 'none', borderRadius: '4px', padding: '0.35rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', gap: '0.35rem', alignItems: 'center', transition: 'all 0.2s' }}
                                    >
                                        {copiedEnvVars ? '✓ Copied' : <><Copy size={12} /> Copy</>}
                                    </button>
                                </div>
                                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                    ⚠️ The <code style={{ color: colors.amber }}>SETTINGS_ENCRYPTION_KEY</code> was auto-generated and saved to your local settings. Keep it secret.
                                </p>
                            </div>

                            {/* Step 4: Grant SES Permission */}
                            <div style={{ padding: '1rem', borderLeft: `3px solid ${colors.amber}`, backgroundColor: '#1a1d24' }}>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold' }}>4. Grant SES Permission</h4>
                                <p style={{ color: colors.muted, fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                                    In the Lambda execution role, attach the <code style={{ color: colors.amber }}>AmazonSESFullAccess</code> managed policy (or a custom policy with <code style={{ color: colors.amber }}>ses:SendEmail</code> only).
                                </p>
                            </div>

                            {/* Step 5: Schedule */}
                            <div style={{ padding: '1rem', borderLeft: `3px solid ${colors.amber}`, backgroundColor: '#1a1d24' }}>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold' }}>5. Schedule with EventBridge</h4>
                                <p style={{ color: colors.muted, fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                                    Click <strong style={{ color: colors.text }}>Add trigger</strong> → EventBridge → Create new rule → Schedule expression:
                                </p>
                                <code style={{ color: colors.amber, display: 'block', marginBottom: '0.5rem' }}>rate(1 hour)</code>
                                <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0 }}>This fires your Lambda every hour — your PC never needs to be on.</p>
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
                        <div style={{ marginBottom: '2rem', color: colors.green }}>
                            <CheckCircle2 size={72} style={{ margin: '0 auto' }} />
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Setup Complete</h2>
                        <p style={{ color: colors.muted, lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: '400px', margin: '0 auto 2.5rem' }}>
                            Your cloud workspace is connected and data syncs automatically.
                            {sesKeyId && ' Email reminders are active — they\'ll fire even when your PC is off.'}
                        </p>
                        <button
                            style={{ ...buttonStyle, margin: '0 auto', padding: '1rem 3rem' }}
                            onClick={() => {
                                try { (window as any).electron?.ipcRenderer?.send('show-welcome-tip'); } catch (_e) { }
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
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
