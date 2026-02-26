import { Express, Request, Response } from 'express';
import { Multer } from 'multer';
import { Database } from './database';
import fs from 'fs-extra';
import path from 'path';
import { fetchCompanyLogo, fetchCompanyInfo } from './companyEnrichment';
import nodemailer from 'nodemailer';
import * as XLSX from 'xlsx';

export function setupRoutes(app: Express, db: Database, upload: Multer, uploadsPath: string) {
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
        const logoUrl = await fetchCompanyLogo(companyData.website, uploadsPath);
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

      // Fetch existing company to check for website changes
      const existingCompany = await db.getCompany(parseInt(req.params.id));

      if (existingCompany) {
        // Did the website change?
        if (companyData.website !== existingCompany.website) {
          if (!companyData.website) {
            // Website was cleared, clear the logo
            companyData.logo_url = null;
          } else {
            // Website was changed, force a new logo fetch
            const logoUrl = await fetchCompanyLogo(companyData.website, uploadsPath);
            companyData.logo_url = logoUrl || null;
          }
        } else if (companyData.website && !companyData.logo_url && !existingCompany.logo_url) {
          // Website is the same, but no logo exists. Try fetching again (perhaps it was added recently)
          const logoUrl = await fetchCompanyLogo(companyData.website, uploadsPath);
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

  app.post('/api/companies/:id/logo', upload.single('logo'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No logo file uploaded' });
      }

      const existingCompany = await db.getCompany(parseInt(req.params.id));
      if (!existingCompany) {
        // Clean up the uploaded file since the company doesn't exist
        await fs.remove(req.file.path);
        return res.status(404).json({ error: 'Company not found' });
      }

      // We need to move the file to the logos directory to keep things organized
      const logosDir = path.join(uploadsPath, 'logos');
      await fs.ensureDir(logosDir);

      const targetPath = path.join(logosDir, req.file.filename);
      await fs.move(req.file.path, targetPath);

      // Update the company's logo URL in the database
      const relativeUrl = `/uploads/logos/${req.file.filename}`;
      const updatedCompany = await db.updateCompany(existingCompany.id, {
        ...existingCompany,
        logo_url: relativeUrl
      });

      res.json(updatedCompany);
    } catch (error: any) {
      // Try to clean up if something failed
      if (req.file) {
        await fs.remove(req.file.path).catch(() => { });
      }
      console.error('Error handling logo upload:', error);
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

  // Company reminders (read + write)
  app.get('/api/companies/:id/reminders', async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.id);
      const reminders = await db.getCompanyReminders(companyId);
      res.json(reminders);
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

  app.get('/api/export/excel', async (req: Request, res: Response) => {
    try {
      const data = await db.exportData();

      // Create a new workbook
      const wb = XLSX.utils.book_new();

      // Map Companies for export
      const companiesExport = data.companies.map((c: any) => ({
        'Name': c.name,
        'Industry': c.industry,
        'Company Size': c.company_size,
        'Location': c.location,
        'Website': c.website,
        'Employee Count': c.employee_count,
        'Notes': c.notes,
        'Last Interaction': c.last_interaction
      }));

      // Map Jobs for export
      const jobsExport = data.jobs.map((j: any) => ({
        'Company': j.company_name,
        'Title': j.title,
        'Status': j.status,
        'Location': j.location,
        'Fit Score': j.fit_score,
        'Excitement Score': j.excitement_score,
        'Link': j.link,
        'Created At': j.created_at,
        'Notes': j.notes,
        'Description': j.description
      }));

      // Map Contacts for export
      const contactsExport = data.contacts.map((c: any) => ({
        'Name': c.name,
        'Role': c.role,
        'Email': c.email,
        'Phone': c.phone,
        'LinkedIn': c.linkedin_url,
        'Company': data.companies.find((co: any) => co.id === c.company_id)?.name || '',
        'Notes': c.notes,
        'Last Interaction': c.last_interaction
      }));

      // Convert to sheets
      if (companiesExport.length > 0) {
        const ws = XLSX.utils.json_to_sheet(companiesExport);
        XLSX.utils.book_append_sheet(wb, ws, 'Companies');
      }

      if (jobsExport.length > 0) {
        const ws = XLSX.utils.json_to_sheet(jobsExport);
        XLSX.utils.book_append_sheet(wb, ws, 'Jobs');
      }

      if (contactsExport.length > 0) {
        const ws = XLSX.utils.json_to_sheet(contactsExport);
        XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
      }

      if (data.interactions && data.interactions.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data.interactions);
        XLSX.utils.book_append_sheet(wb, ws, 'Interactions');
      }

      // Buffer to hold the Excel file
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', `attachment; filename="job-tracker-export-${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
    } catch (error: any) {
      console.error('Excel export error:', error);
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

  // Extract just city + state from LinkedIn-style addresses
  // e.g. "90026, California, Los Angeles, United States" → "Los Angeles, California"
  //      "Charleroi [BELGIUM], Belgium" → "Charleroi"
  function parseCityState(address: string): string | null {
    if (!address) return null;

    // Remove bracketed tags like [BELGIUM]
    let cleaned = address.replace(/\[.*?\]/g, '').trim();

    // Split by comma
    const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;

    // Remove country names (last part is typically the country)
    const countries = ['united states', 'united kingdom', 'canada', 'australia', 'germany', 'france',
      'netherlands', 'belgium', 'india', 'japan', 'china', 'brazil', 'spain', 'italy', 'sweden',
      'switzerland', 'ireland', 'israel', 'singapore', 'south korea', 'denmark', 'norway', 'finland',
      'austria', 'poland', 'portugal', 'mexico', 'new zealand', 'czech republic', 'romania',
      'hungary', 'greece', 'turkey', 'argentina', 'colombia', 'chile', 'ukraine', 'thailand',
      'philippines', 'indonesia', 'malaysia', 'vietnam', 'pakistan', 'bangladesh', 'egypt',
      'south africa', 'nigeria', 'kenya', 'uae', 'saudi arabia', 'qatar', 'luxembourg', 'estonia',
      'latvia', 'lithuania', 'croatia', 'serbia', 'bulgaria', 'slovakia', 'slovenia', 'iceland',
      'malta', 'cyprus', 'taiwan', 'hong kong'];
    while (parts.length > 1 && countries.includes(parts[parts.length - 1].toLowerCase())) {
      parts.pop();
    }

    // Remove leading zip codes (digits-only parts at the start)
    while (parts.length > 1 && /^\d+$/.test(parts[0])) {
      parts.shift();
    }

    if (parts.length === 0) return null;

    // For US-style "State, City" remaining → return "City, State"
    if (parts.length >= 2) {
      const city = parts[parts.length - 1];
      const state = parts[parts.length - 2];
      return `${city}, ${state}`;
    }

    return parts[0] || null;
  }

  // Import companies from Excel
  app.post('/api/import/companies', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames.includes('Companies')
        ? 'Companies'
        : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const existingCompanies = await db.getCompanies();
      const existingNames = new Set(existingCompanies.map((c: any) => c.name?.toLowerCase().trim()));

      const settings = await db.getSettings();
      const existingIndustries: string[] = settings.industries
        ? settings.industries.split('|').map((s: string) => s.trim()).filter(Boolean)
        : [];
      const industrySet = new Set(existingIndustries.map(i => i.toLowerCase()));
      const newIndustries: string[] = [];

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const importedCompanies: { id: number; website: string }[] = [];

      for (const row of rows) {
        const name = (row['Name'] || '').toString().trim();
        if (!name) {
          skipped++;
          continue;
        }

        if (existingNames.has(name.toLowerCase())) {
          skipped++;
          continue;
        }

        // Handle both Import and Export format
        const industry = (row['Industry'] || '').toString().trim();
        const website = (row['Website'] || '').toString().trim() || null;
        const employeeRange = row['Company Size'] || row['Employee Range'] || null;
        const employeeCount = row['Employee Count'] ? parseInt(row['Employee Count']) : null;

        // Location logic: use 'Location' (export) or parse 'Address' (LinkedIn import)
        let location = null;
        if (row['Location']) {
          location = row['Location'].toString().trim();
        } else if (row['Address']) {
          location = parseCityState(row['Address'].toString().trim());
        }

        // Notes logic: use 'Notes' (export) or build from LinkedIn parts
        let notes = null;
        if (row['Notes']) {
          notes = row['Notes'].toString().trim();
        } else {
          const noteParts: string[] = [];
          if (row['Tagline']) noteParts.push(row['Tagline'].toString().trim());
          if (row['Description']) noteParts.push(row['Description'].toString().trim());
          if (row['Specialities']) noteParts.push(`Specialities: ${row['Specialities'].toString().trim()}`);
          if (row['LinkedIn URL']) noteParts.push(`LinkedIn: ${row['LinkedIn URL'].toString().trim()}`);
          notes = noteParts.length > 0 ? noteParts.join('\n\n') : null;
        }

        if (industry && !industrySet.has(industry.toLowerCase())) {
          industrySet.add(industry.toLowerCase());
          newIndustries.push(industry);
        }

        try {
          const created = await db.createCompany({
            name,
            website,
            industry: industry || null,
            notes,
            location,
            employee_count: employeeCount,
            company_size: employeeRange ? employeeRange.toString().trim() : null,
            logo_url: null,
            dark_logo_bg: false
          });
          existingNames.add(name.toLowerCase());
          imported++;

          if (created && website) {
            importedCompanies.push({ id: created.id, website });
          }
        } catch (err: any) {
          errors.push(`${name}: ${err.message}`);
        }
      }

      if (newIndustries.length > 0) {
        const allIndustries = [...existingIndustries, ...newIndustries];
        await db.updateSetting('industries', allIndustries.join('|'));
      }

      await fs.remove(req.file.path);
      res.json({ imported, skipped, errors, newIndustries });

      if (importedCompanies.length > 0) {
        (async () => {
          for (const { id, website } of importedCompanies) {
            try {
              const logoUrl = await fetchCompanyLogo(website, uploadsPath);
              if (logoUrl) {
                const company = await db.getCompany(id);
                if (company) await db.updateCompany(id, { ...company, logo_url: logoUrl });
              }
            } catch (err) {
              console.error(`Logo fetch failed for company ${id}:`, err);
            }
          }
        })();
      }
    } catch (error: any) {
      console.error('Import error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Import jobs from Excel
  app.post('/api/import/jobs', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames.includes('Jobs') ? 'Jobs' : workbook.SheetNames[0];
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const title = (row['Title'] || '').toString().trim();
        const companyName = (row['Company'] || '').toString().trim();
        if (!title || !companyName) { skipped++; continue; }

        try {
          // Link to or create company
          const company = await db.findOrCreateCompany(companyName);

          await db.createJob({
            company_id: company.id,
            title,
            status: row['Status'] || 'Interested',
            location: row['Location'] || null,
            fit_score: parseInt(row['Fit Score']) || 1,
            excitement_score: parseInt(row['Excitement Score']) || 1,
            link: row['Link'] || null,
            notes: row['Notes'] || null,
            description: row['Description'] || null,
            created_at: row['Created At'] || new Date().toISOString()
          });
          imported++;
        } catch (err: any) {
          errors.push(`${title} @ ${companyName}: ${err.message}`);
        }
      }

      await fs.remove(req.file.path);
      res.json({ imported, skipped, errors });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Import contacts from Excel
  app.post('/api/import/contacts', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames.includes('Contacts') ? 'Contacts' : workbook.SheetNames[0];
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const name = (row['Name'] || '').toString().trim();
        const companyName = (row['Company'] || '').toString().trim();
        const email = (row['Email'] || '').toString().trim();
        if (!name) { skipped++; continue; }

        try {
          let companyId = null;
          if (companyName) {
            const company = await db.findOrCreateCompany(companyName);
            companyId = company.id;
          }

          await db.createContact({
            company_id: companyId,
            name,
            role: row['Role'] || null,
            email: email || null,
            phone: row['Phone'] || null,
            linkedin_url: row['LinkedIn'] || null,
            notes: row['Notes'] || null,
            last_interaction: row['Last Interaction'] || null
          });
          imported++;
        } catch (err: any) {
          errors.push(`${name}: ${err.message}`);
        }
      }

      await fs.remove(req.file.path);
      res.json({ imported, skipped, errors });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
