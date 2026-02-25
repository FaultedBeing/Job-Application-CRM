import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import api from '../api';

export default function NotificationSettings() {
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Gmail
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [gmailConnectedEmail, setGmailConnectedEmail] = useState<string | null>(null);
  const [showGmailWizard, setShowGmailWizard] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailRecipient, setGmailRecipient] = useState('');

  // SMTP / AWS
  const [showSmtpSection, setShowSmtpSection] = useState(false);
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpRecipient, setSmtpRecipient] = useState('');

  // Provider priority
  const [emailProvider, setEmailProvider] = useState<'gmail' | 'smtp'>('gmail');

  // Thresholds
  const [desktopSummaryThreshold, setDesktopSummaryThreshold] = useState(5);
  const [emailSummaryThreshold, setEmailSummaryThreshold] = useState(5);

  useEffect(() => {
    loadSettings();
  }, []);

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ message, type });
    if (type !== 'error') {
      window.setTimeout(() => {
        setToast((t) => (t?.message === message ? null : t));
      }, 2500);
    }
  }

  async function loadSettings() {
    try {
      const res = await api.get('/settings');
      setGmailClientId(res.data.gmail_client_id || '');
      setGmailClientSecret(res.data.gmail_client_secret || '');
      setGmailEnabled((res.data.gmail_enabled || 'false') === 'true');
      setGmailRecipient(res.data.gmail_recipient || '');
      setDesktopSummaryThreshold(parseInt(res.data.notification_desktop_summary_threshold || '5', 10) || 5);
      setEmailSummaryThreshold(parseInt(res.data.notification_email_summary_threshold || '5', 10) || 5);

      // Provider priority
      setEmailProvider((res.data.email_provider_priority === 'smtp') ? 'smtp' : 'gmail');

      // SMTP
      setSmtpEnabled((res.data.smtp_enabled || 'false') === 'true');
      setSmtpHost(res.data.smtp_host || '');
      setSmtpPort(res.data.smtp_port || '587');
      setSmtpUser(res.data.smtp_user || '');
      setSmtpPass(res.data.smtp_pass || '');
      setSmtpFrom(res.data.smtp_from || '');
      setSmtpSecure((res.data.smtp_secure || 'true') === 'true');
      setSmtpRecipient(res.data.smtp_recipient || '');

      // If SMTP settings exist, open the section so the user sees them
      if (res.data.smtp_host) setShowSmtpSection(true);

      // Gmail OAuth status
      try {
        const anyWindow = window as any;
        if (anyWindow?.electronAPI?.gmailOAuthStatus) {
          const st = await anyWindow.electronAPI.gmailOAuthStatus();
          setGmailConnectedEmail(st?.email || null);
        }
      } catch (_e) {
        setGmailConnectedEmail(null);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function saveAll() {
    try {
      await api.post('/settings', {
        gmail_client_id: gmailClientId || '',
        gmail_client_secret: gmailClientSecret || '',
        gmail_enabled: gmailEnabled ? 'true' : 'false',
        gmail_recipient: gmailRecipient || '',
        email_provider_priority: emailProvider,
        smtp_enabled: smtpEnabled ? 'true' : 'false',
        smtp_host: smtpHost || '',
        smtp_port: smtpPort || '587',
        smtp_user: smtpUser || '',
        smtp_pass: smtpPass || '',
        smtp_from: smtpFrom || '',
        smtp_secure: smtpSecure ? 'true' : 'false',
        smtp_recipient: smtpRecipient || '',
        notification_desktop_summary_threshold: String(desktopSummaryThreshold),
        notification_email_summary_threshold: String(emailSummaryThreshold)
      });
      showToast('Notification settings saved!', 'success');
    } catch (error) {
      console.error('Error saving notification settings:', error);
      showToast('Error saving settings', 'error');
    }
  }

  async function handleConnectGmail() {
    const trimmedId = gmailClientId.trim();
    const trimmedSecret = gmailClientSecret.trim();
    if (!trimmedId) { showToast('Paste your Google OAuth Client ID first', 'info'); return; }
    if (!trimmedSecret) { showToast('Paste your Google OAuth Client Secret too', 'info'); return; }
    const anyWindow = window as any;
    if (!anyWindow?.electronAPI?.gmailOAuthConnect) {
      showToast('Google connect is only available in the desktop app', 'info');
      return;
    }
    try {
      setGmailBusy(true);
      const result = await anyWindow.electronAPI.gmailOAuthConnect({ clientId: trimmedId, clientSecret: trimmedSecret });
      setGmailConnectedEmail(result?.email || null);
      showToast(result?.email ? `Connected: ${result.email}` : 'Connected', 'success');
    } catch (e: any) {
      console.error('gmailOAuthConnect error:', e);
      showToast(e?.message || 'Failed to connect Google account', 'error');
    } finally {
      setGmailBusy(false);
    }
  }

  async function handleDisconnectGmail() {
    const anyWindow = window as any;
    if (!anyWindow?.electronAPI?.gmailOAuthDisconnect) {
      showToast('Google disconnect is only available in the desktop app', 'info');
      return;
    }
    try {
      setGmailBusy(true);
      await anyWindow.electronAPI.gmailOAuthDisconnect();
      setGmailConnectedEmail(null);
      showToast('Disconnected Google account', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to disconnect', 'error');
    } finally {
      setGmailBusy(false);
    }
  }

  async function handleSendTestEmail() {
    const anyWindow = window as any;
    if (!anyWindow?.electronAPI?.gmailSendTest) {
      showToast('Test email is only available in the desktop app', 'info');
      return;
    }
    try {
      setGmailBusy(true);
      await anyWindow.electronAPI.gmailSendTest({
        subject: 'Job Application Tracker test email',
        body: 'If you received this, Gmail reminders are configured correctly.'
      });
      showToast('Test email sent', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to send test email', 'error');
    } finally {
      setGmailBusy(false);
    }
  }

  async function handleSendSmtpTest() {
    try {
      setGmailBusy(true);
      // Save SMTP settings first so the server has the latest values
      await api.post('/settings', {
        smtp_enabled: smtpEnabled ? 'true' : 'false',
        smtp_host: smtpHost || '',
        smtp_port: smtpPort || '587',
        smtp_user: smtpUser || '',
        smtp_pass: smtpPass || '',
        smtp_from: smtpFrom || '',
        smtp_secure: smtpSecure ? 'true' : 'false',
        smtp_recipient: smtpRecipient || ''
      });
      await api.post('/smtp/send-test');
      showToast('SMTP test email sent', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to send SMTP test email';
      showToast(msg, 'error');
    } finally {
      setGmailBusy(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#0f1115',
    border: '1px solid #2d3139',
    borderRadius: '6px',
    color: '#e5e7eb'
  } as const;

  return (
    <div>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#fbbf24' }}>Notifications &amp; Email</h1>

      {/* ===== Gmail (Primary) ===== */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: '#e5e7eb' }}>Email Reminders (Gmail)</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
              Sends reminders from your own Gmail account. By default, reminders are emailed back to the same address.
            </p>
          </div>
          <button
            onClick={() => setShowGmailWizard(true)}
            style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}
          >
            Setup Wizard
          </button>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: '#e5e7eb' }}>
            <input
              type="checkbox"
              checked={gmailEnabled}
              onChange={(e) => setGmailEnabled(e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#fbbf24' }}
            />
            <span>Enable Gmail reminders</span>
          </label>
          <span style={{ color: gmailConnectedEmail ? '#34d399' : '#6b7280', fontSize: '0.875rem' }}>
            {gmailConnectedEmail ? `Connected: ${gmailConnectedEmail}` : 'Not connected'}
          </span>
        </div>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', maxWidth: '640px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Client ID</label>
            <input type="text" value={gmailClientId} onChange={(e) => setGmailClientId(e.target.value)} placeholder="Paste Google OAuth Client ID (Desktop app)" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Client Secret</label>
            <input type="password" value={gmailClientSecret} onChange={(e) => setGmailClientSecret(e.target.value)} placeholder="Paste Google OAuth Client Secret" style={inputStyle} />
          </div>
          <div>
            <button disabled={gmailBusy} onClick={handleConnectGmail} style={{ padding: '0.75rem 1rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: gmailBusy ? 'not-allowed' : 'pointer', opacity: gmailBusy ? 0.7 : 1 }}>
              Connect Google
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', maxWidth: '520px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Send email reminders to</label>
          <input type="email" value={gmailRecipient} onChange={(e) => setGmailRecipient(e.target.value)} placeholder="Leave blank to send to your own Gmail address" style={inputStyle} />
          <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Default is your connected Gmail address. You can enter a different address if you prefer to receive reminders elsewhere.
          </p>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button disabled={gmailBusy} onClick={handleSendTestEmail} style={{ padding: '0.5rem 1rem', backgroundColor: '#1f2937', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: gmailBusy ? 'not-allowed' : 'pointer', opacity: gmailBusy ? 0.7 : 1 }}>
            Send test email
          </button>
          <button disabled={gmailBusy} onClick={handleDisconnectGmail} style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', border: '1px solid #4b5563', borderRadius: '6px', color: '#f87171', cursor: gmailBusy ? 'not-allowed' : 'pointer', opacity: gmailBusy ? 0.7 : 1 }}>
            Disconnect
          </button>
        </div>

        <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.75rem' }}>
          You can find both the <strong>Client ID</strong> and <strong>Client Secret</strong> on the Google Cloud Console under <em>APIs &amp; Services → Credentials</em>. Click the Setup Wizard above for a step-by-step guide.
        </p>
      </section>

      {/* ===== Primary email provider picker ===== */}
      {gmailEnabled && smtpEnabled && (
        <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.25rem 1.5rem', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1rem', color: '#e5e7eb', marginBottom: '0.75rem' }}>Primary email provider</h3>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Both Gmail and SMTP are enabled. Choose which one should be used first — the other will be ignored (not used as fallback).
          </p>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: emailProvider === 'gmail' ? '#fbbf24' : '#9ca3af' }}>
              <input type="radio" name="emailProvider" value="gmail" checked={emailProvider === 'gmail'} onChange={() => setEmailProvider('gmail')} style={{ accentColor: '#fbbf24', width: '16px', height: '16px' }} />
              Gmail (Google OAuth)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: emailProvider === 'smtp' ? '#fbbf24' : '#9ca3af' }}>
              <input type="radio" name="emailProvider" value="smtp" checked={emailProvider === 'smtp'} onChange={() => setEmailProvider('smtp')} style={{ accentColor: '#fbbf24', width: '16px', height: '16px' }} />
              Custom SMTP / AWS SES
            </label>
          </div>
        </section>
      )}

      {/* ===== SMTP / AWS (Advanced — collapsed by default) ===== */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', marginBottom: '2rem', overflow: 'hidden' }}>
        <button
          onClick={() => setShowSmtpSection(!showSmtpSection)}
          style={{
            width: '100%',
            padding: '1.25rem 1.5rem',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#e5e7eb',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            textAlign: 'left'
          }}
        >
          {showSmtpSection ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Custom SMTP / AWS SES</span>
            <span style={{ display: 'block', color: '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>
              Advanced — use your own mail server or AWS SES instead of Gmail
            </span>
          </div>
        </button>

        {showSmtpSection && (
          <div style={{ padding: '0 1.5rem 1.5rem' }}>
            <div style={{ borderTop: '1px solid #2d3139', paddingTop: '1rem' }}>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: '#e5e7eb', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={smtpEnabled}
                  onChange={(e) => setSmtpEnabled(e.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#fbbf24' }}
                />
                <span>Enable SMTP email reminders</span>
              </label>

              <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem' }}>
                If both Gmail and SMTP are enabled, <strong>Gmail</strong> takes priority. SMTP is used as a fallback or standalone alternative.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '640px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>SMTP Host</label>
                  <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="e.g. email-smtp.us-east-1.amazonaws.com" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Port</label>
                  <input type="text" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e7eb', fontSize: '0.875rem', height: '100%', paddingTop: '1.4rem' }}>
                    <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#fbbf24' }} />
                    Use TLS / STARTTLS
                  </label>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Username</label>
                  <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="SMTP username or AWS access key" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Password</label>
                  <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="SMTP password or AWS secret key" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>From address</label>
                  <input type="email" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@yourdomain.com" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Send reminders to</label>
                  <input type="email" value={smtpRecipient} onChange={(e) => setSmtpRecipient(e.target.value)} placeholder="Leave blank to use the From address" style={inputStyle} />
                  <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    Defaults to the "From" address above if left blank.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <button onClick={handleSendSmtpTest} disabled={gmailBusy} style={{ padding: '0.5rem 1rem', backgroundColor: '#1f2937', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: gmailBusy ? 'not-allowed' : 'pointer', opacity: gmailBusy ? 0.7 : 1 }}>
                  Send SMTP test email
                </button>
              </div>

              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '8px' }}>
                <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>AWS SES quick setup</div>
                <ol style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0.25rem 0 0', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                  <li>In the AWS console, go to <strong>SES → SMTP Settings</strong>.</li>
                  <li>Click <strong>Create SMTP Credentials</strong> — this gives you a username and password.</li>
                  <li>Copy the <strong>SMTP endpoint</strong> (e.g. <code style={{ color: '#e5e7eb' }}>email-smtp.us-east-1.amazonaws.com</code>).</li>
                  <li>Verify the "From" email address under <strong>SES → Verified identities</strong>.</li>
                  <li>Paste the host, username, and password above. Port 587 with TLS is recommended.</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===== Notification Preferences ===== */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#e5e7eb' }}>Notification Preferences</h2>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem' }}>
          When multiple reminders become due while the app is closed, the app will summarize them on next launch.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '560px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Desktop summary threshold</label>
            <input type="number" min={1} max={50} value={desktopSummaryThreshold} onChange={(e) => setDesktopSummaryThreshold(parseInt(e.target.value || '5', 10) || 5)} style={inputStyle} />
            <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
              If ≥ this many desktop reminders are due, show one "X items need attention" notification.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Email summary threshold</label>
            <input type="number" min={1} max={50} value={emailSummaryThreshold} onChange={(e) => setEmailSummaryThreshold(parseInt(e.target.value || '5', 10) || 5)} style={inputStyle} />
            <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
              If ≥ this many email reminders are due, send one summary email instead of multiple emails.
            </p>
          </div>
        </div>
      </section>

      {/* Save */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button onClick={saveAll} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: 'pointer' }}>
          Save Notification Settings
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 2000, padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #2d3139', backgroundColor: '#0f1115', color: '#e5e7eb', boxShadow: '0 12px 30px rgba(0,0,0,0.45)', minWidth: '260px', maxWidth: '420px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: 999, backgroundColor: toast.type === 'success' ? '#34d399' : toast.type === 'error' ? '#ef4444' : '#3b82f6', flexShrink: 0 }} />
          <div style={{ fontSize: '0.9rem', lineHeight: 1.2, flex: 1 }}>{toast.message}</div>
          <button onClick={() => setToast(null)} aria-label="Dismiss notification" style={{ padding: '0.25rem 0.4rem', backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Gmail Setup Wizard Modal */}
      {showGmailWizard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setShowGmailWizard(false)}>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '12px', padding: '1.5rem', width: '92%', maxWidth: '680px', border: '1px solid #2d3139' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.25rem' }}>Gmail Setup Wizard</h3>
                <p style={{ marginTop: '0.5rem', marginBottom: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
                  Goal: create a <strong>Desktop app</strong> OAuth credential, then paste the <strong>Client ID</strong> and <strong>Client Secret</strong> below.
                </p>
              </div>
              <button onClick={() => setShowGmailWizard(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }} aria-label="Close">×</button>
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.25rem' }}>Step 1 — Open Google Cloud Console</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Create (or select) a project.</div>
                <button onClick={() => (window as any).electronAPI?.openExternal?.('https://console.cloud.google.com/')} style={{ marginTop: '0.5rem', padding: '0.5rem 0.9rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Open Console</button>
              </div>

              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.25rem' }}>Step 2 — Enable Gmail API</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Search for "Gmail API" and enable it.</div>
                <button onClick={() => (window as any).electronAPI?.openExternal?.('https://console.cloud.google.com/apis/library/gmail.googleapis.com')} style={{ marginTop: '0.5rem', padding: '0.5rem 0.9rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Open Gmail API page</button>
              </div>

              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.25rem' }}>Step 3 — Configure OAuth Consent Screen</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Choose External (if prompted), fill app name, and add yourself as a test user if needed.</div>
                <button onClick={() => (window as any).electronAPI?.openExternal?.('https://console.cloud.google.com/apis/credentials/consent')} style={{ marginTop: '0.5rem', padding: '0.5rem 0.9rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Open consent screen</button>
              </div>

              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.25rem' }}>Step 4 — Create OAuth Client ID (Desktop app)</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Go to Credentials → Create Credentials → OAuth client ID → Application type: <strong>Desktop app</strong>.</div>
                <button onClick={() => (window as any).electronAPI?.openExternal?.('https://console.cloud.google.com/apis/credentials')} style={{ marginTop: '0.5rem', padding: '0.5rem 0.9rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Open Credentials</button>
              </div>

              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.25rem' }}>Step 5 — Copy Client ID &amp; Client Secret</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                  After creating the credential, Google will show you both values. Copy the <strong>Client ID</strong> (ends with <code style={{ color: '#e5e7eb' }}>.apps.googleusercontent.com</code>) and the <strong>Client Secret</strong>. Paste both into the fields on this page, then click <strong>Connect Google</strong>.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setShowGmailWizard(false)} style={{ padding: '0.6rem 1rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
