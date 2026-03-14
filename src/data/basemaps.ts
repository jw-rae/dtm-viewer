export interface BasemapConfig {
    id: string
    label: string
    /** XYZ tile URL template. Empty string = no basemap. */
    url: string
    thumbnailUrl: string
    attribution: string
    maxZoom: number
}

export const BASEMAPS: BasemapConfig[] = [
    {
        id: 'osm',
        label: 'OpenStreetMap',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        thumbnailUrl: 'https://tile.openstreetmap.org/3/4/2.png',
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
    },
    {
        id: 'satellite',
        label: 'Satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        thumbnailUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/4',
        attribution: '© Esri, Maxar, Earthstar Geographics',
        maxZoom: 19,
    },
    {
        id: 'topo',
        label: 'Topo',
        url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        thumbnailUrl: 'https://tile.opentopomap.org/3/4/2.png',
        attribution: '© OpenTopoMap contributors',
        maxZoom: 17,
    },
    {
        id: 'carto-dark',
        label: 'Dark',
        url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        thumbnailUrl: 'https://a.basemaps.cartocdn.com/dark_all/3/4/2@2x.png',
        attribution: '© OpenStreetMap contributors, © CARTO',
        maxZoom: 19,
    },
]

export const DEFAULT_BASEMAP_ID = 'osm'

export function isBasemapId(id: string): boolean {
    return BASEMAPS.some((basemap) => basemap.id === id)
}

export function getBasemap(id: string): BasemapConfig {
    return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]
}
