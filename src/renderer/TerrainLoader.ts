import { fromUrl, fromBlob, Pool } from 'geotiff'
import { bboxToWgs84 } from '../utils/projection.js'
import type { ElevationGrid } from '../types/index.js'

/** Target pixels per side. We pick the smallest overview that stays >= this. */
const TARGET_SIDE = 1024
const GIT_LFS_POINTER_SIGNATURE = 'version https://git-lfs.github.com/spec/v1'

/** Shared worker pool for parallel tile decoding. */
const _pool = new Pool()

// ── Public interface ───────────────────────────────────────────────────────────

export interface TerrainLoadResult {
    grid: ElevationGrid
    /** Dataset extent in WGS84 [west, south, east, north] */
    bounds4326: [number, number, number, number]
}

// ── URL fallback helpers ──────────────────────────────────────────────────────

function normalizeBasePath(path: string): string {
    if (!path) return '/'
    return path.endsWith('/') ? path : `${path}/`
}

function directoryFromPathname(pathname: string): string {
    if (!pathname || pathname === '/') return '/'
    if (pathname.endsWith('/')) return pathname

    const parts = pathname.split('/').filter(Boolean)
    const lastSegment = parts.length > 0 ? parts[parts.length - 1] : ''
    if (lastSegment.includes('.')) {
        const cut = pathname.lastIndexOf('/')
        return cut >= 0 ? pathname.slice(0, cut + 1) : '/'
    }

    return `${pathname}/`
}

function extractFileName(url: string): string | null {
    try {
        const candidate = new URL(url, 'https://dtm.local')
        const parts = candidate.pathname.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : null
    } catch {
        return null
    }
}

function buildUrlCandidates(url: string): string[] {
    const candidates = new Set<string>()
    const fileName = extractFileName(url)

    candidates.add(url)

    if (typeof window === 'undefined') {
        return [...candidates]
    }

    const { origin, pathname, href } = window.location
    const pathBase = normalizeBasePath(directoryFromPathname(pathname))
    const runtimeBase = normalizeBasePath(import.meta.env.BASE_URL || '/')

    if (url.startsWith('/')) {
        candidates.add(`${origin}${url}`)
    }

    if (url.includes('/apps/digital-terrain-model-viewer/')) {
        candidates.add(url.replace('/apps/digital-terrain-model-viewer/', '/'))
    }

    if (fileName) {
        candidates.add(`${origin}${runtimeBase}data/${fileName}`)
        candidates.add(`${origin}${pathBase}data/${fileName}`)

        const hrefWithSlash = href.endsWith('/') ? href : `${href}/`
        candidates.add(new URL(`data/${fileName}`, hrefWithSlash).toString())
    }

    return [...candidates]
}

async function isGitLfsPointerResponse(url: string): Promise<boolean> {
    if (typeof fetch === 'undefined') return false

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-255' },
            cache: 'no-store',
        })

        if (!response.ok) return false

        const body = await response.text()
        return body.startsWith(GIT_LFS_POINTER_SIGNATURE)
    } catch {
        return false
    }
}

async function detectGitLfsPointerCandidate(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
        if (await isGitLfsPointerResponse(candidate)) {
            return candidate
        }
    }

    return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openTiffWithFallback(url: string): Promise<any> {
    const candidates = buildUrlCandidates(url)
    let lastError: unknown = null

    for (const candidate of candidates) {
        try {
            const tiff = await fromUrl(candidate)
            // Force-read first IFD so HTML fallback responses fail immediately.
            await tiff.getImage(0)
            return tiff
        } catch (error) {
            lastError = error
        }
    }

    const lfsPointerCandidate = await detectGitLfsPointerCandidate(candidates)
    const lfsHint = lfsPointerCandidate
        ? [
            `Detected Git LFS pointer at: ${lfsPointerCandidate}`,
            'Host is returning a Git LFS pointer instead of GeoTIFF binary content.',
        ]
        : []

    throw new Error(
        [
            'Failed to load terrain GeoTIFF.',
            `Original URL: ${url}`,
            `Tried: ${candidates.join(', ')}`,
            `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
            ...lfsHint,
        ].join('\n'),
    )
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processTiff(tiff: any): Promise<TerrainLoadResult> {
    // Metadata (CRS, bbox, noData) always comes from the full-res primary image.
    const fullImage = await tiff.getImage(0)

    const geoKeys = fullImage.getGeoKeys()
    const epsgCode = (geoKeys.ProjectedCSTypeGeoKey as number | undefined)
        ?? (geoKeys.GeographicTypeGeoKey as number | undefined)
        ?? 4326

    const rawBbox = fullImage.getBoundingBox() as [number, number, number, number]
    const bounds4326 = await bboxToWgs84(rawBbox, epsgCode, geoKeys)

    const noDataValue: number = fullImage.getGDALNoData() ?? -999999

    // ── Pick the best overview and read its pixels at native resolution ───────
    const readImage = await pickBestOverview(tiff, TARGET_SIDE)
    const rasters = await readImage.readRasters({ interleave: false, pool: _pool })

    const raw = rasters[0] as Float32Array
    const width: number = readImage.getWidth()
    const height: number = readImage.getHeight()

    // ── Elevation range ───────────────────────────────────────────────────────
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

export async function loadTerrain(url: string): Promise<TerrainLoadResult> {
    const tiff = await openTiffWithFallback(url)
    return processTiff(tiff)
}

export async function loadTerrainFromBlob(file: File): Promise<TerrainLoadResult> {
    const tiff = await fromBlob(file)
    return processTiff(tiff)
}
