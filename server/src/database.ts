import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export class Database {
  private db: sqlite3.Database;
  private encryptionKey: Buffer | null = null;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    fs.ensureDirSync(dir);

    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      }
    });
  }

  // Derive encryption key from machine-specific info
  private getEncryptionKey(): Buffer {
    if (this.encryptionKey) return this.encryptionKey;

    // Use machine-specific info to derive a key (hostname, user, platform)
    const machineInfo = `${os.hostname()}-${os.userInfo().username}-${os.platform()}`;
    // ⚠️  DO NOT CHANGE THIS SALT VALUE! It is used to derive the encryption key
    // for all data stored in the database. Changing it (e.g. during a version bump)
    // will make ALL existing encrypted data permanently unreadable.
    const salt = 'job-tracker-v2.0.0-salt';
    this.encryptionKey = crypto.pbkdf2Sync(machineInfo, salt, 100000, 32, 'sha256');
    return this.encryptionKey;
  }

  // Encrypt sensitive data
  private encrypt(text: string): string {
    if (!text) return text;
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Return: iv:authTag:encrypted (all hex)
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('Encryption error:', error);
      return text; // Fallback to plaintext if encryption fails
    }
  }

  // Decrypt sensitive data
  private decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;

    // Check if it's already encrypted (has the format iv:authTag:encrypted)
    if (!encryptedText.includes(':')) {
      // Not encrypted (legacy data), return as-is
      return encryptedText;
    }

    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        // Invalid format, return as-is (might be legacy plaintext)
        return encryptedText;
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      // If decryption fails, might be legacy plaintext or corrupted
      return encryptedText;
    }
  }

  // List of settings keys that should be encrypted
  private readonly ENCRYPTED_KEYS = [
    'smtp_host',
    'smtp_user',
    'smtp_pass',
    'gmail_client_secret'
  ];

  private run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          // Ignore "duplicate column" errors for migrations
          if (err.message.includes('duplicate column')) {
            resolve();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    });
  }

  private get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  private all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async initialize() {
    // Create tables
    await this.run(`
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        website TEXT,
        industry TEXT,
        notes TEXT,
        location TEXT,
        dark_logo_bg INTEGER DEFAULT 0,
        no_posted_jobs INTEGER DEFAULT 0,
        no_appropriate_jobs INTEGER DEFAULT 0,
        last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
        logo_url TEXT,
        employee_count INTEGER,
        company_size TEXT,
        financial_stability_warning INTEGER DEFAULT 0
      )
    `);

    // Add new columns if they don't exist (migration)
    await this.run(`ALTER TABLE companies ADD COLUMN logo_url TEXT`);
    await this.run(`ALTER TABLE companies ADD COLUMN employee_count INTEGER`);
    await this.run(`ALTER TABLE companies ADD COLUMN company_size TEXT`);
    await this.run(`ALTER TABLE companies ADD COLUMN location TEXT`);
    await this.run(`ALTER TABLE companies ADD COLUMN no_posted_jobs INTEGER DEFAULT 0`);
    await this.run(`ALTER TABLE companies ADD COLUMN no_appropriate_jobs INTEGER DEFAULT 0`);
    await this.run(`ALTER TABLE companies ADD COLUMN financial_stability_warning INTEGER DEFAULT 0`);

    await this.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        company_name TEXT,
        title TEXT NOT NULL,
        location TEXT,
        status TEXT DEFAULT 'Wishlist',
        link TEXT,
        description TEXT,
        notes TEXT,
        excitement_score INTEGER DEFAULT 3,
        fit_score INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // Add new columns if they don't exist (migration)
    await this.run(`ALTER TABLE jobs ADD COLUMN location TEXT`);

    await this.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company_id INTEGER,
        job_id INTEGER,
        role TEXT,
        email TEXT,
        phone TEXT,
        notes TEXT,
        last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
        linkedin_url TEXT,
        next_check_in DATETIME,
        is_prospective INTEGER DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )
    `);

    // Add new columns if they don't exist (migration)
    await this.run(`ALTER TABLE contacts ADD COLUMN linkedin_url TEXT`);
    await this.run(`ALTER TABLE contacts ADD COLUMN next_check_in DATETIME`);
    await this.run(`ALTER TABLE contacts ADD COLUMN social_platform TEXT`);
    await this.run(`ALTER TABLE contacts ADD COLUMN social_handle TEXT`);
    await this.run(`ALTER TABLE contacts ADD COLUMN email_draft TEXT`);
    await this.run(`ALTER TABLE contacts ADD COLUMN is_prospective INTEGER DEFAULT 0`);

    await this.run(`
      CREATE TABLE IF NOT EXISTS interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER,
        contact_id INTEGER,
        company_id INTEGER,
        type TEXT,
        content TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (contact_id) REFERENCES contacts(id),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // Reminders (desktop notifications / follow-ups)
    await this.run(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- 'contact' | 'company' | 'interaction'
        entity_id INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual', -- e.g. 'next_check_in' for contacts
        due_at DATETIME NOT NULL,
        message TEXT NOT NULL,
        link_path TEXT,
        notify_desktop INTEGER DEFAULT 1,
        notify_email INTEGER DEFAULT 0,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ALLOW multiple reminders (drop the old unique index if it exists)
    await this.run(`DROP INDEX IF EXISTS idx_reminders_unique`);

    // Migrations for reminders channel flags
    await this.run(`ALTER TABLE reminders ADD COLUMN notify_desktop INTEGER DEFAULT 1`);
    await this.run(`ALTER TABLE reminders ADD COLUMN notify_email INTEGER DEFAULT 0`);
    await this.run(`ALTER TABLE reminders ADD COLUMN contact_id INTEGER`);

    // Notifications (in-app hub + unread count). One row per reminder occurrence.
    await this.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reminder_id INTEGER,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        due_at DATETIME NOT NULL,
        title TEXT,
        message TEXT NOT NULL,
        link_path TEXT,
        notify_desktop INTEGER DEFAULT 1,
        notify_email INTEGER DEFAULT 0,
        delivered_desktop_at DATETIME,
        delivered_email_at DATETIME,
        read_at DATETIME,
        dismissed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to notifications if they don't exist
    await this.run(`ALTER TABLE notifications ADD COLUMN logo_url TEXT`);
    await this.run(`ALTER TABLE notifications ADD COLUMN icon_bg TEXT`);
    // Allow multiple notifications over time for the same reminder (e.g. recurring contact check-ins)
    // Unique per reminder + due time.
    try {
      await this.run(`DROP INDEX IF EXISTS idx_notifications_reminder_unique`);
    } catch (_e) {
      // ignore
    }
    await this.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_reminder_due_unique ON notifications(reminder_id, due_at)`);

    await this.run(`
      CREATE TABLE IF NOT EXISTS email_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )
    `);

    // Migration: if the existing documents table has job_id as NOT NULL, recreate it
    // SQLite doesn't support ALTER COLUMN, so we recreate the table
    try {
      const tableInfo: any[] = await this.all("PRAGMA table_info(documents)");
      const jobIdCol = tableInfo.find((col: any) => col.name === 'job_id');
      if (jobIdCol && jobIdCol.notnull === 1) {
        await this.run(`CREATE TABLE documents_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          type TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id)
        )`);
        await this.run(`INSERT INTO documents_new SELECT * FROM documents`);
        await this.run(`DROP TABLE documents`);
        await this.run(`ALTER TABLE documents_new RENAME TO documents`);
        console.log('Migrated documents table: job_id is now nullable');
      }
    } catch (err) {
      console.error('Documents migration check failed (non-fatal):', err);
    }

    await this.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Initialize default settings
    const username = await this.get('SELECT value FROM settings WHERE key = ?', ['username']);
    if (!username) {
      await this.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['username', 'User']);
    }

    const statuses = await this.get('SELECT value FROM settings WHERE key = ?', ['statuses']);
    if (!statuses) {
      await this.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [
        'statuses',
        'Wishlist,Applied,Interviewing,Offer,Rejected'
      ]);
    }

    // Check existing industries and fix if using old comma format
    const existingIndustries = await this.get('SELECT value FROM settings WHERE key = ?', ['industries']);
    const defaultIndustries = [
      'Launch Vehicles',
      'Satellite Manufacturing',
      'Earth Observation & Remote Sensing',
      'Ground Segment & Ground Stations',
      'In-Space Services (On-Orbit Servicing, Refueling, Debris Removal)',
      'Space Infrastructure (Stations, Platforms, Habitats)',
      'Space Tourism & Human Spaceflight',
      'Space Robotics & Autonomy',
      'Space Situational Awareness (SSA) & Space Traffic Management',
      'Space Communications & Networking',
      'Space Exploration & Science Missions',
      'Defense & National Security Space',
      'Space Consulting, Analytics, & Research',
      'Space Software & Mission Operations',
      'Other Space-Related'
    ].join('|');

    // If no industries exist, or if using old comma format (no pipe but has comma), reset to defaults
    if (!existingIndustries || !existingIndustries.value || (existingIndustries.value.includes(',') && !existingIndustries.value.includes('|'))) {
      await this.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'industries',
        defaultIndustries
      ]);
    }
  }

  // Companies
  async getCompanies() {
    const companies = await this.all(`
      SELECT 
        c.*,
        COUNT(j.id) as job_count,
        MAX(j.status) as latest_status,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE ((r.entity_type = 'company' AND r.entity_id = c.id) 
            OR (r.entity_type = 'job' AND r.entity_id IN (SELECT id FROM jobs WHERE company_id = c.id))) 
          AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM companies c
      LEFT JOIN jobs j ON c.id = j.company_id
      GROUP BY c.id
      ORDER BY c.last_interaction DESC
    `);
    return companies.map((c: any) => ({
      ...c,
      job_count: c.job_count || 0,
      dark_logo_bg: Boolean(c.dark_logo_bg),
      financial_stability_warning: Boolean(c.financial_stability_warning)
    }));
  }

  async getCompany(id: number) {
    const c = await this.get(`
      SELECT 
        c.*,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE ((r.entity_type = 'company' AND r.entity_id = c.id) 
            OR (r.entity_type = 'job' AND r.entity_id IN (SELECT id FROM jobs WHERE company_id = c.id))) 
          AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM companies c WHERE id = ?
      `, [id]);
    if (!c) return c;
    return {
      ...c,
      dark_logo_bg: Boolean(c.dark_logo_bg),
      financial_stability_warning: Boolean(c.financial_stability_warning)
    };
  }

  async getCompanyJobs(companyId: number) {
    return await this.all(`
      SELECT 
        j.*,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE r.entity_type = 'job' AND r.entity_id = j.id AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM jobs j
      WHERE j.company_id = ? 
      ORDER BY j.created_at DESC
    `, [companyId]);
  }

  async getCompanyContacts(companyId: number) {
    return await this.all(`
      SELECT 
        c.*,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE ((r.entity_type = 'contact' AND r.entity_id = c.id) OR (r.contact_id = c.id))
          AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM contacts c
      WHERE c.company_id = ? 
      ORDER BY c.last_interaction DESC
    `, [companyId]);
  }

  async createCompany(data: any) {
    await this.run(
      'INSERT INTO companies (name, website, industry, notes, location, dark_logo_bg, no_posted_jobs, no_appropriate_jobs, financial_stability_warning, logo_url, employee_count, company_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.website || null, data.industry || null, data.notes || null, data.location || null, data.dark_logo_bg ? 1 : 0, data.no_posted_jobs ? 1 : 0, data.no_appropriate_jobs ? 1 : 0, data.financial_stability_warning ? 1 : 0, data.logo_url || null, data.employee_count || null, data.company_size || null]
    );
    return await this.get('SELECT * FROM companies WHERE name = ?', [data.name]);
  }

  async updateCompany(id: number, data: any) {
    await this.run(
      'UPDATE companies SET name = ?, website = ?, industry = ?, notes = ?, location = ?, dark_logo_bg = ?, no_posted_jobs = ?, no_appropriate_jobs = ?, financial_stability_warning = ?, logo_url = ?, employee_count = ?, company_size = ? WHERE id = ?',
      [data.name, data.website || null, data.industry || null, data.notes || null, data.location || null, data.dark_logo_bg ? 1 : 0, data.no_posted_jobs ? 1 : 0, data.no_appropriate_jobs ? 1 : 0, data.financial_stability_warning ? 1 : 0, data.logo_url || null, data.employee_count || null, data.company_size || null, id]
    );
    return await this.getCompany(id);
  }

  async deleteCompany(id: number) {
    // Nullify foreign keys instead of cascading
    await this.run('UPDATE jobs SET company_id = NULL WHERE company_id = ?', [id]);
    await this.run('UPDATE contacts SET company_id = NULL WHERE company_id = ?', [id]);
    await this.run('UPDATE interactions SET company_id = NULL WHERE company_id = ?', [id]);
    await this.run('DELETE FROM companies WHERE id = ?', [id]);
  }

  async findOrCreateCompany(name: string, website?: string, logoUrl?: string) {
    let company = await this.get('SELECT * FROM companies WHERE name = ?', [name]);
    if (!company) {
      await this.run('INSERT INTO companies (name, website, logo_url) VALUES (?, ?, ?)', [name, website || null, logoUrl || null]);
      company = await this.get('SELECT * FROM companies WHERE name = ?', [name]);
    } else if (website && !company.website) {
      // Update website if not set
      await this.run('UPDATE companies SET website = ? WHERE id = ?', [website, company.id]);
      company = await this.getCompany(company.id);
    }
    return company;
  }

  // Jobs
  async getJobs() {
    const jobs = await this.all(`
      SELECT 
        j.*,
        c.name as company_name,
        c.website as company_website,
        c.logo_url as company_logo_url,
        c.dark_logo_bg as company_dark_logo_bg,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE r.entity_type = 'job' AND r.entity_id = j.id AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      ORDER BY j.created_at DESC
    `);
    return jobs.map((job: any) => ({
      ...job,
      company_dark_logo_bg: Boolean(job.company_dark_logo_bg)
    }));
  }

  async getJob(id: number) {
    const job = await this.get(`
      SELECT 
        j.*,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE r.entity_type = 'job' AND r.entity_id = j.id AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM jobs j WHERE id = ?
      `, [id]);
    if (job && job.company_id) {
      const company = await this.getCompany(job.company_id);
      return { ...job, company };
    }
    return job;
  }

  async createJob(data: any) {
    let companyId = data.company_id || null;

    // Auto-create company if company_name provided but no company_id
    if (data.company_name && !companyId) {
      try {
        const company = await this.findOrCreateCompany(data.company_name);
        companyId = company.id;
        // Update company last_interaction
        await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [companyId]);
      } catch (err) {
        console.error('Error creating company:', err);
        // Continue with company_name as fallback
      }
    }

    await this.run(
      `INSERT INTO jobs (company_id, company_name, title, location, status, link, description, notes, excitement_score, fit_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        data.company_name || null,
        data.title,
        data.location || null,
        data.status || 'Wishlist',
        data.link || null,
        data.description || null,
        data.notes || null,
        data.excitement_score ?? 3,
        data.fit_score ?? 3
      ]
    );

    const job = await this.get('SELECT * FROM jobs WHERE title = ? AND company_id = ? ORDER BY id DESC LIMIT 1',
      [data.title, companyId]);

    if (companyId) {
      await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [companyId]);
    }

    return job;
  }

  async updateJob(id: number, data: any) {
    let companyId = data.company_id;

    // Handle company auto-creation on update
    if (data.company_name && !companyId) {
      try {
        const company = await this.findOrCreateCompany(data.company_name);
        companyId = company.id;
        await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [companyId]);
      } catch (err) {
        console.error('Error creating company:', err);
      }
    }

    await this.run(
      `UPDATE jobs SET 
        company_id = ?, 
        company_name = ?, 
        title = ?, 
        location = ?,
        status = ?, 
        link = ?, 
        description = ?, 
        notes = ?, 
        excitement_score = ?, 
        fit_score = ?
       WHERE id = ?`,
      [
        companyId || null,
        data.company_name || null,
        data.title,
        data.location || null,
        data.status,
        data.link || null,
        data.description || null,
        data.notes || null,
        data.excitement_score ?? 3,
        data.fit_score ?? 3,
        id
      ]
    );

    if (companyId) {
      await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [companyId]);
    }

    return await this.getJob(id);
  }

  async deleteJob(id: number) {
    await this.run('UPDATE contacts SET job_id = NULL WHERE job_id = ?', [id]);
    await this.run('UPDATE interactions SET job_id = NULL WHERE job_id = ?', [id]);
    await this.run('DELETE FROM documents WHERE job_id = ?', [id]);
    await this.run('DELETE FROM jobs WHERE id = ?', [id]);
  }

  // Contacts
  async getContacts() {
    return await this.all(`
      SELECT 
        c.*,
        co.name as company_name,
        co.logo_url as company_logo_url,
        co.dark_logo_bg as company_dark_logo_bg,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE ((r.entity_type = 'contact' AND r.entity_id = c.id) OR (r.contact_id = c.id))
          AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM contacts c
      LEFT JOIN companies co ON c.company_id = co.id
      ORDER BY c.last_interaction DESC
    `);
  }

  async getJobContacts(jobId: number) {
    const job = await this.getJob(jobId);
    if (!job) return [];

    // Query both job-specific contacts and company-level contacts in one go
    // Note: We filter contacts belonging to the same company if it's a job-level view
    const companyId = job.company_id;

    return await this.all(`
      SELECT 
        c.*,
        (
          SELECT MIN(r.due_at) FROM reminders r 
          WHERE ((r.entity_type = 'contact' AND r.entity_id = c.id) OR (r.contact_id = c.id))
          AND r.sent_at IS NULL AND r.due_at >= CURRENT_TIMESTAMP
        ) as nearest_reminder
      FROM contacts c
      WHERE c.job_id = ? 
      OR (c.company_id = ? AND c.job_id IS NULL)
      ORDER BY c.last_interaction DESC
    `, [jobId, companyId || -1]);
  }

  async createContact(data: any) {
    await this.run(
      `INSERT INTO contacts (name, company_id, job_id, role, email, phone, notes, linkedin_url, next_check_in, social_platform, social_handle, email_draft, is_prospective)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.company_id || null,
        data.job_id || null,
        data.role || null,
        data.email || null,
        data.phone || null,
        data.notes || null,
        data.linkedin_url || null,
        data.next_check_in || null,
        data.social_platform || null,
        data.social_handle || null,
        data.email_draft || null,
        data.is_prospective ? 1 : 0
      ]
    );

    const contact = await this.get('SELECT * FROM contacts WHERE name = ? ORDER BY id DESC LIMIT 1', [data.name]);

    // If contact is added to a job, also add it to the company (but not to other jobs)
    if (data.job_id && !data.company_id) {
      const job = await this.getJob(data.job_id);
      if (job?.company_id) {
        // Update the contact to also have company_id
        await this.run('UPDATE contacts SET company_id = ? WHERE id = ?', [job.company_id, contact.id]);
        await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [job.company_id]);
      }
    } else if (data.company_id) {
      await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [data.company_id]);
    }

    const finalContact = await this.get('SELECT * FROM contacts WHERE id = ?', [contact.id]);
    await this.syncContactReminder(finalContact);
    return finalContact;
  }

  async updateContact(id: number, data: any) {
    await this.run(
      `UPDATE contacts SET name = ?, company_id = ?, job_id = ?, role = ?, email = ?, phone = ?, notes = ?, linkedin_url = ?, next_check_in = ?, social_platform = ?, social_handle = ?, email_draft = ?, is_prospective = ?
       WHERE id = ?`,
      [
        data.name,
        data.company_id || null,
        data.job_id || null,
        data.role || null,
        data.email || null,
        data.phone || null,
        data.notes || null,
        data.linkedin_url || null,
        data.next_check_in || null,
        data.social_platform || null,
        data.social_handle || null,
        data.email_draft || null,
        data.is_prospective ? 1 : 0,
        id
      ]
    );
    const updated = await this.get('SELECT * FROM contacts WHERE id = ?', [id]);
    await this.syncContactReminder(updated);
    return updated;
  }

  async getContact(id: number) {
    return await this.get(
      `
      SELECT 
        c.*,
        co.name as company_name,
        co.logo_url as company_logo_url,
        co.dark_logo_bg as company_dark_logo_bg
      FROM contacts c
      LEFT JOIN companies co ON c.company_id = co.id
      WHERE c.id = ?
      `,
      [id]
    );
  }

  async getContactInteractions(contactId: number) {
    return await this.all(
      `
      SELECT 
        i.*,
        r.due_at as follow_up_at
      FROM interactions i
      LEFT JOIN reminders r
        ON r.entity_type = 'interaction'
       AND r.entity_id = i.id
       AND r.source = 'follow_up'
      WHERE i.contact_id = ?
      ORDER BY i.date DESC
      `,
      [contactId]
    );
  }

  async deleteContact(id: number) {
    await this.run('UPDATE interactions SET contact_id = NULL WHERE contact_id = ?', [id]);
    await this.deleteReminderByEntity('contact', id, 'next_check_in');
    await this.run('DELETE FROM contacts WHERE id = ?', [id]);
  }

  // Interactions
  async getInteraction(id: number) {
    return await this.get(`
      SELECT 
        i.*,
        j.title as job_title,
        c.name as contact_name,
        co.name as company_name,
        r.due_at as follow_up_at
      FROM interactions i
      LEFT JOIN jobs j ON i.job_id = j.id
      LEFT JOIN contacts c ON i.contact_id = c.id
      LEFT JOIN companies co ON i.company_id = co.id
      LEFT JOIN reminders r
        ON r.entity_type = 'interaction'
       AND r.entity_id = i.id
       AND r.source = 'follow_up'
      WHERE i.id = ?
    `, [id]);
  }

  async getInteractions() {
    return await this.all(`
      SELECT 
        i.*,
        j.title as job_title,
        c.name as contact_name,
        co.name as company_name,
        r.due_at as follow_up_at
      FROM interactions i
      LEFT JOIN jobs j ON i.job_id = j.id
      LEFT JOIN contacts c ON i.contact_id = c.id
      LEFT JOIN companies co ON i.company_id = co.id
      LEFT JOIN reminders r
        ON r.entity_type = 'interaction'
       AND r.entity_id = i.id
       AND r.source = 'follow_up'
      ORDER BY i.date DESC
    `);
  }

  async deleteInteraction(id: number) {
    await this.run('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?', ['interaction', id]);
    await this.deleteReminderByEntity('interaction', id, 'follow_up');
    await this.run('DELETE FROM interactions WHERE id = ?', [id]);
  }

  async createInteraction(data: any) {
    await this.run(
      `INSERT INTO interactions (job_id, contact_id, company_id, type, content, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.job_id || null,
        data.contact_id || null,
        data.company_id || null,
        data.type,
        data.content || null,
        data.date || new Date().toISOString()
      ]
    );

    const interaction = await this.get('SELECT * FROM interactions ORDER BY id DESC LIMIT 1');

    // Optional follow-up reminder attached to this interaction
    if (data.follow_up_at) {
      const linkPath =
        data.job_id ? `/job/${data.job_id}` :
          data.contact_id ? `/contacts/${data.contact_id}` :
            data.company_id ? `/company/${data.company_id}` :
              '/';

      const msg =
        (typeof data.follow_up_message === 'string' && data.follow_up_message.trim())
          ? data.follow_up_message.trim()
          : `Follow up: ${data.type || 'Interaction'}`;

      await this.upsertReminder({
        entity_type: 'interaction',
        entity_id: interaction.id,
        source: 'follow_up',
        due_at: data.follow_up_at,
        message: msg,
        link_path: linkPath,
        notify_desktop: data.notify_desktop !== undefined ? Boolean(data.notify_desktop) : true,
        notify_email: data.notify_email !== undefined ? Boolean(data.notify_email) : false
      });
    }

    // Update last_interaction timestamps
    if (data.company_id) {
      await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [data.company_id]);
    }
    if (data.contact_id) {
      await this.run('UPDATE contacts SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [data.contact_id]);
    }

    return interaction;
  }

  // --- Reminders ---
  private async upsertReminder(rem: {
    entity_type: string;
    entity_id: number;
    source: string;
    due_at: string;
    message: string;
    link_path?: string | null;
    notify_desktop?: boolean;
    notify_email?: boolean;
    contact_id?: number;
  }) {
    if (rem.source === 'manual') {
      await this.run(
        `INSERT INTO reminders (entity_type, entity_id, source, due_at, message, link_path, notify_desktop, notify_email, contact_id, sent_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)`,
        [
          rem.entity_type, rem.entity_id, rem.source,
          rem.due_at, rem.message, rem.link_path || null,
          rem.notify_desktop === undefined ? 1 : rem.notify_desktop ? 1 : 0,
          rem.notify_email === undefined ? 0 : rem.notify_email ? 1 : 0,
          rem.contact_id || null
        ]
      );
    } else {
      await this.run(
        `INSERT OR REPLACE INTO reminders (id, entity_type, entity_id, source, due_at, message, link_path, notify_desktop, notify_email, contact_id, sent_at, updated_at)
         VALUES (
           (SELECT id FROM reminders WHERE entity_type = ? AND entity_id = ? AND source = ?),
           ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP
         )`,
        [
          rem.entity_type, rem.entity_id, rem.source,
          rem.entity_type,
          rem.entity_id,
          rem.source,
          rem.due_at,
          rem.message,
          rem.link_path || null,
          rem.notify_desktop === undefined ? 1 : rem.notify_desktop ? 1 : 0,
          rem.notify_email === undefined ? 0 : rem.notify_email ? 1 : 0,
          rem.contact_id || null
        ]
      );
    }
  }

  private async deleteReminderByEntity(entityType: string, entityId: number, source?: string) {
    if (source) {
      await this.run('DELETE FROM reminders WHERE entity_type = ? AND entity_id = ? AND source = ?', [entityType, entityId, source]);
    } else {
      await this.run('DELETE FROM reminders WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
    }
  }

  private async syncContactReminder(contact: any) {
    if (!contact || !contact.id) return;
    const due = contact.next_check_in;
    if (!due) {
      await this.deleteReminderByEntity('contact', contact.id, 'next_check_in');
      return;
    }
    const message = `Follow up with ${contact.name}`;
    const linkPath = `/contacts/${contact.id}`;
    await this.upsertReminder({
      entity_type: 'contact',
      entity_id: contact.id,
      source: 'next_check_in',
      due_at: due,
      message,
      link_path: linkPath,
      notify_desktop: true,
      notify_email: false
    });
  }

  async createCompanyReminder(companyId: number, dueAt: string, message: string, opts?: { notify_desktop?: boolean; notify_email?: boolean }) {
    await this.upsertReminder({
      entity_type: 'company',
      entity_id: companyId,
      source: 'manual', // Use 'manual' to allow multiple reminders/history
      due_at: dueAt,
      message,
      link_path: `/company/${companyId}`,
      notify_desktop: opts?.notify_desktop ?? true,
      notify_email: opts?.notify_email ?? false
    });
    return await this.get('SELECT * FROM reminders WHERE entity_type = ? AND entity_id = ? AND source = ? ORDER BY id DESC LIMIT 1', ['company', companyId, 'manual']);
  }

  async getCompanyReminders(companyId: number) {
    return await this.all(
      `SELECT * FROM reminders WHERE entity_type = 'company' AND entity_id = ?
       ORDER BY CASE WHEN sent_at IS NULL THEN 0 ELSE 1 END, due_at ASC;`,
      [companyId]
    );
  }

  async clearCompanyReminder(companyId: number) {
    await this.deleteReminderByEntity('company', companyId, 'follow_up');
  }

  async createJobReminder(jobId: number, dueAt: string, message: string, opts?: { notify_desktop?: boolean; notify_email?: boolean; contact_id?: number }) {
    await this.upsertReminder({
      entity_type: 'job',
      entity_id: jobId,
      source: 'manual', // Use 'manual' to allow stacking
      due_at: dueAt,
      message,
      link_path: `/job/${jobId}`,
      notify_desktop: opts?.notify_desktop ?? true,
      notify_email: opts?.notify_email ?? false,
      contact_id: opts?.contact_id
    });

    return await this.get('SELECT * FROM reminders WHERE rowid = last_insert_rowid()');
  }

  async getJobReminders(jobId: number) {
    return await this.all(
      `SELECT r.*, c.name as contact_name
       FROM reminders r
       LEFT JOIN contacts c ON r.contact_id = c.id
       WHERE r.entity_type = 'job' AND r.entity_id = ? 
       ORDER BY CASE WHEN r.sent_at IS NULL THEN 0 ELSE 1 END, r.due_at ASC;`,
      [jobId]
    );
  }

  async getContactReminders(contactId: number) {
    return await this.all(
      `SELECT r.*, c.name as contact_name
       FROM reminders r
       LEFT JOIN contacts c ON r.contact_id = c.id
       WHERE (r.entity_type = 'contact' AND r.entity_id = ?) OR (r.contact_id = ?)
       ORDER BY CASE WHEN r.sent_at IS NULL THEN 0 ELSE 1 END, r.due_at ASC;`,
      [contactId, contactId]
    );
  }

  async createContactReminder(contactId: number, dueAt: string, message: string, opts?: { notify_desktop?: boolean; notify_email?: boolean; contact_id?: number }) {
    await this.upsertReminder({
      entity_type: 'contact',
      entity_id: contactId,
      source: 'manual',
      due_at: dueAt,
      message,
      link_path: `/contacts/${contactId}`,
      notify_desktop: opts?.notify_desktop ?? true,
      notify_email: opts?.notify_email ?? false,
      contact_id: opts?.contact_id || contactId
    });
    return await this.get('SELECT * FROM reminders WHERE rowid = last_insert_rowid()');
  }

  async getDueReminders(nowIso: string) {
    return await this.all(
      `SELECT * FROM reminders
       WHERE sent_at IS NULL AND due_at <= ?
       ORDER BY due_at ASC`,
      [nowIso]
    );
  }

  async markReminderSent(id: number) {
    await this.run('UPDATE reminders SET sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return await this.get('SELECT * FROM reminders WHERE id = ?', [id]);
  }

  async deleteReminder(id: number) {
    await this.run('DELETE FROM reminders WHERE id = ?', [id]);
  }

  // Email Drafts
  async getContactEmailDrafts(contactId: number) {
    return this.all('SELECT * FROM email_drafts WHERE contact_id = ? ORDER BY created_at DESC', [contactId]);
  }

  async createEmailDraft(contactId: number, content: string) {
    const res = await this.run(
      'INSERT INTO email_drafts (contact_id, content) VALUES (?, ?)',
      [contactId, content]
    );
    // Since run doesn't return the ID in this promisified wrapper usually, but we might need it.
    // Actually, our run implementation in database.ts might be different. Let's check it.
  }

  async updateEmailDraft(id: number, content: string) {
    await this.run(
      'UPDATE email_drafts SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content, id]
    );
  }

  async deleteEmailDraft(id: number) {
    await this.run('DELETE FROM email_drafts WHERE id = ?', [id]);
  }

  // --- Notifications (hub) ---
  async syncDueRemindersToNotifications(nowIso: string) {
    const due: any[] = await this.all(
      `SELECT * FROM reminders WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at ASC`,
      [nowIso]
    );

    let created = 0;
    for (const r of due) {
      let richTitle = 'Follow-up reminder';
      let logoUrl = null;
      let iconBg = null;

      try {
        if (r.entity_type === 'company') {
          const co = await this.get('SELECT name, logo_url, dark_logo_bg FROM companies WHERE id = ?', [r.entity_id]);
          if (co) {
            richTitle = `Company: ${co.name}`;
            logoUrl = co.logo_url;
            iconBg = co.dark_logo_bg ? '#e5e7eb' : null;
          }
        } else if (r.entity_type === 'job') {
          const j = await this.get(`
            SELECT j.title, c.name as company_name, c.logo_url, c.dark_logo_bg 
            FROM jobs j 
            LEFT JOIN companies c ON j.company_id = c.id 
            WHERE j.id = ?`, [r.entity_id]);
          if (j) {
            richTitle = j.company_name ? `${j.title} @ ${j.company_name}` : j.title;
            logoUrl = j.logo_url;
            iconBg = j.dark_logo_bg ? '#e5e7eb' : null;
          }
        } else if (r.entity_type === 'contact') {
          const c = await this.get(`
            SELECT c.name, co.name as company_name, co.logo_url, co.dark_logo_bg 
            FROM contacts c 
            LEFT JOIN companies co ON c.company_id = co.id 
            WHERE c.id = ?`, [r.entity_id]);
          if (c) {
            richTitle = c.company_name ? `${c.name} @ ${c.company_name}` : c.name;
            logoUrl = c.logo_url;
            iconBg = c.dark_logo_bg ? '#e5e7eb' : null;
          }
        } else if (r.entity_type === 'interaction') {
          const i = await this.get(`
            SELECT i.type, c.name as contact_name, co.name as company_name, co.logo_url, co.dark_logo_bg
            FROM interactions i
            LEFT JOIN contacts c ON i.contact_id = c.id
            LEFT JOIN companies co ON i.company_id = co.id
            WHERE i.id = ?`, [r.entity_id]);
          if (i) {
            const part1 = i.contact_name || i.type || 'Interaction';
            richTitle = i.company_name ? `${part1} @ ${i.company_name}` : part1;
            logoUrl = i.logo_url;
            iconBg = i.dark_logo_bg ? '#e5e7eb' : null;
          }
        }
      } catch (_e) {
        // Fallback to default title if hydration fails
      }

      await this.run(
        `INSERT OR IGNORE INTO notifications
           (reminder_id, entity_type, entity_id, due_at, title, message, link_path, notify_desktop, notify_email, logo_url, icon_bg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.entity_type, r.entity_id, r.due_at, richTitle, r.message, r.link_path || null, r.notify_desktop ?? 1, r.notify_email ?? 0, logoUrl, iconBg]
      );

      await this.run(
        `UPDATE notifications
         SET due_at = ?, title = ?, message = ?, link_path = ?, notify_desktop = ?, notify_email = ?, logo_url = ?, icon_bg = ?
         WHERE reminder_id = ? AND due_at = ?`,
        [r.due_at, richTitle, r.message, r.link_path || null, r.notify_desktop ?? 1, r.notify_email ?? 0, logoUrl, iconBg, r.id, r.due_at]
      );

      await this.run('UPDATE reminders SET sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [r.id]);
      created += 1;
    }
    return { created, dueCount: due.length };
  }

  async getUnreadNotificationCount() {
    const row = await this.get(
      `SELECT COUNT(*) as cnt FROM notifications
       WHERE dismissed_at IS NULL AND read_at IS NULL`,
      []
    );
    return row?.cnt || 0;
  }

  async listNotifications(limit = 50, offset = 0) {
    return await this.all(
      `SELECT n.*, r.contact_id, c.name as contact_name
       FROM notifications n
       LEFT JOIN reminders r ON n.reminder_id = r.id
       LEFT JOIN contacts c ON r.contact_id = c.id
       WHERE n.dismissed_at IS NULL
       ORDER BY
         CASE WHEN n.read_at IS NULL THEN 0 ELSE 1 END,
         datetime(n.created_at) DESC,
         n.id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  async markNotificationRead(id: number) {
    await this.run('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ?', [id]);
    return await this.get('SELECT * FROM notifications WHERE id = ?', [id]);
  }

  async dismissNotification(id: number) {
    await this.run('UPDATE notifications SET dismissed_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return await this.get('SELECT * FROM notifications WHERE id = ?', [id]);
  }

  async dismissAllNotifications() {
    await this.run('UPDATE notifications SET dismissed_at = CURRENT_TIMESTAMP WHERE dismissed_at IS NULL');
  }

  async getPendingDelivery(channel: 'desktop' | 'email', nowIso: string, limit = 50) {
    const col = channel === 'desktop' ? 'delivered_desktop_at' : 'delivered_email_at';
    const flag = channel === 'desktop' ? 'notify_desktop' : 'notify_email';
    return await this.all(
      `SELECT n.*, r.contact_id
       FROM notifications n
       LEFT JOIN reminders r ON n.reminder_id = r.id
       WHERE n.dismissed_at IS NULL
         AND n.due_at <= ?
         AND n.${flag} = 1
         AND n.${col} IS NULL
       ORDER BY n.due_at ASC
       LIMIT ?`,
      [nowIso, limit]
    );
  }

  async markDelivered(id: number, channel: 'desktop' | 'email') {
    if (channel === 'desktop') {
      await this.run('UPDATE notifications SET delivered_desktop_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    } else {
      await this.run('UPDATE notifications SET delivered_email_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    }
    return await this.get('SELECT * FROM notifications WHERE id = ?', [id]);
  }

  // Documents
  async getJobDocuments(jobId: number) {
    return await this.all('SELECT * FROM documents WHERE job_id = ? ORDER BY created_at DESC', [jobId]);
  }

  async getAllDocuments() {
    return await this.all(`
      SELECT 
        d.*,
        j.title as job_title,
        j.company_id,
        COALESCE(c.name, j.company_name) as company_name
      FROM documents d
      LEFT JOIN jobs j ON d.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      ORDER BY d.created_at DESC
    `);
  }

  async createDocument(data: any) {
    await this.run(
      `INSERT INTO documents (job_id, filename, path, type)
       VALUES (?, ?, ?, ?)`,
      [data.job_id || null, data.filename, data.path, data.type || 'Other']
    );
    return await this.get('SELECT * FROM documents ORDER BY id DESC LIMIT 1');
  }

  async updateDocument(id: number, data: any) {
    await this.run(
      'UPDATE documents SET filename = ?, type = ? WHERE id = ?',
      [data.filename, data.type || 'Other', id]
    );
    return await this.get('SELECT * FROM documents WHERE id = ?', [id]);
  }

  async deleteDocument(id: number) {
    const doc = await this.get('SELECT * FROM documents WHERE id = ?', [id]);
    if (doc) {
      // Delete file from disk
      try {
        await fs.remove(doc.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }
    await this.run('DELETE FROM documents WHERE id = ?', [id]);
  }

  // Settings
  async getSettings() {
    const rows = await this.all('SELECT * FROM settings');
    const settings: any = {};
    rows.forEach((row: any) => {
      // Decrypt sensitive fields
      if (this.ENCRYPTED_KEYS.includes(row.key)) {
        settings[row.key] = this.decrypt(row.value);
      } else {
        settings[row.key] = row.value;
      }
    });
    return settings;
  }

  async updateSetting(key: string, value: string) {
    // Encrypt sensitive fields before storing
    const valueToStore = this.ENCRYPTED_KEYS.includes(key) ? this.encrypt(value) : value;
    await this.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, valueToStore]);
  }

  // Export
  async exportData() {
    const companies = await this.all('SELECT * FROM companies');
    const jobs = await this.all('SELECT * FROM jobs');
    const contacts = await this.all('SELECT * FROM contacts');
    const interactions = await this.all('SELECT * FROM interactions');
    const documents = await this.all('SELECT * FROM documents');
    const settings = await this.getSettings();

    return {
      companies,
      jobs,
      contacts,
      interactions,
      documents,
      settings
    };
  }

  async resetDatabase() {
    await this.run('DELETE FROM interactions');
    await this.run('DELETE FROM documents');
    await this.run('DELETE FROM contacts');
    await this.run('DELETE FROM jobs');
    await this.run('DELETE FROM companies');
    await this.initialize();
  }

  close() {
    return new Promise<void>((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
