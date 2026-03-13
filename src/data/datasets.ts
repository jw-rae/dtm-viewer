import type { TerrainDataset } from '../types/index.js'

// ── Predefined terrain datasets ────────────────────────────────────────────────
// URLs and geographic bounds are populated in Step 4 when source GeoTIFF files
// are acquired. The labels and descriptions are final.

export const DATASETS: TerrainDataset[] = [
    {
        id: 'northwest-colorado',
        label: 'Northwest Colorado',
        description: 'USGS 1-metre DEM covering the Never Summer range and Rocky Mountain National Park foothills (2020).',
        url: `${import.meta.env.BASE_URL}data/USGS_1M_13_x43y446_CO_NorthwestCO_2020_D20.tif`,
        bounds: [-105.82249824986873, 40.197423552784166, -105.70581284353193, 40.288395026720885],
        initialZoom: 12,
        initialCenter: [-105.76415554670032, 40.242909289752525],
    },
    {
        id: 'sierra-nevada',
        label: 'Sierra Nevada',
        description: 'USGS 1-metre DEM in the High Sierra, California (2022).',
        url: `${import.meta.env.BASE_URL}data/USGS_1M_11_x36y411_CA_SierraNevada_B22.tif`,
        bounds: [-118.57420618064504, 37.035724178718226, -118.46340098033954, 37.12738592688266],
        initialZoom: 12,
        initialCenter: [-118.51880358049229, 37.081555052803246],
    },
    {
        id: 'highland-plateau',
        label: 'Highland Plateau',
        description: 'Elevated plateau with gentle slopes and incised river channels.',
        url: '',
        bounds: [0, 0, 0, 0],
        initialZoom: 10,
        initialCenter: [0, 0],
    },
]

export function getDataset(id: string): TerrainDataset | undefined {
    return DATASETS.find((d) => d.id === id)
}

export const DEFAULT_DATASET_ID = DATASETS[0].id
