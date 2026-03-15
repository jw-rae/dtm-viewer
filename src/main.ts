import '@jwrae/design-tokens'
import 'ol/ol.css'
import './style.css'

import { createMapContainer } from './ui/MapContainer.js'
import { initMap, getMap, fitBounds } from './renderer/MapEngine.js'
import { loadTerrain, loadTerrainFromBlob } from './renderer/TerrainLoader.js'
import { createBBoxLayer } from './renderer/TerrainRenderer.js'
import { renderGreyscaleHeightMap, createHeightMapLayer } from './renderer/HeightMapService.js'
import { computeSlope, renderSlopeMap, createSlopeLayer } from './renderer/SlopeService.js'
import { computeAspect, renderAspectMap, createAspectLayer } from './renderer/AspectService.js'
import { computeHillshade, renderHillshadeMap, createHillshadeLayer } from './renderer/HillshadeService.js'
import { computeCurvature, renderCurvatureMap, createCurvatureLayer } from './renderer/CurvatureService.js'
import type { CurvatureResult } from './renderer/CurvatureService.js'
import { appState } from './state/AppState.js'
import { DATASETS } from './data/datasets.js'
import { TerrainLayer } from './types/index.js'
import type { ElevationGrid, TerrainLayerState } from './types/index.js'

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
app.append(createMapContainer())

// ── Initialise OpenLayers map ──────────────────────────────────────────────────
// Must run after the DOM is appended so the #map element exists.
initMap('map')
const map = getMap()

// ── Terrain loading ────────────────────────────────────────────────────────────
const TERRAIN_LAYER_Z_BASE = 20

const terrainLayers = new Map<TerrainLayer, ImageLayer<ImageStatic>>()
let bboxLayer: VectorLayer<VectorSource> | null = null

// Cached after a dataset is loaded — reused when switching analysis layers.
let cachedGrid: ElevationGrid | null = null
let cachedBounds: [number, number, number, number] | null = null

// Per-layer canvas cache — avoids recomputing layers whose inputs haven't changed.
const cachedCanvases = new Map<TerrainLayer, HTMLCanvasElement>()
// Curvature intermediate result — allows re-rendering without re-computing when
// only display options (threshold, featureMode, minLineLength) change.
let cachedCurvatureResult: CurvatureResult | null = null

function setLoadingVisible(visible: boolean): void {
  const el = document.getElementById('map-loading')
  if (el) el.style.display = visible ? 'flex' : 'none'
}

function removeTerrainLayers(): void {
  if (!map) return

  terrainLayers.forEach((layer) => {
    map.removeLayer(layer)
  })
  terrainLayers.clear()
}

function invalidateCanvas(layerType: TerrainLayer): void {
  cachedCanvases.delete(layerType)
  if (layerType === TerrainLayer.Curvature) cachedCurvatureResult = null
}

function invalidateAllCanvases(): void {
  cachedCanvases.clear()
  cachedCurvatureResult = null
}

function computeCanvas(
  layerType: TerrainLayer,
  grid: ElevationGrid,
  bounds4326: [number, number, number, number],
): HTMLCanvasElement {
  if (layerType === TerrainLayer.HeightMap) {
    return renderGreyscaleHeightMap(grid)
  }
  if (layerType === TerrainLayer.Slope) {
    const slopeGrid = computeSlope(grid, bounds4326, appState.state.slopeUnit)
    return renderSlopeMap(slopeGrid)
  }
  if (layerType === TerrainLayer.Aspect) {
    const aspectData = computeAspect(grid)
    return renderAspectMap(aspectData, grid.width, grid.height)
  }
  if (layerType === TerrainLayer.Hillshade) {
    const hsData = computeHillshade(grid, bounds4326, appState.state.hillshadeParams)
    return renderHillshadeMap(hsData, grid.width, grid.height)
  }
  // Curvature: reuse intermediate result when only render options changed.
  if (!cachedCurvatureResult) {
    cachedCurvatureResult = computeCurvature(grid, appState.state.curvatureType)
  }
  return renderCurvatureMap(cachedCurvatureResult, {
    strongFeatureThreshold: appState.state.curvatureStrengthThreshold,
    featureMode: appState.state.curvatureFeatureMode,
    minConnectedPixels: appState.state.curvatureMinLineLength,
  })
}

function getOrComputeCanvas(
  layerType: TerrainLayer,
  grid: ElevationGrid,
  bounds4326: [number, number, number, number],
): HTMLCanvasElement {
  const cached = cachedCanvases.get(layerType)
  if (cached) return cached
  const canvas = computeCanvas(layerType, grid, bounds4326)
  cachedCanvases.set(layerType, canvas)
  return canvas
}

