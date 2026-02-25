import { useMemo } from 'react';
import { geoAlbersUsa, geoPath, GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
// @ts-ignore – JSON import from node_modules (us-atlas ships .json files)
import usTopology from 'us-atlas/states-10m.json';
import cities from '../data/us-cities.json';
import gazetteerCities from '../data/us-gazetteer-places.json';

/* ─── types ───────────────────────────────────────────────────────── */

interface CityEntry {
  c: string;   // city name
  s: string;   // state abbreviation
  la: number;  // latitude
  lo: number;  // longitude
  p: number;   // population
  a?: string[]; // aliases
}

interface USMapProps {
  location?: string;
  height?: number;
}

/* ─── constants ───────────────────────────────────────────────────── */

const MAJOR_POP = 200_000;          // "major city" threshold for reference labels
const MIN_VIEWBOX_SIZE = 140;       // min extent so we never over-zoom (allow a bit more zoom-in)
const VIEWBOX_PAD = 45;             // padding around bounding box (in proj px)
const FULL_VB = '0 0 960 600';
const ASPECT = 960 / 600;

const allCities = cities as CityEntry[];
const allGazetteer = gazetteerCities as CityEntry[];

/* ─── projection (matches us-atlas data) ──────────────────────────── */

const projection = geoAlbersUsa().scale(1070).translate([480, 250]);
const pathGenerator = geoPath(projection);

/* ─── extract GeoJSON from TopoJSON once ──────────────────────────── */

// topojson-client feature() with proper typing
const statesGeo = (() => {
  const topo: any = usTopology;
  return feature(topo, topo.objects.states) as any;
})();

/* ─── location matching ───────────────────────────────────────────── */

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

// Strip generic suffixes like \"city\", \"town\", etc. ONLY if they appear at the END
// This preserves city names like "Kansas City" or "New York City" where "city" is part of the actual name
function normalizeCityCore(name: string) {
  const n = normalize(name);
  // Only strip if the suffix is at the end of the string (with optional leading space)
  const suffixPattern = /\s+(city|town|village|cdp|borough|municipality)$/;
  return n.replace(suffixPattern, '').trim();
}

// Same logic as normalizeCityCore but preserves original casing for display purposes.
function formatDisplayName(name: string) {
  const suffixPattern = /\s+(city|town|village|cdp|borough|municipality)$/i;
  return name.replace(suffixPattern, '').trim();
}

const STATE_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

function matchInList(list: CityEntry[], raw: string): CityEntry[] {
  const q = normalize(raw);
  const results: CityEntry[] = [];
  const pushUnique = (c: CityEntry | null | undefined) => {
    if (!c) return;
    if (results.some(r => r.c === c.c && r.s === c.s && r.la === c.la && r.lo === c.lo)) return;
    results.push(c);
  };

  // 1. Try "City, STATE" / "City, ST"
  const parts = raw.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    const cityQ = normalize(parts[0]); // Keep user input as-is (don't strip "city" from "Kansas City")
    let stateQ = parts[parts.length - 1].trim().toUpperCase();
    // Handle full state name
    if (stateQ.length > 2) {
      stateQ = STATE_ABBR[stateQ.toLowerCase()] || stateQ;
    }
    const matches = list.filter((c) => {
      if (c.s !== stateQ) return false;
      const cn = normalize(c.c);
      const cnCore = normalizeCityCore(c.c); // Strip suffix from DB entry only
      // Try exact match first (preserves "Kansas City" matching "Kansas City")
      if (cn === cityQ) return true;
      // Then try with suffix stripped from DB entry (handles "Atwater city" matching "Atwater")
      if (cnCore === cityQ) return true;
      // Also try partial matches
      if (cnCore.startsWith(cityQ) || cityQ.startsWith(cnCore)) return true;
      return false;
    });
    if (matches.length) {
      matches.sort((a, b) => (b.p || 0) - (a.p || 0));
      matches.forEach(pushUnique);
      return results;
    }
  }

  // 1b. Try "City STATE" or "City StateName" (space‑separated, no comma)
  const rawWords = raw.split(/\s+/).map(w => w.trim()).filter(Boolean);
  if (rawWords.length >= 2) {
    const lastToken = rawWords[rawWords.length - 1];
    const lowerLast = lastToken.toLowerCase();
    let stateQ = lastToken.toUpperCase();
    if (STATE_ABBR[lowerLast]) {
      stateQ = STATE_ABBR[lowerLast];
    }
    const cityRaw = rawWords.slice(0, -1).join(' ');
    const cityQ2 = normalize(cityRaw); // Keep user input as-is
    const matches2 = list.filter((c) => {
      if (c.s !== stateQ) return false;
      const cn = normalize(c.c);
      const cnCore = normalizeCityCore(c.c); // Strip suffix from DB entry only
      return cn.startsWith(cityQ2) || cnCore.startsWith(cityQ2);
    });
    if (matches2.length) {
      matches2.sort((a, b) => (b.p || 0) - (a.p || 0));
      matches2.forEach(pushUnique);
      return results;
    }
  }

  // 2. Alias match (for curated list only – gazetteer entries won't have aliases)
  const aliasMatch = list.find(
    c => c.a?.some(a => normalize(a) === q)
  );
  pushUnique(aliasMatch);

  // 3. Exact city‑name match (prefer higher population if available)
  const sorted = [...list].sort((a, b) => (b.p || 0) - (a.p || 0));
  const exactCities = sorted.filter((c) => {
    const cn = normalize(c.c);
    const cnCore = normalizeCityCore(c.c);
    return cn === q || cnCore === q; // Try full name first, then with suffix stripped from DB entry
  });
  exactCities.forEach(pushUnique);

  // 4. Starts‑with / includes match
  const partialMatch = sorted.find((c) => {
    const cn = normalize(c.c);
    const cnCore = normalizeCityCore(c.c);
    return cn.startsWith(q) || q.includes(cn) || cnCore.startsWith(q) || q.includes(cnCore);
  });
  pushUnique(partialMatch);

  // 5. Word overlap (e.g. "San Francisco Bay Area" → "San Francisco")
  const words = q.split(/\s+/).filter(w => w.length > 2);
  if (words.length >= 2) {
    const wordMatch = sorted.find(c => {
      const cn = normalize(c.c);
      return words.filter(w => cn.includes(w)).length >= 2;
    });
    pushUnique(wordMatch);
  }

  return results;
}

