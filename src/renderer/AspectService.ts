import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import { transformExtent } from 'ol/proj.js'
import type { ElevationGrid } from '../types/index.js'

const RAD_TO_DEG = 180 / Math.PI

// ── Aspect colour palette ──────────────────────────────────────────────────────
// Full 360° compass wheel, matching standard ArcGIS Aspect symbology:
//   N=red, NE=orange/yellow, E=yellow, SE=yellow-green, S=green,
//   SW=cyan/teal, W=blue, NW=purple/magenta, back to N.
// t is normalised azimuth in [0, 1] representing 0°–360°.

interface ColorStop { t: number; r: number; g: number; b: number }

const ASPECT_PALETTE: ColorStop[] = [
    { t: 0.000, r: 255, g: 0,   b: 0   }, // 0°   N   — red
    { t: 0.125, r: 255, g: 165, b: 0   }, // 45°  NE  — orange
    { t: 0.250, r: 255, g: 255, b: 0   }, // 90°  E   — yellow
    { t: 0.375, r: 170, g: 255, b: 0   }, // 135° SE  — yellow-green
    { t: 0.500, r: 0,   g: 168, b: 0   }, // 180° S   — green
    { t: 0.625, r: 0,   g: 200, b: 200 }, // 225° SW  — teal
    { t: 0.750, r: 0,   g: 128, b: 255 }, // 270° W   — blue
    { t: 0.875, r: 200, g: 0,   b: 255 }, // 315° NW  — purple
    { t: 1.000, r: 255, g: 0,   b: 0   }, // 360° N   — red (wraps)
]

/** CSS conic-gradient matching ASPECT_PALETTE for the compass rose legend. */
export const ASPECT_CONIC_CSS =
    'conic-gradient(from 0deg at 50% 50%,' +
    ' #ff0000 0deg,' +
    ' #ffa500 45deg,' +
    ' #ffff00 90deg,' +
    ' #aaff00 135deg,' +
    ' #00a800 180deg,' +
    ' #00c8c8 225deg,' +
    ' #0080ff 270deg,' +
    ' #c800ff 315deg,' +
    ' #ff0000 360deg)'

/** Linear gradient (for a strip legend alternative). */
export const ASPECT_LINEAR_CSS =
    'linear-gradient(to right,' +
    ' #ff0000 0%,' +
    ' #ffa500 12.5%,' +
    ' #ffff00 25%,' +
    ' #aaff00 37.5%,' +
    ' #00a800 50%,' +
    ' #00c8c8 62.5%,' +
    ' #0080ff 75%,' +
    ' #c800ff 87.5%,' +
    ' #ff0000 100%)'

function samplePalette(t: number): [number, number, number] {
    const p = ASPECT_PALETTE
    // t wraps at 1.0 back to 0.0 — clamp to [0, 1)
    const c = ((t % 1) + 1) % 1
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
    return [p[p.length - 1].r, p[p.length - 1].g, p[p.length - 1].b]
}

// ── computeAspect ──────────────────────────────────────────────────────────────

/**
 * Computes per-cell aspect (0–360°, clockwise from north) using Horn's 3×3
 * finite-difference method — matching the ArcGIS Spatial Analyst algorithm.
 *
 * Flat cells (zero slope) are assigned -1, matching the ArcGIS convention.
 * Boundary and noData cells return NaN.
 * At least 7 of the 8 neighbours must be valid; a single noData neighbour is
 * substituted with the centre elevation.
 */
export function computeAspect(grid: ElevationGrid): Float32Array {
    const { data, width, height, noDataValue } = grid
    const out = new Float32Array(width * height).fill(NaN)
    const isNoData = (v: number) => Math.abs(v - noDataValue) < 0.5

    for (let row = 1; row < height - 1; row++) {
        for (let col = 1; col < width - 1; col++) {
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

            const neighbours = [a, b, c, d, f, g, h, ii]
            if (neighbours.filter(isNoData).length > 1) continue

            const nn = (v: number) => isNoData(v) ? e : v
            const [ra, rb, rc, rd, rf, rg, rh, ri] = neighbours.map(nn)

            // Horn's finite differences (dx/dy are equal-resolution so cell
            // size cancels out: aspect direction is dimensionless)
            const dzdx = ((rc + 2 * rf + ri) - (ra + 2 * rd + rg)) / 8
            const dzdy = ((rg + 2 * rh + ri) - (ra + 2 * rb + rc)) / 8

            if (dzdx === 0 && dzdy === 0) {
                // Flat cell
                out[row * width + col] = -1
                continue
            }

            // Math atan2 angle → clockwise-from-north azimuth
            let aspect = RAD_TO_DEG * Math.atan2(dzdx, dzdy)
            if (aspect < 0) aspect += 360

            out[row * width + col] = aspect
        }
    }

    return out
}

// ── renderAspectMap ────────────────────────────────────────────────────────────

export function renderAspectMap(
    aspectData: Float32Array,
    width: number,
    height: number,
): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(width, height)
    const px = imgData.data

    for (let i = 0; i < aspectData.length; i++) {
        const v = aspectData[i]
        const o = i * 4

        if (isNaN(v)) {
            // noData / boundary — transparent
            px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0
            continue
        }

        if (v < 0) {
            // Flat cell — mid-grey
            px[o] = 180; px[o + 1] = 180; px[o + 2] = 180; px[o + 3] = 220
            continue
        }

        const t = v / 360
        const [r, g, b] = samplePalette(t)
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 220
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

// ── createAspectLayer ──────────────────────────────────────────────────────────

export function createAspectLayer(
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
