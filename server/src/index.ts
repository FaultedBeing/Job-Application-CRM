import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { Database } from './database';
import { SyncService } from './syncService';
import { setupRoutes } from './routes';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Diagnostic logging
console.log(`--- Server Process Started at ${new Date().toISOString()} ---`);
console.log(`NODE_ENV: ${NODE_ENV}`);
console.log(`PORT: ${PORT}`);

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Simple health check for Electron wrapper (moved early for faster detection)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

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

  if (NODE_ENV === 'production' && !rawAppData.endsWith('job-tracker-desktop')) {
    // If we are in Roaming base or in a different app's folder, point to the original one
    appDataPath = path.join(path.dirname(rawAppData), 'job-tracker-desktop');
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

// Ensure frontend path evaluates fully.
console.log('Frontend serving from:', frontendPath);

// Ensure uploads directory exists
fs.ensureDirSync(uploadsPath);

// Initialize database
const db = new Database(dbPath);
console.log('Initializing database...');
db.initialize().then(async () => {
  console.log('Database initialization complete.');
  // Initialize sync service
  const syncService = new SyncService(db);
  await syncService.initialize();

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

  // Middleware (must be before routes)
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Intercept X-User-Id — set per-request so concurrent requests don't clobber each other.
  // Note: because Express handlers are async, there is still a theoretical race between
  // two concurrent requests interleaving awaits. A full fix would require AsyncLocalStorage
  // or passing userId through the call chain. For this single-user Electron app, setting
  // userId at the start of each request is sufficient and correct.
  app.use((req, res, next) => {
    const userId = (req.headers['x-user-id'] as string) || null;
    db.setUserId(userId);
    next();
  });

  // Background reminder delivery check (every minute)
  setInterval(async () => {
    try {
      const now = new Date().toISOString();
      // Sync due reminders to notifications if not already done
      await db.syncDueRemindersToNotifications(now);
    } catch (err) {
      console.error('Background Delivery Error:', err);
    }
  }, 60000);

  // Serve uploaded files
  app.use('/uploads', express.static(uploadsPath));

  setupRoutes(app, db, upload, uploadsPath, syncService);

  // We explicitly resolve the pre-evaluated global frontendPath here instead of 
  // relying on relative cwd evaluations from fs module after async jumps
  if (fs.existsSync(frontendPath)) {
    console.log('Serving frontend strictly from:', frontendPath);
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  } else {
    console.error(`FATAL: Client directory not found at absolute path: ${frontendPath}`);
  }

  // Start server
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Database: ${dbPath}`);
    console.log(`Uploads: ${uploadsPath}`);
  });
}).catch((err) => {
  console.error('FATAL: Initialization failed:', err);
  process.exit(1);
});

export default app;
