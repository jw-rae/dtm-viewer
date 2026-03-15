import Map from 'ol/Map.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import XYZ from 'ol/source/XYZ.js'
import { Attribution, ScaleLine, Zoom } from 'ol/control.js'
import { fromLonLat, transformExtent } from 'ol/proj.js'

import { appState } from '../state/AppState.js'
import { getBasemap } from '../data/basemaps.js'

// ── Module-level map reference (exposed for terrain layers in Step 4) ──────────
let _map: Map | null = null

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeXYZSource(id: string): XYZ | null {
    const cfg = getBasemap(id)
    if (!cfg.url) return null

    return new XYZ({
        url: cfg.url,
        maxZoom: cfg.maxZoom,
        attributions: cfg.attribution || undefined,
        crossOrigin: 'anonymous',
        cacheSize: 512,
    })
}

function makeBasemapLayer(id: string): TileLayer<XYZ> {
    const source = makeXYZSource(id)
    return new TileLayer<XYZ>({
        source: source ?? undefined,
        visible: source !== null,
        zIndex: 0,
        preload: Infinity,
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

    const initialId = appState.state.activeBasemap
    const basemapLayer = makeBasemapLayer(initialId)

    const map = new Map({
        target: targetId,
        layers: [basemapLayer],
        view,
        controls: [
            new Zoom({
                zoomInTipLabel: 'Zoom in',
                zoomOutTipLabel: 'Zoom out',
            }),
            new Attribution({
                collapsible: false,
                collapsed: false,
            }),
            new ScaleLine({
                units: 'metric',
                minWidth: 90,
                bar: false,
            }),
        ],
    })

    let prevId = initialId
    appState.subscribe((state) => {
        if (state.activeBasemap === prevId) return

        const nextId = state.activeBasemap
        const source = makeXYZSource(nextId)
        basemapLayer.setSource(source)
        basemapLayer.setVisible(source !== null)
        prevId = nextId
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

/** Fit the map view to a WGS84 bounding box [west, south, east, north]. */
export function fitBounds(bounds4326: [number, number, number, number]): void {
    if (!_map) return
    const [west, south, east, north] = bounds4326
    const extent = transformExtent([west, south, east, north], 'EPSG:4326', 'EPSG:3857')
    _map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 800, maxZoom: 16 })
}
