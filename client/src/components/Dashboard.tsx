import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Briefcase, TrendingUp, Bell } from 'lucide-react';

interface Job {
  id: number;
  title: string;
  company_name: string;
  company_logo_url?: string;
  company_dark_logo_bg?: boolean;
  status: string;
  excitement_score: number;
  fit_score: number;
  nearest_reminder?: string;
}

interface Company {
  id: number;
  name: string;
  logo_url?: string;
  dark_logo_bg?: boolean;
  last_interaction: string;
  nearest_reminder?: string;
}

interface Contact {
  id: number;
  name: string;
  last_interaction: string;
  company_name?: string;
  company_logo_url?: string;
  company_dark_logo_bg?: boolean;
  linkedin_url?: string;
  nearest_reminder?: string;
}

interface Settings {
  username?: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, interviewing: 0, offers: 0 });
  const [topJobs, setTopJobs] = useState<Job[]>([]);
  const [recentCompanies, setRecentCompanies] = useState<Company[]>([]);
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
  const [username, setUsername] = useState('User');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [jobsRes, companiesRes, contactsRes, settingsRes, notificationsRes, unreadRes] = await Promise.all([
        api.get('/jobs'),
        api.get('/companies'),
        api.get('/contacts'),
        api.get('/settings'),
        api.get('/notifications', { params: { limit: 20, offset: 0 } }),
        api.get('/notifications/unread-count')
      ]);

      const jobs: Job[] = jobsRes.data;
      const companies: Company[] = companiesRes.data;
      const contacts: Contact[] = contactsRes.data;
      const settings: Settings = settingsRes.data;
      const allNotifs = notificationsRes.data || [];
      const unread = unreadRes.data?.unread || 0;

      // Calculate stats
      const total = jobs.length;
      const interviewing = jobs.filter(j => j.status === 'Interviewing').length;
      const offers = jobs.filter(j => j.status === 'Offer').length;

      // Top priority jobs (combined score)
      const sortedJobs = [...jobs]
        .sort((a, b) => (b.excitement_score + b.fit_score) - (a.excitement_score + a.fit_score))
        .slice(0, 3);

      // Recent companies (last 5)
      const sortedCompanies = [...companies]
        .sort((a, b) => new Date(b.last_interaction).getTime() - new Date(a.last_interaction).getTime())
        .slice(0, 5);

      // Recent contacts (last 5)
      const sortedContacts = [...contacts]
        .sort((a, b) => new Date(b.last_interaction).getTime() - new Date(a.last_interaction).getTime())
        .slice(0, 5);

      setStats({ total, interviewing, offers });
      setTopJobs(sortedJobs);
      setRecentCompanies(sortedCompanies);
      setRecentContacts(sortedContacts);
      setUsername(settings.username || 'User');
      setUnreadCount(unread);
      setNotifications(allNotifs.filter((n: any) => !n.read_at).slice(0, 5));
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#fbbf24' }}>
        Welcome back, {username}!
      </h1>

      {/* Notifications */}
      {unreadCount > 0 && (
        <section style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1.25rem', marginBottom: '2rem', border: '1px solid #2d3139' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#e5e7eb' }}>
            Needs attention ({unreadCount})
          </h2>
          {notifications.length === 0 ? (
            <p style={{ color: '#9ca3af' }}>Open the Alerts panel to view details.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {notifications.map((n: any) => (
                <Link
                  key={n.id}
                  to={n.link_path || '/'}
                  onClick={async () => {
                    try {
                      await api.post(`/notifications/${n.id}/read`);
                      setNotifications((prev) => prev.filter((x: any) => x.id !== n.id));
                      setUnreadCount((c) => Math.max(0, c - 1));
                      window.dispatchEvent(new CustomEvent('notifications-updated'));
                    } catch {
                      // ignore
                    }
                  }}
                  style={{
                    display: 'block',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#0f1115',
                    borderRadius: '6px',
                    border: '1px solid #2d3139',
                    textDecoration: 'none',
                    color: '#e5e7eb'
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>{n.title || 'Reminder'}</div>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.message}
                  </div>
                </Link>
              ))}
              {unreadCount > notifications.length && (
                <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                  And {unreadCount - notifications.length} more… (use Alerts in the top bar)
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard icon={Briefcase} label="Total Applications" value={stats.total} color="#3b82f6" />
        <StatCard icon={TrendingUp} label="Interviewing" value={stats.interviewing} color="#fbbf24" />
        <StatCard icon={Briefcase} label="Offers" value={stats.offers} color="#34d399" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Top Priority Jobs */}
        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>
            Top Priority Jobs
          </h2>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1rem' }}>
            {topJobs.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No jobs yet. Add your first application!</p>
            ) : (
              topJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/job/${job.id}`}
                  style={{
                    display: 'block',
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    backgroundColor: '#0f1115',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid #2d3139'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ color: '#e5e7eb', marginBottom: '0.25rem' }}>{job.title}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {job.company_logo_url && (
                          <img
                            src={job.company_logo_url}
                            alt={`${job.company_name} logo`}
                            style={{
                              width: '18px',
                              height: '18px',
                              objectFit: 'contain',
                              backgroundColor: job.company_dark_logo_bg ? '#e5e7eb' : '#0b0d11',
                              padding: '2px',
                              borderRadius: '4px',
                              flexShrink: 0
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>{job.company_name}</p>
                      </div>
                      {job.nearest_reminder && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                          <Bell size={12} />
                          Reminder: {new Date(job.nearest_reminder).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#fbbf24' }}>★ {job.excitement_score}</span>
                      <span style={{ color: '#34d399' }}>● {job.fit_score}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Recent Companies */}
        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>
            Recent Companies
          </h2>
          <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1rem' }}>
            {recentCompanies.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No companies yet.</p>
            ) : (
              recentCompanies.map((company) => (
                <Link
                  key={company.id}
                  to={`/company/${company.id}`}
                  style={{
                    display: 'block',
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    backgroundColor: '#0f1115',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: '#e5e7eb',
                    border: '1px solid #2d3139'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {company.logo_url && (
                      <img
                        src={company.logo_url}
                        alt={`${company.name} logo`}
                        style={{
                          width: '20px',
                          height: '20px',
                          objectFit: 'contain',
                          backgroundColor: company.dark_logo_bg ? '#e5e7eb' : '#0b0d11',
                          padding: '2px',
                          borderRadius: '4px',
                          flexShrink: 0
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <span>{company.name}</span>
                  </div>
                  {company.nearest_reminder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                      <Bell size={12} />
                      Reminder: {new Date(company.nearest_reminder).toLocaleDateString()}
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Recent Contacts */}
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#e5e7eb' }}>
          Recent Contacts
        </h2>
        <div style={{ backgroundColor: '#1a1d24', borderRadius: '8px', padding: '1rem' }}>
          {recentContacts.length === 0 ? (
            <p style={{ color: '#9ca3af' }}>No contacts yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '1rem' }}>
              {recentContacts.map((contact) => (
                <Link
                  key={contact.id}
                  to={`/contacts/${contact.id}`}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#0f1115',
                    borderRadius: '6px',
                    border: '1px solid #2d3139',
                    textAlign: 'center',
                    textDecoration: 'none',
                    color: '#e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  {contact.company_logo_url && (
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        padding: 4,
                        backgroundColor: contact.company_dark_logo_bg ? '#e5e7eb' : '#0b0d11',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #2d3139',
                        marginBottom: '0.1rem'
                      }}
                    >
                      <img
                        src={contact.company_logo_url}
                        alt={contact.company_name ? `${contact.company_name} logo` : 'Company logo'}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <p style={{ color: '#e5e7eb', fontSize: '0.9rem', margin: 0 }}>{contact.name}</p>
                  {contact.company_name && (
                    <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>{contact.company_name}</p>
                  )}
                  {contact.nearest_reminder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                      <Bell size={10} />
                      {new Date(contact.nearest_reminder).toLocaleDateString()}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div style={{
      backgroundColor: '#1a1d24',
      borderRadius: '8px',
      padding: '1.5rem',
      border: '1px solid #2d3139'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <Icon size={24} color={color} />
        <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{label}</span>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: color }}>{value}</div>
    </div>
  );
}
