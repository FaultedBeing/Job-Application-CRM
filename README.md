# Job Application Tracker

A standalone desktop application for managing job applications, companies, contacts, and interactions throughout your job search process.

## Quick Start (For End Users)

### Download and Install

1. **Download the installer:**
   - Go to [Releases](https://github.com/FaultedBeing/Job-Application-CRM/releases)
   - Download the latest `Job Application Tracker Setup [version].exe`
   - Or download from the root folder of this repository

2. **Run the installer:**
   - Double-click the downloaded `.exe` file
   - Follow the installation wizard
   - Choose installation location (default: `C:\Users\YourName\AppData\Local\Programs\Job Application Tracker`)
   - Optionally create desktop and Start Menu shortcuts

3. **Launch the app:**
   - Open from Start Menu or Desktop shortcut
   - The app will start automatically


### Auto-Updates

The app automatically checks for updates when you launch it. When a new version is available:
- You'll see a notification dialog
- Click "Download Now" to get the update
- The app will download and prompt you to restart

You can also manually check for updates by right-clicking the system tray icon → "Check for Updates"

---

## Features

- **Job Applications Management**: Track all your job applications with status, scores, and details
- **Company Management**: Automatically creates companies when adding jobs, with logo fetching
- **Contact Management**: Track contacts associated with companies and jobs
- **Interaction Logging**: Log emails, calls, interviews, and notes for each contact
- **Document Management**: Upload and manage resumes, cover letters, and other documents
- **Dashboard**: Overview statistics and priority jobs
- **Settings**: Customize username, status pipeline, and industry categories
- **Activity Logs**: Track interactions and set next check-in dates for contacts
- **Company Logos**: Automatically fetches and displays company logos
- **Industry Categories**: Space and aerospace-focused industry categorization

---

## For Developers (I hope it is for developers, this was typed with ai sooo, hope this makes sense to actual developers or is helpfull at all. This thing is vibed to all hell, but I'm trying here)

### Prerequisites

- Node.js v16+ ([Download](https://nodejs.org/))
- npm (comes with Node.js)

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   cd YOUR_REPO_NAME
   ```

2. **Install dependencies:**
   ```bash
   cd server && npm install
   cd ../client && npm install
   cd ../desktop && npm install
   ```

3. **Start development servers:**
   
   **Backend (Terminal 1):**
   ```bash
   cd server
   npm run dev
   ```
   
   **Frontend (Terminal 2):**
   ```bash
   cd client
   npm run dev
   ```
   
   The app will be available at http://localhost:5173

### Building the Installer

**Easy way (Recommended):**
- Just run `BUILD.exe.bat` from the root folder
- It will install dependencies, build everything, and create the installer

**Manual way:**
```bash
# Build server
cd server
npm run build

# Build client
cd ../client
npm run build

# Build installer
cd ../desktop
npm run build
```

The installer will be created in the root folder: `Job Application Tracker Setup [version].exe`

### Project Structure

```
Job-Application-CRM/
├── client/          # React frontend (TypeScript + Vite)
├── server/          # Express backend (TypeScript)
├── desktop/         # Electron wrapper
├── BUILD.exe.bat    # One-click build script
└── README.md        # This file
```

### Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (file-based, no server needed)
- **Desktop**: Electron
- **Icons**: Lucide React

---

## Releases

New versions are released on [GitHub Releases](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME/releases). The app will automatically notify you when updates are available.

---

## Troubleshooting

**App won't start?**
- Make sure no other instance is running
- Check Windows Task Manager for any stuck processes
- Try restarting your computer

**Update check fails?**
- Check your internet connection
- Verify the GitHub repository is accessible
- Make sure you're running a version that was installed from a GitHub Release

**Database issues?**
- The database is stored in: `C:\Users\YourName\AppData\Roaming\job-tracker-desktop\database.sqlite`
- You can backup this file to save your data
- Deleting it will reset the app (you'll lose all data)

---

## License

MIT

---

## Contributing

This is a personal project, but feel free to fork and modify for your own use!


