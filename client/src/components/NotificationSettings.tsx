import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, AlertCircle } from 'lucide-react';
import api from '../api';

export default function NotificationSettings() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Gmail
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [gmailConnectedEmail, setGmailConnectedEmail] = useState<string | null>(null);
  const [showGmailWizard, setShowGmailWizard] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailRecipient, setGmailRecipient] = useState('');

  // AWS SES — Serverless
  const [showSesSection, setShowSesSection] = useState(false);
  const [sesRegion, setSesRegion] = useState('us-east-1');
  const [sesKeyId, setSesKeyId] = useState('');
  const [sesSecretKey, setSesSecretKey] = useState('');
  const [sesFrom, setSesFrom] = useState('');
  const [sesRecipient, setSesRecipient] = useState('');
  const [sesSmtpHost, setSesSmtpHost] = useState('');
  const [sesEncryptionKey, setSesEncryptionKey] = useState('');
  const [sesTestBusy, setSesTestBusy] = useState(false);
  const [lambdaDownloading, setLambdaDownloading] = useState(false);

  // Discord Bot
  interface DiscordRecipient { id: string; addedAt: string; name?: string; }
  const [showDiscordSection, setShowDiscordSection] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordToken, setDiscordToken] = useState('');
  const [discordRecipients, setDiscordRecipients] = useState<DiscordRecipient[]>([]);
  const [newRecipientInput, setNewRecipientInput] = useState('');
  const [newRecipientName, setNewRecipientName] = useState('');
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [showDiscordWizard, setShowDiscordWizard] = useState(false);

  // Thresholds
  const [desktopSummaryThreshold, setDesktopSummaryThreshold] = useState(5);
  const [emailSummaryThreshold, setEmailSummaryThreshold] = useState(5);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => { loadSettings().then(() => setInitialLoaded(true)); }, []);

  // Auto-save
  useEffect(() => {
    if (!initialLoaded) return;
    const timer = setTimeout(() => saveAll(), 1000);
    return () => clearTimeout(timer);
  }, [
    gmailClientId, gmailClientSecret, gmailEnabled, gmailRecipient,
    desktopSummaryThreshold, emailSummaryThreshold,
    discordEnabled, discordToken, discordRecipients,
    sesRegion, sesKeyId, sesSecretKey, sesFrom, sesRecipient, sesSmtpHost,
    initialLoaded
  ]);

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ message, type });
    if (type !== 'error') window.setTimeout(() => setToast(t => t?.message === message ? null : t), 2500);
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

      // AWS SES Serverless
      setSesRegion(res.data.ses_region || 'us-east-1');
      setSesKeyId(res.data.ses_key_id || '');
      setSesSecretKey(res.data.ses_secret_key || '');
      setSesFrom(res.data.ses_from || '');
      setSesRecipient(res.data.ses_recipient || '');
      setSesSmtpHost(res.data.ses_smtp_host || '');
      // The encryption key is auto-generated and stored locally — display it read-only
      setSesEncryptionKey(res.data.supabase_encryption_key || '');
      if (res.data.ses_key_id) setShowSesSection(true);

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
          } else if (typeof res.data.discord_recipient_id === 'string') {
            parsedRecipients = res.data.discord_recipient_id.split(',')
              .map((id: string) => ({ id: id.trim(), addedAt: new Date().toISOString() }))
              .filter((r: DiscordRecipient) => r.id.length > 0);
          }
        } catch {
          if (typeof res.data.discord_recipient_id === 'string') {
            parsedRecipients = res.data.discord_recipient_id.split(',')
              .map((id: string) => ({ id: id.trim(), addedAt: new Date().toISOString() }))
              .filter((r: DiscordRecipient) => r.id.length > 0);
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
      } catch { setGmailConnectedEmail(null); }
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
        discord_enabled: discordEnabled ? 'true' : 'false',
        discord_bot_token: discordToken,
        discord_recipient_id: JSON.stringify(discordRecipients),
        notification_desktop_summary_threshold: String(desktopSummaryThreshold),
        notification_email_summary_threshold: String(emailSummaryThreshold),
        ses_region: sesRegion || 'us-east-1',
        ses_key_id: sesKeyId || '',
        ses_secret_key: sesSecretKey || '',
        ses_from: sesFrom || '',
        ses_recipient: sesRecipient || '',
        ses_smtp_host: sesSmtpHost || '',
        // supabase_encryption_key is auto-generated and read-only — not saved from UI
      });
      showToast('Notification settings saved!', 'success');
    } catch (error) {
      console.error('Error saving notification settings:', error);
      showToast('Error saving settings', 'error');
    }
  }

  async function handleSesTest() {
    setSesTestBusy(true);
    try {
      await saveAll();
      const res = await api.post('/ses/send-test');
      showToast(`Test email sent to ${res.data.to}! Check your inbox.`, 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'SES test failed', 'error');
    } finally {
      setSesTestBusy(false);
    }
  }

  async function handleLambdaDownload() {
    setLambdaDownloading(true);
    try {
      const response = await fetch('/api/lambda/download');
      if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ses-reminder-sender.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Lambda package downloaded! Upload the zip to AWS Lambda.', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Download failed', 'error');
    } finally {
      setLambdaDownloading(false);
    }
  }

  async function handleConnectGmail() {
    const trimmedId = gmailClientId.trim();
    const trimmedSecret = gmailClientSecret.trim();
    if (!trimmedId) { showToast('Paste your Google OAuth Client ID first', 'info'); return; }
    if (!trimmedSecret) { showToast('Paste your Google OAuth Client Secret too', 'info'); return; }
    const anyWindow = window as any;
    if (!anyWindow?.electronAPI?.gmailOAuthConnect) {
      showToast('Google connect is only available in the desktop app', 'info'); return;
    }
    try {
      setGmailBusy(true);
      const result = await anyWindow.electronAPI.gmailOAuthConnect({ clientId: trimmedId, clientSecret: trimmedSecret });
      setGmailConnectedEmail(result?.email || null);
      showToast(result?.email ? `Connected: ${result.email}` : 'Connected', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to connect Google account', 'error');
    } finally { setGmailBusy(false); }
  }

  async function handleDisconnectGmail() {
    const anyWindow = window as any;
    if (!anyWindow?.electronAPI?.gmailOAuthDisconnect) {
      showToast('Google disconnect is only available in the desktop app', 'info'); return;
    }
    try {
      setGmailBusy(true);
      await anyWindow.electronAPI.gmailOAuthDisconnect();
      setGmailConnectedEmail(null);
      showToast('Disconnected Google account', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to disconnect', 'error');
    } finally { setGmailBusy(false); }
  }

  async function handleSendTestEmail() {
    const anyWindow = window as any;
    if (!anyWindow?.electronAPI?.gmailSendTest) {
      showToast('Test email is only available in the desktop app', 'info'); return;
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
    } finally { setGmailBusy(false); }
  }

  async function testDiscordSettings() {
    if (!discordToken || discordRecipients.length === 0) {
      showToast('Token and at least one Recipient ID are required for testing.', 'error'); return;
    }
    setTestingDiscord(true);
    try {
      await api.post('/discord/test', { token: discordToken, channelId: discordRecipients.map(r => r.id).join(',') });
      showToast('Test message sent to Discord!', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to send test message.', 'error');
    } finally { setTestingDiscord(false); }
  }

  function handleAddRecipient() {
    const val = newRecipientInput.trim();
    if (!val) return;
    if (discordRecipients.some(r => r.id === val)) {
      showToast('This ID is already in the list.', 'info');
      setNewRecipientInput(''); setNewRecipientName(''); return;
    }
    setDiscordRecipients(prev => [...prev, { id: val, name: newRecipientName.trim() || undefined, addedAt: new Date().toISOString() }]);
    setNewRecipientInput(''); setNewRecipientName('');
  }

  function handleRemoveRecipient(id: string) {
    setDiscordRecipients(prev => prev.filter(r => r.id !== id));
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem',
    backgroundColor: '#0f1115', border: '1px solid #2d3139',
    borderRadius: '6px', color: '#e5e7eb'
  } as const;

  return (
    <div>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#fbbf24' }}>Notifications &amp; Email</h1>

      {/* ===== Gmail (local sending via Electron) ===== */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: '#e5e7eb' }}>Gmail (Local Email)</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
              Sends reminders directly from your Gmail when the desktop app is running.
            </p>
          </div>
          <button onClick={() => setShowGmailWizard(true)}
            style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>
            Setup Wizard
          </button>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: '#e5e7eb' }}>
            <input type="checkbox" checked={gmailEnabled} onChange={e => setGmailEnabled(e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#fbbf24' }} />
            <span>Enable Gmail reminders</span>
          </label>
          <span style={{ color: gmailConnectedEmail ? '#34d399' : '#6b7280', fontSize: '0.875rem' }}>
            {gmailConnectedEmail ? `Connected: ${gmailConnectedEmail}` : 'Not connected'}
          </span>
        </div>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', maxWidth: '640px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Client ID</label>
            <input type="text" value={gmailClientId} onChange={e => setGmailClientId(e.target.value)} placeholder="Paste Google OAuth Client ID" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Client Secret</label>
            <input type="password" value={gmailClientSecret} onChange={e => setGmailClientSecret(e.target.value)} placeholder="Paste Google OAuth Client Secret" style={inputStyle} />
          </div>
          <div>
            <button disabled={gmailBusy} onClick={handleConnectGmail}
              style={{ padding: '0.75rem 1rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: gmailBusy ? 'not-allowed' : 'pointer', opacity: gmailBusy ? 0.7 : 1 }}>
              Connect Google
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', maxWidth: '520px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Send reminders to</label>
          <input type="email" value={gmailRecipient} onChange={e => setGmailRecipient(e.target.value)} placeholder="Leave blank to send to your own Gmail" style={inputStyle} />
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button disabled={gmailBusy} onClick={handleSendTestEmail}
            style={{ padding: '0.5rem 1rem', backgroundColor: '#1f2937', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: gmailBusy ? 'not-allowed' : 'pointer', opacity: gmailBusy ? 0.7 : 1 }}>
            Send test email
          </button>
          <button disabled={gmailBusy} onClick={handleDisconnectGmail}
            style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', border: '1px solid #4b5563', borderRadius: '6px', color: '#f87171', cursor: gmailBusy ? 'not-allowed' : 'pointer', opacity: gmailBusy ? 0.7 : 1 }}>
            Disconnect
          </button>
        </div>

        <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.75rem' }}>
          Find the <strong>Client ID</strong> and <strong>Client Secret</strong> in Google Cloud Console under <em>APIs &amp; Services → Credentials</em>. Click Setup Wizard above for a step-by-step guide.
        </p>
      </section>

      {/* ===== Serverless Email (AWS SES + Lambda) ===== */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', marginBottom: '2rem', overflow: 'hidden' }}>
        <button onClick={() => setShowSesSection(!showSesSection)}
          style={{ width: '100%', padding: '1.25rem 1.5rem', backgroundColor: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}>
          {showSesSection ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Serverless Email (AWS SES)</span>
            <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '2px' }}>
              <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#10b98122', padding: '1px 8px', borderRadius: '99px' }}>WORKS WHEN PC IS OFF</span>
              <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Reminders sent via AWS Lambda even when your computer is off</span>
            </span>
          </div>
          {sesKeyId && <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Configured</span>}
        </button>

        {showSesSection && (
          <div style={{ padding: '0 1.5rem 1.5rem' }}>
            <div style={{ borderTop: '1px solid #2d3139', paddingTop: '1rem' }}>

              {/* How it works */}
              <div style={{ padding: '1rem', backgroundColor: '#0f1115', borderRadius: '8px', border: '1px solid #10b98133', marginBottom: '1.5rem' }}>
                <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>How this works</div>
                <ol style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                  <li>Enter your AWS SES SMTP credentials below and click <strong style={{ color: '#e5e7eb' }}>Test Email</strong>.</li>
                  <li>Click <strong style={{ color: '#fbbf24' }}>Download Lambda Package</strong> — your encryption key is pre-bundled inside automatically.</li>
                  <li>Upload the zip to AWS Lambda. Add <code style={{ color: '#fbbf24' }}>SUPABASE_URL</code> and <code style={{ color: '#fbbf24' }}>SUPABASE_SERVICE_KEY</code> as env vars.</li>
                  <li>Set an EventBridge schedule (e.g. every 15 min) and you're done.</li>
                </ol>
              </div>

              {/* Multiple Computers Warning */}
              <div style={{ padding: '1rem', backgroundColor: '#fbbf2415', borderRadius: '8px', border: '1px solid #fbbf2444', marginBottom: '1.5rem' }}>
                <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={16} /> 
                  Using Multiple Computers?
                </div>
                <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                  If you already configured Email Reminders and deployed your Lambda from your <strong>primary computer</strong>, you do <strong>not</strong> need to configure it again here. The Cloud App relies on the encryption key generated on your primary PC. Simply skip this section and let your primary setup handle the emails!
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '640px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>AWS Region</label>
                  <input type="text" value={sesRegion} onChange={e => setSesRegion(e.target.value)} placeholder="us-east-1" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Custom SMTP Host <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span></label>
                  <input type="text" value={sesSmtpHost} onChange={e => setSesSmtpHost(e.target.value)} placeholder={`Auto: email-smtp.${sesRegion || 'us-east-1'}.amazonaws.com`} style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>SMTP Username <span style={{ color: '#6b7280', fontWeight: 400 }}>(SES → SMTP Settings → Create Credentials)</span></label>
                  <input type="text" value={sesKeyId} onChange={e => setSesKeyId(e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>SMTP Password</label>
                  <input type="password" value={sesSecretKey} onChange={e => setSesSecretKey(e.target.value)} placeholder="SMTP password from AWS" style={inputStyle} />
                  <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                    ⚠️ This is the SMTP password from <strong>SES → SMTP Settings</strong>, not your AWS secret access key.
                  </p>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>From address <span style={{ color: '#ef4444', fontWeight: 400 }}>*verified in SES</span></label>
                  <input type="email" value={sesFrom} onChange={e => setSesFrom(e.target.value)} placeholder="you@yourdomain.com" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>Send reminders to</label>
                  <input type="email" value={sesRecipient} onChange={e => setSesRecipient(e.target.value)} placeholder="Leave blank to use From address" style={inputStyle} />
                </div>

                {/* Auto-generated encryption key — read-only */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: '#e5e7eb', fontSize: '0.875rem' }}>
                    Encryption Key
                    <span style={{ marginLeft: '8px', color: '#10b981', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#10b98122', padding: '1px 8px', borderRadius: '99px' }}>AUTO-GENERATED</span>
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      readOnly
                      type="password"
                      value={sesEncryptionKey}
                      style={{ ...inputStyle, flex: 1, cursor: 'default', color: '#6b7280' }}
                    />
                    <button
                      title="Copy key"
                      onClick={() => { navigator.clipboard.writeText(sesEncryptionKey); showToast('Key copied', 'success'); }}
                      style={{ padding: '0.75rem', backgroundColor: '#2d3139', border: '1px solid #374151', borderRadius: '6px', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Copy size={16} />
                    </button>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                    Randomly generated on first run. Stored locally only — never synced to Supabase. It's pre-bundled into the Lambda download below so you don't have to copy it manually.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button onClick={handleSesTest} disabled={sesTestBusy || !sesKeyId || !sesSecretKey}
                  style={{ padding: '0.6rem 1.25rem', backgroundColor: (!sesKeyId || sesTestBusy) ? '#374151' : '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: (!sesKeyId || !sesSecretKey || sesTestBusy) ? 'not-allowed' : 'pointer', opacity: (!sesKeyId || !sesSecretKey || sesTestBusy) ? 0.7 : 1 }}>
                  {sesTestBusy ? 'Sending...' : '✉ Send Test Email'}
                </button>

                <button onClick={handleLambdaDownload} disabled={lambdaDownloading}
                  style={{ padding: '0.6rem 1.25rem', backgroundColor: lambdaDownloading ? '#374151' : '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f1115', fontWeight: 'bold', cursor: lambdaDownloading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: lambdaDownloading ? 0.7 : 1 }}>
                  <Download size={16} />
                  {lambdaDownloading ? 'Preparing...' : 'Download Lambda Package'}
                </button>

                <a href="https://us-east-1.console.aws.amazon.com/ses/home#/smtp" target="_blank" rel="noreferrer"
                  style={{ padding: '0.6rem 1rem', border: '1px solid #2d3139', borderRadius: '6px', color: '#9ca3af', textDecoration: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center' }}>
                  Open AWS SES SMTP Settings ↗
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===== Discord Bot ===== */}
      <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', marginBottom: '2rem', overflow: 'hidden' }}>
        <button onClick={() => setShowDiscordSection(!showDiscordSection)}
          style={{ width: '100%', padding: '1.25rem 1.5rem', backgroundColor: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}>
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
                  <input type="checkbox" checked={discordEnabled} onChange={e => setDiscordEnabled(e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#fbbf24' }} />
                  <span>Enable Discord Bot</span>
                </label>
                <button onClick={() => setShowDiscordWizard(true)}
                  style={{ padding: '0.4rem 0.8rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Setup Wizard
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', maxWidth: '640px' }}>
                <div>
                  <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Bot Token</label>
                  <input type="password" value={discordToken} onChange={e => setDiscordToken(e.target.value)} placeholder="MTIzNDU2Nzg5..." style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Add Channel / User ID</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: '0.5rem' }}>
                    <input type="text" value={newRecipientName} onChange={e => setNewRecipientName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRecipient(); } }}
                      placeholder="Name (optional)" style={inputStyle} />
                    <input type="text" value={newRecipientInput} onChange={e => setNewRecipientInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRecipient(); } }}
                      placeholder="Enter ID..." style={inputStyle} />
                    <button onClick={handleAddRecipient}
                      style={{ padding: '0 0.75rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
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
                        <button onClick={() => handleRemoveRecipient(r.id)}
                          style={{ padding: '0.25rem 0.6rem', backgroundColor: 'transparent', border: '1px solid #ef4444', borderRadius: '4px', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer' }}>
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
                <button onClick={testDiscordSettings} disabled={testingDiscord || !discordToken || discordRecipients.length === 0}
                  style={{ padding: '0.6rem 1.25rem', backgroundColor: testingDiscord ? '#374151' : '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: (testingDiscord || !discordToken || discordRecipients.length === 0) ? 'not-allowed' : 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
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
            <input type="number" min={1} max={50} value={desktopSummaryThreshold} onChange={e => setDesktopSummaryThreshold(parseInt(e.target.value || '5', 10) || 5)} style={inputStyle} />
            <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
              If ≥ this many desktop reminders are due, show one "X items need attention" notification.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Email summary threshold</label>
            <input type="number" min={1} max={50} value={emailSummaryThreshold} onChange={e => setEmailSummaryThreshold(parseInt(e.target.value || '5', 10) || 5)} style={inputStyle} />
            <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
              If ≥ this many email reminders are due, send one summary email instead of multiple.
            </p>
          </div>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 2000, padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #2d3139', backgroundColor: '#0f1115', color: '#e5e7eb', boxShadow: '0 12px 30px rgba(0,0,0,0.45)', minWidth: '260px', maxWidth: '420px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: 999, backgroundColor: toast.type === 'success' ? '#34d399' : toast.type === 'error' ? '#ef4444' : '#3b82f6', flexShrink: 0 }} />
          <div style={{ fontSize: '0.9rem', lineHeight: 1.2, flex: 1 }}>{toast.message}</div>
          <button onClick={() => setToast(null)} style={{ padding: '0.25rem 0.4rem', backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Gmail Setup Wizard Modal */}
      {showGmailWizard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setShowGmailWizard(false)}>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '12px', padding: '1.5rem', width: '92%', maxWidth: '680px', border: '1px solid #2d3139' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.25rem' }}>Gmail Setup Wizard</h3>
                <p style={{ marginTop: '0.5rem', marginBottom: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
                  Create a <strong>Desktop app</strong> OAuth credential, then paste the <strong>Client ID</strong> and <strong>Client Secret</strong> below.
                </p>
              </div>
              <button onClick={() => setShowGmailWizard(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
              {[
                { step: 1, title: 'Open Google Cloud Console', desc: 'Create (or select) a project.', url: 'https://console.cloud.google.com/', label: 'Open Console' },
                { step: 2, title: 'Enable Gmail API', desc: 'Search for "Gmail API" and enable it.', url: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com', label: 'Open Gmail API page' },
                { step: 3, title: 'Configure OAuth Consent Screen', desc: 'Choose External, fill app name, add yourself as a test user.', url: 'https://console.cloud.google.com/apis/credentials/consent', label: 'Open consent screen' },
                { step: 4, title: 'Create OAuth Client ID (Desktop app)', desc: 'Go to Credentials → Create Credentials → OAuth client ID → Application type: Desktop app.', url: 'https://console.cloud.google.com/apis/credentials', label: 'Open Credentials' },
              ].map(({ step, title, desc, url, label }) => (
                <div key={step} style={{ padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                  <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.25rem' }}>Step {step} — {title}</div>
                  <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{desc}</div>
                  <button onClick={() => (window as any).electronAPI?.openExternal?.(url)}
                    style={{ marginTop: '0.5rem', padding: '0.5rem 0.9rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                    {label}
                  </button>
                </div>
              ))}
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.25rem' }}>Step 5 — Copy Client ID &amp; Client Secret</div>
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                  After creating the credential, copy the <strong>Client ID</strong> (ends with <code style={{ color: '#e5e7eb' }}>.apps.googleusercontent.com</code>) and <strong>Client Secret</strong>. Paste both into the fields on this page, then click <strong>Connect Google</strong>.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setShowGmailWizard(false)} style={{ padding: '0.6rem 1rem', backgroundColor: 'transparent', border: '1px solid #2d3139', borderRadius: '6px', color: '#e5e7eb', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Discord Setup Wizard Modal */}
      {showDiscordWizard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '2rem 1rem' }} onClick={() => setShowDiscordWizard(false)}>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '720px', border: '1px solid #2d3139', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.25rem' }}>Discord Bot Setup Wizard</h3>
                <p style={{ marginTop: '0.5rem', marginBottom: 0, color: '#9ca3af', fontSize: '0.9rem' }}>Create a Discord bot and configure it to send you daily updates.</p>
              </div>
              <button onClick={() => setShowDiscordWizard(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { step: 1, title: 'Create a Discord Application', body: <ol style={{ margin: 0, paddingLeft: '1.25rem' }}><li>Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>Discord Developer Portal</a>.</li><li>Click <strong>New Application</strong>. Name it "Job Tracker Bot".</li><li>Go to the <strong>Bot</strong> tab.</li></ol>, btn: { label: 'Open Discord Developer Portal', url: 'https://discord.com/developers/applications', color: '#5865F2' } },
                { step: 2, title: 'Get your Bot Token', body: <ol style={{ margin: 0, paddingLeft: '1.25rem' }}><li>On the <strong>Bot</strong> tab, click <strong>Reset Token</strong> (or Copy if visible).</li><li>Copy this token and paste it into the <strong>Bot Token</strong> field.</li></ol> },
                { step: 3, title: 'Add the Bot to your Server', body: <ol style={{ margin: 0, paddingLeft: '1.25rem' }}><li>Go to <strong>OAuth2 → URL Generator</strong>. Check <strong>bot</strong> scope.</li><li>Under Bot Permissions select <strong>Send Messages</strong>, <strong>View Channels</strong>, <strong>Embed Links</strong>.</li><li>Copy the generated URL, open it in a browser, and authorize the bot to your server.</li></ol> },
                { step: 4, title: 'Get your Channel or User ID', body: <ol style={{ margin: 0, paddingLeft: '1.25rem' }}><li>Open Discord → User Settings → Advanced → Enable <strong>Developer Mode</strong>.</li><li><strong>Channel:</strong> Right-click the channel → Copy Channel ID.</li><li><strong>DM:</strong> Right-click your profile → Copy User ID.</li><li>Paste the ID into the Channel / Recipient ID field above.</li></ol> },
              ].map(({ step, title, body, btn }: any) => (
                <div key={step} style={{ padding: '1rem', backgroundColor: '#0f1115', border: '1px solid #2d3139', borderRadius: '10px' }}>
                  <div style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '0.35rem' }}>Step {step}: {title}</div>
                  <div style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.5 }}>{body}</div>
                  {btn && <button onClick={() => (window as any).electronAPI?.openExternal?.(btn.url)} style={{ marginTop: '0.75rem', padding: '0.5rem 0.9rem', backgroundColor: btn.color || '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{btn.label}</button>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setShowDiscordWizard(false)} style={{ padding: '0.6rem 1rem', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