function createOlLayer(
  layerType: TerrainLayer,
  canvas: HTMLCanvasElement,
  bounds4326: [number, number, number, number],
): ImageLayer<ImageStatic> {
  if (layerType === TerrainLayer.HeightMap) return createHeightMapLayer(canvas, bounds4326)
  if (layerType === TerrainLayer.Slope) return createSlopeLayer(canvas, bounds4326)
  if (layerType === TerrainLayer.Aspect) return createAspectLayer(canvas, bounds4326)
  if (layerType === TerrainLayer.Hillshade) return createHillshadeLayer(canvas, bounds4326)
  return createCurvatureLayer(canvas, bounds4326)
}

function renderVisibleTerrainLayers(): void {
  if (!cachedGrid || !cachedBounds || !map) return

  const grid = cachedGrid
  const bounds = cachedBounds
  const enabledLayers = appState.state.terrainLayerStates.filter((entry) => entry.enabled)

  removeTerrainLayers()

  enabledLayers.forEach((entry, index) => {
    const canvas = getOrComputeCanvas(entry.layer, grid, bounds)
    const layer = createOlLayer(entry.layer, canvas, bounds)
    layer.setOpacity(entry.opacity)
    layer.setZIndex(TERRAIN_LAYER_Z_BASE + (enabledLayers.length - index))
    map.addLayer(layer)
    terrainLayers.set(entry.layer, layer)
  })
}

// Rebuilds a single specific layer after its compute params change.
function rebuildSingleLayer(layerType: TerrainLayer): void {
  if (!cachedGrid || !cachedBounds || !map) return
  const state = appState.state
  const entry = state.terrainLayerStates.find((e) => e.layer === layerType)
  if (!entry?.enabled) return

  const existing = terrainLayers.get(layerType)
  if (existing) map.removeLayer(existing)

  const enabledLayers = state.terrainLayerStates.filter((e) => e.enabled)
  const idx = enabledLayers.findIndex((e) => e.layer === layerType)
  const canvas = computeCanvas(layerType, cachedGrid, cachedBounds)
  cachedCanvases.set(layerType, canvas)
  const layer = createOlLayer(layerType, canvas, cachedBounds)
  layer.setOpacity(entry.opacity)
  layer.setZIndex(TERRAIN_LAYER_Z_BASE + (enabledLayers.length - idx))
  map.addLayer(layer)
  terrainLayers.set(layerType, layer)
}

// Handles terrainLayerStates changes: add/remove layers and sync opacity/z-index
// without recomputing layers whose data hasn't changed.
function handleLayerStackChange(
  prev: TerrainLayerState[],
  curr: TerrainLayerState[],
): void {
  if (!cachedGrid || !cachedBounds || !map) return
  const grid = cachedGrid
  const bounds = cachedBounds
  const enabledCurr = curr.filter((e) => e.enabled)
  const enabledPrev = prev.filter((e) => e.enabled)

  // Remove newly-disabled layers.
  for (const entry of enabledPrev) {
    if (!enabledCurr.find((e) => e.layer === entry.layer)) {
      const olLayer = terrainLayers.get(entry.layer)
      if (olLayer) { map.removeLayer(olLayer); terrainLayers.delete(entry.layer) }
    }
  }

  // Add newly-enabled layers (uses canvas cache — no recompute if previously rendered).
  for (const entry of enabledCurr) {
    if (!terrainLayers.has(entry.layer)) {
      const canvas = getOrComputeCanvas(entry.layer, grid, bounds)
      const layer = createOlLayer(entry.layer, canvas, bounds)
      map.addLayer(layer)
      terrainLayers.set(entry.layer, layer)
    }
  }

  // Sync opacity and z-index for all currently enabled layers.
  enabledCurr.forEach((entry, idx) => {
    const olLayer = terrainLayers.get(entry.layer)
    if (!olLayer) return
    olLayer.setOpacity(entry.opacity)
    olLayer.setZIndex(TERRAIN_LAYER_Z_BASE + (enabledCurr.length - idx))
  })
}

function isTerrainLayerEnabled(
  layers: TerrainLayerState[],
  layerType: TerrainLayer,
): boolean {
  return layers.some((entry) => entry.layer === layerType && entry.enabled)
}

async function loadAndRenderDataset(datasetId: string): Promise<void> {
  const dataset = DATASETS.find((d) => d.id === datasetId)
  if (!dataset || !dataset.url) return

  if (!map) return

  removeTerrainLayers()
  if (bboxLayer) { map.removeLayer(bboxLayer); bboxLayer = null }
  cachedGrid = null
  cachedBounds = null
  invalidateAllCanvases()
  appState.update({ elevationRange: null })

  setLoadingVisible(true)
  try {
    const { grid, bounds4326 } = await loadTerrain(dataset.url)
    cachedGrid = grid
    cachedBounds = bounds4326
    appState.update({ elevationRange: { min: grid.minElevation, max: grid.maxElevation } })

    renderVisibleTerrainLayers()

    const bbox = createBBoxLayer(bounds4326)
    map.addLayer(bbox)
    bboxLayer = bbox as unknown as VectorLayer<VectorSource>

    fitBounds(bounds4326)
  } catch (err) {
    console.error('[DTM] Failed to load terrain:', err)
  } finally {
    setLoadingVisible(false)
  }
}

