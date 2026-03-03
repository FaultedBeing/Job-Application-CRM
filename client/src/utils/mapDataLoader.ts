/**
 * Shared utility to load large map JSON files dynamically.
 * Supports background preloading and caching.
 */

import usCities from '../data/us-cities.json';
import usGazetteer from '../data/us-gazetteer-places.json';
import usTopology from 'us-atlas/states-10m.json';
import worldTopology from 'world-atlas/countries-50m.json';

interface MapDataCache {
    [key: string]: any;
}

const cache: MapDataCache = {};

// Helper to load a specific file
async function loadFile(key: string, importer: () => Promise<any>) {
    if (cache[key]) return cache[key];
    const data = await importer();
    cache[key] = data.default || data;
    return cache[key];
}

export const MapDataLoader = {
    // These are now static to avoid build warnings and support the "seamless" UI requirement
    getUSCities: async () => usCities,
    getUSGazetteer: async () => usGazetteer,
    getUSTopology: async () => usTopology,
    getWorldTopology: async () => worldTopology,

    // Regional data remains dynamic to keep the main bundle size from exploding further
    getAUCities: () => loadFile('au_cities', () => import('../data/au-cities.json')),
    getCACities: () => loadFile('ca_cities', () => import('../data/ca-cities.json')),
    getNZCities: () => loadFile('nz_cities', () => import('../data/nz-cities.json')),
    getEUCities: () => loadFile('eu_cities', () => import('../data/eu-cities.json')),

    // Preload regional data silently
    preloadAll: async () => {
        try {
            // Static data (US, World) is already bundled/preloaded by the main app/LocationMap
            await Promise.all([
                MapDataLoader.getAUCities(),
                MapDataLoader.getCACities(),
                MapDataLoader.getNZCities(),
                MapDataLoader.getEUCities()
            ]);
            console.log('Regional map data preloading complete');
        } catch (err) {
            console.error('Regional map data preloading failed:', err);
        }
    }
};
