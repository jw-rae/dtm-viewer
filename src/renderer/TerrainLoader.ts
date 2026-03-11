import { fromUrl, Pool } from 'geotiff'
import { bboxToWgs84 } from '../utils/projection.js'
import type { ElevationGrid } from '../types/index.js'

/** Target pixels per side. We pick the smallest overview that stays >= this. */
const TARGET_SIDE = 1024

/** Shared worker pool for parallel tile decoding. */
const _pool = new Pool()

// ── Public interface ───────────────────────────────────────────────────────────

export interface TerrainLoadResult {
    grid: ElevationGrid
    /** Dataset extent in WGS84 [west, south, east, north] */
    bounds4326: [number, number, number, number]
}

// ── Overview selection ─────────────────────────────────────────────────────────

/**
 * Returns the best image IFD to read from: the smallest overview whose width
 * is still >= minW. Falls back to the first (full-res) image if no overviews
 * are available or all are smaller than minW.
 *
 * Reading from an existing overview (no resampling) avoids all bilinear-
 * blending artefacts that corrupt noData boundaries when geotiff.js is asked
 * to resample the full-res raster on the fly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pickBestOverview(tiff: any, minW: number): Promise<any> {
    const count: number = await tiff.getImageCount()
    const fullImage = await tiff.getImage(0)
    if (count === 1) return fullImage

    let best = fullImage
    let bestW: number = fullImage.getWidth()

    for (let i = 1; i < count; i++) {
        const img = await tiff.getImage(i)
        const w: number = img.getWidth()
        if (w >= minW && w < bestW) {
            best = img
            bestW = w
        }
    }

    return best
}

// ── loadTerrain ────────────────────────────────────────────────────────────────

export async function loadTerrain(url: string): Promise<TerrainLoadResult> {
    const tiff = await fromUrl(url)

    // Metadata (CRS, bbox, noData) always comes from the full-res primary image.
    const fullImage = await tiff.getImage(0)

    const geoKeys = fullImage.getGeoKeys()
    const epsgCode = (geoKeys.ProjectedCSTypeGeoKey as number | undefined)
        ?? (geoKeys.GeographicTypeGeoKey as number | undefined)
        ?? 4326

    const rawBbox = fullImage.getBoundingBox() as [number, number, number, number]
    const bounds4326 = bboxToWgs84(rawBbox, epsgCode, geoKeys)

    const noDataValue: number = fullImage.getGDALNoData() ?? -999999

    // ── Pick the best overview and read its pixels at native resolution ───────
    // NO width/height/resampleMethod — we read the exact pixels the overview
    // stores. Every noData cell stays exactly at noDataValue with no blending.
    const readImage = await pickBestOverview(tiff, TARGET_SIDE)
    const rasters = await readImage.readRasters({ interleave: false, pool: _pool })

    const raw = rasters[0] as Float32Array
    const width: number = readImage.getWidth()
    const height: number = readImage.getHeight()

    // ── Elevation range ───────────────────────────────────────────────────────
    // With no bilinear blending, noData pixels are exactly noDataValue.
    // A tolerance of 0.5 handles minor float precision drift.
    let minElevation = Infinity
    let maxElevation = -Infinity
    for (let i = 0; i < raw.length; i++) {
        const v = raw[i]
        if (Math.abs(v - noDataValue) < 0.5) continue
        if (v < minElevation) minElevation = v
        if (v > maxElevation) maxElevation = v
    }

    return {
        grid: { data: raw, width, height, noDataValue, minElevation, maxElevation },
        bounds4326,
    }
}