function matchLocation(location?: string): { best: CityEntry | null; candidates: CityEntry[] } {
  if (!location) return { best: null, candidates: [] };
  const raw = location.trim();
  if (!raw || /^remote$/i.test(raw)) return { best: null, candidates: [] };

  // 1) Try curated major‑city list (has real populations + aliases)
  const fromCurated = matchInList(allCities, raw);
  if (fromCurated.length) return { best: fromCurated[0], candidates: fromCurated };

  // 2) Fall back to full Gazetteer places (covers essentially all towns)
  const fromGazetteer = matchInList(allGazetteer, raw);
  if (fromGazetteer.length) return { best: fromGazetteer[0], candidates: fromGazetteer };

  return { best: null, candidates: [] };
}

/* ─── nearby major cities for reference labels ─────────────────────── */

function findNearbyMajors(target: CityEntry): CityEntry[] {
  const majors = allCities.filter(c => c.p >= MAJOR_POP && !(c.c === target.c && c.s === target.s));
  const withDist = majors.map(c => {
    const dlat = c.la - target.la;
    const dlng = c.lo - target.lo;
    return { city: c, dist: Math.sqrt(dlat * dlat + dlng * dlng) };
  });
  withDist.sort((a, b) => a.dist - b.dist);
  // return a pool (up to ~10) within ~8° (~550 mi); we will filter for overlaps later
  return withDist.filter(d => d.dist < 8).slice(0, 10).map(d => d.city);
}

/* ─── viewBox calculation ──────────────────────────────────────────── */

