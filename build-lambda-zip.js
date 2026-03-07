/**
 * build-lambda-zip.js
 * 
 * Pre-builds the Lambda deployment package (ses-reminder-sender.zip).
 * Run this before building the Electron app:
 *   node build-lambda-zip.js
 *
 * What it does:
 * 1. Installs production dependencies in lambda/ses-reminder-sender/
 * 2. Zips the entire directory (including node_modules) into lambda/ses-reminder-sender.zip
 *
 * The resulting zip is what gets:
 * - Bundled into the Electron app via extraResources
 * - Served by the /api/download/lambda route
 * - Downloaded by users and uploaded directly to AWS Lambda
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LAMBDA_DIR = path.join(__dirname, 'lambda', 'ses-reminder-sender');
const ZIP_PATH = path.join(__dirname, 'lambda', 'ses-reminder-sender.zip');

// Validate the lambda source exists
if (!fs.existsSync(path.join(LAMBDA_DIR, 'index.js'))) {
    console.error('❌ Lambda source not found at:', LAMBDA_DIR);
    console.error('   Expected index.js in that directory.');
    process.exit(1);
}

// 1. Install production dependencies
console.log('📦 Installing production dependencies...');
try {
    execSync('npm install --omit=dev', { cwd: LAMBDA_DIR, stdio: 'inherit' });
} catch (err) {
    console.error('❌ npm install failed:', err.message);
    process.exit(1);
}

// 2. Create the zip
console.log('🗜️  Creating zip archive...');

// We need archiver — check if it's available globally or locally
let archiver;
try {
    archiver = require('archiver');
} catch {
    // Try loading from server/node_modules as a fallback
    try {
        archiver = require(path.join(__dirname, 'server', 'node_modules', 'archiver'));
    } catch {
        console.error('❌ archiver module not found. Install it:');
        console.error('   npm install archiver');
        process.exit(1);
    }
}

async function createZip() {
    // Remove existing zip if present
    if (fs.existsSync(ZIP_PATH)) {
        fs.unlinkSync(ZIP_PATH);
    }

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(ZIP_PATH);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
            console.log(`✅ Created ${ZIP_PATH}`);
            console.log(`   Size: ${sizeMB} MB (${archive.pointer()} bytes)`);
            resolve();
        });

        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('⚠️  Warning:', err.message);
            } else {
                reject(err);
            }
        });

        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        // Add the entire lambda directory contents (files at root of zip, not nested)
        archive.directory(LAMBDA_DIR, false);
        archive.finalize();
    });
}

createZip()
    .then(() => {
        console.log('');
        console.log('🚀 Lambda package ready! This zip is:');
        console.log('   • Bundled into the Electron app via extraResources');
        console.log('   • Served at /api/download/lambda');
        console.log('   • Ready for direct upload to AWS Lambda');
    })
    .catch((err) => {
        console.error('❌ Zip creation failed:', err);
        process.exit(1);
    });
