// Simple Node script to convert Census Gazetteer place file to compact JSON
// Input:  ..\2025_Gaz_place_national\2025_Gaz_place_national.txt
// Output: ..\src\data\us-gazetteer-places.json

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const inputPath = path.join(root, '..', '2025_Gaz_place_national', '2025_Gaz_place_national.txt');
const outputPath = path.join(root, 'src', 'data', 'us-gazetteer-places.json');

if (!fs.existsSync(inputPath)) {
  console.error('Gazetteer file not found at', inputPath);
  process.exit(1);
}

console.log('Reading', inputPath);
const raw = fs.readFileSync(inputPath, 'utf-8');
const lines = raw.split(/\r?\n/);
if (lines.length <= 1) {
  console.error('Gazetteer file appears to be empty');
  process.exit(1);
}

// Header:
// USPS|GEOID|GEOIDFQ|ANSICODE|NAME|LSAD|FUNCSTAT|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG
const header = lines[0].split('|');
const idxUSPS = header.indexOf('USPS');
const idxNAME = header.indexOf('NAME');
const idxLAT = header.indexOf('INTPTLAT');
const idxLON = header.indexOf('INTPTLONG');

if (idxUSPS < 0 || idxNAME < 0 || idxLAT < 0 || idxLON < 0) {
  console.error('Unexpected Gazetteer header, cannot find required columns');
  process.exit(1);
}

const out = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const parts = line.split('|');
  if (parts.length <= idxLON) continue;

  const s = parts[idxUSPS];
  const name = parts[idxNAME];
  const latStr = parts[idxLAT];
  const lonStr = parts[idxLON];

  const la = parseFloat(latStr);
  const lo = parseFloat(lonStr);
  if (!name || !s || !Number.isFinite(la) || !Number.isFinite(lo)) continue;

  // Give all Gazetteer places a nominal population so they don't count as "major cities".
  // Our curated us-cities.json continues to be the source of true major cities by population.
  out.push({
    c: name,
    s,
    la,
    lo,
    p: 50000
  });
}

console.log('Parsed places:', out.length);
fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
console.log('Wrote JSON to', outputPath);

