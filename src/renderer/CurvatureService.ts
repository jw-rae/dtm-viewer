import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import { transformExtent } from 'ol/proj.js'
import type { ElevationGrid } from '../types/index.js'

// ── Public types ───────────────────────────────────────────────────────────────

export type CurvatureType = 'standard' | 'profile' | 'plan'

export interface CurvatureResult {
    data: Float32Array
    width: number
    height: number
    /** Symmetric percentile clip range used for colour stretch. */
    clipValue: number
}

// ── Colour palette ─────────────────────────────────────────────────────────────
// Diverging blue–white–red: blue = concave (negative), white = flat (0),
// red = convex (positive). Matches standard GIS curvature symbology.

/** CSS linear gradient string for the popup legend. */
export const CURVATURE_GRADIENT_CSS =
    'linear-gradient(to right, #2166ac, #92c5de, #f7f7f7, #f4a582, #d6604d)'

function sampleDiverging(t: number): [number, number, number] {
    // t in [-1, 1]: -1=blue, 0=white, +1=red
    if (t < 0) {
        // blue (#2166ac) → white (#f7f7f7)
        const f = Math.max(0, Math.min(1, 1 + t))
        return [
            Math.round(33  + f * (247 - 33)),
            Math.round(102 + f * (247 - 102)),
            Math.round(172 + f * (247 - 172)),
        ]
    } else {
        // white (#f7f7f7) → red (#d6604d)
        const f = Math.max(0, Math.min(1, t))
        return [
            Math.round(247 + f * (214 - 247)),
            Math.round(247 + f * (96  - 247)),
            Math.round(247 + f * (77  - 247)),
        ]
    }
}

// ── computeCurvature ───────────────────────────────────────────────────────────

/**
 * Computes curvature using the ArcGIS 3×3 polynomial-fit algorithm.
 *
 * The nine cells of each neighbourhood are fitted to a 2nd-order polynomial:
 *   Z = Ax²y² + Bx²y + Cxy² + Dx² + Ey² + Fxy + Gx + Hy + I
 *
 * Coefficients are derived from Evans (1980) as used in ArcGIS:
 *   D = (z4 + z6) / (2 * L²)  – z6  (second derivative x)
 *   E = (z2 + z8) / (2 * L²)  – z6  (second derivative y)
 *   F = (-z1 + z3 + z7 - z9) / (4 * L²)  (cross derivative)
 *   G = (-z4 + z6) / (2 * L)   (first derivative x)
 *   H = (z2  - z8) / (2 * L)   (first derivative y)
 *
 * Numbered grid (ArcGIS row-major, top-left origin):
 *   z1 z2 z3
 *   z4 z5 z6
 *   z7 z8 z9
 *
 * Standard curvature  = -2(D + E) × 100
 * Profile curvature   = -2(Dg² + EH̃² + FGH) / (G² + H²)   [if slope > 0]
 * Plan curvature      = -2(DH² + EG² - FGH)   / (G² + H²)  [if slope > 0]
 *
 * Units: 1/100 z-unit (matches ArcGIS output).
 * Boundary and noData cells → NaN.
 * Flat-slope cells → 0 for profile/plan.
 */
export function computeCurvature(
    grid: ElevationGrid,
    type: CurvatureType = 'standard',
): CurvatureResult {
    const { data, width, height, noDataValue } = grid
    const out = new Float32Array(width * height).fill(NaN)
    const isNoData = (v: number) => Math.abs(v - noDataValue) < 0.5

    // Cell size L — we use 1 (normalised) because ArcGIS says the output is
    // "1/100 of a z-unit"; the L² terms cancel in the ratio for curvature
    // when the DEM is already in consistent units.
    const L = 1

    for (let row = 1; row < height - 1; row++) {
        for (let col = 1; col < width - 1; col++) {
            const z1 = data[(row - 1) * width + (col - 1)]
            const z2 = data[(row - 1) * width +  col     ]
            const z3 = data[(row - 1) * width + (col + 1)]
            const z4 = data[ row      * width + (col - 1)]
            const z5 = data[ row      * width +  col     ]
            const z6 = data[ row      * width + (col + 1)]
            const z7 = data[(row + 1) * width + (col - 1)]
            const z8 = data[(row + 1) * width +  col     ]
            const z9 = data[(row + 1) * width + (col + 1)]

            if (isNoData(z5)) continue
            const neighbours = [z1, z2, z3, z4, z6, z7, z8, z9]
            if (neighbours.filter(isNoData).length > 1) continue
            const nn = (v: number) => isNoData(v) ? z5 : v
            const [r1, r2, r3, r4, r6, r7, r8, r9] = neighbours.map(nn)

            const L2 = L * L

            const D = ((r4 + r6) / 2 - z5) / L2
            const E = ((r2 + r8) / 2 - z5) / L2
            const F = (-r1 + r3 + r7 - r9) / (4 * L2)
            const G = (-r4 + r6) / (2 * L)
            const H = (r2  - r8) / (2 * L)

            let value: number

            if (type === 'standard') {
                value = -2 * (D + E) * 100
            } else {
                const slope2 = G * G + H * H
                if (slope2 < 1e-10) {
                    value = 0
                } else if (type === 'profile') {
                    value = -2 * (D * G * G + E * H * H + F * G * H) / slope2
                } else {
                    // plan
                    value = -2 * (D * H * H + E * G * G - F * G * H) / slope2
                }
            }

            out[row * width + col] = value
        }
    }

    // Compute symmetric percentile clip for colour stretch (98th percentile)
    const valid: number[] = []
    for (let i = 0; i < out.length; i++) {
        if (!isNaN(out[i])) valid.push(Math.abs(out[i]))
    }
    valid.sort((a, b) => a - b)
    const p98idx = Math.floor(valid.length * 0.98)
    const clipValue = valid[p98idx] ?? 1

    return { data: out, width, height, clipValue }
}

// ── renderCurvatureMap ─────────────────────────────────────────────────────────

export function renderCurvatureMap(result: CurvatureResult): HTMLCanvasElement {
    const { data, width, height, clipValue } = result

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
        const t = clipValue > 0 ? Math.max(-1, Math.min(1, v / clipValue)) : 0
        const [r, g, b] = sampleDiverging(t)
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 210
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

// ── createCurvatureLayer ───────────────────────────────────────────────────────

export function createCurvatureLayer(
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
