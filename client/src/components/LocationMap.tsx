import { useMemo, useState, useEffect } from 'react';
import USMap from './USMap';
import RegionMap from './RegionMap';
import { MapDataLoader } from '../utils/mapDataLoader';

interface LocationMapProps {
    location?: string;
    height?: number;
}

export default function LocationMap({ location, height = 200 }: LocationMapProps) {
    const [regionalCities, setRegionalCities] = useState<any>(null);
    const [currentRegionType, setCurrentRegionType] = useState<string | null>(null);

    const regionInfo = useMemo(() => {
        if (!location) return null;
        const loc = location.toLowerCase();

        // 1. Check for Australia
        if (loc.includes('australia') || /\b(nsw|vic|qld|wa|sa|tas|nt|act|au)\b/.test(loc)) {
            return {
                type: 'region',
                regionId: 'AU',
                countryCode: 'AU',
                center: [134, -25] as [number, number],
                scale: 450
            };
        }

        // 2. Check for New Zealand
        if (loc.includes('new zealand') || /\b(nz)\b/.test(loc)) {
            return {
                type: 'region',
                regionId: 'NZ',
                countryCode: 'NZ',
                center: [174, -41] as [number, number],
                scale: 1200
            };
        }

        // 3. Check for Canada
        if (loc.includes('canada') || /\b(ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|on|qc|bc|ab|mb|sk|ns|nb|nl)\b/.test(loc)) {
            return {
                type: 'region',
                regionId: 'CA',
                countryCode: 'CA',
                center: [-96, 56] as [number, number],
                scale: 300
            };
        }

        // 4. Check for Europe
        if (
            loc.includes('europe') || loc.includes('uk') || loc.includes('united kingdom') ||
            loc.includes('germany') || loc.includes('france') || loc.includes('netherlands') ||
            loc.includes('spain') || loc.includes('italy') || loc.includes('sweden') || loc.includes('ireland') ||
            /\b(de|fr|nl|es|it|se|ie|be|ch|at|pl|cz|pt|hu|ro|no|dk|fi|gr)\b/.test(loc)
        ) {
            return {
                type: 'region',
                regionId: 'EU',
                countryCode: 'EU',
                center: [10, 50] as [number, number],
                scale: 400
            };
        }

        return { type: 'us' };
    }, [location]);

    useEffect(() => {
        if (regionInfo?.type === 'region' && regionInfo.regionId !== currentRegionType) {
            setCurrentRegionType(regionInfo.regionId || null);
            const loadData = async () => {
                try {
                    let data;
                    if (regionInfo.regionId === 'AU') data = await MapDataLoader.getAUCities();
                    else if (regionInfo.regionId === 'NZ') data = await MapDataLoader.getNZCities();
                    else if (regionInfo.regionId === 'CA') data = await MapDataLoader.getCACities();
                    else if (regionInfo.regionId === 'EU') data = await MapDataLoader.getEUCities();
                    setRegionalCities(data);
                } catch (err) {
                    console.error('Failed to load regional map data:', err);
                }
            };
            loadData();
        }
    }, [regionInfo, currentRegionType]);

    if (!location) return null;

    if (regionInfo?.type === 'region' && regionalCities) {
        return (
            <RegionMap
                location={location}
                height={height}
                cities={regionalCities}
                center={regionInfo.center!}
                scale={regionInfo.scale!}
            />
        );
    }

    return <USMap location={location} height={height} />;
}
