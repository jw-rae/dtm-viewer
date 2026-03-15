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
]

export function getDataset(id: string): TerrainDataset | undefined {
    return DATASETS.find((d) => d.id === id)
}

export const DEFAULT_DATASET_ID = DATASETS[0].id