async function loadAndRenderFile(file: File): Promise<void> {
  if (!map) return

  removeTerrainLayers()
  if (bboxLayer) { map.removeLayer(bboxLayer); bboxLayer = null }
  cachedGrid = null
  cachedBounds = null
  invalidateAllCanvases()
  appState.update({ elevationRange: null })

  setLoadingVisible(true)
  try {
    const { grid, bounds4326 } = await loadTerrainFromBlob(file)
    cachedGrid = grid
    cachedBounds = bounds4326
    appState.update({ elevationRange: { min: grid.minElevation, max: grid.maxElevation } })

    renderVisibleTerrainLayers()

    const bbox = createBBoxLayer(bounds4326)
    map.addLayer(bbox)
    bboxLayer = bbox as unknown as VectorLayer<VectorSource>

    fitBounds(bounds4326)
  } catch (err) {
    console.error('[DTM] Failed to load imported terrain:', err)
  } finally {
    setLoadingVisible(false)
  }
}

window.addEventListener('dtm:import-file', (e) => {
  const file = (e as CustomEvent<{ file: File }>).detail.file
  loadAndRenderFile(file)
})

// Load first dataset with a real URL, then react to dataset + layer changes.
const initialDataset = DATASETS.find((d) => !!d.url)
if (initialDataset) {
  appState.update({ currentDataset: initialDataset.id })
  loadAndRenderDataset(initialDataset.id)
}

let prevDataset = appState.state.currentDataset
let prevLayerStates = appState.state.terrainLayerStates
let prevSlopeUnit = appState.state.slopeUnit
let prevHillshadeParams = appState.state.hillshadeParams
let prevCurvatureType = appState.state.curvatureType
let prevCurvatureStrengthThreshold = appState.state.curvatureStrengthThreshold
let prevCurvatureFeatureMode = appState.state.curvatureFeatureMode
let prevCurvatureMinLineLength = appState.state.curvatureMinLineLength

appState.subscribe((state) => {
  const datasetChanged = state.currentDataset !== prevDataset
  const layerStackChanged = state.terrainLayerStates !== prevLayerStates
  const slopeChanged = state.slopeUnit !== prevSlopeUnit
  const hillshadeChanged = state.hillshadeParams !== prevHillshadeParams
  const curvatureTypeChanged = state.curvatureType !== prevCurvatureType
  const curvatureRenderChanged =
    state.curvatureStrengthThreshold !== prevCurvatureStrengthThreshold ||
    state.curvatureFeatureMode !== prevCurvatureFeatureMode ||
    state.curvatureMinLineLength !== prevCurvatureMinLineLength

  const savedPrevLayerStates = prevLayerStates
  prevDataset = state.currentDataset
  prevLayerStates = state.terrainLayerStates
  prevSlopeUnit = state.slopeUnit
  prevHillshadeParams = state.hillshadeParams
  prevCurvatureType = state.curvatureType
  prevCurvatureStrengthThreshold = state.curvatureStrengthThreshold
  prevCurvatureFeatureMode = state.curvatureFeatureMode
  prevCurvatureMinLineLength = state.curvatureMinLineLength

  if (datasetChanged && state.currentDataset !== '__imported__') {
    loadAndRenderDataset(state.currentDataset)
    return
  }

  // Rebuild only the specific layer whose compute params changed.
  if (slopeChanged && isTerrainLayerEnabled(state.terrainLayerStates, TerrainLayer.Slope)) {
    invalidateCanvas(TerrainLayer.Slope)
    rebuildSingleLayer(TerrainLayer.Slope)
  }

  if (hillshadeChanged && isTerrainLayerEnabled(state.terrainLayerStates, TerrainLayer.Hillshade)) {
    invalidateCanvas(TerrainLayer.Hillshade)
    rebuildSingleLayer(TerrainLayer.Hillshade)
  }

  if (isTerrainLayerEnabled(state.terrainLayerStates, TerrainLayer.Curvature)) {
    if (curvatureTypeChanged) {
      // Full recompute: type change invalidates both intermediate result and canvas.
      invalidateCanvas(TerrainLayer.Curvature)
      rebuildSingleLayer(TerrainLayer.Curvature)
    } else if (curvatureRenderChanged) {
      // Re-render only: keep cachedCurvatureResult, just regenerate the canvas.
      cachedCanvases.delete(TerrainLayer.Curvature)
      rebuildSingleLayer(TerrainLayer.Curvature)
    }
  }

  // Handle layer enable/disable, opacity, and reordering without recomputing.
  if (layerStackChanged) {
    handleLayerStackChange(savedPrevLayerStates, state.terrainLayerStates)
  }
})
