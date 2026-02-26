import { Express, Request, Response } from 'express';
import { Multer } from 'multer';
import { Database } from './database';
import fs from 'fs-extra';
import { fetchCompanyLogo, fetchCompanyInfo } from './companyEnrichment';
import nodemailer from 'nodemailer';

export function setupRoutes(app: Express, db: Database, upload: Multer) {
  // Companies
  app.get('/api/companies', async (req: Request, res: Response) => {
    try {
      const companies = await db.getCompanies();
      res.json(companies);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/companies/:id', async (req: Request, res: Response) => {
    try {
      const company = await db.getCompany(parseInt(req.params.id));
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }
      res.json(company);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/companies/:id/jobs', async (req: Request, res: Response) => {
    try {
      const jobs = await db.getCompanyJobs(parseInt(req.params.id));
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/companies/:id/contacts', async (req: Request, res: Response) => {
    try {
      const contacts = await db.getCompanyContacts(parseInt(req.params.id));
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/companies', async (req: Request, res: Response) => {
    try {
      let companyData = { ...req.body };

      // Fetch logo if website is provided
      if (companyData.website && !companyData.logo_url) {
        const logoUrl = await fetchCompanyLogo(companyData.website);
        if (logoUrl) {
          companyData.logo_url = logoUrl;
        }
      }

      // Fetch company info if website is provided
      if (companyData.website) {
        const companyInfo = await fetchCompanyInfo(companyData.website, companyData.name);
        if (!companyData.employee_count && companyInfo.employee_count) {
          companyData.employee_count = companyInfo.employee_count;
        }
        if (!companyData.company_size && companyInfo.company_size) {
          companyData.company_size = companyInfo.company_size;
        }
        if (!companyData.industry && companyInfo.industry) {
          companyData.industry = companyInfo.industry;
        }
      }

      const company = await db.createCompany(companyData);
      res.status(201).json(company);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/companies/:id', async (req: Request, res: Response) => {
    try {
      let companyData = { ...req.body };

      // Fetch logo if website is provided and logo_url is not set
      if (companyData.website && !companyData.logo_url) {
        const existingCompany = await db.getCompany(parseInt(req.params.id));
        if (!existingCompany?.logo_url) {
          const logoUrl = await fetchCompanyLogo(companyData.website);
          if (logoUrl) {
            companyData.logo_url = logoUrl;
          }
        }
      }

      const company = await db.updateCompany(parseInt(req.params.id), companyData);
      res.json(company);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/companies/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteCompany(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Jobs
  app.get('/api/jobs', async (req: Request, res: Response) => {
    try {
      const jobs = await db.getJobs();
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/jobs/:id', async (req: Request, res: Response) => {
    try {
      const job = await db.getJob(parseInt(req.params.id));
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/jobs', async (req: Request, res: Response) => {
    try {
      const job = await db.createJob(req.body);
      res.status(201).json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/jobs/:id', async (req: Request, res: Response) => {
    try {
      const job = await db.updateJob(parseInt(req.params.id), req.body);
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/jobs/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteJob(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contacts
  app.get('/api/contacts', async (req: Request, res: Response) => {
    try {
      const contacts = await db.getContacts();
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/jobs/:id/contacts', async (req: Request, res: Response) => {
    try {
      const contacts = await db.getJobContacts(parseInt(req.params.id));
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/contacts', async (req: Request, res: Response) => {
    try {
      const contact = await db.createContact(req.body);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/contacts/:id', async (req: Request, res: Response) => {
    try {
      const contact = await db.getContact(parseInt(req.params.id));
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/contacts/:id', async (req: Request, res: Response) => {
    try {
      const contact = await db.updateContact(parseInt(req.params.id), req.body);
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/contacts/:id/interactions', async (req: Request, res: Response) => {
    try {
      const interactions = await db.getContactInteractions(parseInt(req.params.id));
      res.json(interactions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/contacts/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteContact(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/contacts/:id/reminders', async (req: Request, res: Response) => {
    try {
      const reminders = await db.getContactReminders(parseInt(req.params.id));
      res.json(reminders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/contacts/:id/reminders', async (req: Request, res: Response) => {
    try {
      const { due_at, message, notify_desktop, notify_email } = req.body;
      if (!due_at || !message) {
        return res.status(400).json({ error: 'due_at and message are required' });
      }
      const reminder = await db.createContactReminder(
        parseInt(req.params.id),
        due_at,
        message,
        { notify_desktop, notify_email }
      );
      res.status(201).json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/reminders/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteReminder(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Interactions
  app.get('/api/interactions', async (req: Request, res: Response) => {
    try {
      const interactions = await db.getInteractions();
      res.json(interactions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/interactions/:id', async (req: Request, res: Response) => {
    try {
      const interaction = await db.getInteraction(parseInt(req.params.id));
      if (!interaction) {
        return res.status(404).json({ error: 'Interaction not found' });
      }
      res.json(interaction);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/interactions/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteInteraction(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/interactions', async (req: Request, res: Response) => {
    try {
      const interaction = await db.createInteraction(req.body);
      res.status(201).json(interaction);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reminders (desktop notifications)
  app.get('/api/reminders/due', async (req: Request, res: Response) => {
    try {
      const now = typeof req.query.now === 'string' ? req.query.now : new Date().toISOString();
      const due = await db.getDueReminders(now);
      res.json(due);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/reminders/:id/mark-sent', async (req: Request, res: Response) => {
    try {
      const updated = await db.markReminderSent(parseInt(req.params.id));
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Job reminders
  app.get('/api/jobs/:id/reminders', async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const reminders = await db.getJobReminders(jobId);
      res.json(reminders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Job follow-up reminder
  app.post('/api/jobs/:id/reminder', async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const due_at = req.body?.due_at;
      let message = req.body?.message;
      const contact_id = req.body?.contact_id;
      const notify_desktop = req.body?.notify_desktop;
      const notify_email = req.body?.notify_email;
      if (!due_at) {
        return res.status(400).json({ error: 'due_at is required' });
      }

      if (contact_id && !message) {
        const contact = await db.getContact(contact_id);
        if (contact) {
          message = `Follow up with ${contact.name}`;
        }
      }
      if (!message) {
        message = 'Follow up with Job';
      }

      const reminder = await db.createJobReminder(jobId, due_at, message, {
        notify_desktop: notify_desktop === undefined ? true : Boolean(notify_desktop),
        notify_email: notify_email === undefined ? false : Boolean(notify_email),
        contact_id
      });
      res.status(201).json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Company follow-up reminder (single reminder per company)
  app.post('/api/companies/:id/reminder', async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.id);
      const due_at = req.body?.due_at;
      const message = req.body?.message;
      const notify_desktop = req.body?.notify_desktop;
      const notify_email = req.body?.notify_email;
      if (!due_at || !message) {
        return res.status(400).json({ error: 'due_at and message are required' });
      }
      const reminder = await db.createCompanyReminder(companyId, due_at, message, {
        notify_desktop: notify_desktop === undefined ? true : Boolean(notify_desktop),
        notify_email: notify_email === undefined ? false : Boolean(notify_email)
      });
      res.status(201).json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/companies/:id/reminder', async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.id);
      await db.clearCompanyReminder(companyId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Notifications (hub + delivery)
  app.post('/api/notifications/sync-due', async (req: Request, res: Response) => {
    try {
      const now = req.body?.now || new Date().toISOString();
      const result = await db.syncDueRemindersToNotifications(now);
      const unread = await db.getUnreadNotificationCount();
      res.json({ ...result, unread });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/notifications/unread-count', async (_req: Request, res: Response) => {
    try {
      const unread = await db.getUnreadNotificationCount();
      res.json({ unread });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/notifications', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit)) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset)) : 0;
      const rows = await db.listNotifications(limit, offset);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/notifications/pending', async (req: Request, res: Response) => {
    try {
      const channel = (req.query.channel === 'email' ? 'email' : 'desktop') as 'desktop' | 'email';
      const now = typeof req.query.now === 'string' ? req.query.now : new Date().toISOString();
      const limit = req.query.limit ? parseInt(String(req.query.limit)) : 50;
      await db.syncDueRemindersToNotifications(now);
      const rows = await db.getPendingDelivery(channel, now, limit);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/notifications/:id/read', async (req: Request, res: Response) => {
    try {
      const updated = await db.markNotificationRead(parseInt(req.params.id));
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/notifications/:id/dismiss', async (req: Request, res: Response) => {
    try {
      const updated = await db.dismissNotification(parseInt(req.params.id));
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/notifications/dismiss-all', async (_req: Request, res: Response) => {
    try {
      await db.dismissAllNotifications();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/notifications/:id/delivered', async (req: Request, res: Response) => {
    try {
      const channel = req.body?.channel === 'email' ? 'email' : 'desktop';
      const updated = await db.markDelivered(parseInt(req.params.id), channel);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Documents
  app.get('/api/documents', async (req: Request, res: Response) => {
    try {
      const documents = await db.getAllDocuments();
      res.json(documents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/jobs/:id/documents', async (req: Request, res: Response) => {
    try {
      const documents = await db.getJobDocuments(parseInt(req.params.id));
      res.json(documents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/documents/general', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const document = await db.createDocument({
        job_id: null,
        filename: req.file.originalname,
        path: req.file.path,
        type: req.body.type || 'Other'
      });

      res.status(201).json(document);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/jobs/:id/documents', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const document = await db.createDocument({
        job_id: parseInt(req.params.id),
        filename: req.file.originalname,
        path: req.file.path,
        type: req.body.type || 'Other'
      });

      res.status(201).json(document);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/documents/:id', async (req: Request, res: Response) => {
    try {
      const document = await db.updateDocument(parseInt(req.params.id), req.body);
      res.json(document);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/documents/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteDocument(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Settings
  app.get('/api/settings', async (req: Request, res: Response) => {
    try {
      const settings = await db.getSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/settings', async (req: Request, res: Response) => {
    try {
      for (const [key, value] of Object.entries(req.body)) {
        await db.updateSetting(key, String(value));
      }
      const settings = await db.getSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Utility
  app.get('/api/export', async (req: Request, res: Response) => {
    try {
      const data = await db.exportData();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/reset-database', async (req: Request, res: Response) => {
    try {
      await db.resetDatabase();
      res.status(200).json({ message: 'Database reset successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- SMTP email sending ---

  app.post('/api/smtp/send-test', async (req: Request, res: Response) => {
    try {
      const settings = await db.getSettings();
      const host = settings.smtp_host;
      const port = parseInt(settings.smtp_port || '587', 10);
      const user = settings.smtp_user;
      const pass = settings.smtp_pass;
      const from = settings.smtp_from;
      const secure = (settings.smtp_secure || 'true') === 'true';
      const to = settings.smtp_recipient || from;

      if (!host || !user || !pass || !from) {
        res.status(400).json({ error: 'SMTP settings incomplete. Fill in host, user, password, and from address.' });
        return;
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: secure ? { rejectUnauthorized: false } : undefined
      } as any);

      await transporter.sendMail({
        from,
        to,
        subject: 'Job Application Tracker — SMTP test email',
        text: 'If you received this, your custom SMTP/AWS SES email configuration is working correctly.'
      });

      res.json({ ok: true });
    } catch (error: any) {
      console.error('SMTP send-test error:', error);
      res.status(500).json({ error: error.message || 'SMTP send failed' });
    }
  });

  app.post('/api/smtp/send', async (req: Request, res: Response) => {
    try {
      const { subject, html, text, to: toOverride } = req.body;
      const settings = await db.getSettings();
      const host = settings.smtp_host;
      const port = parseInt(settings.smtp_port || '587', 10);
      const user = settings.smtp_user;
      const pass = settings.smtp_pass;
      const from = settings.smtp_from;
      const secure = (settings.smtp_secure || 'true') === 'true';
      const to = toOverride || settings.smtp_recipient || from;

      if (!host || !user || !pass || !from) {
        res.status(400).json({ error: 'SMTP settings incomplete' });
        return;
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: secure ? { rejectUnauthorized: false } : undefined
      } as any);

      await transporter.sendMail({
        from,
        to,
        subject: subject || 'Job Application Tracker reminder',
        text: text || '',
        html: html || undefined
      });

      res.json({ ok: true });
    } catch (error: any) {
      console.error('SMTP send error:', error);
      res.status(500).json({ error: error.message || 'SMTP send failed' });
    }
  });
}
