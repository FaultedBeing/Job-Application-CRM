# How to Run the Job Application Tracker

## Quick Start (Development Mode)

### Option 1: Use the Start Scripts (Easiest)

1. **Start the Backend Server:**
   - Double-click `start-server.bat` (or run it from Command Prompt)
   - Wait until you see "Server running on port 3000"

2. **Start the Frontend:**
   - Open a NEW Command Prompt window
   - Double-click `start-client.bat` (or run it from Command Prompt)
   - Your browser should automatically open to http://localhost:5173

3. **To Stop:**
   - Press `Ctrl+C` in each window to stop the servers

### Option 2: Manual Start

1. **Open Command Prompt** (Press Windows Key + R, type `cmd`, press Enter)

2. **Start Backend:**
   ```
   cd C:\Misc\job_app_2\server
   npm run dev
   ```
   Keep this window open!

3. **Open a NEW Command Prompt window** and **Start Frontend:**
   ```
   cd C:\Misc\job_app_2\client
   npm run dev
   ```

4. **Open your browser** and go to: http://localhost:5173

## Building for Production (Creating .exe file)

If you want to create a standalone .exe file:

1. **Build Frontend:**
   ```
   cd C:\Misc\job_app_2\client
   npm run build
   ```

2. **Build Backend:**
   ```
   cd C:\Misc\job_app_2\server
   npm run build
   ```

3. **Create Desktop App:**
   ```
   cd C:\Misc\job_app_2\desktop
   npm run build
   ```

4. **Find your .exe file** in: `C:\Misc\job_app_2\desktop\dist\`

## Troubleshooting

- **"npm is not recognized"**: You need to install Node.js from https://nodejs.org/
- **Port already in use**: Close any other applications using port 3000 or 5173
- **Database errors**: The database will be created automatically on first run

## What Each Part Does

- **Server**: Handles data storage and API (runs on port 3000)
- **Client**: The user interface you see in your browser (runs on port 5173)
- **Desktop**: Wraps everything into a Windows .exe file (optional)
