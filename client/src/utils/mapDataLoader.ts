/**
 * Shared utility to load large map JSON files dynamically.
 * Supports background preloading and caching.
 */

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
    getUSCities: () => loadFile('us_cities', () => import('../data/us-cities.json')),
    getUSGazetteer: () => loadFile('us_gazetteer', () => import('../data/us-gazetteer-places.json')),
    getAUCities: () => loadFile('au_cities', () => import('../data/au-cities.json')),
    getCACities: () => loadFile('ca_cities', () => import('../data/ca-cities.json')),
    getNZCities: () => loadFile('nz_cities', () => import('../data/nz-cities.json')),
    getEUCities: () => loadFile('eu_cities', () => import('../data/eu-cities.json')),
    getUSTopology: () => loadFile('us_topology', () => import('us-atlas/states-10m.json')),
    getWorldTopology: () => loadFile('world_topology', () => import('world-atlas/countries-50m.json')),

    // Preload everything silently
    preloadAll: async () => {
        try {
            // We load them sequentially or in small batches to avoid pegging the CPU/Network too hard at once
            await MapDataLoader.getUSCities();
            await MapDataLoader.getUSGazetteer();
            await MapDataLoader.getAUCities();
            await MapDataLoader.getCACities();
            await MapDataLoader.getNZCities();
            await MapDataLoader.getEUCities();
            console.log('Map data preloading complete');
        } catch (err) {
            console.error('Map data preloading failed:', err);
        }
    }
};
