export interface BasemapConfig {
    id: string
    label: string
    /** XYZ tile URL template. Empty string = no basemap. */
    url: string
    attribution: string
    maxZoom: number
}

export const BASEMAPS: BasemapConfig[] = [
    {
        id: 'osm',
        label: 'OpenStreetMap',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    },
    {
        id: 'satellite',
        label: 'Satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '© <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
        maxZoom: 19,
    },
    {
        id: 'topo',
        label: 'Topo',
        url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
        maxZoom: 17,
    },
    {
        id: 'carto-light',
        label: 'Light',
        url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
    },
    {
        id: 'carto-dark',
        label: 'Dark',
        url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
    },
    {
        id: 'none',
        label: 'None',
        url: '',
        attribution: '',
        maxZoom: 22,
    },
]

export const DEFAULT_BASEMAP_ID = 'osm'

export function getBasemap(id: string): BasemapConfig {
    return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]
}
