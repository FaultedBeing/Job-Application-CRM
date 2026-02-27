import { useMemo } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopology from 'world-atlas/countries-50m.json';

/* ─── types ───────────────────────────────────────────────────────── */

interface CityEntry {
    c: string;   // city name
    s: string;   // state/province/country code
    la: number;  // latitude
    lo: number;  // longitude
    p: number;   // population
    a?: string[]; // aliases
}

interface RegionMapProps {
    location?: string;
    height?: number;
    cities: CityEntry[];
    countryCode: string; // ISO code or name for filtering
    center: [number, number]; // [longitude, latitude]
    scale: number;
}

/* ─── helper functions ────────────────────────────────────────────── */

function normalize(s: string) {
    return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

function formatDisplayName(name: string) {
    const suffixPattern = /\s+(city|town|village|cdp|borough|municipality)$/i;
    return name.replace(suffixPattern, '').trim();
}

function matchInList(list: CityEntry[], raw: string): CityEntry[] {
    const q = normalize(raw);
    const results: CityEntry[] = [];
    const pushUnique = (c: CityEntry | null | undefined) => {
        if (!c) return;
        if (results.some(r => r.c === c.c && r.s === c.s && r.la === c.la && r.lo === c.lo)) return;
        results.push(c);
    };

    const parts = raw.split(',').map(s => s.trim());
    if (parts.length >= 2) {
        const cityQ = normalize(parts[0]);
        const matches = list.filter((c) => {
            const cn = normalize(c.c);
            return cn === cityQ || cn.startsWith(cityQ) || cityQ.startsWith(cn);
        });
        if (matches.length) {
            matches.sort((a, b) => (b.p || 0) - (a.p || 0));
            matches.forEach(pushUnique);
            return results;
        }
    }

    const exactCities = list.filter(c => normalize(c.c) === q);
    exactCities.sort((a, b) => (b.p || 0) - (a.p || 0)).forEach(pushUnique);

    const partialMatch = list.find(c => normalize(c.c).startsWith(q) || q.includes(normalize(c.c)));
    pushUnique(partialMatch);

    return results;
}

/* ─── component ───────────────────────────────────────────────────── */

export default function RegionMap({ location, height = 200, cities, center, scale }: Omit<RegionMapProps, 'countryCode'>) {


    const { best } = useMemo(() => {
        if (!location) return { best: null };
        const matches = matchInList(cities, location);
        return { best: matches.length ? matches[0] : null };
    }, [location, cities]);

    const active = best;

    const projection = useMemo(() => {
        return geoMercator().scale(scale).center(center).translate([480, 250]);
    }, [scale, center]);

    const pathGenerator = useMemo(() => geoPath(projection), [projection]);

    const countriesGeo = useMemo(() => {
        return feature(worldTopology as any, (worldTopology as any).objects.countries) as any;
    }, []);

    // Filter or highlight the specific country if needed, for now we show all but centered on region
    const features = useMemo(() => countriesGeo ? (countriesGeo.features as any[]) : [], [countriesGeo]);

    const targetXY = useMemo(() => {
        if (!active) return null;
        return projection([active.lo, active.la]) as [number, number] | null;
    }, [active, projection]);

    const nearbyMajors = useMemo(() => {
        if (!active) return [];
        const withDist = cities
            .filter(c => c.p >= 100000 && !(c.c === active.c && c.s === active.s))
            .map(c => {
                const dlat = c.la - active.la;
                const dlng = c.lo - active.lo;
                return { city: c, dist: Math.sqrt(dlat * dlat + dlng * dlng) };
            });
        withDist.sort((a, b) => a.dist - b.dist);
        return withDist.filter(d => d.dist < 10).slice(0, 10).map(d => d.city);
    }, [active, cities]);

    const refXYs = useMemo(
        () => nearbyMajors.map(c => projection([c.lo, c.la]) as [number, number] | null),
        [nearbyMajors, projection]
    );

    const FULL_VB = '0 0 960 600';
    const MIN_VIEWBOX_SIZE = 140;
    const VIEWBOX_PAD = 45;
    const ASPECT = 960 / 600;

    const viewBox = useMemo(() => {
        if (!targetXY) return FULL_VB;
        let minX = targetXY[0], maxX = targetXY[0], minY = targetXY[1], maxY = targetXY[1];

        for (const pt of refXYs) {
            if (!pt) continue;
            minX = Math.min(minX, pt[0]);
            maxX = Math.max(maxX, pt[0]);
            minY = Math.min(minY, pt[1]);
            maxY = Math.max(maxY, pt[1]);
        }

        let w = Math.max(maxX - minX + VIEWBOX_PAD * 2, MIN_VIEWBOX_SIZE);
        let h = Math.max(maxY - minY + VIEWBOX_PAD * 2, MIN_VIEWBOX_SIZE);

        if (w / h > ASPECT) h = w / ASPECT;
        else w = h * ASPECT;

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        return `${cx} ${cy} ${w} ${h}`;
    }, [targetXY, refXYs]);

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

    const labeledRefs = useMemo(() => {
        if (!targetXY || !active) return [];

        type Rect = { x1: number; y1: number; x2: number; y2: number };
        const intersects = (r1: Rect, r2: Rect) => !(r1.x2 < r2.x1 || r1.x1 > r2.x2 || r1.y2 < r2.y1 || r1.y1 > r2.y2);

        const targetLabelText = `${formatDisplayName(active.c)}${active.s ? ', ' + active.s : ''}`;
        const targetW = targetLabelText.length * labelSize * 0.6;
        const targetRect: Rect = {
            x1: targetXY[0] - pinR,
            y1: targetXY[1] - labelSize * 0.5,
            x2: targetXY[0] + pinR + 5 + targetW,
            y2: targetXY[1] + labelSize * 0.5
        };

        const selected: { city: CityEntry; xy: [number, number]; rect: Rect }[] = [];
        for (let i = 0; i < nearbyMajors.length; i++) {
            const city = nearbyMajors[i];
            const xy = refXYs[i];
            if (!xy) continue;

            const displayText = formatDisplayName(city.c);
            const w = displayText.length * refLabelSize * 0.6;
            const h = refLabelSize;
            const rect: Rect = {
                x1: xy[0] - refDotR - 2,
                y1: xy[1] - h * 0.5,
                x2: xy[0] + refDotR + 3 + w,
                y2: xy[1] + h * 0.5
            };

            if (intersects(rect, targetRect)) continue;
            if (selected.some(s => intersects(rect, s.rect))) continue;

            selected.push({ city, xy, rect });
            if (selected.length >= 3) break;
        }
        return selected;
    }, [nearbyMajors, refXYs, targetXY, active, labelSize, pinR, refLabelSize]);

    if (!location || !active) return null;

    const viewBoxParts = viewBox.split(' ');
    const cx = parseFloat(viewBoxParts[0]);
    const cy = parseFloat(viewBoxParts[1]);
    const w = parseFloat(viewBoxParts[2]);
    const h = parseFloat(viewBoxParts[3]);
    const vbString = `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;

    return (
        <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #2d3139', backgroundColor: '#080a0e', marginTop: '0.75rem' }}>
            <svg viewBox={vbString} width="100%" style={{ display: 'block', maxHeight: `${height}px` }} preserveAspectRatio="xMidYMid meet">
                {features.map((feat, i) => (
                    <path key={i} d={pathGenerator(feat) || ''} fill="#111827" stroke="#4b5563" strokeWidth={borderWidth} />
                ))}
                {labeledRefs.map(({ city, xy }, i) => (
                    <g key={`ref-${i}`}>
                        <circle cx={xy[0]} cy={xy[1]} r={refDotR} fill="#4b5563" />
                        <text x={xy[0] + refDotR + 3} y={xy[1] + refLabelSize * 0.35} fill="#6b7280" fontSize={refLabelSize} fontFamily="system-ui, sans-serif">
                            {formatDisplayName(city.c)}
                        </text>
                    </g>
                ))}
                {targetXY && (
                    <g>
                        <circle cx={targetXY[0]} cy={targetXY[1]} r={glowR} fill="#fb923c" opacity={0.18} />
                        <circle cx={targetXY[0]} cy={targetXY[1]} r={pinR} fill="#fb923c" stroke="#0f1115" strokeWidth={pinR * 0.35} />
                        <text x={targetXY[0] + pinR + 5} y={targetXY[1] + labelSize * 0.35} fill="#e5e7eb" fontSize={labelSize} fontWeight="bold" fontFamily="system-ui, sans-serif">
                            {formatDisplayName(active.c)}{active.s ? `, ${active.s}` : ''}
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
}
