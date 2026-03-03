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

  // Discord Bot
  interface DiscordRecipient {
    id: string;
    addedAt: string;
    name?: string;
  }
  const [showDiscordSection, setShowDiscordSection] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordToken, setDiscordToken] = useState('');
  const [discordRecipients, setDiscordRecipients] = useState<DiscordRecipient[]>([]);
  const [newRecipientInput, setNewRecipientInput] = useState('');
  const [newRecipientName, setNewRecipientName] = useState('');
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [showDiscordWizard, setShowDiscordWizard] = useState(false);

  // Provider priority
  const [emailProvider, setEmailProvider] = useState<'gmail' | 'smtp'>('gmail');

  // Thresholds
  const [desktopSummaryThreshold, setDesktopSummaryThreshold] = useState(5);
  const [emailSummaryThreshold, setEmailSummaryThreshold] = useState(5);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then(() => setInitialLoaded(true));
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (!initialLoaded) return;
    const timer = setTimeout(() => {
      saveAll();
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    gmailClientId, gmailClientSecret, gmailEnabled, gmailRecipient,
    emailProvider, smtpEnabled, smtpHost, smtpPort, smtpUser, smtpPass,
    smtpFrom, smtpSecure, smtpRecipient, desktopSummaryThreshold,
    emailSummaryThreshold, discordEnabled, discordToken, discordRecipients, initialLoaded
  ]);

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

      // Discord
      setDiscordEnabled(res.data.discord_enabled === 'true');
      const dToken = res.data.discord_bot_token || '';
      setDiscordToken(dToken);

      let parsedRecipients: DiscordRecipient[] = [];
      if (res.data.discord_recipient_id) {
        try {
          const parsed = JSON.parse(res.data.discord_recipient_id);
          if (Array.isArray(parsed)) {
            parsedRecipients = parsed;
          } else if (typeof res.data.discord_recipient_id === 'string' && res.data.discord_recipient_id.trim().length > 0) {
            // Legacy support: if it's not JSON, it might just be the old string format
            parsedRecipients = res.data.discord_recipient_id.split(',').map((id: string) => ({
              id: id.trim(),
              addedAt: new Date().toISOString()
            })).filter((r: DiscordRecipient) => r.id.length > 0);
          }
        } catch (_e) {
          // If JSON parse fails, try legacy format
          if (typeof res.data.discord_recipient_id === 'string' && res.data.discord_recipient_id.trim().length > 0) {
            parsedRecipients = res.data.discord_recipient_id.split(',').map((id: string) => ({
              id: id.trim(),
              addedAt: new Date().toISOString()
            })).filter((r: DiscordRecipient) => r.id.length > 0);
          }
        }
      }
      setDiscordRecipients(parsedRecipients);

      if (dToken) setShowDiscordSection(true);

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
        discord_enabled: discordEnabled ? 'true' : 'false',
        discord_bot_token: discordToken,
        discord_recipient_id: JSON.stringify(discordRecipients),
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

  async function testDiscordSettings() {
    if (!discordToken || discordRecipients.length === 0) {
      showToast('Token and at least one Recipient ID are required for testing.', 'error');
      return;
    }

    setTestingDiscord(true);
    try {
      const channelIdsString = discordRecipients.map(r => r.id).join(',');
      await api.post('/discord/test', {
        token: discordToken,
        channelId: channelIdsString
      });
      showToast('Test message sent to Discord!', 'success');
    } catch (error: any) {
      console.error('Discord test error:', error);
      showToast(error.response?.data?.error || 'Failed to send test message.', 'error');
    } finally {
      setTestingDiscord(false);
    }
  }

  function handleAddRecipient() {
    const val = newRecipientInput.trim();
    if (!val) return;

    // Check for duplicates
    if (discordRecipients.some(r => r.id === val)) {
      showToast('This ID is already in the list.', 'info');
      setNewRecipientInput('');
      setNewRecipientName('');
      return;
    }

    setDiscordRecipients(prev => [...prev, {
      id: val,
      name: newRecipientName.trim() || undefined,
      addedAt: new Date().toISOString()
    }]);
    setNewRecipientInput('');
    setNewRecipientName('');
  }

  function handleRemoveRecipient(idToRemove: string) {
    setDiscordRecipients(prev => prev.filter(r => r.id !== idToRemove));
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

      {/* ===== Discord Bot Accountability (collapsible) ===== */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', marginBottom: '2rem', overflow: 'hidden' }}>
        <button
          onClick={() => setShowDiscordSection(!showDiscordSection)}
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
          {showDiscordSection ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Discord Bot Accountability</span>
            <span style={{ display: 'block', color: '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>
              Send a daily summary of your activity to a Discord channel or DM
            </span>
          </div>
        </button>

        {showDiscordSection && (
          <div style={{ padding: '0 1.5rem 1.5rem' }}>
            <div style={{ borderTop: '1px solid #2d3139', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: '#e5e7eb' }}>
                  <input
                    type="checkbox"
                    checked={discordEnabled}
                    onChange={(e) => setDiscordEnabled(e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#fbbf24' }}
                  />
                  <span>Enable Discord Bot</span>
                </label>
                <button
                  onClick={() => setShowDiscordWizard(true)}
                  style={{ padding: '0.4rem 0.8rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Setup Wizard
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', maxWidth: '640px' }}>
                <div>
                  <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Bot Token</label>
                  <input
                    type="password"
                    value={discordToken}
                    onChange={(e) => setDiscordToken(e.target.value)}
                    placeholder="MTIzNDU2Nzg5..."
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Add Channel / User ID</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={newRecipientName}
                      onChange={(e) => setNewRecipientName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRecipient();
                        }
                      }}
                      placeholder="Name (Optional)"
                      style={{ ...inputStyle }}
                    />
                    <input
                      type="text"
                      value={newRecipientInput}
                      onChange={(e) => setNewRecipientInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRecipient();
                        }
                      }}
                      placeholder="Enter ID..."
                      style={{ ...inputStyle }}
                    />
                    <button
                      onClick={handleAddRecipient}
                      style={{
                        padding: '0 0.75rem',
                        backgroundColor: '#3b82f6',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {discordRecipients.length > 0 && (
                <div style={{ marginBottom: '1.5rem', maxWidth: '640px', backgroundColor: '#0f1115', borderRadius: '8px', border: '1px solid #2d3139', overflow: 'hidden' }}>
                  <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #2d3139', backgroundColor: '#1a1d24', color: '#9ca3af', fontSize: '0.85rem', fontWeight: 600 }}>
                    Configured Endpoints ({discordRecipients.length})
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {discordRecipients.map(r => (
                      <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid #2d3139', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ color: '#e5e7eb', fontFamily: 'monospace', fontWeight: 600 }}>
                            {r.name ? `${r.name} (${r.id})` : r.id}
                          </span>
                          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Added: {new Date(r.addedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveRecipient(r.id)}
                          style={{
                            padding: '0.25rem 0.6rem',
                            backgroundColor: 'transparent',
                            border: '1px solid #ef4444',
                            borderRadius: '4px',
                            color: '#ef4444',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                          aria-label={`Remove ID ${r.id}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0, maxWidth: '400px' }}>
                  The bot will send a daily summary of your activity to the specified channel/user between 5 PM and 12 AM.
                </p>
                <button
                  onClick={testDiscordSettings}
                  disabled={testingDiscord || !discordToken || discordRecipients.length === 0}
                  style={{
                    padding: '0.6rem 1.25rem',
                    backgroundColor: testingDiscord ? '#374151' : '#3b82f6',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: (testingDiscord || !discordToken || discordRecipients.length === 0) ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {testingDiscord ? 'Sending...' : 'Test Connection'}
                </button>
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

      {/* Save (Manual trigger if needed) */}
      <div style={{ display: 'none', gap: '1rem', marginBottom: '2rem' }}>
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

      {/* Discord Setup Wizard Modal */}
      {showDiscordWizard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '2rem 1rem' }} onClick={() => setShowDiscordWizard(false)}>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '720px', border: '1px solid #2d3139', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.25rem' }}>Discord Bot Setup Wizard</h3>
                <p style={{ marginTop: '0.5rem', marginBottom: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
                  Create a Discord bot and configure it to send you or your server daily updates.
                </p>
              </div>
              <button onClick={() => setShowDiscordWizard(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }} aria-label="Close">×</button>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'visible' }}>
              <div style={{ padding: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.35rem' }}>Step 1: Create a Discord Application</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    <li>Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>Discord Developer Portal</a>.</li>
                    <li>Log in and click <strong>New Application</strong>. Name it something like "Job Tracker Bot".</li>
                    <li>In the left menu, go to the <strong>Bot</strong> tab.</li>
                  </ol>
                </div>
                <button onClick={() => (window as any).electronAPI?.openExternal?.('https://discord.com/developers/applications')} style={{ marginTop: '0.75rem', padding: '0.5rem 0.9rem', backgroundColor: '#5865F2', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Open Discord Developer Portal</button>
              </div>

              <div style={{ padding: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.35rem' }}>Step 2: Get your Bot Token</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    <li>Still on the <strong>Bot</strong> tab, locate the <strong>Token</strong> section.</li>
                    <li>Click <strong>Reset Token</strong> (or Copy if visible).</li>
                    <li><strong>Important:</strong> Copy this long string immediately. Paste it in the <strong>Bot Token</strong> field behind this modal.</li>
                  </ol>
                </div>
              </div>

              <div style={{ padding: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.35rem' }}>Step 3: Add the Bot to your Server</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    <li>In the left menu, go to <strong>OAuth2</strong> → <strong>URL Generator</strong>.</li>
                    <li>Under <strong>Scopes</strong>, check the box for <strong>bot</strong>. (A new <em>Bot Permissions</em> section will appear below).</li>
                    <li>Under <strong>Bot Permissions</strong>, select <strong>Send Messages</strong>, <strong>View Channels / Read Messages</strong>, and <strong>Embed Links</strong>.</li>
                    <li>Copy the Generated URL at the bottom and open it in a new browser tab.</li>
                    <li>Select the server you want the bot to join and authorize it.</li>
                  </ol>
                </div>
              </div>

              <div style={{ padding: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.35rem' }}>Step 4: Get your Channel or User ID</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  <ol style={{ margin: 0, paddingLeft: '1.25rem', marginBottom: '0.5rem' }}>
                    <li>Open Discord. Go to User Settings (gear icon) → <strong>Advanced</strong>. Turn on <strong>Developer Mode</strong>.</li>
                    <li>To send to a <strong>Server Channel</strong>: Right-click the channel name in your server list and choose <strong>Copy Channel ID</strong>.</li>
                    <li>To send a <strong>Direct Message</strong>: Right-click your own profile (or a friend's) and choose <strong>Copy User ID</strong>. Note: For DMs, you must share a server with the bot or it won't be able to message you.</li>
                  </ol>
                  Paste this ID into the <strong>Channel / Recipient ID</strong> field.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', flexShrink: 0 }}>
              <button onClick={() => setShowDiscordWizard(false)} style={{ padding: '0.6rem 1rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
