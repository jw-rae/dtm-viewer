import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import { transformExtent } from 'ol/proj.js'
import type { ElevationGrid } from '../types/index.js'

// ── Public types ───────────────────────────────────────────────────────────────

export type CurvatureType = 'standard' | 'profile' | 'plan'
export type CurvatureFeatureMode = 'both' | 'ridges' | 'valleys'

export interface CurvatureResult {
    data: Float32Array
    width: number
    height: number
    /** Symmetric percentile clip range used for colour stretch. */
    clipValue: number
}

export interface CurvatureRenderOptions {
    /**
     * Normalized cutoff in [0, 0.95].
     * Higher values hide weak curvature and keep only strong ridge/valley lines.
     */
    strongFeatureThreshold: number
    /**
     * Which curvature sign to display.
     * ridges = convex (+), valleys = concave (-), both = all strong features.
     */
    featureMode: CurvatureFeatureMode
    /**
     * Minimum connected component size in pixels.
     * Removes isolated dots and keeps longer, more coherent linework.
     */
    minConnectedPixels: number
}

export const DEFAULT_CURVATURE_RENDER_OPTIONS: CurvatureRenderOptions = {
    strongFeatureThreshold: 0.08,
    featureMode: 'both',
    minConnectedPixels: 8,
}

function clampFeatureThreshold(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_CURVATURE_RENDER_OPTIONS.strongFeatureThreshold
    return Math.max(0, Math.min(0.95, value))
}

function clampConnectedPixels(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_CURVATURE_RENDER_OPTIONS.minConnectedPixels
    return Math.max(1, Math.min(1000, Math.round(value)))
}

// ── Colour palette ─────────────────────────────────────────────────────────────
// Diverging red–transparent–blue: red = concave (negative),
// blue = convex (positive), near-flat values are transparent.

/** CSS linear gradient string for the popup legend. */
export const CURVATURE_GRADIENT_CSS =
    'linear-gradient(to right, #ff3b30 0%, #ff8f86 36%, rgba(255,255,255,0) 50%, #8bc3ff 64%, #0076ff 100%)'

function sampleDiverging(t: number): [number, number, number] {
    // t in [-1, 1]: -1=red (concave), +1=blue (convex)
    if (t < 0) {
        const f = Math.max(0, Math.min(1, Math.abs(t)))
        return [
            Math.round(255 - f * 15),
            Math.round(170 - f * 120),
            Math.round(160 - f * 120),
        ]
    } else {
        const f = Math.max(0, Math.min(1, t))
        return [
            Math.round(140 - f * 120),
            Math.round(200 - f * 90),
            255,
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

export function renderCurvatureMap(
    result: CurvatureResult,
    options: CurvatureRenderOptions = DEFAULT_CURVATURE_RENDER_OPTIONS,
): HTMLCanvasElement {
    const { data, width, height, clipValue } = result
    const threshold = clampFeatureThreshold(options.strongFeatureThreshold)
    const minConnectedPixels = clampConnectedPixels(options.minConnectedPixels)
    const span = Math.max(0.05, 1 - threshold)
    const featureMode =
        options.featureMode === 'ridges' || options.featureMode === 'valleys'
            ? options.featureMode
            : 'both'

    const candidateMask = new Uint8Array(data.length)
    const candidateStrength = new Float32Array(data.length)

    for (let i = 0; i < data.length; i++) {
        const v = data[i]
        if (isNaN(v)) continue

        const t = clipValue > 0 ? Math.max(-1, Math.min(1, v / clipValue)) : 0
        const absT = Math.abs(t)
        if (absT < threshold) continue

        if (featureMode === 'ridges' && t <= 0) continue
        if (featureMode === 'valleys' && t >= 0) continue

        const stretched = Math.sign(t) * ((absT - threshold) / span)
        candidateMask[i] = 1
        candidateStrength[i] = stretched
    }

    if (minConnectedPixels > 1) {
        const visited = new Uint8Array(data.length)
        const stack: number[] = []
        const component: number[] = []

        for (let i = 0; i < candidateMask.length; i++) {
            if (candidateMask[i] === 0 || visited[i] === 1) continue

            stack.push(i)
            visited[i] = 1
            component.length = 0

            while (stack.length > 0) {
                const index = stack.pop()!
                component.push(index)

                const row = Math.floor(index / width)
                const col = index - row * width

                for (let dy = -1; dy <= 1; dy++) {
                    const nr = row + dy
                    if (nr < 0 || nr >= height) continue

                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue
                        const nc = col + dx
                        if (nc < 0 || nc >= width) continue

                        const ni = nr * width + nc
                        if (candidateMask[ni] === 0 || visited[ni] === 1) continue
                        visited[ni] = 1
                        stack.push(ni)
                    }
                }
            }

            if (component.length < minConnectedPixels) {
                for (const index of component) {
                    candidateMask[index] = 0
                }
            }
        }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(width, height)
    const px = imgData.data

    for (let i = 0; i < data.length; i++) {
        const o = i * 4
        if (candidateMask[i] === 0) {
            px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0
            continue
        }

        const stretched = candidateStrength[i]
        const [r, g, b] = sampleDiverging(stretched)
        const alpha = 190 + Math.round(Math.min(1, Math.abs(stretched)) * 45)
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = alpha
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
