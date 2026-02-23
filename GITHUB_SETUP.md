# GitHub Setup Guide

This guide will help you upload your Job Application Tracker to GitHub.

## What Files to Include/Exclude

### ✅ **INCLUDE (Source Code & Config)**
- All `.ts`, `.tsx`, `.js`, `.jsx` files (your source code)
- `package.json` and `package-lock.json` (dependencies)
- `tsconfig.json`, `vite.config.ts` (configuration files)
- `.gitignore` (tells Git what to ignore)
- `README.md` (project documentation)
- `START_HERE.md` (your setup guide)
- `start-server.bat`, `start-client.bat` (helper scripts)
- `desktop/icon.ico`, `desktop/icon.png` (app icons)
- `desktop/main.js` (Electron main process)

### ❌ **EXCLUDE (Generated/Build Files)**
- `node_modules/` (dependencies - can be reinstalled)
- `dist/` folders (build outputs)
- `*.exe` files (built executables)
- `*.sqlite` files (database - contains user data)
- `uploads/` folder (user-uploaded files)
- `.env` files (environment variables/secrets)

**Note:** The `.gitignore` file I've updated will automatically exclude these!

## Step-by-Step GitHub Setup

### 1. Create a GitHub Account (if you don't have one)
- Go to https://github.com
- Sign up for a free account

### 2. Create a New Repository
1. Click the "+" icon in the top right → "New repository"
2. Name it (e.g., `job-application-tracker`)
3. Choose **Public** (free) or **Private** (if you want to keep it private)
4. **DO NOT** initialize with README, .gitignore, or license (you already have these)
5. Click "Create repository"

### 3. Install Git (if not already installed)
- Download from: https://git-scm.com/download/win
- Install with default options

### 4. Initialize Git in Your Project

Open PowerShell or Command Prompt in your project folder (`C:\Misc\job_app_2`) and run:

```powershell
# Initialize Git repository
git init

# Add all files (respecting .gitignore)
git add .

# Create your first commit
git commit -m "Initial commit: Job Application Tracker"

# Add your GitHub repository as remote (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Rename default branch to 'main' (GitHub standard)
git branch -M main

# Push to GitHub
git push -u origin main
```

### 5. Authentication
When you push, GitHub will ask for credentials:
- **Username:** Your GitHub username
- **Password:** Use a **Personal Access Token** (not your password)
  - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  - Generate new token with `repo` permissions
  - Copy the token and use it as your password

## Daily Workflow

### Making Changes and Uploading

```powershell
# Check what files changed
git status

# Add specific files (or use . to add all)
git add .

# Commit with a message describing your changes
git commit -m "Fixed industry categories parsing issue"

# Push to GitHub
git push
```

### Pulling Latest Changes (if working on multiple computers)

```powershell
git pull
```

## Best Practices

1. **Commit Often**: Make small, logical commits with clear messages
2. **Write Good Commit Messages**: 
   - Good: "Fix industry categories splitting on commas"
   - Bad: "fix stuff"
3. **Don't Commit Secrets**: Never commit `.env` files, API keys, or passwords
4. **Don't Commit User Data**: Database files and uploads stay local
5. **Use Branches for Features** (optional, for later):
   ```powershell
   git checkout -b feature-name
   # make changes
   git commit -m "Added new feature"
   git push -u origin feature-name
   ```

## What Gets Uploaded?

Based on your `.gitignore`, here's what **WILL** be uploaded:

```
job_app_2/
├── client/
│   ├── src/              ✅ All source code
│   ├── package.json      ✅ Dependencies list
│   └── vite.config.ts    ✅ Config
├── server/
│   ├── src/              ✅ All source code
│   ├── package.json      ✅ Dependencies list
│   └── tsconfig.json     ✅ Config
├── desktop/
│   ├── main.js           ✅ Electron code
│   ├── package.json       ✅ Config
│   ├── icon.ico          ✅ App icon
│   └── icon.png          ✅ App icon
├── .gitignore            ✅ Git config
├── README.md             ✅ Documentation
└── START_HERE.md         ✅ Setup guide
```

And what **WON'T** be uploaded:
- `node_modules/` (too large, can be reinstalled)
- `dist/` folders (build outputs)
- `*.exe` files (built executables)
- `*.sqlite` (your database - contains personal data)
- `uploads/` (user files)

## Repository Size

Your repository will be relatively small (probably < 5MB) because:
- Source code is text (very small)
- `node_modules/` is excluded (can be 100MB+ but not needed)
- Build outputs are excluded
- User data is excluded

## Making Releases

When you want to share a built `.exe` file:

1. Build your app: `cd desktop && npm run build`
2. Go to GitHub → Releases → "Create a new release"
3. Tag version (e.g., `v1.0.7`)
4. Upload the `.exe` file as a release asset
5. Users can download the `.exe` without cloning the repo

## Troubleshooting

**"Repository not found"**
- Check your repository URL
- Make sure you're authenticated

**"Large file" warnings**
- Make sure `.gitignore` is working
- Check `git status` to see what's being added

**"Authentication failed"**
- Use Personal Access Token, not password
- Make sure token has `repo` permissions

## Need Help?

- Git documentation: https://git-scm.com/doc
- GitHub Guides: https://guides.github.com
- Git cheat sheet: https://education.github.com/git-cheat-sheet-education.pdf
