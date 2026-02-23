# Job Application Tracker

A standalone desktop application for managing job applications, companies, contacts, and interactions throughout the job search process.

## Features

- **Job Applications Management**: Track all your job applications with status, scores, and details
- **Company Management**: Auto-creates companies when adding jobs
- **Contact Management**: Track contacts associated with companies and jobs
- **Interaction Logging**: Log emails, calls, interviews, and notes
- **Document Management**: Upload and manage resumes, cover letters, and other documents
- **Dashboard**: Overview statistics and priority jobs
- **Settings**: Customize username and status pipeline

## Development Setup

### Prerequisites
- Node.js v16+
- npm

### Local Development

1. **Install dependencies:**
   ```bash
   cd server && npm install
   cd ../client && npm install
   cd ../desktop && npm install
   ```

2. **Start backend:**
   ```bash
   cd server
   npm run dev
   ```

3. **Start frontend (in a new terminal):**
   ```bash
   cd client
   npm run dev
   ```

4. **Access the app:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000

## Building Standalone Application

1. **Build frontend:**
   ```bash
   cd client
   npm run build
   ```

2. **Build backend:**
   ```bash
   cd server
   npm run build
   ```

3. **Package with Electron:**
   ```bash
   cd desktop
   npm run build
   ```

4. **Output:**
   The executable will be in `desktop/dist/Job Application Tracker.exe`

## Project Structure

```
project/
├── client/          # React frontend
├── server/          # Express backend
└── desktop/         # Electron wrapper
```

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite
- **Desktop**: Electron
- **Icons**: Lucide React

## License

MIT