function calcViewBox(
  targetXY: [number, number],
  referencePts: Array<[number, number] | null>
): string {
  let minX = targetXY[0];
  let maxX = targetXY[0];
  let minY = targetXY[1];
  let maxY = targetXY[1];

  for (const pt of referencePts) {
    if (!pt) continue;
    minX = Math.min(minX, pt[0]);
    maxX = Math.max(maxX, pt[0]);
    minY = Math.min(minY, pt[1]);
    maxY = Math.max(maxY, pt[1]);
  }

  let w = maxX - minX + VIEWBOX_PAD * 2;
  let h = maxY - minY + VIEWBOX_PAD * 2;

  // enforce minimum size
  w = Math.max(w, MIN_VIEWBOX_SIZE);
  h = Math.max(h, MIN_VIEWBOX_SIZE);

  // maintain a 3:2 aspect ratio
  if (w / h > ASPECT) {
    h = w / ASPECT;
  } else {
    w = h * ASPECT;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
}

/* ─── component ───────────────────────────────────────────────────── */

export default function USMap({ location, height = 200 }: USMapProps) {
  const { best } = useMemo(() => matchLocation(location), [location]);
  const active = best;

  const targetXY = useMemo(() => {
    if (!active) return null;
    return projection([active.lo, active.la]) as [number, number] | null;
  }, [active]);

  const nearbyMajors = useMemo(() => {
    if (!active) return [];
    return findNearbyMajors(active);
  }, [active]);

  const refXYs = useMemo(
    () => nearbyMajors.map(c => projection([c.lo, c.la]) as [number, number] | null),
    [nearbyMajors]
  );

  const viewBox = useMemo(() => {
    if (!targetXY) return FULL_VB;
    return calcViewBox(targetXY, refXYs);
  }, [targetXY, refXYs]);

  // Derive dynamic sizes from viewBox width
  const vbWidth = useMemo(() => {
    const parts = viewBox.split(' ');
    return parseFloat(parts[2]) || 960;
  }, [viewBox]);

  const pinR = Math.max(3, vbWidth * 0.009);
  const glowR = pinR * 2;
  const labelSize = Math.max(8, vbWidth * 0.018);
  const refDotR = Math.max(1.5, vbWidth * 0.004);
  const refLabelSize = Math.max(7, vbWidth * 0.016);
  const borderWidth = Math.max(0.8, vbWidth * 0.001);

  // Choose a subset of nearby cities whose labels won't overlap too badly
  const labeledRefs = useMemo(() => {
    if (!targetXY) return [];
    const minDistToTarget = vbWidth * 0.08;   // keep some space from main pin (increased)
    const minDistBetween = vbWidth * 0.09;    // avoid labels on top of each other
    const labelStartOffset = refDotR + 3;      // label text starts this many pixels right of dot

    const selected: { city: CityEntry; xy: [number, number] }[] = [];
    for (let i = 0; i < nearbyMajors.length; i++) {
      const city = nearbyMajors[i];
      const xy = refXYs[i];
      if (!xy) continue;

      // Check distance from label text start position (not just the dot) to target pin
      // Label text starts at xy[0] + labelStartOffset
      const labelStartX = xy[0] + labelStartOffset;
      const labelStartY = xy[1]; // Labels are vertically centered on the dot

      // Distance from label start to target pin
      const dxT = labelStartX - targetXY[0];
      const dyT = labelStartY - targetXY[1];
      const distToTarget = Math.hypot(dxT, dyT);

      // Also check if the dot itself is too close (for cities to the left of the pin)
      const dotDistToTarget = Math.hypot(xy[0] - targetXY[0], xy[1] - targetXY[1]);

      // Reject if either the label start or the dot is too close to the target pin
      if (distToTarget < minDistToTarget || dotDistToTarget < minDistToTarget * 0.7) continue;

      // too close to any already selected label?
      let tooClose = false;
      for (const s of selected) {
        const dx = xy[0] - s.xy[0];
        const dy = xy[1] - s.xy[1];
        if (Math.hypot(dx, dy) < minDistBetween) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      selected.push({ city, xy });
      if (selected.length >= 3) break;
    }
    return selected;
  }, [nearbyMajors, refXYs, targetXY, vbWidth, refDotR]);

  if (!location) return null;
  if (!active) {
    return (
      <div style={{ color: '#6b7280', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.5rem' }}>
        Could not locate "{location}" on the map.
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #2d3139',
        backgroundColor: '#080a0e',
        marginTop: '0.75rem'
      }}
    >
      <svg
        viewBox={viewBox}
        width="100%"
        style={{ display: 'block', maxHeight: `${height}px` }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* State outlines */}
        {(statesGeo.features as any[]).map((feat: GeoPermissibleObjects, i: number) => (
          <path
            key={i}
            d={pathGenerator(feat) || ''}
            fill="#111827"
            stroke="#4b5563"
            strokeWidth={borderWidth}
          />
        ))}

        {/* Reference city dots + labels (filtered to avoid overlaps) */}
        {labeledRefs.map(({ city, xy }, i) => (
          <g key={`ref-${i}`}>
            <circle cx={xy[0]} cy={xy[1]} r={refDotR} fill="#4b5563" />
            <text
              x={xy[0] + refDotR + 3}
              y={xy[1] + refLabelSize * 0.35}
              fill="#6b7280"
              fontSize={refLabelSize}
              fontFamily="system-ui, sans-serif"
            >
              {formatDisplayName(city.c)}
            </text>
          </g>
        ))}

        {/* Target pin */}
        {targetXY && active && (
          <g>
            <circle cx={targetXY[0]} cy={targetXY[1]} r={glowR} fill="#fbbf24" opacity={0.18} />
            <circle cx={targetXY[0]} cy={targetXY[1]} r={pinR} fill="#fbbf24" stroke="#0f1115" strokeWidth={pinR * 0.35} />
            <text
              x={targetXY[0] + pinR + 5}
              y={targetXY[1] + labelSize * 0.35}
              fill="#e5e7eb"
              fontSize={labelSize}
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              {formatDisplayName(active.c)}, {active.s}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
