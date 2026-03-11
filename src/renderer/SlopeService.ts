import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import { transformExtent } from 'ol/proj.js'
import type { ElevationGrid, SlopeUnit } from '../types/index.js'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/** Approximate metres per degree of latitude. */
const METERS_PER_DEG_LAT = 111320

// ── Slope colour palette ───────────────────────────────────────────────────────
// Normalised t = angle/90°: white (0°, flat) → green → yellow → orange → red → maroon (90°, vertical)

interface ColorStop { t: number; r: number; g: number; b: number }

const SLOPE_PALETTE: ColorStop[] = [
    { t: 0.00, r: 254, g: 254, b: 254 }, // 0° — white, flat
    { t: 0.11, r: 178, g: 223, b: 138 }, // ~10° — light green, gentle
    { t: 0.22, r: 255, g: 237, b: 160 }, // ~20° — pale yellow, moderate
    { t: 0.33, r: 253, g: 174, b: 97  }, // ~30° — orange, steep
    { t: 0.50, r: 215, g: 48,  b: 31  }, // ~45° — red, very steep
    { t: 1.00, r: 103, g: 0,   b: 13  }, // 90° — dark maroon, cliff
]

/** The CSS gradient string matching SLOPE_PALETTE (used in popup legend). */
export const SLOPE_GRADIENT_CSS =
    'linear-gradient(to right,' +
    ' rgb(254,254,254) 0%,' +
    ' rgb(178,223,138) 11%,' +
    ' rgb(255,237,160) 22%,' +
    ' rgb(253,174,97) 33%,' +
    ' rgb(215,48,31) 50%,' +
    ' rgb(103,0,13) 100%)'

function samplePalette(t: number): [number, number, number] {
    const p = SLOPE_PALETTE
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

// ── Public types ───────────────────────────────────────────────────────────────

export interface SlopeGrid {
    /** Per-cell slope values; NaN for noData / boundary cells. */
    data: Float32Array
    width: number
    height: number
    unit: SlopeUnit
}

// ── computeSlope ───────────────────────────────────────────────────────────────

/**
 * Computes per-cell slope using Horn's 3×3 finite-difference method (the same
 * algorithm used by ArcGIS Spatial Analyst).
 *
 * Cell size is derived from the WGS84 bounding box and approximate Mercator
 * conversion — accurate enough for small-area 1-metre DEMs.
 *
 * Returns NaN for noData and boundary cells.  At least 7 of the 8 neighbours
 * must be valid (the remaining one is substituted with the centre elevation),
 * matching the ArcGIS "at least seven valid" requirement.
 */
export function computeSlope(
    grid: ElevationGrid,
    bounds4326: [number, number, number, number],
    unit: SlopeUnit = 'degree',
): SlopeGrid {
    const { data, width, height, noDataValue } = grid
    const [west, south, east, north] = bounds4326

    // Cell size in metres (approximate Mercator at centre latitude)
    const centerLat = (south + north) / 2
    const dx = (east - west) / width  * Math.cos(centerLat * DEG_TO_RAD) * METERS_PER_DEG_LAT
    const dy = (north - south) / height * METERS_PER_DEG_LAT

    const out = new Float32Array(width * height).fill(NaN)

    const isNoData = (v: number) => Math.abs(v - noDataValue) < 0.5

    for (let row = 1; row < height - 1; row++) {
        for (let col = 1; col < width - 1; col++) {
            // 3×3 Horn neighbourhood labels (a=NW … i=SE, e=centre)
            const a  = data[(row - 1) * width + (col - 1)]
            const b  = data[(row - 1) * width +  col     ]
            const c  = data[(row - 1) * width + (col + 1)]
            const d  = data[ row      * width + (col - 1)]
            const e  = data[ row      * width +  col     ]
            const f  = data[ row      * width + (col + 1)]
            const g  = data[(row + 1) * width + (col - 1)]
            const h  = data[(row + 1) * width +  col     ]
            const ii = data[(row + 1) * width + (col + 1)]

            if (isNoData(e)) continue

            // Count invalid neighbours; bail if more than 1 (ArcGIS rule)
            const neighbours = [a, b, c, d, f, g, h, ii]
            if (neighbours.filter(isNoData).length > 1) continue

            // Substitute any single noData neighbour with centre elevation
            const nn = (v: number) => isNoData(v) ? e : v
            const [ra, rb, rc, rd, rf, rg, rh, ri] = neighbours.map(nn)

            // Horn's finite differences
            const dzdx = ((rc + 2 * rf + ri) - (ra + 2 * rd + rg)) / (8 * dx)
            const dzdy = ((rg + 2 * rh + ri) - (ra + 2 * rb + rc)) / (8 * dy)

            const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy))

            out[row * width + col] = unit === 'degree'
                ? slopeRad * RAD_TO_DEG
                : Math.tan(slopeRad) * 100
        }
    }

    return { data: out, width, height, unit }
}

// ── renderSlopeMap ─────────────────────────────────────────────────────────────

/**
 * Renders slope values to an RGBA canvas using the SLOPE_PALETTE.
 *
 * Colour is always keyed on the equivalent angle normalised to [0, 90°] so the
 * palette meaning stays consistent whether the user views degrees or percent rise.
 */
export function renderSlopeMap(slopeGrid: SlopeGrid): HTMLCanvasElement {
    const { data, width, height, unit } = slopeGrid

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(width, height)
    const px = imgData.data

    for (let i = 0; i < data.length; i++) {
        const v = data[i]
        const o = i * 4
        if (isNaN(v)) {
            px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0
            continue
        }

        // Normalise to [0,1] against 90° for consistent colour meaning
        const deg = unit === 'degree' ? v : Math.atan(v / 100) * RAD_TO_DEG
        const t = Math.min(deg, 90) / 90
        const [r, g, b] = samplePalette(t)
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 220
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

// ── createSlopeLayer ───────────────────────────────────────────────────────────

export function createSlopeLayer(
    canvas: HTMLCanvasElement,
    bounds4326: [number, number, number, number],
): ImageLayer<ImageStatic> {
    const extent3857 = transformExtent(bounds4326, 'EPSG:4326', 'EPSG:3857')

    const source = new ImageStatic({
        url: canvas.toDataURL('image/png'),
        imageExtent: extent3857,
        projection: 'EPSG:3857',
        interpolate: true,
    })

    return new ImageLayer<ImageStatic>({
        source,
        zIndex: 10,
        opacity: 0.85,
    })
}
