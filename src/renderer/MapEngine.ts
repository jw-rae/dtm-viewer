import Map from 'ol/Map.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import XYZ from 'ol/source/XYZ.js'
import { Attribution, Zoom } from 'ol/control.js'
import { fromLonLat } from 'ol/proj.js'

import { appState } from '../state/AppState.js'
import { getBasemap } from '../data/basemaps.js'

// ── Module-level map reference (exposed for terrain layers in Step 4) ──────────
let _map: Map | null = null

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeXYZSource(id: string): XYZ {
    const cfg = getBasemap(id)
    return new XYZ({
        url: cfg.url || undefined,
        maxZoom: cfg.maxZoom,
        attributions: cfg.attribution || undefined,
        crossOrigin: 'anonymous',
        cacheSize: 512,
    })
}

/**
 * Create a basemap TileLayer with settings that prevent tile flash:
 * - transition: 0  ➜ tiles appear instantly (no per-tile opacity fade)
 * - preload: Infinity  ➜ OL pre-fetches tiles one zoom level up/down so
 *   panning and zooming never reveal the empty background
 */
function makeBasemapLayer(id: string, zIndex: number): TileLayer<XYZ> {
    const cfg = getBasemap(id)
    return new TileLayer<XYZ>({
        source: cfg.url ? makeXYZSource(id) : undefined,
        visible: !!cfg.url,
        zIndex,
        preload: Infinity,   // eagerly cache adjacent zoom levels
    })
}

// ── initMap ────────────────────────────────────────────────────────────────────

export function initMap(targetId: string): Map {
    const view = new View({
        center: fromLonLat([10, 30]),
        zoom: 3,
        minZoom: 2,
        maxZoom: 22,
        extent: [-20037508.34 * 2, -20037508.34, 20037508.34 * 2, 20037508.34],
        constrainOnlyCenter: true,
    })

    // Two basemap layers: back (currently displayed) + front (incoming swap).
    // When the user picks a new basemap we load it into the front layer and fade
    // the front from 0 → 1 once it has tiles, then promote it to back.  This
    // eliminates the white-canvas flash during basemap switches.
    const initialId = appState.state.activeBasemap
    const backLayer = makeBasemapLayer(initialId, 0)
    const frontLayer = makeBasemapLayer(initialId, 1)
    frontLayer.setOpacity(0)   // hidden until a swap happens

    const map = new Map({
        target: targetId,
        layers: [backLayer, frontLayer],
        view,
        controls: [
            new Zoom({
                zoomInTipLabel: 'Zoom in',
                zoomOutTipLabel: 'Zoom out',
            }),
            new Attribution({
                collapsible: true,
                collapsed: false,
            }),
        ],
    })

    // ── Basemap swap with crossfade ───────────────────────────────────────────────
    let prevId = initialId
    let swapping = false

    appState.subscribe((state) => {
        if (state.activeBasemap === prevId || swapping) return
        swapping = true
        const nextId = state.activeBasemap
        const cfg = getBasemap(nextId)

        if (!cfg.url) {
            // "None" — just hide both layers immediately
            backLayer.setVisible(false)
            frontLayer.setVisible(false)
            prevId = nextId
            swapping = false
            return
        }

        // Load next basemap into the front layer (fully transparent)
        frontLayer.setSource(makeXYZSource(nextId))
        frontLayer.setVisible(true)
        frontLayer.setOpacity(0)

        // Wait until at least the first tile has rendered, then crossfade
        const onRender = () => {
            map.un('rendercomplete', onRender)
            frontLayer.setOpacity(1)

            // After the CSS transition completes, promote front → back and reset
            setTimeout(() => {
                backLayer.setSource(makeXYZSource(nextId))
                backLayer.setVisible(!!cfg.url)
                backLayer.setOpacity(1)
                frontLayer.setOpacity(0)
                frontLayer.setVisible(false)
                prevId = nextId
                swapping = false
            }, SWAP_DURATION_MS)
        }

        map.once('rendercomplete', onRender)
    })

    // ── Hide placeholder after first render ───────────────────────────────────────
    const placeholder = document.getElementById('map-placeholder')
    if (placeholder) {
        map.once('rendercomplete', () => {
            placeholder.style.transition = `opacity 400ms ease`
            placeholder.style.opacity = '0'
            setTimeout(() => { placeholder.style.display = 'none' }, 420)
        })
    }

    _map = map
    return map
}

export function getMap(): Map | null {
    return _map
}

/** Fly the map view to a lon/lat center at a given zoom level. */
export function flyTo(lonLat: [number, number], zoom: number): void {
    if (!_map) return
    _map.getView().animate({ center: fromLonLat(lonLat), zoom, duration: 800 })
}

// Duration must match the CSS transition on .ol-layer canvas (see style.css)
const SWAP_DURATION_MS = 300
