import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import { transformExtent } from 'ol/proj.js'
import type { ElevationGrid } from '../types/index.js'

// ── renderGreyscaleHeightMap ───────────────────────────────────────────────────
//
// Pure greyscale renderer: black = minimum elevation, white = maximum elevation,
// transparent = noData / below physical minimum.
// No colour palette — contrast comes entirely from the elevation gradient.

export function renderGreyscaleHeightMap(grid: ElevationGrid): HTMLCanvasElement {
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
            // Transparent — exact noData value (no bilinear blending artefacts)
            px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0
        } else {
            const t = range > 0 ? (v - minElevation) / range : 0
            const g = Math.round(Math.max(0, Math.min(1, t)) * 255)
            px[o] = g; px[o + 1] = g; px[o + 2] = g; px[o + 3] = 220
        }
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

// ── createHeightMapLayer ───────────────────────────────────────────────────────

export function createHeightMapLayer(
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
