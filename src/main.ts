import '@jwrae/design-tokens'
import 'ol/ol.css'
import './style.css'

import { createHeaderBar } from './ui/HeaderBar.js'
import { createMapContainer } from './ui/MapContainer.js'
import { initMap, getMap, flyTo } from './renderer/MapEngine.js'
import { loadTerrain } from './renderer/TerrainLoader.js'
import { createBBoxLayer } from './renderer/TerrainRenderer.js'
import { renderGreyscaleHeightMap, createHeightMapLayer } from './renderer/HeightMapService.js'
import { appState } from './state/AppState.js'
import { DATASETS } from './data/datasets.js'
import { TerrainLayer } from './types/index.js'
import type { ElevationGrid } from './types/index.js'

import type ImageLayer from 'ol/layer/Image.js'
import type ImageStatic from 'ol/source/ImageStatic.js'
import type VectorLayer from 'ol/layer/Vector.js'
import type VectorSource from 'ol/source/Vector.js'

// ── Theme bootstrap ────────────────────────────────────────────────────────────
// Applied before first paint to prevent a flash of unstyled content.
const savedTheme = localStorage.getItem('dtm-theme') ?? 'blue'
const savedScheme = localStorage.getItem('dtm-color-scheme') ?? 'light'
document.documentElement.setAttribute('data-theme', savedTheme)
document.documentElement.setAttribute('data-color-scheme', savedScheme)

// ── Mount UI ───────────────────────────────────────────────────────────────────
const app = document.getElementById('app')!
app.append(createHeaderBar(), createMapContainer())

// ── Initialise OpenLayers map ──────────────────────────────────────────────────
// Must run after the DOM is appended so the #map element exists.
initMap('map')

// ── Terrain loading ────────────────────────────────────────────────────────────
let terrainLayer: ImageLayer<ImageStatic> | null = null
let bboxLayer: VectorLayer<VectorSource> | null = null

// Cached after a dataset is loaded — reused when switching analysis layers.
let cachedGrid: ElevationGrid | null = null
let cachedBounds: [number, number, number, number] | null = null

function setLoadingVisible(visible: boolean): void {
  const el = document.getElementById('map-loading')
  if (el) el.style.display = visible ? 'flex' : 'none'
}

function removeTerrainLayer(): void {
  const map = getMap()
  if (!map) return
  if (terrainLayer) { map.removeLayer(terrainLayer); terrainLayer = null }
}

function renderActiveLayer(): void {
  if (!cachedGrid || !cachedBounds) return
  const map = getMap()
  if (!map) return

  removeTerrainLayer()

  const { activeTerrainLayer } = appState.state
  if (activeTerrainLayer === TerrainLayer.HeightMap) {
    const canvas = renderGreyscaleHeightMap(cachedGrid)
    const layer = createHeightMapLayer(canvas, cachedBounds)
    map.addLayer(layer)
    terrainLayer = layer
  }
  // Other layers (Hillshade, Contour, Slope, Aspect, Curvature) added in later steps.
}

async function loadAndRenderDataset(datasetId: string): Promise<void> {
  const dataset = DATASETS.find((d) => d.id === datasetId)
  if (!dataset || !dataset.url) return

  const map = getMap()
  if (!map) return

  // Remove previous terrain + bbox layers
  removeTerrainLayer()
  if (bboxLayer) { map.removeLayer(bboxLayer); bboxLayer = null }
  cachedGrid = null
  cachedBounds = null

  setLoadingVisible(true)
  try {
    const { grid, bounds4326 } = await loadTerrain(dataset.url)
    cachedGrid = grid
    cachedBounds = bounds4326

    renderActiveLayer()

    const bbox = createBBoxLayer(bounds4326)
    map.addLayer(bbox)
    bboxLayer = bbox as unknown as VectorLayer<VectorSource>

    flyTo(dataset.initialCenter as [number, number], dataset.initialZoom)
  } catch (err) {
    console.error('[DTM] Failed to load terrain:', err)
  } finally {
    setLoadingVisible(false)
  }
}

// Load first dataset with a real URL, then react to dataset + layer changes.
const initialDataset = DATASETS.find((d) => !!d.url)
if (initialDataset) {
  appState.update({ currentDataset: initialDataset.id })
  loadAndRenderDataset(initialDataset.id)
}

let prevDataset = appState.state.currentDataset
let prevLayer = appState.state.activeTerrainLayer
appState.subscribe((state) => {
  if (state.currentDataset !== prevDataset) {
    prevDataset = state.currentDataset
    prevLayer = state.activeTerrainLayer
    loadAndRenderDataset(state.currentDataset)
  } else if (state.activeTerrainLayer !== prevLayer) {
    prevLayer = state.activeTerrainLayer
    renderActiveLayer()
  }
})
