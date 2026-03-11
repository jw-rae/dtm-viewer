import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import Feature from 'ol/Feature.js'
import { fromExtent } from 'ol/geom/Polygon.js'
import { transformExtent } from 'ol/proj.js'
import { Style, Stroke, Fill } from 'ol/style.js'
import type { ElevationGrid } from '../types/index.js'

// ── Terrain colour palette ─────────────────────────────────────────────────────
// Elevation-relative gradient rendered against the full min→max range of the DEM.

interface ColorStop { t: number; r: number; g: number; b: number }

const TERRAIN_PALETTE: ColorStop[] = [
    { t: 0.00, r: 46, g: 94, b: 43 }, // deep valley — dark green
    { t: 0.20, r: 82, g: 126, b: 60 }, // lowland — mid green
    { t: 0.40, r: 152, g: 149, b: 82 }, // midland — olive
    { t: 0.58, r: 182, g: 148, b: 90 }, // upland — tan
    { t: 0.72, r: 148, g: 108, b: 70 }, // highland — warm brown
    { t: 0.85, r: 128, g: 110, b: 98 }, // sub-alpine — grey brown
    { t: 0.93, r: 185, g: 175, b: 168 }, // near-alpine — pale grey
    { t: 1.00, r: 240, g: 240, b: 240 }, // summit — near white
]

function samplePalette(t: number): [number, number, number] {
    const p = TERRAIN_PALETTE
    const c = Math.max(0, Math.min(1, t))
    for (let i = 1; i < p.length; i++) {
        if (c <= p[i].t) {
            const a = p[i - 1], b = p[i]
            const f = (c - a.t) / (b.t - a.t)
            return [
                Math.round(a.r + f * (b.r - a.r)),
                Math.round(a.g + f * (b.g - a.g)),
                Math.round(a.b + f * (b.b - a.b)),
            ]
        }
    }
    const last = p[p.length - 1]
    return [last.r, last.g, last.b]
}

// ── renderHeightMap ────────────────────────────────────────────────────────────

export function renderHeightMap(grid: ElevationGrid): HTMLCanvasElement {
    const { data, width, height, noDataValue, minElevation, maxElevation } = grid
    const range = maxElevation - minElevation

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(width, height)
    const px = imgData.data

    for (let i = 0; i < data.length; i++) {
        const v = data[i]
        const o = i * 4
        if (Math.abs(v - noDataValue) < 0.5) {
            px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0
        } else {
            const t = range > 0 ? (v - minElevation) / range : 0
            const [r, g, b] = samplePalette(t)
            px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 220
        }
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

// ── createTerrainImageLayer ────────────────────────────────────────────────────

/**
 * Converts a rendered canvas to an OpenLayers ImageStatic layer positioned
 * at the correct geographic extent.
 */
export function createTerrainImageLayer(
    canvas: HTMLCanvasElement,
    bounds4326: [number, number, number, number],
): ImageLayer<ImageStatic> {
    const extent3857 = transformExtent(bounds4326, 'EPSG:4326', 'EPSG:3857')
    const url = canvas.toDataURL('image/png')

    const source = new ImageStatic({
        url,
        imageExtent: extent3857,
        projection: 'EPSG:3857',
        interpolate: true,
    })

    return new ImageLayer<ImageStatic>({
        source,
        zIndex: 10,
        opacity: 0.9,
    })
}

// ── createBBoxLayer ────────────────────────────────────────────────────────────

/** Draws the dataset bounding box as a dashed rectangle on the map. */
export function createBBoxLayer(
    bounds4326: [number, number, number, number],
): VectorLayer<VectorSource> {
    const extent3857 = transformExtent(bounds4326, 'EPSG:4326', 'EPSG:3857')
    const polygon = fromExtent(extent3857)
    const feature = new Feature(polygon)

    const source = new VectorSource({ features: [feature] })

    return new VectorLayer<VectorSource>({
        source,
        zIndex: 11,
        style: new Style({
            stroke: new Stroke({
                color: 'rgba(255, 80, 80, 0.9)',
                width: 2,
                lineDash: [8, 6],
            }),
            fill: new Fill({
                color: 'rgba(255, 80, 80, 0.06)',
            }),
        }),
    })
}
