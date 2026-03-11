// ── Terrain layers ─────────────────────────────────────────────────────────────

export enum TerrainLayer {
    HeightMap = 'heightmap',
    Hillshade = 'hillshade',
    Contour = 'contour',
    Slope = 'slope',
    Aspect = 'aspect',
    Curvature = 'curvature',
}

// ── Slope units ────────────────────────────────────────────────────────────────

export type SlopeUnit = 'degree' | 'percent'

// ── Dataset ────────────────────────────────────────────────────────────────────

export interface TerrainDataset {
    id: string
    label: string
    description: string
    /** Path to the GeoTIFF elevation file served from /public/data/ */
    url: string
    /** Bounding box [west, south, east, north] in EPSG:4326 */
    bounds: [number, number, number, number]
    initialZoom: number
    initialCenter: [number, number]
}

// ── Elevation grid ─────────────────────────────────────────────────────────────

export interface ElevationGrid {
    /** Row-major flat array of elevation values in metres */
    data: Float32Array
    width: number
    height: number
    /** Sentinel value that represents missing / no-data pixels */
    noDataValue: number
    minElevation: number
    maxElevation: number
}

// ── Map viewport ───────────────────────────────────────────────────────────────

export interface MapViewportState {
    zoom: number
    center: [number, number]
}

// ── Application state ──────────────────────────────────────────────────────────

export interface AppState {
    currentDataset: string
    activeTerrainLayer: TerrainLayer
    mapViewport: MapViewportState
    theme: string
    colorScheme: 'light' | 'dark'
}
