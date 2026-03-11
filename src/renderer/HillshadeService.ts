import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import { transformExtent } from 'ol/proj.js'
import type { ElevationGrid } from '../types/index.js'

const DEG_TO_RAD = Math.PI / 180

/** Approximate metres per degree of latitude — same constant as SlopeService. */
const METERS_PER_DEG_LAT = 111320

// ── Public params ──────────────────────────────────────────────────────────────

export interface HillshadeParams {
    /** Sun position along the E→S→W daytime arc.
     *  0 = sunrise (East), 50 = solar noon (South), 100 = sunset (West). */
    sunPosition: number
    /** If true, cells in shadow are forced to 0. Default false. */
    modelShadows: boolean
    /** Z-unit scale factor (z-units per x,y unit). Default 1. */
    zFactor: number
}

export const DEFAULT_HILLSHADE_PARAMS: HillshadeParams = {
    sunPosition: 25,   // mid-morning: ~SE illumination, ~135° azimuth, ~42° altitude
    modelShadows: false,
    zFactor: 1,
}

/**
 * Converts a sun position (0–100) to azimuth and altitude.
 * The sun travels from East (0) through South at noon (50) to West (100).
 */
export function sunPositionToAngles(sunPosition: number): { azimuth: number; altitude: number } {
    const t = Math.max(0, Math.min(100, sunPosition)) / 100
    return {
        azimuth:  90 + t * 180,            // 90° (E) → 180° (S) → 270° (W)
        altitude: 60 * Math.sin(t * Math.PI), // 0° → 60° at noon → 0°
    }
}

// ── computeHillshade ───────────────────────────────────────────────────────────

/**
 * Computes hillshade using the standard ArcGIS algorithm:
 *   1. Derive dz/dx and dz/dy via Horn's 3×3 weighted finite differences.
 *   2. Compute the illumination angle: cos(zenith_rad - slope_rad) × cos(azimuth_math - aspect_rad)
 *   3. Scale to 0–255 integer range.
 *   4. Optionally set shadow cells (facing away from sun) to 0.
 *
 * Returns a Uint8Array of values 0–255.  Boundary and noData cells are 0.
 */
export function computeHillshade(
    grid: ElevationGrid,
    bounds4326: [number, number, number, number],
    params: HillshadeParams = DEFAULT_HILLSHADE_PARAMS,
): Uint8Array {
    const { data, width, height, noDataValue } = grid
    const { sunPosition, modelShadows, zFactor } = params
    const { azimuth, altitude } = sunPositionToAngles(sunPosition)

    const [west, south, east, north] = bounds4326
    const centerLat = (south + north) / 2
    const dx = (east - west) / width  * Math.cos(centerLat * DEG_TO_RAD) * METERS_PER_DEG_LAT
    const dy = (north - south) / height * METERS_PER_DEG_LAT

    // Convert light source to radians
    // ArcGIS convention: azimuth is clockwise from north; math convention is
    // counter-clockwise from east — convert once.
    const azimuthMath = (360 - azimuth + 90) % 360
    const azimuthRad  = azimuthMath * DEG_TO_RAD
    const zenithRad   = (90 - altitude) * DEG_TO_RAD

    const isNoData = (v: number) => Math.abs(v - noDataValue) < 0.5

    const out = new Uint8Array(width * height) // zero-initialised

    for (let row = 1; row < height - 1; row++) {
        for (let col = 1; col < width - 1; col++) {
            const e = data[row * width + col]
            if (isNoData(e)) continue

            const a  = data[(row - 1) * width + (col - 1)]
            const b  = data[(row - 1) * width +  col     ]
            const c  = data[(row - 1) * width + (col + 1)]
            const d  = data[ row      * width + (col - 1)]
            const f  = data[ row      * width + (col + 1)]
            const g  = data[(row + 1) * width + (col - 1)]
            const h  = data[(row + 1) * width +  col     ]
            const ii = data[(row + 1) * width + (col + 1)]

            const neighbours = [a, b, c, d, f, g, h, ii]
            if (neighbours.filter(isNoData).length > 1) continue

            const nn = (v: number) => isNoData(v) ? e : v
            const [ra, rb, rc, rd, rf, rg, rh, ri] = neighbours.map(nn)

            const dzdx = zFactor * ((rc + 2 * rf + ri) - (ra + 2 * rd + rg)) / (8 * dx)
            const dzdy = zFactor * ((rg + 2 * rh + ri) - (ra + 2 * rb + rc)) / (8 * dy)

            // Slope in radians
            const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy))

            // Aspect in math convention (counter-clockwise from east)
            let aspectRad = Math.atan2(dzdy, -dzdx)
            if (aspectRad < 0) aspectRad += 2 * Math.PI

            // Hillshade formula (ArcGIS):
            //   HS = 255 × ((cos(zenith) × cos(slope)) +
            //                (sin(zenith) × sin(slope) × cos(azimuth_math - aspect)))
            const hs =
                255 *
                (Math.cos(zenithRad) * Math.cos(slopeRad) +
                    Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(azimuthRad - aspectRad))

            if (modelShadows && hs < 0) {
                out[row * width + col] = 0
            } else {
                out[row * width + col] = Math.max(0, Math.min(255, Math.round(hs)))
            }
        }
    }

    return out
}

// ── renderHillshadeMap ─────────────────────────────────────────────────────────

export function renderHillshadeMap(
    hsData: Uint8Array,
    width: number,
    height: number,
): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(width, height)
    const px = imgData.data

    for (let i = 0; i < hsData.length; i++) {
        const v = hsData[i]
        const o = i * 4
        if (v === 0) {
            px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0
            continue
        }
        px[o] = v; px[o + 1] = v; px[o + 2] = v; px[o + 3] = 220
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

// ── createHillshadeLayer ───────────────────────────────────────────────────────

export function createHillshadeLayer(
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
        opacity: 0.9,
    })
}
