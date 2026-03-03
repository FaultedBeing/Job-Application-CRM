import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { Database } from './database';
import { SyncService } from './syncService';
import { setupRoutes } from './routes';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Ensure mime.lookup exists for static file serving (some mime versions remove it)
// Use require so we patch the same CommonJS export that Express/send uses.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rawMime: any = require('mime');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rawMimeTypes: any = require('mime-types');

if (rawMime && typeof rawMime.lookup !== 'function') {
  rawMime.lookup = (filePath: string) =>
    (rawMimeTypes && typeof rawMimeTypes.lookup === 'function'
      ? rawMimeTypes.lookup(filePath)
      : null) || 'application/octet-stream';
}

// Also patch mime.charsets.lookup which send/index.js uses
if (rawMime && (!rawMime.charsets || typeof rawMime.charsets.lookup !== 'function')) {
  if (!rawMime.charsets) {
    rawMime.charsets = {};
  }
  rawMime.charsets.lookup = (mimeType: string) => {
    // Return default charset for common types, null otherwise
    if (mimeType && mimeType.includes('text/')) {
      return 'UTF-8';
    }
    if (mimeType && mimeType.includes('application/json')) {
      return 'UTF-8';
    }
    return null;
  };
}

// Determine paths based on environment
let dbPath: string;
let uploadsPath: string;
let frontendPath: string;

if (NODE_ENV === 'production') {
  // In production (Electron), use AppData or resourcesPath
  // Force it to the original Job Application Tracker folder to share the DB.
  // We check if the passed APPDATA already contains our target folder name to avoid nesting.
  const rawAppData = process.env.APPDATA || path.join(process.env.HOME || '', '.job-tracker');
  let appDataPath = rawAppData;

  if (NODE_ENV === 'production' && !rawAppData.endsWith('Job Application Tracker')) {
    // If we are in Roaming base or in a different app's folder, point to the original one
    appDataPath = path.join(path.dirname(rawAppData), 'Job Application Tracker');
  }
  const resourcesPath = process.env.RESOURCES_PATH || path.join(__dirname, '..');

  // Try resourcesPath first (Electron extraResources), fallback to AppData
  const possibleDbPath = path.join(resourcesPath, 'database.sqlite');
  dbPath = fs.existsSync(possibleDbPath) ? possibleDbPath : path.join(appDataPath, 'database.sqlite');

  uploadsPath = process.env.UPLOADS_PATH || path.join(appDataPath, 'uploads');
  frontendPath = process.env.FRONTEND_PATH || path.join(resourcesPath, 'client-dist');
} else {
  // Development paths
  dbPath = path.join(__dirname, '..', 'database.sqlite');
  uploadsPath = path.join(__dirname, '..', 'uploads');
  frontendPath = path.join(__dirname, '..', '..', 'client', 'dist');
}

// Ensure uploads directory exists
fs.ensureDirSync(uploadsPath);

// Initialize database
const db = new Database(dbPath);
db.initialize().then(() => {
  // Initialize sync service
  const syncService = new SyncService(db);
  syncService.initialize();

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  });
  const upload = multer({ storage });

  setupRoutes(app, db, upload, uploadsPath, syncService);

  // Background reminder delivery check (every minute)
  setInterval(async () => {
    try {
      const now = new Date().toISOString();
      // Sync due reminders to notifications if not already done
      await db.syncDueRemindersToNotifications(now);

      // 1. Deliver pending Desktop notifications
      // (Handled by frontend polling)
      await db.syncDueRemindersToNotifications(now);
    } catch (err) {
      console.error('Background Delivery Error:', err);
    }
  }, 60000);

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));


  // Serve uploaded files
  app.use('/uploads', express.static(uploadsPath));

  // Simple health check for Electron wrapper to know when server is ready
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve frontend when a built client exists
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Uploads: ${uploadsPath}`);
});

export default app;
