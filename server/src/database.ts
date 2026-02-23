import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

export class Database {
  private db: sqlite3.Database;

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
        dark_logo_bg INTEGER DEFAULT 0,
        last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
        logo_url TEXT,
        employee_count INTEGER,
        company_size TEXT
      )
    `);
    
    // Add new columns if they don't exist (migration)
    await this.run(`ALTER TABLE companies ADD COLUMN logo_url TEXT`);
    await this.run(`ALTER TABLE companies ADD COLUMN employee_count INTEGER`);
    await this.run(`ALTER TABLE companies ADD COLUMN company_size TEXT`);

    await this.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        company_name TEXT,
        title TEXT NOT NULL,
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
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )
    `);
    
    // Add new columns if they don't exist (migration)
    await this.run(`ALTER TABLE contacts ADD COLUMN linkedin_url TEXT`);
    await this.run(`ALTER TABLE contacts ADD COLUMN next_check_in DATETIME`);

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

    await this.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )
    `);

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
    
    // If no industries exist, or if using old comma format (no pipe), reset to defaults
    if (!existingIndustries || !existingIndustries.value || !existingIndustries.value.includes('|')) {
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
        MAX(j.status) as latest_status
      FROM companies c
      LEFT JOIN jobs j ON c.id = j.company_id
      GROUP BY c.id
      ORDER BY c.last_interaction DESC
    `);
    return companies.map((c: any) => ({
      ...c,
      job_count: c.job_count || 0,
      dark_logo_bg: Boolean(c.dark_logo_bg)
    }));
  }

  async getCompany(id: number) {
    return await this.get('SELECT * FROM companies WHERE id = ?', [id]);
  }

  async getCompanyJobs(companyId: number) {
    return await this.all('SELECT * FROM jobs WHERE company_id = ? ORDER BY created_at DESC', [companyId]);
  }

  async getCompanyContacts(companyId: number) {
    return await this.all('SELECT * FROM contacts WHERE company_id = ? ORDER BY last_interaction DESC', [companyId]);
  }

  async createCompany(data: any) {
    await this.run(
      'INSERT INTO companies (name, website, industry, notes, dark_logo_bg, logo_url, employee_count, company_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.website || null, data.industry || null, data.notes || null, data.dark_logo_bg ? 1 : 0, data.logo_url || null, data.employee_count || null, data.company_size || null]
    );
    return await this.get('SELECT * FROM companies WHERE name = ?', [data.name]);
  }

  async updateCompany(id: number, data: any) {
    await this.run(
      'UPDATE companies SET name = ?, website = ?, industry = ?, notes = ?, dark_logo_bg = ?, logo_url = ?, employee_count = ?, company_size = ? WHERE id = ?',
      [data.name, data.website || null, data.industry || null, data.notes || null, data.dark_logo_bg ? 1 : 0, data.logo_url || null, data.employee_count || null, data.company_size || null, id]
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
    return await this.all(`
      SELECT 
        j.*,
        c.name as company_name,
        c.website as company_website,
        c.logo_url as company_logo_url
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      ORDER BY j.created_at DESC
    `);
  }

  async getJob(id: number) {
    const job = await this.get('SELECT * FROM jobs WHERE id = ?', [id]);
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
      `INSERT INTO jobs (company_id, company_name, title, status, link, description, notes, excitement_score, fit_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        data.company_name || null,
        data.title,
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
        co.name as company_name
      FROM contacts c
      LEFT JOIN companies co ON c.company_id = co.id
      ORDER BY c.last_interaction DESC
    `);
  }

  async getJobContacts(jobId: number) {
    // Get contacts directly linked to job, plus company-level contacts (not job-specific)
    const job = await this.getJob(jobId);
    const jobContacts = await this.all('SELECT * FROM contacts WHERE job_id = ?', [jobId]);
    
    if (job?.company_id) {
      // Get company-level contacts (where company_id is set but job_id is NULL)
      const companyContacts = await this.all('SELECT * FROM contacts WHERE company_id = ? AND job_id IS NULL', 
        [job.company_id]);
      return [...jobContacts, ...companyContacts];
    }
    
    return jobContacts;
  }

  async createContact(data: any) {
    await this.run(
      `INSERT INTO contacts (name, company_id, job_id, role, email, phone, notes, linkedin_url, next_check_in)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.company_id || null,
        data.job_id || null,
        data.role || null,
        data.email || null,
        data.phone || null,
        data.notes || null,
        data.linkedin_url || null,
        data.next_check_in || null
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
    
    return await this.get('SELECT * FROM contacts WHERE id = ?', [contact.id]);
  }
  
  async updateContact(id: number, data: any) {
    await this.run(
      `UPDATE contacts SET name = ?, company_id = ?, job_id = ?, role = ?, email = ?, phone = ?, notes = ?, linkedin_url = ?, next_check_in = ?
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
        id
      ]
    );
    return await this.get('SELECT * FROM contacts WHERE id = ?', [id]);
  }
  
  async getContact(id: number) {
    return await this.get('SELECT * FROM contacts WHERE id = ?', [id]);
  }
  
  async getContactInteractions(contactId: number) {
    return await this.all('SELECT * FROM interactions WHERE contact_id = ? ORDER BY date DESC', [contactId]);
  }

  async deleteContact(id: number) {
    await this.run('UPDATE interactions SET contact_id = NULL WHERE contact_id = ?', [id]);
    await this.run('DELETE FROM contacts WHERE id = ?', [id]);
  }

  // Interactions
  async getInteractions() {
    return await this.all(`
      SELECT 
        i.*,
        j.title as job_title,
        c.name as contact_name,
        co.name as company_name
      FROM interactions i
      LEFT JOIN jobs j ON i.job_id = j.id
      LEFT JOIN contacts c ON i.contact_id = c.id
      LEFT JOIN companies co ON i.company_id = co.id
      ORDER BY i.date DESC
    `);
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
    
    // Update last_interaction timestamps
    if (data.company_id) {
      await this.run('UPDATE companies SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [data.company_id]);
    }
    if (data.contact_id) {
      await this.run('UPDATE contacts SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?', [data.contact_id]);
    }
    
    return interaction;
  }

  // Documents
  async getJobDocuments(jobId: number) {
    return await this.all('SELECT * FROM documents WHERE job_id = ? ORDER BY created_at DESC', [jobId]);
  }

  async createDocument(data: any) {
    await this.run(
      `INSERT INTO documents (job_id, filename, path, type)
       VALUES (?, ?, ?, ?)`,
      [data.job_id, data.filename, data.path, data.type || 'Other']
    );
    return await this.get('SELECT * FROM documents ORDER BY id DESC LIMIT 1');
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
      settings[row.key] = row.value;
    });
    return settings;
  }

  async updateSetting(key: string, value: string) {
    await this.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
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
