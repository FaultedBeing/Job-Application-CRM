import { useMemo } from 'react';
import USMap from './USMap';
import RegionMap from './RegionMap';
import auCities from '../data/au-cities.json';
import caCities from '../data/ca-cities.json';
import nzCities from '../data/nz-cities.json';
import euCities from '../data/eu-cities.json';

interface LocationMapProps {
    location?: string;
    height?: number;
}

export default function LocationMap({ location, height = 200 }: LocationMapProps) {
    const region = useMemo(() => {
        if (!location) return null;
        const loc = location.toLowerCase();

        // 1. Check for Australia
        if (loc.includes('australia') || /\b(nsw|vic|qld|wa|sa|tas|nt|act|au)\b/.test(loc)) {
            return {
                type: 'region',
                cities: auCities as any,
                countryCode: 'AU',
                center: [134, -25] as [number, number],
                scale: 450
            };
        }

        // 2. Check for New Zealand
        if (loc.includes('new zealand') || /\b(nz)\b/.test(loc)) {
            return {
                type: 'region',
                cities: nzCities as any,
                countryCode: 'NZ',
                center: [174, -41] as [number, number],
                scale: 1200
            };
        }

        // 3. Check for Canada
        // We check for "canada" or province abbreviations to avoid "CA" (California) confusion
        if (loc.includes('canada') || /\b(ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|on|qc|bc|ab|mb|sk|ns|nb|nl)\b/.test(loc)) {
            return {
                type: 'region',
                cities: caCities as any,
                countryCode: 'CA',
                center: [-96, 56] as [number, number],
                scale: 300
            };
        }

        // 4. Check for Europe / Major Euro Countries
        if (
            loc.includes('europe') ||
            loc.includes('uk') ||
            loc.includes('united kingdom') ||
            loc.includes('germany') ||
            loc.includes('france') ||
            loc.includes('netherlands') ||
            loc.includes('spain') ||
            loc.includes('italy') ||
            loc.includes('sweden') ||
            loc.includes('ireland') ||
            /\b(de|fr|nl|es|it|se|ie|be|ch|at|pl|cz|pt|hu|ro|no|dk|fi|gr)\b/.test(loc)
        ) {
            return {
                type: 'region',
                cities: euCities as any,
                countryCode: 'EU',
                center: [10, 50] as [number, number],
                scale: 400
            };
        }

        // Default to USMap
        return { type: 'us' };
    }, [location]);

    if (!location) return null;

    if (region?.type === 'region' && region.cities) {
        return (
            <RegionMap
                location={location}
                height={height}
                cities={region.cities}
                center={region.center!}
                scale={region.scale!}
            />
        );
    }

    return <USMap location={location} height={height} />;
}
