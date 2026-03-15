import type { TerrainDataset } from '../types/index.js'

// ── Predefined terrain datasets ────────────────────────────────────────────────
// URLs and geographic bounds are populated in Step 4 when source GeoTIFF files
// are acquired. The labels and descriptions are final.

const DEFAULT_TERRAIN_DATA_BASE = `${import.meta.env.BASE_URL}data/`

function normalizeTerrainDataBase(input: string | undefined): string {
    const value = (input ?? '').trim()
    if (!value) return DEFAULT_TERRAIN_DATA_BASE
    return value.endsWith('/') ? value : `${value}/`
}

const TERRAIN_DATA_BASE = normalizeTerrainDataBase(import.meta.env.VITE_TERRAIN_DATA_BASE)

function terrainUrl(fileName: string): string {
    return `${TERRAIN_DATA_BASE}${fileName}`
}

export const DATASETS: TerrainDataset[] = [
    {
        id: 'cold-mountain',
        label: 'Cold Mountain',
        description: 'USGS 1/3 arc-second DEM covering Cold Mountain in the Blue Ridge, Haywood County, NC.',
        url: terrainUrl('USGS_13_cold_mountain.tif'),
        bounds: [-83.1, 35.4, -82.7, 35.75],
        initialZoom: 12,
        initialCenter: [-82.9, 35.57],
    },
    {
        id: 'mount-whitney',
        label: 'Mount Whitney',
        description: 'USGS 1/3 arc-second DEM covering Mount Whitney, the highest peak in the contiguous US, Inyo County, CA.',
        url: terrainUrl('USGS_13_mount_whitney.tif'),
        bounds: [-118.4, 36.5, -118.1, 36.8],
        initialZoom: 12,
        initialCenter: [-118.29, 36.58],
    },
    {
        id: 'el-capitan',
        label: 'El Capitan',
        description: 'USGS 1/3 arc-second DEM covering El Capitan in Yosemite Valley, Tuolumne County, CA.',
        url: terrainUrl('USGS_13_el_capitan.tif'),
        bounds: [-119.7, 37.6, -119.5, 37.8],
        initialZoom: 13,
        initialCenter: [-119.63, 37.73],
    },
]

export function getDataset(id: string): TerrainDataset | undefined {
    return DATASETS.find((d) => d.id === id)
}

export const DEFAULT_DATASET_ID = DATASETS[0].id
