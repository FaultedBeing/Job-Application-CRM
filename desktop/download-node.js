const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Helper to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Node.js version to bundle (LTS version)
const NODE_VERSION = '20.18.0';
const NODE_ARCH = 'x64';
const NODE_PLATFORM = 'win';

const nodeDir = path.join(__dirname, 'node-portable');
const nodeExe = path.join(nodeDir, 'node.exe');

console.log('Checking for bundled Node.js...');

if (fs.existsSync(nodeExe)) {
  console.log('✓ Node.js already downloaded');
  process.exit(0);
}

console.log(`Downloading Node.js ${NODE_VERSION}...`);

// Create directory
if (!fs.existsSync(nodeDir)) {
  fs.mkdirSync(nodeDir, { recursive: true });
}

// Download URL for Node.js Windows x64 zip
const downloadUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_PLATFORM}-${NODE_ARCH}.zip`;
const zipPath = path.join(__dirname, 'node.zip');

console.log(`Downloading from: ${downloadUrl}`);

const file = fs.createWriteStream(zipPath);

https.get(downloadUrl, (response) => {
  if (response.statusCode === 302 || response.statusCode === 301) {
    // Follow redirect
    https.get(response.headers.location, (redirectResponse) => {
      redirectResponse.pipe(file);
      file.on('finish', async () => {
        file.close();
        await extractNode();
      });
    });
  } else {
    response.pipe(file);
    file.on('finish', async () => {
      file.close();
      await extractNode();
    });
  }
}).on('error', (err) => {
  console.error('Error downloading Node.js:', err);
  process.exit(1);
});

async function extractNode() {
  console.log('Extracting Node.js...');
  try {
    // Wait a moment to ensure file is fully written
    await wait(500);
    
    // Use PowerShell to extract (built into Windows)
    const extractCommand = `powershell -Command "$ErrorActionPreference='Stop'; try { Expand-Archive -Path '${zipPath.replace(/\\/g, '/')}' -DestinationPath '${path.dirname(zipPath).replace(/\\/g, '/')}' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"`;
    execSync(extractCommand, { stdio: 'inherit' });
    
    // Wait a moment for extraction to complete
    await wait(500);
    
    // Move node.exe from extracted folder to node-portable
    const extractedDir = path.join(__dirname, `node-v${NODE_VERSION}-${NODE_PLATFORM}-${NODE_ARCH}`);
    const extractedNodeExe = path.join(extractedDir, 'node.exe');
    
    if (fs.existsSync(extractedNodeExe)) {
      fs.copyFileSync(extractedNodeExe, nodeExe);
      console.log('✓ Node.js extracted successfully');
      
      // Clean up - wait a bit before deleting
      await wait(500);
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      try {
        if (fs.existsSync(extractedDir)) {
          fs.rmSync(extractedDir, { recursive: true, force: true });
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    } else {
      throw new Error('node.exe not found in extracted archive');
    }
  } catch (error) {
    console.error('Error extracting Node.js:', error);
    process.exit(1);
  }
}
