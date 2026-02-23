# Job Application Tracker

A standalone desktop application for managing job applications, companies, contacts, and interactions throughout the job search process.

## Quick Start (For End Users)

**Just download and run the installer!**

1. Download `Job Application Tracker Setup [version].exe` from the root folder of this repository (or from [Releases](https://github.com/YOUR_USERNAME/REPO_NAME/releases))
2. Run the installer
3. Choose installation location and options
4. Launch from Start Menu or Desktop shortcut

**No building or technical knowledge required!**

The installer is in the main folder for easy access.

---

## For Developers

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

## Building the Installer (For Developers Only)

**Note:** End users don't need to do this! They just download and run the installer from Releases.

### Quick Build

**Just double-click `BUILD.exe.bat`** - it will:
- Check for Node.js
- Install all dependencies
- Build everything
- Create the executable

The **installer** will be in `desktop/dist/Job Application Tracker Setup [version].exe`

**What you get:**
- ✅ **`Job Application Tracker Setup [version].exe`** - Windows installer (run this to install)
- The installer lets you choose:
  - Where to install the app
  - Create desktop shortcut (optional)
  - Create Start Menu shortcut (optional)
- After installation, you can uninstall from Windows Settings → Apps

**Note:** The `win-unpacked/` folder is just for development - ignore it.

### Manual Build

If you prefer to build manually:

1. **Build frontend:**
   ```bash
   cd client
   npm install
   npm run build
   ```

2. **Build backend:**
   ```bash
   cd server
   npm install
   npm run build
   ```

3. **Package with Electron:**
   ```bash
   cd desktop
   npm install
   npm run build
   ```

4. **Output:**
   The installer will be in `desktop/dist/Job Application Tracker Setup [version].exe`
   Run the installer to install the application with options for location and shortcuts.

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
