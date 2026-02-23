import { Express, Request, Response } from 'express';
import { Multer } from 'multer';
import { Database } from './database';
import fs from 'fs-extra';
import { fetchCompanyLogo, fetchCompanyInfo } from './companyEnrichment';

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

  // Interactions
  app.get('/api/interactions', async (req: Request, res: Response) => {
    try {
      const interactions = await db.getInteractions();
      res.json(interactions);
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

  // Documents
  app.get('/api/jobs/:id/documents', async (req: Request, res: Response) => {
    try {
      const documents = await db.getJobDocuments(parseInt(req.params.id));
      res.json(documents);
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
}
